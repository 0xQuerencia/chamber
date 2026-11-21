-- Reviewable, reversible client imports. No original files stored in D1.
CREATE TABLE IF NOT EXISTS import_batches (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 kind TEXT NOT NULL CHECK(kind IN ('clients')),
 created_by TEXT NOT NULL REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','complete','undone')),
 created_at TEXT NOT NULL,
 completed_at TEXT,
 undone_at TEXT
);
CREATE INDEX IF NOT EXISTS import_batches_firm ON import_batches(firm_id,created_at DESC);
CREATE TABLE IF NOT EXISTS import_rows (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 batch_id TEXT NOT NULL REFERENCES import_batches(id),
 source_index INTEGER NOT NULL,
 client_id TEXT NOT NULL REFERENCES clients(id),
 created_at TEXT NOT NULL,
 UNIQUE(batch_id,source_index)
);
CREATE INDEX IF NOT EXISTS import_rows_batch ON import_rows(firm_id,batch_id);
CREATE TABLE IF NOT EXISTS import_errors (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 batch_id TEXT NOT NULL REFERENCES import_batches(id),
 source_index INTEGER NOT NULL,
 reasons TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(batch_id,source_index)
);

-- An archived client no longer occupies its former code in the active master.
DROP INDEX IF EXISTS clients_firm_code_unique;
CREATE UNIQUE INDEX clients_firm_code_unique ON clients(firm_id,code) WHERE code IS NOT NULL AND archived_at IS NULL;
