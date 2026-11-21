# Chamber source audit — 21 November 2026

## Basis
Repository `0xQuerencia/chamber`, `main` at `c9110dd8df5a0d60117ee517ccafb601c427c9a1`.
Compared against *Chamber: End-to-End Build Plan for a CA Firm Practice Management System* (18 November 2026, 27 pages). This is a source/configuration audit, not a penetration test or end-user acceptance test.

## Actual stack
React 19, TypeScript, Vite 7, Anime.js 4, Cloudflare Worker API (JavaScript), D1 SQLite, Wrangler deployment, Cloudflare Cron. Current checked-in schema has two migrations. The existing repo is **not** the Next.js/PostgreSQL/pg-boss/S3 architecture described as a default in plan Section 4.

## Keep / refactor / replace decision (plan §5.2)
- **Keep:** React frontend and existing ERP registers; Worker routing; D1-backed records; client/task/document CRUD foundations; recurrence idempotency; existing CI smoke tests.
- **Refactor:** monolithic `frontend/src/App.tsx`; role permissions; complete client master; task lifecycle and audits; reporting queries; local state and keyboard navigation.
- **Add:** monthly client × period tracker; reusable requirement templates; inward entry; ask-by dates and deadline overrides; full review workflow; secure file storage; email/WhatsApp integrations and communication queues; Google Sheets mirror; onboarding and recovery procedures.
- **Architecture gate:** the plan requires a second enforcement layer via PostgreSQL row-level security. D1 application-scoped filtering alone does **not** satisfy that requirement. Before confidential multi-firm production use, choose PostgreSQL+RLS or document and independently validate an alternative isolation architecture. No claim of equivalent security is made.

## Existing modules
- Login/setup: password-derived hashes, server sessions and lockout; no TOTP, device registry or per-device revocation.
- Clients: create/list/search; no editing, archiving, contact directory, multi-GSTIN, import or verified PAN/GSTIN validation.
- Tasks: create, assign, status update and primitive audit events; no review decisions, task-level history, timers or bulk assignments.
- Documents: requirement rows and status changes; no file uploads, requirement templates or financial-year matrix.
- Compliance: monthly/quarterly/yearly service enrolment and one monthly Cron; due rules and ask-by are not sufficient.
- Communications: clipboard and `mailto:` draft only; no provider send, receipts, opt-in or reminders.
- Reports: in-browser counts; bootstrap truncates task/document/activity results; no reliable paginated reporting aggregates.
- Activity: operational events; incomplete security logs; no Sheets mirror.
- Deployment: Cloudflare Worker `chamber-erp`, D1 `chamber-db`; no staging resources verified.

## Security observations
- **High:** staff bootstrap originally returned complete PAN/GSTIN/notes from D1 even if UI masked display. This PR minimizes those fields for staff.
- **High:** manager visibility is all clients in firm, not only manager's team as demanded by plan §9.2.
- **High:** no multi-factor authentication or device/session management.
- **High:** no PostgreSQL row-level security or complete cross-tenant matrix tests.
- **High:** exports, sign-ins and sign-outs were not consistently captured in activity; this PR adds basic events, not a complete security audit system.
- **High:** no tested backup/restore/runbooks or confidential file controls.
- **Process:** `main` is unprotected and repository is public even though README says private.
- **Data:** no strict PAN/GSTIN validation, duplicates, retention policy or verified data residency.
- No user-supplied or production client data was inspected.

## Current CI
`npm run build`, `node --check`, Node validation unit tests and a Worker/D1 smoke suite. Last `main` check passed, but no Playwright keyboard journey suite, axe, k6, RLS tests, secret scanning, penetration test, or restore drill exists in the repo.

## Definition of done for a real-firm pilot
Complete plan §11 and Appendix C, with access-control tests, MFA, audit trail, isolated environments, recovery drill, verified legal obligations, security review and the five end-to-end journeys. Keep staging seeded only with fictional data.

## Implementation sequence
1. Access controls and authorization matrix, tests, CI, lockfile.
2. Complete schema and domain logic (clients, services, requirements, tasks, overrides).
3. Monthly tracker, inward entry and keyboard-only acceptance tests.
4. Secure files, bulk communications, reminders and inbound processing.
5. Dashboards, Sheets mirror, onboarding, reports and pilot hardening.

This document records technical gaps; it does **not** certify Chamber as production-ready.
