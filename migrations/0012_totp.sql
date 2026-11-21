-- Password verification creates a short-lived challenge; only a verified TOTP issues a session.
ALTER TABLE users ADD COLUMN mfa_secret_enc TEXT;
ALTER TABLE users ADD COLUMN mfa_enabled_at TEXT;
ALTER TABLE users ADD COLUMN mfa_last_step INTEGER;
CREATE TABLE IF NOT EXISTS mfa_pending (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 mode TEXT NOT NULL CHECK(mode IN ('enroll','verify')),
 secret_enc TEXT,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),
 expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS mfa_pending_user ON mfa_pending(user_id,expires_at);
