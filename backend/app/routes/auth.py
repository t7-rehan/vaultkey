from fastapi import APIRouter, Depends
from ..models import User
from ..schemas import UserResponse
from ..security import get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)
