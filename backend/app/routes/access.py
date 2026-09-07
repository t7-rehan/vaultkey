from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import ShareLink, FileItem, AccessLog
from ..schemas import RecipientCheckResponse, RecipientAuthorizeRequest
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
            requires_password=False,
            revoked=False,
            status="INVALID",
        )

    file_item = db.query(FileItem).filter(FileItem.id == share.file_id).first()
    filename = file_item.original_filename if file_item else "Protected Document"
    file_size = file_item.size if file_item else 0

    now = datetime.now(timezone.utc)
    downloads_remaining = max(0, share.max_downloads - share.download_count)

    if share.revoked:
        log_event(db, share, "ACCESS_DENIED", "DENIED", request)
        return RecipientCheckResponse(
            valid=False, original_filename=filename, file_size=file_size,
            expires_at=share.expires_at, max_downloads=share.max_downloads,
            downloads_remaining=0, requires_password=share.password_hash is not None,
            revoked=True, status="REVOKED",
        )

    if share.expires_at and make_aware(share.expires_at) < now:
        log_event(db, share, "LINK_EXPIRED", "DENIED", request)
        return RecipientCheckResponse(
            valid=False, original_filename=filename, file_size=file_size,
            expires_at=share.expires_at, max_downloads=share.max_downloads,
            downloads_remaining=0, requires_password=share.password_hash is not None,
            revoked=False, status="EXPIRED",
        )

    if share.max_downloads > 0 and share.download_count >= share.max_downloads:
        log_event(db, share, "ACCESS_DENIED", "DENIED", request)
        return RecipientCheckResponse(
            valid=False, original_filename=filename, file_size=file_size,
            expires_at=share.expires_at, max_downloads=share.max_downloads,
            downloads_remaining=0, requires_password=share.password_hash is not None,
            revoked=False, status="LIMIT_REACHED",
        )

    log_event(db, share, "ACCESS_ATTEMPT", "SUCCESS", request)

    return RecipientCheckResponse(
        valid=True, original_filename=filename, file_size=file_size,
        expires_at=share.expires_at, max_downloads=share.max_downloads,
        downloads_remaining=downloads_remaining,
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
    if share.max_downloads > 0 and share.download_count >= share.max_downloads:
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
    share = get_share_by_token(token, db)

    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid share token")

    if share.revoked:
        # Previously: no log was written here — now fixed
        log_event(db, share, "ACCESS_DENIED", "DENIED", request)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This VaultKey link has been revoked by its owner.",
        )

    if share.expires_at and make_aware(share.expires_at) < datetime.now(timezone.utc):
        # Previously: no log was written here — now fixed
        log_event(db, share, "LINK_EXPIRED", "DENIED", request)
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This VaultKey link has expired.",
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
        log_event(db, share, "FILE_VIEWED", "SUCCESS", request)

    # Fetch file metadata from Postgres
    file_item = db.query(FileItem).filter(FileItem.id == share.file_id).first()
    if not file_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Encrypted file payload missing.",
        )

    # Stream ciphertext from R2
    encrypted_bytes = download_file(file_item.r2_object_key)

    response_headers = {
        "X-IV-Hex": file_item.iv_hex,
        "X-Original-Filename": file_item.original_filename,
        "Content-Disposition": f'attachment; filename="{file_item.id}.enc"',
        "Access-Control-Expose-Headers": "X-IV-Hex, X-Original-Filename",
    }

    return Response(
        content=encrypted_bytes,
        media_type="application/octet-stream",
        headers=response_headers,
    )
