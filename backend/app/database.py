import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL environment variable is not set. "
        "Set it to your Neon PostgreSQL connection string."
    )

# Neon (and most managed Postgres providers) use 'postgres://' scheme;
# SQLAlchemy requires 'postgresql://'.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://neondb_owner:npg_ZBz83AnMgiHK@ep-square-cloud-aztwfg5l.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=req", 1)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,       # drops stale connections from the pool automatically
    pool_size=5,
    max_overflow=10,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
