-- Reminder decisions only; messages are never automatically sent by this migration.
CREATE TABLE IF NOT EXISTS reminder_suggestions (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 client_id TEXT NOT NULL REFERENCES clients(id),
 period TEXT NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('ask','remind','escalate')),
 due_date TEXT NOT NULL,
 missing_count INTEGER NOT NULL CHECK(missing_count > 0),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','prepared','resolved','dismissed')),
 prepared_batch_id TEXT REFERENCES message_batches(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(firm_id,client_id,period,stage)
);
CREATE INDEX IF NOT EXISTS reminder_suggestions_feed ON reminder_suggestions(firm_id,status,due_date);
CREATE TABLE IF NOT EXISTS reminder_client_pauses (
 firm_id TEXT NOT NULL REFERENCES firms(id),
 client_id TEXT NOT NULL REFERENCES clients(id),
 paused_until TEXT NOT NULL,
 reason TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(firm_id,client_id)
);
CREATE INDEX IF NOT EXISTS reminder_pauses_expiration ON reminder_client_pauses(firm_id,paused_until);
