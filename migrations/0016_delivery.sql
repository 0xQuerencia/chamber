-- Explicit, cancellable outbound sends with a durable retry ledger.
ALTER TABLE message_batches ADD COLUMN template_id TEXT REFERENCES message_templates(id);
ALTER TABLE message_batches ADD COLUMN queued_by TEXT REFERENCES users(id);
ALTER TABLE message_batches ADD COLUMN queued_at TEXT;
ALTER TABLE messages ADD COLUMN template_params TEXT;
ALTER TABLE messages ADD COLUMN send_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN next_attempt_at TEXT;
ALTER TABLE messages ADD COLUMN lease_until TEXT;
ALTER TABLE messages ADD COLUMN sent_at TEXT;
ALTER TABLE messages ADD COLUMN delivered_at TEXT;
ALTER TABLE messages ADD COLUMN read_at TEXT;
CREATE INDEX IF NOT EXISTS messages_delivery_queue ON messages(status,next_attempt_at,lease_until);
CREATE INDEX IF NOT EXISTS messages_provider_lookup ON messages(channel,provider_id) WHERE provider_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS delivery_events (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 message_id TEXT NOT NULL REFERENCES messages(id),
 event_type TEXT NOT NULL,
 provider_event_id TEXT,
 detail TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL,
 UNIQUE(message_id,event_type,provider_event_id)
);
CREATE INDEX IF NOT EXISTS delivery_events_message ON delivery_events(firm_id,message_id,created_at);
CREATE TABLE IF NOT EXISTS inbound_messages (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 client_id TEXT REFERENCES clients(id),
 contact_id TEXT REFERENCES client_contacts(id),
 channel TEXT NOT NULL CHECK(channel IN ('email','whatsapp')),
 sender TEXT NOT NULL,
 provider_message_id TEXT NOT NULL,
 body TEXT,
 media_id TEXT,
 received_at TEXT NOT NULL,
 reviewed_at TEXT,
 UNIQUE(firm_id,channel,provider_message_id)
);
CREATE INDEX IF NOT EXISTS inbound_messages_client ON inbound_messages(firm_id,client_id,received_at DESC);
