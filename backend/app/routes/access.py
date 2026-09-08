from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import ShareLink, FileItem, AccessLog, AccessMode
from ..schemas import (
    RecipientCheckResponse,
    RecipientAuthorizeRequest,
    BlockedActionReportRequest,
)
from ..security import hash_share_token, verify_password
from ..storage import download_file
from ..limiter import limiter
from ..utils import log_event, make_aware

router = APIRouter(prefix="/api/access", tags=["Recipient Access"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_share_by_token(token: str, db: Session) -> Optional[ShareLink]:
    token_hash = hash_share_token(token)
    return db.query(ShareLink).filter(ShareLink.token_hash == token_hash).first()


def _share_access_mode(share: ShareLink) -> str:
    """Return normalised access_mode string, defaulting to 'download' for legacy rows."""
    return share.access_mode or AccessMode.DOWNLOAD.value


def _is_view_only(share: ShareLink) -> bool:
    return _share_access_mode(share) == AccessMode.VIEW_ONLY.value


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/{token}", response_model=RecipientCheckResponse)
def check_recipient_access(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    share = get_share_by_token(token, db)

    if not share:
        return RecipientCheckResponse(
            valid=False,
            original_filename="",
            file_size=0,
            expires_at=None,
            max_downloads=0,
            downloads_remaining=0,
            access_mode=AccessMode.DOWNLOAD.value,
            requires_password=False,
            revoked=False,
            status="INVALID",
        )

    file_item = db.query(FileItem).filter(FileItem.id == share.file_id).first()
    filename = file_item.original_filename if file_item else "Protected Document"
    file_size = file_item.size if file_item else 0

    now = datetime.now(timezone.utc)
    access_mode = _share_access_mode(share)
    # VIEW_ONLY shares have no download counter — remaining is always 0 (not applicable).
    downloads_remaining = (
        0
        if _is_view_only(share)
        else max(0, share.max_downloads - share.download_count)
    )

    if share.revoked:
        log_event(db, share, "ACCESS_DENIED", "DENIED", request)
        return RecipientCheckResponse(
            valid=False, original_filename=filename, file_size=file_size,
            expires_at=share.expires_at, max_downloads=share.max_downloads,
            downloads_remaining=0, access_mode=access_mode,
            requires_password=share.password_hash is not None,
            revoked=True, status="REVOKED",
        )

    if share.expires_at and make_aware(share.expires_at) < now:
        log_event(db, share, "LINK_EXPIRED", "DENIED", request)
        return RecipientCheckResponse(
            valid=False, original_filename=filename, file_size=file_size,
            expires_at=share.expires_at, max_downloads=share.max_downloads,
            downloads_remaining=0, access_mode=access_mode,
            requires_password=share.password_hash is not None,
            revoked=False, status="EXPIRED",
        )

    # Download-mode only: enforce the counter limit on the info endpoint as well.
    if (
        not _is_view_only(share)
        and share.max_downloads > 0
        and share.download_count >= share.max_downloads
    ):
        log_event(db, share, "ACCESS_DENIED", "DENIED", request)
        return RecipientCheckResponse(
            valid=False, original_filename=filename, file_size=file_size,
            expires_at=share.expires_at, max_downloads=share.max_downloads,
            downloads_remaining=0, access_mode=access_mode,
            requires_password=share.password_hash is not None,
            revoked=False, status="LIMIT_REACHED",
        )

    log_event(db, share, "ACCESS_ATTEMPT", "SUCCESS", request)

    return RecipientCheckResponse(
        valid=True, original_filename=filename, file_size=file_size,
        expires_at=share.expires_at, max_downloads=share.max_downloads,
        downloads_remaining=downloads_remaining,
        access_mode=access_mode,
        requires_password=share.password_hash is not None,
        revoked=False, status="OK",
    )


@router.post("/{token}/authorize")
@limiter.limit("5/minute")
def authorize_password(
    token: str,
    payload: RecipientAuthorizeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    share = get_share_by_token(token, db)

    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid share token")
    if share.revoked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access revoked")
    if share.expires_at and make_aware(share.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Link expired")
    # Download-mode only limit check (VIEW_ONLY never hits the counter).
    if (
        not _is_view_only(share)
        and share.max_downloads > 0
        and share.download_count >= share.max_downloads
    ):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Download limit reached")

    if share.password_hash:
        if not payload.password or not verify_password(payload.password.strip(), share.password_hash):
            log_event(db, share, "PASSWORD_FAILED", "FAILED", request)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to authorize access with the provided password.",
            )

    log_event(db, share, "ACCESS_GRANTED", "SUCCESS", request)
    return {"status": "authorized", "message": "Access authorized"}


@router.post("/{token}/download")
@limiter.limit("5/minute")
def download_encrypted_file(
    token: str,
    payload: RecipientAuthorizeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Stream the encrypted ciphertext for DOWNLOAD-mode shares only.

    VIEW_ONLY shares are rejected here with HTTP 403.  The actual restriction
    is enforced server-side — hiding the button in the frontend is NOT sufficient.
    """
    share = get_share_by_token(token, db)

    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid share token")

    if share.revoked:
        log_event(db, share, "ACCESS_DENIED", "DENIED", request)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This VaultKey link has been revoked by its owner.",
        )

    if share.expires_at and make_aware(share.expires_at) < datetime.now(timezone.utc):
        log_event(db, share, "LINK_EXPIRED", "DENIED", request)
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This VaultKey link has expired.",
        )

    # -----------------------------------------------------------------------
    # VIEW_ONLY enforcement — this is the critical server-side check.
    # The frontend hides the download button, but any direct API call or
    # network-level bypass is blocked here regardless of UI state.
    # -----------------------------------------------------------------------
    if _is_view_only(share):
        log_event(db, share, "DOWNLOAD_BLOCKED", "DENIED", request)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This share is view-only. Downloading is not permitted.",
        )

    # Password check
    if share.password_hash:
        if not payload.password or not verify_password(payload.password.strip(), share.password_hash):
            log_event(db, share, "PASSWORD_FAILED", "FAILED", request)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to authorize access with the provided password.",
            )

    # Atomic download counter — prevents concurrent limit bypass
    if share.max_downloads > 0:
        rows_updated = (
            db.query(ShareLink)
            .filter(
                ShareLink.id == share.id,
                ShareLink.download_count < ShareLink.max_downloads,
                ShareLink.revoked == False,
            )
            .update({"download_count": ShareLink.download_count + 1})
        )

        if rows_updated == 0:
            log_event(db, share, "ACCESS_DENIED", "DENIED", request)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="The maximum number of downloads for this file has been reached.",
            )

        db.commit()
        log_event(db, share, "FILE_DOWNLOADED", "SUCCESS", request)
    else:
        # max_downloads == 0 with access_mode == 'download' means unlimited downloads.
        log_event(db, share, "FILE_DOWNLOADED", "SUCCESS", request)

    # Fetch file metadata
    file_item = db.query(FileItem).filter(FileItem.id == share.file_id).first()
    if not file_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Encrypted file payload missing.",
        )

    # Stream ciphertext from R2
    encrypted_bytes = download_file(file_item.r2_object_key)

    # Resolve MIME type: use stored value, fall back by extension, then generic binary
    mime_type = file_item.mime_type
    if not mime_type:
        import os
        _EXT_FALLBACK = {
            ".pdf":  "application/pdf",
            ".png":  "image/png",
            ".jpg":  "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif":  "image/gif",
            ".webp": "image/webp",
            ".txt":  "text/plain",
            ".md":   "text/markdown",
            ".json": "application/json",
            ".js":   "text/javascript",
            ".py":   "text/x-python",
            ".html": "text/html",
            ".css":  "text/css",
            ".csv":  "text/csv",
            ".log":  "text/plain",
        }
        ext = os.path.splitext(file_item.original_filename)[1].lower()
        mime_type = _EXT_FALLBACK.get(ext, "application/octet-stream")

    response_headers = {
        "X-IV-Hex": file_item.iv_hex,
        "X-Original-Filename": file_item.original_filename,
        "X-Mime-Type": mime_type,
        "Content-Disposition": f'attachment; filename="{file_item.id}.enc"',
        "Access-Control-Expose-Headers": "X-IV-Hex, X-Original-Filename, X-Mime-Type",
    }

    return Response(
        content=encrypted_bytes,
        media_type="application/octet-stream",
        headers=response_headers,
    )


@router.post("/{token}/view")
@limiter.limit("5/minute")
def view_encrypted_file(
    token: str,
    payload: RecipientAuthorizeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Stream the encrypted ciphertext for VIEW_ONLY shares.

    This endpoint is the authorised path for view-only recipients.
    It performs the same auth and expiry checks as /download but:
      - requires access_mode == 'view_only'
      - never increments download_count
      - logs FILE_VIEWED instead of FILE_DOWNLOADED
    """
    share = get_share_by_token(token, db)

    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid share token")

    if share.revoked:
        log_event(db, share, "ACCESS_DENIED", "DENIED", request)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This VaultKey link has been revoked by its owner.",
        )

    if share.expires_at and make_aware(share.expires_at) < datetime.now(timezone.utc):
        log_event(db, share, "LINK_EXPIRED", "DENIED", request)
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This VaultKey link has expired.",
        )

    # This endpoint is exclusively for VIEW_ONLY shares.
    if not _is_view_only(share):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This share is not view-only. Use the /download endpoint.",
        )

    # Password check
    if share.password_hash:
        if not payload.password or not verify_password(payload.password.strip(), share.password_hash):
            log_event(db, share, "PASSWORD_FAILED", "FAILED", request)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to authorize access with the provided password.",
            )

    # Log that viewing has started (no counter increment)
    log_event(db, share, "VIEW_STARTED", "SUCCESS", request)

    # Fetch file metadata
    file_item = db.query(FileItem).filter(FileItem.id == share.file_id).first()
    if not file_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Encrypted file payload missing.",
        )

    # Stream ciphertext from R2
    encrypted_bytes = download_file(file_item.r2_object_key)

    # Resolve MIME type
    mime_type = file_item.mime_type
    if not mime_type:
        import os
        _EXT_FALLBACK = {
            ".pdf":  "application/pdf",
            ".png":  "image/png",
            ".jpg":  "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif":  "image/gif",
            ".webp": "image/webp",
            ".txt":  "text/plain",
            ".md":   "text/markdown",
            ".json": "application/json",
            ".js":   "text/javascript",
            ".py":   "text/x-python",
            ".html": "text/html",
            ".css":  "text/css",
            ".csv":  "text/csv",
            ".log":  "text/plain",
        }
        ext = os.path.splitext(file_item.original_filename)[1].lower()
        mime_type = _EXT_FALLBACK.get(ext, "application/octet-stream")

    response_headers = {
        "X-IV-Hex": file_item.iv_hex,
        "X-Original-Filename": file_item.original_filename,
        "X-Mime-Type": mime_type,
        # No Content-Disposition: attachment — we don't want browsers to suggest saving.
        "Access-Control-Expose-Headers": "X-IV-Hex, X-Original-Filename, X-Mime-Type",
    }

    return Response(
        content=encrypted_bytes,
        media_type="application/octet-stream",
        headers=response_headers,
    )


@router.post("/{token}/report-blocked")
@limiter.limit("20/minute")
def report_blocked_action(
    token: str,
    payload: BlockedActionReportRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Receives a client-side report that a restricted action was blocked
    (e.g. Ctrl+S, right-click, Ctrl+P) in the View-Only viewer.

    Only VIEW_ONLY shares may receive these reports; the payload is validated
    against a strict allowlist of event names so this endpoint cannot be abused
    to inject arbitrary strings into the audit log.

    No sensitive data (decryption key, blob content) is accepted or logged.
    """
    share = get_share_by_token(token, db)

    # Silently accept if share is unknown — do not leak existence information.
    if not share:
        return {"status": "ok"}

    # Only log for VIEW_ONLY shares that are still active.
    if (
        share.revoked
        or (share.expires_at and make_aware(share.expires_at) < datetime.now(timezone.utc))
        or not _is_view_only(share)
    ):
        return {"status": "ok"}

    # payload.event is already validated by Pydantic's Literal type — only the
    # five allowed strings can reach this point.
    log_event(db, share, payload.event, "SUCCESS", request)
    return {"status": "ok"}
