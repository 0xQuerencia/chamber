# Secure client-upload portal

The principal or manager issues an expiring, single-client, single-month link from **Client Master → Documents**. The URL uses a browser fragment, so the raw capability is not sent in ordinary HTTP request paths. Chamber stores only SHA-256 hashes of the random 256-bit link and the short-lived access token.

The registered email recipient must enter a **six-digit OTP** before seeing the checklist. OTPs are HMAC-SHA256 proof values keyed by the separate `PORTAL_OTP_PEPPER` Worker secret. They expire after 5 minutes, permit at most five guesses, and can be requested at most three times per hour per link, with a one-minute cooldown. Verified sessions expire after 15 minutes. Links expire within 1–14 days and can be revoked immediately.

## Required configuration

The portal is **disabled until** all of the following exist on the Cloudflare Worker:

- Private R2 binding `FILES` and the malware scanner callback setup from `docs/deployment.md`.
- `PORTAL_OTP_PEPPER`: a distinct, randomly generated secret of at least 32 characters, stored as a Worker secret.
- Firm-owned Gmail configuration from `docs/communications-delivery.md`, including `GMAIL_FIRM_ID` and `CHAMBER_ALLOW_DELIVERY=true`.

Never use a shared test mailbox or an unverified contact for client data. The portal never reads PAN, GSTIN or other clients' records. All client uploads are quarantined in R2 until the malware scanner reports clean; staff can only download verified-clean objects. The task assignee sees a new notification in **My Day**, and the audit log records the upload source as `portal`.

The portal currently supports **email OTP only**. WhatsApp OTP is a future provider-specific addition; do not claim it is configured.

## Validation before live use

- Generate and revoke a link; ensure it does not work after expiry or revocation.
- Verify wrong OTP, expired OTP, rate limits, and a client trying to request another client's checklist.
- Upload only PDF/JPG/PNG/CSV/XLSX up to 15 MB. Test quarantined, clean, infected and scanner-failed outcomes.
- Check assignee notification and scanner-driven tracker updates. An upload by itself is not a verified document.
- Perform a complete browser test with the firm's Gmail mailbox, private R2 bucket and an approved scanner. CI's fail-closed tests do **not** substitute for this production acceptance check.

Blueprint references: §§7.5, 7.8, 7.10 and 9.
