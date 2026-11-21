-- Accountless, expiring client upload links. Store only hashed capabilities and OTPs.
CREATE TABLE IF NOT EXISTS portal_links (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 client_id TEXT NOT NULL REFERENCES clients(id),
 period TEXT NOT NULL,
 contact_id TEXT REFERENCES client_contacts(id),
 recipient_email TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS portal_links_client ON portal_links(firm_id,client_id,period,expires_at);
CREATE TABLE IF NOT EXISTS portal_challenges (
 link_id TEXT PRIMARY KEY REFERENCES portal_links(id),
 otp_hash TEXT,
 issued_at TEXT,
 otp_expires_at TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 send_count INTEGER NOT NULL DEFAULT 0,
 send_window_start TEXT,
 last_sent_at TEXT,
 access_hash TEXT,
 access_expires_at TEXT
);
CREATE TABLE IF NOT EXISTS portal_notifications (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 client_id TEXT NOT NULL REFERENCES clients(id),
 task_id TEXT NOT NULL REFERENCES tasks(id),
 recipient_id TEXT NOT NULL REFERENCES users(id),
 file_id TEXT NOT NULL REFERENCES stored_documents(id),
 message TEXT NOT NULL,
 created_at TEXT NOT NULL,
 read_at TEXT,
 UNIQUE(firm_id,file_id,recipient_id)
);
CREATE INDEX IF NOT EXISTS portal_notifications_assignee ON portal_notifications(firm_id,recipient_id,read_at,created_at DESC);
