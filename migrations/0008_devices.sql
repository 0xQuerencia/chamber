-- Named browser devices and idle-expiring, revocable per-device sessions.
CREATE TABLE IF NOT EXISTS devices (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 label TEXT NOT NULL,
 user_agent TEXT NOT NULL,
 first_seen_at TEXT NOT NULL,
 last_seen_at TEXT NOT NULL,
 trusted INTEGER NOT NULL DEFAULT 0,
 revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS devices_by_firm ON devices(firm_id,user_id,revoked_at);
ALTER TABLE sessions ADD COLUMN device_id TEXT REFERENCES devices(id);
ALTER TABLE sessions ADD COLUMN last_active_at TEXT;
CREATE INDEX IF NOT EXISTS sessions_by_device ON sessions(device_id,expires_at);
UPDATE sessions SET last_active_at=created_at WHERE last_active_at IS NULL;
