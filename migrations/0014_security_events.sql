-- Separate work and security activity without creating a second inconsistent audit store.
ALTER TABLE activity ADD COLUMN event_class TEXT NOT NULL DEFAULT 'work'
 CHECK(event_class IN ('work','security'));
UPDATE activity SET event_class='security'
 WHERE event IN ('signed_in','signed_out','exported','revoked','configured','disconnected','mfa_enrolled','mfa_verified','access_denied','sign_in_failed','downloaded');
CREATE INDEX IF NOT EXISTS activity_security_feed ON activity(firm_id,event_class,at DESC,id);
