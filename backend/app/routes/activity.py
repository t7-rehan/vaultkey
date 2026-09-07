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

    # Batch query for file names to eliminate N+1
    file_ids = {log.file_id for log in logs if log.file_id}
    files_map = {}
    if file_ids:
        files = db.query(FileItem).filter(FileItem.id.in_(file_ids)).all()
        files_map = {f.id: f.original_filename for f in files}

    result = []
    for log in logs:
        filename = files_map.get(log.file_id) if log.file_id else None

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
