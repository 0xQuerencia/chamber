-- Principal-published, revisioned internal instructions (not statutory guidance).
CREATE TABLE firm_procedures (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 service TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 published_by TEXT NOT NULL REFERENCES users(id),
 published_at TEXT NOT NULL,
 UNIQUE(firm_id,service,version)
);
CREATE INDEX firm_procedure_lookup ON firm_procedures(firm_id,service,version DESC);
