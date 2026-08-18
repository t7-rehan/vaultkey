from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, FileItem, ShareLink, AccessLog
from ..schemas import ShareCreateRequest, ShareCreateResponse, ShareDetailResponse
from ..security import get_current_user, generate_secure_token, hash_share_token, hash_password

router = APIRouter(prefix="/api/shares", tags=["Shares"])

@router.post("", response_model=ShareCreateResponse)
def create_share_link(
    payload: ShareCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify file exists and belongs to current user
    file_item = db.query(FileItem).filter(
        FileItem.id == payload.file_id,
        FileItem.owner_id == current_user.id
    ).first()

    if not file_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or unauthorized"
        )

    # Calculate expiration date
    expires_at = None
    if payload.expiration_hours and payload.expiration_hours > 0:
        expires_at = datetime.utcnow() + timedelta(hours=payload.expiration_hours)

    # Generate raw token & hash
    raw_token = generate_secure_token()
    token_hash = hash_share_token(raw_token)

    # Hash optional password
    password_hash = None
    if payload.password and payload.password.strip():
        password_hash = hash_password(payload.password.strip())

    share = ShareLink(
        file_id=file_item.id,
        owner_id=current_user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        max_downloads=payload.max_downloads,
        download_count=0,
        password_hash=password_hash,
        revoked=False
    )

    db.add(share)
    db.flush()  # assign share.id

    # Audit log
    audit_log = AccessLog(
        share_id=share.id,
        file_id=file_item.id,
        owner_id=current_user.id,
        event="LINK_CREATED",
        status="SUCCESS"
    )
    db.add(audit_log)
    db.commit()

    return ShareCreateResponse(
        share_id=share.id,
        token=raw_token,
        file_id=file_item.id,
        original_filename=file_item.original_filename,
        expires_at=expires_at,
        max_downloads=payload.max_downloads,
        has_password=password_hash is not None,
        created_at=share.created_at
    )

@router.get("", response_model=List[ShareDetailResponse])
def list_user_shares(
    file_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(ShareLink).filter(ShareLink.owner_id == current_user.id)
    if file_id:
        query = query.filter(ShareLink.file_id == file_id)

    shares = query.order_by(ShareLink.created_at.desc()).all()

    now = datetime.utcnow()
    result = []
    for s in shares:
        f = db.query(FileItem).filter(FileItem.id == s.file_id).first()
        filename = f.original_filename if f else "Unknown"

        status_str = "ACTIVE"
        if s.revoked:
            status_str = "REVOKED"
        elif s.expires_at and s.expires_at < now:
            status_str = "EXPIRED"
        elif s.download_count >= s.max_downloads:
            status_str = "LIMIT_REACHED"

        item = ShareDetailResponse(
            id=s.id,
            file_id=s.file_id,
            original_filename=filename,
            expires_at=s.expires_at,
            max_downloads=s.max_downloads,
            download_count=s.download_count,
            has_password=s.password_hash is not None,
            revoked=s.revoked,
            revoked_at=s.revoked_at,
            created_at=s.created_at,
            status=status_str
        )
        result.append(item)

    return result

@router.get("/{share_id}", response_model=ShareDetailResponse)
def get_share_detail(
    share_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    s = db.query(ShareLink).filter(
        ShareLink.id == share_id,
        ShareLink.owner_id == current_user.id
    ).first()

    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")

    f = db.query(FileItem).filter(FileItem.id == s.file_id).first()
    filename = f.original_filename if f else "Unknown"

    now = datetime.utcnow()
    status_str = "ACTIVE"
    if s.revoked:
        status_str = "REVOKED"
    elif s.expires_at and s.expires_at < now:
        status_str = "EXPIRED"
    elif s.download_count >= s.max_downloads:
        status_str = "LIMIT_REACHED"

    return ShareDetailResponse(
        id=s.id,
        file_id=s.file_id,
        original_filename=filename,
        expires_at=s.expires_at,
        max_downloads=s.max_downloads,
        download_count=s.download_count,
        has_password=s.password_hash is not None,
        revoked=s.revoked,
        revoked_at=s.revoked_at,
        created_at=s.created_at,
        status=status_str
    )

@router.post("/{share_id}/revoke")
def revoke_share_link(
    share_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    s = db.query(ShareLink).filter(
        ShareLink.id == share_id,
        ShareLink.owner_id == current_user.id
    ).first()

    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")

    if not s.revoked:
        s.revoked = True
        s.revoked_at = datetime.utcnow()

        # Audit log
        audit_log = AccessLog(
            share_id=s.id,
            file_id=s.file_id,
            owner_id=s.owner_id,
            event="LINK_REVOKED",
            status="SUCCESS"
        )
        db.add(audit_log)
        db.commit()

    return {"status": "success", "message": "Share link revoked successfully"}
