# Chamber — CA Practice Experience

## Product positioning
Chamber is an operational command center for Chartered Accountant firms. It is **not** a bookkeeping ledger, tax-filing product, or generic kanban board. It must answer:
1. Which assignment requires action now?
2. Which client has not supplied required data?
3. Who owns the work?
4. What is awaiting review?
5. What are the firm's recorded planning deadlines?

The core audience is a principal/partner, firm manager, article or staff member. Client-facing workflows come later.

## Design principles

- **Registers first.** Dense, readable lists with predictable actions and drill-down. Do not replace operational tables with decorative cards.
- **Actionability over vanity metrics.** Counts open actionable work rather than inventing revenue/savings/effort data.
- **Single source of truth.** Display D1-backed records with explicit sample mode; no hardcoded client data outside preview.
- **Fast for daily users.** Command search (Ctrl+K), keyboard shortcuts, filter chips, due-date sorting, one-click client and task opening.
- **Reviewable context.** Inspect records alongside lists; preserve a clear path back to the register.
- **Friendly restraint.** Midnight blue sidebar, soft porcelain workspace, high-contrast typography, small operational accents. No arbitrary gradients or dashboard illustrations.
- **Trust.** Planning dates are labeled as such, not represented as statutory deadlines. Draft messages are not claimed to be sent.
- **Motion with purpose.** Anime.js only for opening command menu, changing screens, and dialogs; no animation on every data row.
- **Accessible by default.** Keyboard operability, visible focus, semantic tables, labels, reduced-motion and smaller-screen navigation.

## Layout anatomy

1. **Workspace rail**: grouped Workspace, Operations and System navigation; firm identity, current member, counts of open work and pending documents.
2. **Utility bar**: location, global command trigger, active financial-year label and route to activity.
3. **Firm desk**: date-specific summary, four actionable metrics, priority queue, client follow-ups, upcoming planning dates, review handoff, assignment distribution.
4. **Registers**: search, semantic filters, sorting, compact sticky-header table, details side-by-side when space allows.
5. **Record forms**: concise labeled fields and error states; dialogs close with Escape. Never submit on selecting navigation.
6. **Status bar**: shortcut hints and read-only preview state; no fabricated system claims.

## Data definitions

- Open assignments: any assignment where status is not \`done\`.
- Past due: open assignment with nonempty due date before the user's currently displayed date.
- Waiting on clients: open assignments whose status is \`waiting\`.
- Ready for review: assignments with status \`review\`.
- Pending documents: document requirement with status \`missing\`, \`requested\` or \`rejected\`.
- Assignment distribution: number of open assignments per active or visible team member, **not** hours or employee productivity.
- Upcoming work: open assignments with a due date, sorted ascending.

## Screens and hierarchy

- **Firm Desk:** prioritization and navigation, not dense data editing.
- **Work Register:** primary action hub, cross-client task tracking and status updates.
- **Client Master:** identity and services, client-specific work history and missing-data context.
- **Document Register:** requested/received/verified lifecycle and editable request drafts.
- **Compliance:** explicitly firm-entered deadlines and service recurrence templates.
- **Team:** open assignments, not surveillance or time-on-task inference.
- **Reports:** transparent counts backed by records.
- **Activity & Sync:** events, source and limitations.

## Visual tokens

| Token | Purpose |
| --- | --- |
| \`#1c2b3d\` | Deep practice navigation rail |
| \`#f7f8fa\` | Main workspace |
| \`#19293b\` | Primary copy |
| \`#345f96\` | Actions, focus and navigation |
| \`#e1e5ea\` | Form, table and panel divisions |
| \`#b8584b\` | Overdue emphasis, not every alert |
| \`#3b9d6d\` | Positive completion |

Primary table density: around 40–44 px rows; column labels small with clear contrast.
Minimum interactive target: keep common controls around 32–36 px while maintaining accessible input labels and keyboard focus.

## Interaction checks

- Ctrl+K opens command search from anywhere in workspace; ArrowUp, ArrowDown and Enter navigate search results.
- Command search finds pages, assignments, clients and documents within the data visible to the current user.
- Keyboard focus restores after closing command search.
- Filters have pressed states; document status chips filter rather than acting as decorative counters.
- Main page menu remains available on smaller screens via an explicit drawer, not a hidden/unreachable desktop sidebar.
- A demo cannot create, export or change real records.
- Client communications remain user-reviewed drafts; no automatic sending.
- Failure and empty states are meaningful.

## Future improvements

Before production:
- browser-based WCAG keyboard and contrast audit;
- real-firm usability sessions with principal, manager, and article;
- table column customization, selection and bulk actions, virtualized large registers;
- server-side pagination and filtering for large firms;
- full per-record change history and saved views;
- mobile accessibility check;
- optional density setting;
- reliable compliance holiday/statutory date rule verification;
- cross-role authorization matrix and private field access review.

This design document describes the UX objective and current implementation scope, not a completed security or compliance certification.
