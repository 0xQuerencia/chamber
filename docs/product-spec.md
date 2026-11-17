# Chamber product specification

## Source evidence

The reference site publicly exposes the title **Chamber** and shortcuts: Desk (F1), Clients (F2), Team (F3), Activity & Sync (F4), Alt+N New task, Alt+C New client, Esc Close. Its backend, source code and database could not be recovered from the public page. Rebuilding is therefore informed by this visible interface and the user's supplied requirements, not a byte-for-byte copy.

## Core problem (from handwritten notes)

Small and mid-sized CA firms struggle to:
1. Know which client is missing which information for a particular month.
2. Track work allocated to articles/staff and whether/when/by whom it was finished.
3. Request and send needed client data on time.
4. Identify unassigned work and available staff.
5. Keep upcoming due dates visible.

## Required modules

- **Desk:** summary of overdue, due, blocked, awaiting review, completed; drill into records.
- **Clients:** firm-owned client records, contacts, assigned services and history.
- **Work Register:** task title, service, client, reporting period, assignee, reviewer, due date, priority, status, notes and timestamps.
- **Documents:** requirements linked to client/task; requested/received/verified states, missing-data queue, reminders and history.
- **Compliance:** recurring task templates, monthly/quarterly periods, editable regulatory deadlines (no statutory dates hardcoded).
- **Team:** principal, manager, article/staff permissions; assignment/capacity overview.
- **Activity & Sync:** immutable-style audit history and sync status/error reporting.
- **Communication:** draft + approval flows for email and authorized WhatsApp Business; later phase.
- **Exports:** CSV/Excel/Sheets; later phase.

## UX conventions

Use a professional Tally/ERP-oriented experience, not a card-heavy startup dashboard.
- Neutral enterprise palette: white/grey background, navy primary, restrained semantic badges.
- Dense sortable tables, advanced filters, sticky headers, keyboard navigation, quick-search.
- Structured two-column business forms and context drawers, accessible labels and focus states.
- Clear empty/loading/error/retry/permission states.
- Responsive, but desktop-first.

## Security contract

- Authentication on all business API requests.
- Firm-scoped access policy checked in backend on every record.
- Strong password hashes, secure sessions, CSRF defenses, rate limiting plan.
- Redact sensitive IDs, validate inputs, maintain audit timestamps.
- No public client records; no localStorage source-of-truth; no fake credentials.
- Real tax deadline rules require verified, versioned configuration and responsible review.

## Acceptance scenarios

- Principal creates client, enrolls service, assigns work and selects reporting period.
- Staff sees own tasks and updates progress.
- Manager sees missing document requirements; marks them requested/received/verified.
- Reviewer returns incomplete work or confirms completion.
- The app shows who's responsible and records who changed statuses and when.
- Recurring tasks are created without duplicating a period.
- Records remain isolated to the relevant firm.
