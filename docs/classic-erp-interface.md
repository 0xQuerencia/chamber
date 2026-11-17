# Chamber — Classic ERP interface

## Goal

Make Chamber practical for a small or mid-sized Indian CA firm. Use the visual and interaction conventions of professional accounting/ERP software: a menu strip, active company and financial year, clear master/transaction/report modules, dense registers and documented keyboard shortcuts. **Do not build a marketing dashboard.**

## Reference and provenance

The friend's original deployed Chamber page exposes the title, Desk, Clients, Team, Activity & Sync, and F1–F4 / Alt+N / Alt+C / Esc keyboard shortcuts. Its private source and hidden backend are **not** available from that page. This is a workflow-oriented reconstruction rather than an exact source or pixel copy. TallyPrime is an **interaction reference**, not branding, accounting functionality or licensing.

## Screen structure

- Fixed blue top menu: Go To, Work, Clients, Reports.
- Company bar: firm name, financial year, active view and preview indicator.
- Left Gateway menu: Masters (Client Master, Team Register), Transactions (Work Register, Document Register), Reports, Utilities.
- Centre content: full-width working registers with inline status, compact rows, minimal borders and no floating metric cards.
- Right function-key bar (desktop): F1–F7, Alt+N, Alt+C, Ctrl+K, Esc.
- Bottom key and data status strip.

## Desk / Work Control Centre

- One-line summary counts are directly selectable filters, not cards.
- Main register shows client, particulars, service, period, assignee, due date and stage.
- Pending client information and review/allocation registers sit immediately below it.
- Selecting a row opens the existing Work or Document screen; rows are not separate fake records.
- Arrow Up/Down + Enter work when the register body has focus.

## Data and safety

All listed records come from the existing authenticated workspace API; preview records are explicitly fictional. No statutory due dates are implied; configured dates are internal planning dates. Existing API auth and permissions stay unchanged. No WhatsApp or email delivery is falsely displayed as operational.

## Design rules

- Use Arial/Segoe UI, approximately 11–13px interface type, ~32px register rows.
- White workspace, pale blue-gray panels, thin separators, strong blue headings.
- Avoid oversized cards, gradient backgrounds, product illustrations, icon-only actions, or animated rows.
- Forms stay conventional with labeled fields and visible keyboard focus.
- Support smaller devices with a menu drawer; dense registers scroll horizontally rather than hiding financial fields.
- Keep copy plain and specific: Client Master, Work Register, Information Required, Assigned To, Under Review, Due Date.

## Follow-up usability tests

Test with a principal, manager and article. Measure assignment lookup time, missing document discovery, and ability to navigate without mouse. Check visible focus, contrast and accessibility. This PR is a frontend presentation change, not a production compliance or security audit.
