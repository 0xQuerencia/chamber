# Firm-owned message delivery

Chamber drafts are never sent automatically. An authenticated principal/manager must verify recipients and explicitly queue a batch.

## Single-firm Cloudflare Worker configuration

The first provider integration is intentionally **one firm per set of Worker secrets**. All sends require a matching firm ID; unmatched firms remain draft-only. For multi-firm hosting, replace the global credentials with per-firm encrypted OAuth token storage before enabling sending.

Set the following Worker secrets using Wrangler/Cloudflare secret management, **never** in Git:

- `CHAMBER_ALLOW_DELIVERY=true` (global kill switch, false by default)
- Gmail: `GMAIL_FIRM_ID`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_FROM_ADDRESS`; optionally `GMAIL_REPLY_TO`.
- WhatsApp Cloud API: `WHATSAPP_FIRM_ID`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

Gmail OAuth must be granted the least-privilege `gmail.send` scope to send from the firm's own mailbox. Use a verified sender mailbox. WhatsApp requires a registered business phone number, verified webhook subscription, contact opt-ins, and approved **Utility** templates (Meta ultimately determines category).

WhatsApp webhook endpoint: `GET/POST /api/webhooks/whatsapp`. GET uses the challenge verification token. POST verifies the `X-Hub-Signature-256` HMAC before accepting status or inbound events. Inbound messages are saved to a review inbox; incoming files and text never silently complete checklist items. STOP messages revoke recorded opt-in.

## Confirmation flow

1. Prepare a firm template and review one client-specific preview per recipient.
2. For WhatsApp, the principal records a template already approved in WhatsApp Manager. The approved template must use four **positional body variables**: client, period, missing list, due date, in that order.
3. Create a draft batch. Confirm the exact recipient count again to queue. Each queue item waits at least **30 seconds** to allow an undo before dispatch.
4. The minute-based Worker cron processes a bounded batch and pauses during **21:00–08:00 IST**, default.
5. The Gmail/Meta API returning a message ID means **provider accepted**, not delivered. WhatsApp webhook statuses supply delivered/read. A lost network response is marked failed and needs manual reconciliation to avoid duplicate sends; a definitive HTTP 429 may be retried with backoff.
6. Failed sends can be explicitly retried after checking the recipient and previous attempt.

No unofficial WhatsApp Web automation, anonymous mass mail, or message sending during login/setup. No provider token is returned to the browser.

## Release gate

- Test with company-owned sandbox mailboxes and an approved WhatsApp test number.
- Verify Meta webhook signature rejection and a real sent → delivered → read sequence.
- Verify STOP opt-out updates consent and blocks subsequent sends.
- Exercise undo within 30 seconds, queue concurrency and network failure recovery.
- Perform a real 5-client round before a 50-client round; keep the kill switch off until the principal approves a pilot.
- Do not deploy this to a production firm until external secrets, legal/privacy notices, backup recovery and security review are complete.

Sources: Chamber blueprint §7.8, Google Gmail API users.messages.send and Meta WhatsApp Cloud API documentation.
