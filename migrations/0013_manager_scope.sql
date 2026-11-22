-- Optional reporting line for manager-owned client visibility.
ALTER TABLE users ADD COLUMN manager_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS users_reporting_line ON users(firm_id,manager_id,active);
CREATE INDEX IF NOT EXISTS clients_manager_scope ON clients(firm_id,manager_id,archived_at);
