-- VaultKey Database Schema — Neon PostgreSQL

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
    id          VARCHAR(36)  PRIMARY KEY,
    email       VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- 2. Files (metadata only — ciphertext lives in Cloudflare R2)
CREATE TABLE IF NOT EXISTS files (
    id                VARCHAR(36)  PRIMARY KEY,
    owner_id          VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    r2_object_key     VARCHAR(512) NOT NULL,   -- e.g. "uploads/<uuid>.enc"
    original_filename VARCHAR(255) NOT NULL,
    mime_type         VARCHAR(100) DEFAULT 'application/pdf',
    size              INTEGER      NOT NULL,
    iv_hex            VARCHAR(64)  NOT NULL,
    created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- 3. Shares
CREATE TABLE IF NOT EXISTS shares (
    id             VARCHAR(36)  PRIMARY KEY,
    file_id        VARCHAR(36)  NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    owner_id       VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash     VARCHAR(64)  UNIQUE NOT NULL,
    expires_at     TIMESTAMP    NULL,
    max_downloads  INTEGER      DEFAULT 5,
    download_count INTEGER      DEFAULT 0,
    password_hash  VARCHAR(255) NULL,
    revoked        BOOLEAN      DEFAULT FALSE,
    revoked_at     TIMESTAMP    NULL,
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- 4. Access logs
CREATE TABLE IF NOT EXISTS access_logs (
    id         VARCHAR(36)  PRIMARY KEY,
    share_id   VARCHAR(36)  NULL REFERENCES shares(id) ON DELETE CASCADE,
    file_id    VARCHAR(36)  NULL REFERENCES files(id)  ON DELETE CASCADE,
    owner_id   VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event      VARCHAR(50)  NOT NULL,
    status     VARCHAR(20)  NOT NULL,
    user_agent VARCHAR(512) NULL,
    ip_address VARCHAR(100) NULL,
    timestamp  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_files_owner    ON files(owner_id);
CREATE INDEX IF NOT EXISTS idx_shares_file    ON shares(file_id);
CREATE INDEX IF NOT EXISTS idx_shares_owner   ON shares(owner_id);
CREATE INDEX IF NOT EXISTS idx_logs_owner     ON access_logs(owner_id);
CREATE INDEX IF NOT EXISTS idx_logs_file      ON access_logs(file_id);
