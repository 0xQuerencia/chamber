-- Firm-configured planning due rules. Starter definitions are NOT government-verified deadlines.
ALTER TABLE service_templates ADD COLUMN due_shift TEXT NOT NULL DEFAULT 'none'
 CHECK(due_shift IN ('none','previous_workday','next_workday'));
ALTER TABLE service_templates ADD COLUMN source_reference TEXT;
ALTER TABLE service_templates ADD COLUMN starter_code TEXT;
ALTER TABLE service_templates ADD COLUMN verified_at TEXT;
ALTER TABLE service_templates ADD COLUMN verified_by TEXT REFERENCES users(id);
CREATE UNIQUE INDEX IF NOT EXISTS template_starter_per_firm
 ON service_templates(firm_id,starter_code) WHERE starter_code IS NOT NULL;
CREATE TABLE IF NOT EXISTS compliance_holidays (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 date TEXT NOT NULL,
 name TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 UNIQUE(firm_id,date)
);
CREATE INDEX IF NOT EXISTS compliance_holidays_firm ON compliance_holidays(firm_id,date);
