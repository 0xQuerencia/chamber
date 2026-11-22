-- Client master, contacts, multiple registrations and soft archive.
ALTER TABLE clients ADD COLUMN code TEXT;
ALTER TABLE clients ADD COLUMN client_group TEXT;
ALTER TABLE clients ADD COLUMN manager_id TEXT REFERENCES users(id);
ALTER TABLE clients ADD COLUMN custom_fields TEXT NOT NULL DEFAULT '{}';
ALTER TABLE clients ADD COLUMN archived_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS clients_firm_code_unique ON clients(firm_id,code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS clients_firm_archive ON clients(firm_id,archived_at,name);
CREATE TABLE IF NOT EXISTS client_contacts (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 client_id TEXT NOT NULL REFERENCES clients(id),
 name TEXT NOT NULL,
 title TEXT,
 phone TEXT,
 email TEXT,
 preferred_channel TEXT NOT NULL DEFAULT 'email' CHECK(preferred_channel IN ('email','whatsapp','phone')),
 whatsapp_opt_in_source TEXT,
 whatsapp_opt_in_at TEXT,
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS contact_client_idx ON client_contacts(firm_id,client_id,active);
CREATE TABLE IF NOT EXISTS client_gstins (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 client_id TEXT NOT NULL REFERENCES clients(id),
 gstin TEXT NOT NULL,
 state_code TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(firm_id,gstin)
);
CREATE INDEX IF NOT EXISTS client_gstins_client_idx ON client_gstins(firm_id,client_id);
