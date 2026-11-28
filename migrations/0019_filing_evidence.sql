-- Manual filing evidence metadata, separate from assignment completion.
CREATE TABLE filing_evidence (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 task_id TEXT NOT NULL REFERENCES tasks(id),
 kind TEXT NOT NULL CHECK(kind IN ('return','challan','acknowledgement','certificate','other')),
 reference TEXT NOT NULL,
 filed_on TEXT NOT NULL,
 evidence_location TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 recorded_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 UNIQUE(firm_id,task_id,kind,reference)
);
CREATE INDEX filing_evidence_task ON filing_evidence(firm_id,task_id,created_at DESC);
