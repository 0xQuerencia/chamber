-- Per-firm Google Sheets audit mirror configuration and recovery status.
ALTER TABLE activity ADD COLUMN sheet_synced_at TEXT;
CREATE INDEX IF NOT EXISTS activity_unsynced_work ON activity(firm_id,sheet_synced_at,at);
CREATE TABLE IF NOT EXISTS sheet_connections (
 firm_id TEXT PRIMARY KEY REFERENCES firms(id),
 spreadsheet_id TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1,
 last_synced_at TEXT,
 last_error TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sheet_sync_locks (
 firm_id TEXT PRIMARY KEY REFERENCES firms(id),
 locked_until TEXT
);
