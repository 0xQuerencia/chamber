-- Period work automation. Due days are firm-planned dates, NOT statutory deadlines.
ALTER TABLE service_templates ADD COLUMN due_day INTEGER NOT NULL DEFAULT 15 CHECK (due_day BETWEEN 1 AND 28);
CREATE TABLE IF NOT EXISTS service_enrollments (
  id TEXT PRIMARY KEY,
  firm_id TEXT NOT NULL REFERENCES firms(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  template_id TEXT NOT NULL REFERENCES service_templates(id),
  assignee_id TEXT REFERENCES users(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(firm_id, client_id, template_id)
);
CREATE INDEX IF NOT EXISTS enrollment_firm_idx ON service_enrollments(firm_id,template_id,active);

-- Permit automation events to have an explicit system actor (NULL), not a fabricated human.
CREATE TABLE activity_new (
  id TEXT PRIMARY KEY, firm_id TEXT NOT NULL REFERENCES firms(id),
  actor_id TEXT REFERENCES users(id),
  event TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL
);
INSERT INTO activity_new SELECT id,firm_id,actor_id,event,entity_type,entity_id,details,at FROM activity;
DROP TABLE activity;
ALTER TABLE activity_new RENAME TO activity;
CREATE INDEX activity_firm_idx ON activity(firm_id,at DESC);
