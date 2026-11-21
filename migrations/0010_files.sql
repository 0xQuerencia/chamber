-- Confidential evidence uploads. Objects remain quarantined until malware scanned.
CREATE TABLE IF NOT EXISTS stored_documents (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 client_id TEXT NOT NULL REFERENCES clients(id),
 task_id TEXT NOT NULL REFERENCES tasks(id),
 requirement_id TEXT NOT NULL REFERENCES documents(id),
 storage_key TEXT NOT NULL UNIQUE,
 filename TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 15728640),
 sha256 TEXT NOT NULL,
 scan_status TEXT NOT NULL DEFAULT 'pending' CHECK(scan_status IN ('pending','clean','infected','failed')),
 uploaded_by TEXT REFERENCES users(id),
 uploaded_via TEXT NOT NULL DEFAULT 'staff',
 created_at TEXT NOT NULL,
 scanned_at TEXT
);
CREATE INDEX IF NOT EXISTS stored_documents_req ON stored_documents(firm_id,requirement_id,created_at DESC);
CREATE INDEX IF NOT EXISTS stored_documents_pending ON stored_documents(scan_status,created_at);
