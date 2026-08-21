import os
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models import User, FileItem, ShareLink
from ..schemas import FileResponse, FileCreateResponse
from ..security import get_current_user

router = APIRouter(prefix="/api/files", tags=["Files"])

STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "storage", "uploads")
os.makedirs(STORAGE_DIR, exist_ok=True)

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB

@router.post("", response_model=FileCreateResponse)
async def upload_encrypted_file(
    file: UploadFile = File(...),
    original_filename: str = Form(...),
    iv_hex: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Read content
    contents = await file.read()
    file_size = len(contents)

    # Server-side validation: size <= 50MB
    if file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds maximum limit of 50 MB."
        )

    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file cannot be empty."
        )

    # Filename validation - PDF only
    clean_filename = os.path.basename(original_filename.strip())
    if not clean_filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are accepted."
        )

    # Generate non-predictable physical storage filename
    storage_filename = f"{uuid.uuid4().hex}.enc"
    storage_path = os.path.join(STORAGE_DIR, storage_filename)

    # Write ciphertext to file
    with open(storage_path, "wb") as f:
        f.write(contents)

    # Create database entry
    file_record = FileItem(
        owner_id=current_user.id,
        storage_path=storage_path,
        original_filename=clean_filename,
        mime_type="application/pdf",
        size=file_size,
        iv_hex=iv_hex.strip()
    )

    db.add(file_record)
    db.commit()
    db.refresh(file_record)

    return FileCreateResponse.model_validate(file_record)

@router.get("", response_model=List[FileResponse])
def list_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    files = db.query(FileItem).filter(FileItem.owner_id == current_user.id).order_by(FileItem.created_at.desc()).all()
    
    result = []
    for f in files:
        active_shares = db.query(ShareLink).filter(
            ShareLink.file_id == f.id,
            ShareLink.revoked == False
        ).count()
        
        total_dl = db.query(func.sum(ShareLink.download_count)).filter(
            ShareLink.file_id == f.id
        ).scalar() or 0

        res = FileResponse.model_validate(f)
        res.active_shares_count = active_shares
        res.total_downloads = total_dl
        result.append(res)

    return result

@router.get("/{file_id}", response_model=FileResponse)
def get_file_detail(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    f = db.query(FileItem).filter(
        FileItem.id == file_id,
        FileItem.owner_id == current_user.id
    ).first()

    if not f:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    active_shares = db.query(ShareLink).filter(
        ShareLink.file_id == f.id,
        ShareLink.revoked == False
    ).count()

    total_dl = db.query(func.sum(ShareLink.download_count)).filter(
        ShareLink.file_id == f.id
    ).scalar() or 0

    res = FileResponse.model_validate(f)
    res.active_shares_count = active_shares
    res.total_downloads = total_dl
    return res

@router.delete("/{file_id}")
def delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    f = db.query(FileItem).filter(
        FileItem.id == file_id,
        FileItem.owner_id == current_user.id
    ).first()

    if not f:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    # Remove file from disk
    if os.path.exists(f.storage_path):
        try:
            os.remove(f.storage_path)
        except OSError:
            pass

    db.delete(f)
    db.commit()
    return {"status": "success", "message": "File deleted successfully"}
