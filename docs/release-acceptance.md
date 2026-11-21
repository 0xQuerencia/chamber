# Chamber release acceptance — CA firm operational product

**Status:** Release candidate code is in draft pull requests. Do **not** treat passing automated tests as evidence that production is ready to store actual CA-client PAN, GSTIN, returns, documents or other sensitive data.

## Release topology

Use **one distinct Cloudflare Worker, D1 database, R2 bucket and secrets set for staging**. The checked-in `wrangler.jsonc` is for the existing `chamber-erp` Worker and existing `chamber-db` production database. A staging template exists at `wrangler.staging.example.jsonc` with intentionally unusable database ID to prevent accidental production sharing.

1. Provision a **new staging D1 database** in the linked Cloudflare account. Insert its actual ID in a *local-only* copy of `wrangler.staging.example.jsonc`, named `wrangler.staging.jsonc`. Do not commit that local file.
2. Provision a **separate private staging R2 bucket**, configure its `FILES` binding, and connect the scanner callback to the staging Worker only.
3. Configure an unpredictable **staging-only** `SETUP_TOKEN`, 32-byte base64 `MFA_ENCRYPTION_KEY`, and 32+ character `PORTAL_OTP_PEPPER` as Wrangler secrets. Do not reuse production keys.
4. Use `npx wrangler d1 migrations apply DB --config wrangler.staging.jsonc --remote` to migrate staging and `npm run build && npx wrangler deploy --config wrangler.staging.jsonc` to deploy the standalone staging Worker.
5. Set `CHAMBER_ALLOW_DELIVERY=false` for staging until the principal has approved a sandbox mailbox, WhatsApp test number, approved Meta template, and opt-in test contacts. Production messaging must remain disabled until separately approved.
6. Give the staging URL only to authorized testers; consider Cloudflare Access for non-public environments. No real client records in test or screenshots.

## Automated gates

`npm run build` performs the TypeScript check and Vite build. `npm run check` exercises the unit and Worker validation suite. GitHub Actions Checks executes these plus local Wrangler+D1 smoke tests. A dedicated Playwright Chromium job tests sign-in with real TOTP, Client Master creation, keyboard navigation, anonymous portal access and desktop/mobile layout, including axe WCAG rule checks.

The tests use fictional records, an isolated D1 database, a CI-only MFA key and **no provider credentials**. They verify the correct **fail-closed** behavior when a provider is absent. They do not establish that Gmail, Meta, R2 scanning or Google Sheets works with a firm's actual account.

## Manual acceptance — do not mark complete on code inspection alone

| Blueprint acceptance case | Required evidence and release gate |
| --- | --- |
| 1. Principal opens Chamber and sees actionable work | Verify dashboard counts against directly paginated D1 drilldowns for due, overdue, missing, unassigned, review, waiting; verify client scope across teams |
| 2. Bulk request for 50 clients within three minutes | With written opt-ins and a firm-owned provider, record video + event IDs of recipient-specific review, one approval, undo and delivery receipts; verify zero cross-recipient data exposure |
| 3. Article opens My Day and marks information received | Verify article cannot view other managers' clients, enter notes, operate timers, open quarantine-cleared files and submit for principal review |
| 4. Repeated generation, deadline extension, review | Verify 60-day planning horizon, firm working-day/holiday rules, no duplicates, official source references, auditable overrides, review approval and rejection |
| 5. Client portal access and upload | Verify OTP email delivery, expired and revoked link denial, five failed codes, 15MB/type constraints, R2 quarantine, scanner clean/failed/infected cases, assignee notification |
| Security | External independent penetration test; cross-firm and cross-manager authorization tests, password/TOTP recovery, 7-day session review, sensitive-data export audit, WAF rate limiting |
| Accessibility | Playwright keyboard-only journey, desktop 1280 and mobile 390 layouts, axe WCAG 2.2 AA + real manual screen-reader pass |
| Performance | Measure a realistic 50-client batch and a 1,000-client tracker with k6 and real D1 indexing; no estimated performance claims |
| Disaster recovery | Complete and timestamp a staging D1 **Time Travel or SQL export → new database restore** with schema and user verification, and independent R2 file restoration test |
| Data privacy | Review registered Indian data processing obligations, grievance contact, consent and retention policies with a professional; check vendor agreements and storage location |

## Recovery procedure

Before migrations or launch:

1. Ensure D1 point-in-time recovery/Time Travel is available for the plan; check current Cloudflare D1 documentation. Create an export or a known restore point using the documented Wrangler D1 tooling. Never commit raw SQL, attachments or credentials.
2. Record the current Worker version/deployment ID and migration status, and inventory the R2 bucket's objects with appropriate restricted credentials.
3. Exercise **restoration into a new, empty staging D1 database**. Confirm all tables, the ability to create a login, and selected synthetic records; do not restore into the live DB.
4. Enable R2 backup/versioning/replication as appropriate for the actual account, then verify the clean and pending file lifecycle survives a restore. D1 Time Travel alone does not restore R2.
5. Record recovery time, data loss window, operator, date and verified results. A code rollback does **not** undo D1 schema/data migrations. Keep a documented forward-fix or rollback migration plan.

## Production cutover sequence

1. Review the complete branch diff against `main` and merge only after CI, staging and an authorized principal's sign-off. Do not merge a partial stack that depends on unpublished D1 migrations.
2. Back up production D1 and R2 (if in use), record Worker deployment version, run migrations while a maintenance window is active, and immediately test sign-in, MFA, client records and repeat generation.
3. Confirm security headers, rate limits, brute-force protection, opt-out callbacks, webhook signature validation, and no `CHAMBER_ALLOW_DELIVERY=true` until separately approved.
4. Run a controlled 5-client pilot, then 50-client pilot with two users and their real firm-owned integrations, not public demo data.
5. Monitor error rate, queue backlog, undelivered messages, pending scans, calendar rule overrides and staff support tickets. Disable sending via the delivery flag if incidents appear.
6. Do not claim the portal or automatic communications are 'live' until each vendor's real message/scan delivery has been observed and signed off.

## Known blockers as of this release candidate

- Firm-owned Gmail OAuth, approved Meta WhatsApp Business account/templates and webhook registration have not been connected or tested in this repository.
- Private R2 bucket and malware scanner are not confirmed active in the live Worker.
- Staging isolation, backup restoration, WAF, independent security test and statutory date source review are outstanding.
- Code uses D1 with firm-scoped application queries rather than PostgreSQL RLS. If the firm's deployment policy requires database-enforced row-level security, architecture migration must occur before approval.
- Current GitHub repository visibility is public, despite older README text claiming private. The owner must choose whether to make it private; no sensitive data is meant to be committed.
- This documentation is an **acceptance checklist**, not proof that the acceptance criteria are completed.

Detailed integration documentation: `docs/communications-delivery.md`, `docs/client-portal.md`, `docs/deployment.md`.
