# Google Sheets work-log mirror

Chamber's primary audit log is the D1 `activity` table. This integration mirrors **work events only** into a firm-owned Google Sheet. Security events remain in the app.

## Configuration

1. Enable Google Sheets API in a dedicated Google Cloud project.
2. Create a restricted service account for Chamber. Generate a credential JSON key only if the firm's security policy permits service-account keys.
3. Add its JSON as a **Cloudflare Worker secret**, never a tracked file:
   `npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON`
4. Share the destination spreadsheet with the service-account email as **Editor**. Share with the principal only beyond that.
5. In Chamber, sign in as principal → **Settings → Google Sheets work log**; paste the spreadsheet ID and connect.
6. Inspect the sync status and test with fictional client data first.

No real credentials or spreadsheet IDs should be included in Git history.

## Sync behavior

- Cloudflare Cron checks every minute. If credentials are absent, **no sync occurs**.
- A per-firm D1 lease reduces overlapping workers.
- Work-event rows are grouped into monthly tabs (YYYY-MM). The columns are: timestamp in IST, user, client **code**, action, brief detail, event ID.
- Sheet event IDs are compared before append. This also catches a previously completed append when D1 status was not updated due to an interruption.
- D1 records `sheet_synced_at` only after the destination confirms the append.
- A failed sync updates `last_error`; failed events remain pending in D1 for the next retry.
- No PAN, GSTIN, bank account, phone number or raw audit-details JSON is mirrored.
- No completion or delivery action depends on Sheets availability.

## Limitations and acceptance work

The service account must be securely managed, rotated and shared with each firm's destination. Test outage recovery, simultaneous workers, quota errors (HTTP 429), tab rotation, data protection retention, and larger historical logs with a dedicated staging Sheet before using live client information.

Do not represent the mirror as a certified or immutable financial audit ledger. No Sheet is automatically connected by this PR.
