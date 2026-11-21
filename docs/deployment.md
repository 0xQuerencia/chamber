# Chamber deployment

## Local development

Requires Node.js 22 and the Cloudflare Wrangler CLI.

1. Run `npm install`.
2. Run `npx wrangler d1 migrations apply DB --local`.
3. Run `npm run dev`.
4. Visit http://localhost:8787.
5. For initial local bootstrap, configure a non-production token in `.dev.vars`: `SETUP_TOKEN=some-long-random-one-time-value`.
6. Open the first-run setup form and provide that token. Do not commit it.

**WARNING:** The checked-in `wrangler.jsonc` already points to the existing `chamber-db` deployment. Its database UUID is **not** a placeholder. Do not run `--remote` migrations or deploy this PR stack to that Worker as a staging test. Use the separate `wrangler.staging.example.jsonc` procedure in `docs/release-acceptance.md` instead.

## New remote environment

1. Provision a separate D1 database and Worker for **staging**, using a local copy of `wrangler.staging.example.jsonc`.
2. Enter that new database UUID only in the local staging configuration; never overwrite the existing production UUID.
3. Store an unpredictable setup token in Cloudflare secrets: `npx wrangler secret put SETUP_TOKEN`. Prefer 32+ random bytes, securely generated.
4. Apply migrations: `npx wrangler d1 migrations apply DB --remote`.
5. Deploy: `npx wrangler deploy`.
6. Complete one-time setup using the form, then remove SETUP_TOKEN from the runtime and redeploy.
7. Configure Cloudflare WAF or equivalent rate limits before a real client-data pilot.
8. Configure backups, recovery tests, access policies and production monitoring.

**Never attach staging/preview Workers to production D1.** Separate the deployment databases and secrets. Do not launch with real CA client records until a thorough security assessment has passed.

## First-run API behavior

- `GET /api/session` returns `needs_setup: true` while no user exists.
- `POST /api/setup` requires an `X-Setup-Token` header matching the secret and JSON firm, name, email and password.
- `POST /api/login` issues a Secure, HttpOnly, SameSite=Strict cookie over HTTPS.
- All business endpoints require an authenticated session and firm scoping.
- Browser mutation requests must originate from the same origin.

## TOTP for privileged users

Before a production deployment, create a fresh **32-byte random key** and set its base64 value as the Worker secret `MFA_ENCRYPTION_KEY` (via the host's secret manager). Do not commit it to Git or reuse the public CI-only fixture. Principals and managers cannot receive a session cookie from password login without configuring this secret and completing authenticator enrollment/verification. Keep an encrypted backup of the key in the firm's approved recovery process: losing the key makes existing encrypted MFA enrollments unreadable. Do not deploy this migration before testing the enrollment and device-revocation flow in staging.
