-- Firm-owned communication templates, per-recipient drafts and reminder configuration.
CREATE TABLE IF NOT EXISTS message_templates (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 name TEXT NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('email','whatsapp')),
 category TEXT NOT NULL DEFAULT 'document_request',
 body TEXT NOT NULL,
 provider_template_id TEXT,
 approval_status TEXT NOT NULL DEFAULT 'unsubmitted',
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS message_template_lookup ON message_templates(firm_id,channel,active);
CREATE TABLE IF NOT EXISTS message_batches (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 created_by TEXT NOT NULL REFERENCES users(id),
 channel TEXT NOT NULL CHECK(channel IN ('email','whatsapp')),
 period TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','cancelled','queued','completed')),
 recipient_count INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 scheduled_at TEXT
);
CREATE INDEX IF NOT EXISTS message_batches_firm ON message_batches(firm_id,created_at DESC);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 batch_id TEXT NOT NULL REFERENCES message_batches(id),
 client_id TEXT NOT NULL REFERENCES clients(id),
 contact_id TEXT REFERENCES client_contacts(id),
 channel TEXT NOT NULL CHECK(channel IN ('email','whatsapp')),
 recipient TEXT NOT NULL,
 body TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','cancelled','manual_opened','queued','sent','delivered','read','failed')),
 provider_id TEXT,
 error TEXT,
 created_at TEXT NOT NULL,
 last_status_at TEXT NOT NULL,
 UNIQUE(batch_id,client_id)
);
CREATE INDEX IF NOT EXISTS message_lookup ON messages(firm_id,client_id,created_at DESC);
CREATE TABLE IF NOT EXISTS reminder_rules (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 ask_days INTEGER NOT NULL DEFAULT 10,
 remind_days INTEGER NOT NULL DEFAULT 6,
 escalate_days INTEGER NOT NULL DEFAULT 3,
 quiet_start TEXT NOT NULL DEFAULT '21:00',
 quiet_end TEXT NOT NULL DEFAULT '08:00',
 max_reminders INTEGER NOT NULL DEFAULT 4,
 enabled INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 UNIQUE(firm_id)
);
