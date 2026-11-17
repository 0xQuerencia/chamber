# Chamber

Keyboard-first operations ERP for Indian Chartered Accountant firms.

> **Status: active rebuild.** The existing Cloudflare-hosted reference exposes a navigation shell but its source code and database are not available. This repository is a new, source-controlled implementation based on the supplied requirements and design references, **not** an export of the hidden backend.

## Product scope

- Desk: due work, blocked work, review queue and team capacity
- Client Master: contacts, services and registrations
- Work Register: assignments, owners, reviewers, due dates and status
- Document Register: required, requested, received and verified items
- Compliance: templates, recurring work periods and configurable deadlines
- Team: ownership and workload
- Activity: auditable changes to business records

## Development principles

1. Work like a serious ERP: compact registers, keyboard navigation, searchable records, dependable transactions.
2. No default fake users or sample client data in production.
3. Protect private client data with authenticated server-side access checks.
4. Never send real WhatsApp/email messages without connected approved providers and explicit recipient permission.
5. Do not hardcode statutory tax due dates.
6. Store authoritative data in the database, never in browser localStorage.
7. Keep changes small and reviewable through pull requests.

## Design references

- Supplied handwritten CA-firm requirements (Nov 2026).
- Supplied Chamber concepts: Desk, Work Register, Client Master and Document Register; TallyPrime/ERPNext-inspired density.
- Source site: https://silent-darkness-d93e.maltigamer6.workers.dev/ (external reference, not connected to this source tree).

See [product specification](docs/product-spec.md) and [delivery roadmap](docs/roadmap.md).

## Getting started

Frontend: **React 19 + TypeScript + Vite**. Animation: **Anime.js v4**, scoped to React elements with reduced-motion support. API and scheduled jobs currently run on a Cloudflare Worker backed by D1.

```bash
npm install
npm run db:local
npm run dev:preview
```

For fast frontend-only HMR, run `npm run dev:worker` and `npm run dev` in separate terminals. Vite proxies `/api` to the Worker running on port 8787. Production: `npm run deploy` builds the typechecked frontend and uploads `dist` static assets together with the Worker.

To inspect a read-only fictional workspace before firm setup, open `/?preview=1`. Never import preview records into a real firm.


## Security

This repository is private. Do not commit client records, credentials, deployment secrets or database dumps.
