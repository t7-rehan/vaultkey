from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, AccessLog, FileItem
from ..schemas import ActivityLogResponse
from ..security import get_current_user

router = APIRouter(prefix="/api/activity", tags=["Activity Logs"])

@router.get("", response_model=List[ActivityLogResponse])
def get_security_activity(
    file_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(AccessLog).filter(AccessLog.owner_id == current_user.id)
    if file_id:
        query = query.filter(AccessLog.file_id == file_id)

    logs = query.order_by(AccessLog.timestamp.desc()).limit(100).all()

    result = []
    for log in logs:
        filename = None
        if log.file_id:
            f = db.query(FileItem).filter(FileItem.id == log.file_id).first()
            if f:
                filename = f.original_filename

        res = ActivityLogResponse(
            id=log.id,
            file_id=log.file_id,
            filename=filename,
            event=log.event,
            status=log.status,
            user_agent=log.user_agent,
            ip_address=log.ip_address,
            timestamp=log.timestamp
        )

        result.append(res)

    return result
