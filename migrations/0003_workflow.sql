-- Client-month requirements, task history and deadline overrides.
CREATE TABLE IF NOT EXISTS requirement_templates (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 template_id TEXT NOT NULL REFERENCES service_templates(id),
 name TEXT NOT NULL,
 required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
 sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 UNIQUE(firm_id,template_id,name)
);
CREATE INDEX IF NOT EXISTS requirement_template_lookup ON requirement_templates(firm_id,template_id,sort_order);
ALTER TABLE service_templates ADD COLUMN ask_by_lead_days INTEGER NOT NULL DEFAULT 10 CHECK(ask_by_lead_days BETWEEN 0 AND 90);
ALTER TABLE tasks ADD COLUMN ask_by_date TEXT;
CREATE INDEX IF NOT EXISTS tasks_firm_period ON tasks(firm_id,period,client_id);
ALTER TABLE documents ADD COLUMN requirement_template_id TEXT REFERENCES requirement_templates(id);
ALTER TABLE documents ADD COLUMN received_via TEXT;
ALTER TABLE documents ADD COLUMN receipt_note TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS document_template_per_task ON documents(task_id,requirement_template_id) WHERE requirement_template_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS due_date_overrides (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 template_id TEXT NOT NULL REFERENCES service_templates(id),
 period TEXT NOT NULL,
 new_due_date TEXT NOT NULL,
 source_reference TEXT NOT NULL,
 changed_by TEXT NOT NULL REFERENCES users(id),
 changed_at TEXT NOT NULL,
 UNIQUE(firm_id,template_id,period)
);
CREATE INDEX IF NOT EXISTS due_overrides_lookup ON due_date_overrides(firm_id,template_id,period);
CREATE TABLE IF NOT EXISTS task_events (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 task_id TEXT NOT NULL REFERENCES tasks(id),
 actor_id TEXT REFERENCES users(id),
 from_status TEXT,
 to_status TEXT NOT NULL,
 note TEXT,
 at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS task_events_history ON task_events(firm_id,task_id,at DESC);
