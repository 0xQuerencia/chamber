-- Firm profile and durable onboarding preferences.
CREATE TABLE IF NOT EXISTS firm_profiles (
 firm_id TEXT PRIMARY KEY REFERENCES firms(id),
 timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
 financial_year_start_month INTEGER NOT NULL DEFAULT 4 CHECK(financial_year_start_month BETWEEN 1 AND 12),
 working_days TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
 contact_email TEXT,
 grievance_email TEXT,
 privacy_notice_url TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
