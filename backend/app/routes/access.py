import os
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from fastapi.responses import FileResponse as FastAPIFileResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import ShareLink, FileItem, AccessLog
from ..schemas import RecipientCheckResponse, RecipientAuthorizeRequest
from ..security import hash_share_token, verify_password

router = APIRouter(prefix="/api/access", tags=["Recipient Access"])

def get_share_by_token(token: str, db: Session) -> Optional[ShareLink]:
    token_hash = hash_share_token(token)
    return db.query(ShareLink).filter(ShareLink.token_hash == token_hash).first()

@router.get("/{token}", response_model=RecipientCheckResponse)
def check_recipient_access(
    token: str,
    request: Request,
    db: Session = Depends(get_db)
):
    share = get_share_by_token(token, db)
    user_agent = request.headers.get("user-agent")
    client_ip = request.client.host if request.client else None

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
            status="INVALID"
        )

    file_item = db.query(FileItem).filter(FileItem.id == share.file_id).first()
    filename = file_item.original_filename if file_item else "Protected Document"
    file_size = file_item.size if file_item else 0

    now = datetime.utcnow()
    downloads_remaining = max(0, share.max_downloads - share.download_count)

    # Status evaluation
    if share.revoked:
        # Audit log access denied (revoked)
        db.add(AccessLog(
            share_id=share.id,
            file_id=share.file_id,
            owner_id=share.owner_id,
            event="ACCESS_DENIED",
            status="DENIED",
            user_agent=user_agent,
            ip_address=client_ip
        ))
        db.commit()

        return RecipientCheckResponse(
            valid=False,
            original_filename=filename,
            file_size=file_size,
            expires_at=share.expires_at,
            max_downloads=share.max_downloads,
            downloads_remaining=0,
            requires_password=share.password_hash is not None,
            revoked=True,
            status="REVOKED"
        )

    if share.expires_at and share.expires_at < now:
        db.add(AccessLog(
            share_id=share.id,
            file_id=share.file_id,
            owner_id=share.owner_id,
            event="LINK_EXPIRED",
            status="DENIED",
            user_agent=user_agent,
            ip_address=client_ip
        ))
        db.commit()

        return RecipientCheckResponse(
            valid=False,
            original_filename=filename,
            file_size=file_size,
            expires_at=share.expires_at,
            max_downloads=share.max_downloads,
            downloads_remaining=0,
            requires_password=share.password_hash is not None,
            revoked=False,
            status="EXPIRED"
        )

    if share.max_downloads > 0 and share.download_count >= share.max_downloads:
        db.add(AccessLog(
            share_id=share.id,
            file_id=share.file_id,
            owner_id=share.owner_id,
            event="ACCESS_DENIED",
            status="DENIED",
            user_agent=user_agent,
            ip_address=client_ip
        ))
        db.commit()

        return RecipientCheckResponse(
            valid=False,
            original_filename=filename,
            file_size=file_size,
            expires_at=share.expires_at,
            max_downloads=share.max_downloads,
            downloads_remaining=0,
            requires_password=share.password_hash is not None,
            revoked=False,
            status="LIMIT_REACHED"
        )

    # Valid attempt
    db.add(AccessLog(
        share_id=share.id,
        file_id=share.file_id,
        owner_id=share.owner_id,
        event="ACCESS_ATTEMPT",
        status="SUCCESS",
        user_agent=user_agent,
        ip_address=client_ip
    ))
    db.commit()

    return RecipientCheckResponse(
        valid=True,
        original_filename=filename,
        file_size=file_size,
        expires_at=share.expires_at,
        max_downloads=share.max_downloads,
        downloads_remaining=downloads_remaining,
        requires_password=share.password_hash is not None,
        revoked=False,
        status="OK"
    )

@router.post("/{token}/authorize")
def authorize_password(
    token: str,
    payload: RecipientAuthorizeRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    share = get_share_by_token(token, db)
    user_agent = request.headers.get("user-agent")
    client_ip = request.client.host if request.client else None

    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid share token")

    if share.revoked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access revoked")

    if share.expires_at and share.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Link expired")

    if share.max_downloads > 0 and share.download_count >= share.max_downloads:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Download limit reached")


    if share.password_hash:
        if not payload.password or not verify_password(payload.password.strip(), share.password_hash):
            db.add(AccessLog(
                share_id=share.id,
                file_id=share.file_id,
                owner_id=share.owner_id,
                event="PASSWORD_FAILED",
                status="FAILED",
                user_agent=user_agent,
                ip_address=client_ip
            ))
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to authorize access with the provided password."
            )

    db.add(AccessLog(
        share_id=share.id,
        file_id=share.file_id,
        owner_id=share.owner_id,
        event="ACCESS_GRANTED",
        status="SUCCESS",
        user_agent=user_agent,
        ip_address=client_ip
    ))
    db.commit()

    return {"status": "authorized", "message": "Access authorized"}

@router.post("/{token}/download")
def download_encrypted_file(
    token: str,
    payload: RecipientAuthorizeRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    share = get_share_by_token(token, db)
    user_agent = request.headers.get("user-agent")
    client_ip = request.client.host if request.client else None

    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid share token")

    if share.revoked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This VaultKey link has been revoked by its owner.")

    if share.expires_at and share.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="This VaultKey link has expired.")

    # Validate password if required
    if share.password_hash:
        if not payload.password or not verify_password(payload.password.strip(), share.password_hash):
            db.add(AccessLog(
                share_id=share.id,
                file_id=share.file_id,
                owner_id=share.owner_id,
                event="PASSWORD_FAILED",
                status="FAILED",
                user_agent=user_agent,
                ip_address=client_ip
            ))
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to authorize access with the provided password."
            )

    if share.max_downloads > 0:
        # Atomic download counter update to prevent concurrent limit bypass
        rows_updated = db.query(ShareLink).filter(
            ShareLink.id == share.id,
            ShareLink.download_count < ShareLink.max_downloads,
            ShareLink.revoked == False
        ).update({"download_count": ShareLink.download_count + 1})

        if rows_updated == 0:
            db.add(AccessLog(
                share_id=share.id,
                file_id=share.file_id,
                owner_id=share.owner_id,
                event="ACCESS_DENIED",
                status="DENIED",
                user_agent=user_agent,
                ip_address=client_ip
            ))
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="The maximum number of downloads for this file has been reached."
            )

        db.commit()

        # Log download event
        db.add(AccessLog(
            share_id=share.id,
            file_id=share.file_id,
            owner_id=share.owner_id,
            event="FILE_DOWNLOADED",
            status="SUCCESS",
            user_agent=user_agent,
            ip_address=client_ip
        ))
        db.commit()
    else:
        # Log view-only access event
        db.add(AccessLog(
            share_id=share.id,
            file_id=share.file_id,
            owner_id=share.owner_id,
            event="FILE_VIEWED",
            status="SUCCESS",
            user_agent=user_agent,
            ip_address=client_ip
        ))
        db.commit()


    # Fetch file record
    file_item = db.query(FileItem).filter(FileItem.id == share.file_id).first()
    if not file_item or not os.path.exists(file_item.storage_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Encrypted file payload missing.")

    headers = {
        "X-IV-Hex": file_item.iv_hex,
        "X-Original-Filename": file_item.original_filename,
        "Access-Control-Expose-Headers": "X-IV-Hex, X-Original-Filename"
    }

    return FastAPIFileResponse(
        path=file_item.storage_path,
        media_type="application/octet-stream",
        filename=f"{file_item.id}.enc",
        headers=headers
    )
