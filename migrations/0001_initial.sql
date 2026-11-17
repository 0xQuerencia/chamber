PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS firms (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, firm_id TEXT NOT NULL REFERENCES firms(id),
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('principal','manager','staff')),
  salt TEXT NOT NULL, password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS users_firm_idx ON users(firm_id);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0,
  lock_until TEXT
);
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, firm_id TEXT NOT NULL REFERENCES firms(id),
  name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Business',
  pan TEXT, gstin TEXT, email TEXT, phone TEXT, notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS clients_firm_idx ON clients(firm_id,name);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, firm_id TEXT NOT NULL REFERENCES firms(id),
  client_id TEXT NOT NULL REFERENCES clients(id), title TEXT NOT NULL,
  service TEXT NOT NULL, period TEXT, due_date TEXT,
  assignee_id TEXT REFERENCES users(id), reviewer_id TEXT REFERENCES users(id),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo','in_progress','waiting','blocked','review','done')),
  notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS tasks_firm_due_idx ON tasks(firm_id,due_date);
CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks(firm_id,assignee_id,status);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, firm_id TEXT NOT NULL REFERENCES firms(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'missing'
    CHECK (status IN ('missing','requested','received','verified','rejected','not_applicable')),
  requested_at TEXT, received_at TEXT, verified_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS docs_task_idx ON documents(firm_id,task_id,status);
CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY, firm_id TEXT NOT NULL REFERENCES firms(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  event TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_firm_idx ON activity(firm_id,at DESC);
CREATE TABLE IF NOT EXISTS service_templates (
  id TEXT PRIMARY KEY, firm_id TEXT NOT NULL REFERENCES firms(id),
  name TEXT NOT NULL, service TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly','quarterly','annual')),
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recurrence_runs (
  id TEXT PRIMARY KEY, firm_id TEXT NOT NULL REFERENCES firms(id),
  template_id TEXT NOT NULL REFERENCES service_templates(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  period TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES tasks(id),
  created_at TEXT NOT NULL,
  UNIQUE(firm_id,template_id,client_id,period)
);
