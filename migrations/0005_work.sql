-- Assignment reviews, comments, timers and capacity (no surveillance signals).
ALTER TABLE tasks ADD COLUMN estimated_minutes INTEGER NOT NULL DEFAULT 60 CHECK(estimated_minutes BETWEEN 1 AND 2400);
ALTER TABLE tasks ADD COLUMN completed_by TEXT REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN started_at TEXT;
ALTER TABLE users ADD COLUMN capacity_hours_per_week INTEGER NOT NULL DEFAULT 40 CHECK(capacity_hours_per_week BETWEEN 1 AND 168);
CREATE TABLE IF NOT EXISTS task_comments (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 task_id TEXT NOT NULL REFERENCES tasks(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 body TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS task_comments_task ON task_comments(firm_id,task_id,created_at);
CREATE TABLE IF NOT EXISTS time_entries (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id),
 task_id TEXT NOT NULL REFERENCES tasks(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 started_at TEXT NOT NULL,
 stopped_at TEXT,
 duration_minutes INTEGER,
 created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_running_timer_per_person ON time_entries(firm_id,user_id) WHERE stopped_at IS NULL;
CREATE INDEX IF NOT EXISTS time_entries_task_idx ON time_entries(firm_id,task_id,started_at);
