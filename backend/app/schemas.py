from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

# Auth Schemas
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# File Schemas
class FileCreateResponse(BaseModel):
    id: str
    original_filename: str
    size: int
    mime_type: str
    iv_hex: str
    created_at: datetime

    class Config:
        from_attributes = True

class FileResponse(BaseModel):
    id: str
    original_filename: str
    size: int
    mime_type: str
    iv_hex: str
    created_at: datetime
    active_shares_count: int = 0
    total_downloads: int = 0

    class Config:
        from_attributes = True

# Share Schemas
class ShareCreateRequest(BaseModel):
    file_id: str
    expiration_hours: Optional[int] = None # None, 1, 6, 24, 72 (3 days), 168 (7 days)
    max_downloads: int = Field(5, ge=0, le=10)

    password: Optional[str] = None

class ShareCreateResponse(BaseModel):
    share_id: str
    token: str  # Unpredictable high-entropy raw token returned ONCE to the creator
    file_id: str
    original_filename: str
    expires_at: Optional[datetime]
    max_downloads: int
    has_password: bool
    created_at: datetime

class ShareDetailResponse(BaseModel):
    id: str
    file_id: str
    original_filename: str
    expires_at: Optional[datetime]
    max_downloads: int
    download_count: int
    has_password: bool
    revoked: bool
    revoked_at: Optional[datetime]
    created_at: datetime
    status: str # ACTIVE, EXPIRED, REVOKED, LIMIT_REACHED

    class Config:
        from_attributes = True

# Access / Recipient Schemas
class RecipientCheckResponse(BaseModel):
    valid: bool
    original_filename: str
    file_size: int
    expires_at: Optional[datetime]
    max_downloads: int
    downloads_remaining: int
    requires_password: bool
    revoked: bool
    status: str  # OK, EXPIRED, REVOKED, LIMIT_REACHED, INVALID

class RecipientAuthorizeRequest(BaseModel):
    password: Optional[str] = None

# Activity Log Schema
class ActivityLogResponse(BaseModel):
    id: str
    file_id: Optional[str]
    filename: Optional[str]
    event: str
    status: str
    user_agent: Optional[str]
    ip_address: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True

