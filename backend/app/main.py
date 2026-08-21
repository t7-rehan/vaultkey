from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routes import auth, files, shares, access, activity

# Initialize DB tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="VaultKey API",
    description="Privacy-focused Client-Side Encrypted File Sharing API",
    version="1.0.0"
)

# CORS configuration
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-IV-Hex", "X-Original-Filename"]
)

# Include Routers
app.include_router(auth.router)
app.include_router(files.router)
app.include_router(shares.router)
app.include_router(access.router)
app.include_router(activity.router)

@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "VaultKey", "version": "1.0.0"}
