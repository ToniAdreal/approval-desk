# Chat — Agent Guide

Chat is the minimal chat-first agent-native app. `/` redirects to shared sign-in, then `/home`, the editable Get started page. Chat lives at `/chat`; new chats start there. Actions carry capabilities; screens exist only for durable workflows.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`. For external-agent integrations, read `pnpm action docs-search --slug "external-agents"`.

## Core rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Normal app data must flow through actions. Keep actions deterministic and focused; use agent chat/AgentSidebar for AI work and follow-ups in the same thread. Keep structured state in SQL and large files in configured storage; persist references only.
- For external integrations, inspect the workspace/provider connection catalog first; reuse its scoped resolver. Never hardcode credentials, webhook URLs, or private/customer data.
- Never fabricate. Report failures and recover; verify writes by reading the row or screen. Navigation is in `<current-screen>`; use `view-screen` for fresh visible-record details.

For custom branding, keep `server/plugins/agent-native-email-branding.ts` aligned: `app.name` appears in transactional email and optional `app.logoUrl` must be an absolute HTTPS URL.

## Approval Desk actions (hackathon, added 2026-10-28)

Core queue workflow, one defineAction per file in `actions/`; UI, agent,
CLI and MCP share `app/lib/approval-store.ts`:
- `review` — record recommendation + rationale; pending/reviewed → reviewed.
- `flag` — attach a coded anomaly; items with unresolved flags cannot be approved.
- `approve` — reviewed + no unresolved flags → approved.
- `reject` — pending/reviewed → rejected, reason required.
All four accept an optional `idempotencyKey`; replays return the original
result without re-applying. Store is in-memory in M2; SQL persistence is
later-milestone work. Flag resolution is M4 work (a flagged item can be
rejected meanwhile, but not approved).
M3 agent flow (added 2026-10-28): `app/lib/agent-rules.ts` holds the
deterministic no-LLM rules (AMOUNT_MISMATCH, MISSING_RECEIPT, DUPLICATE
against earlier queue items only, HIGH_AMOUNT over USD 10000) and
`app/lib/demo-queue.ts` the five fictitious demo items; new actions
`seed-demo-queue` (idempotent seed), `review-queue` (seed-if-empty, then
flag + review every pending item into the human-review queue; re-runs
review nothing), and `list-queue` (GET read of the full queue). The agent
never auto-approves or auto-rejects; flagged items get `needs_info`.
M4 human intervention UI (added 2026-10-28): route `/approval-desk`
(`app/routes/approval-desk.tsx`, sidebar link in
`app/components/layout/Sidebar.tsx`) reads the queue with
`useActionQuery("list-queue")` and drives the same actions the agent
uses via `useActionMutation` — `seed-demo-queue`, `review-queue`,
`review` (re-review edits recommendation + rationale on a reviewed
item), `resolve-flag`, `approve` (blocked while flags are unresolved,
with the block explained in the UI), `reject` (reason required). New
action `resolve-flag` (itemId + code, idempotent) marks the first
unresolved flag with that code resolved; it closes the M2/M3 gap that
left flagged items approvable only via rejection. Mutations
auto-invalidate action queries, so UI state stays consistent with the
shared store without polling.

## Application state

- `navigation` describes the view and selected ids. Chat is `chat` at `/chat` and `/chat/<threadId>`; the Get started page is `home` at `/home`; `/` opens shared sign-in/signup.
- Use `navigate` when supported and `view-screen` for a fresh read of visible details; basic navigation is already in `<current-screen>`.

## Building a domain app

Choose the primary workflow and route before editing. Add a domain route under `app/routes/` and set `app.homePath` in `server/plugins/agent-native-email-branding.ts` with `defineAppConfig`. The default Get started page lives at `/home`, and Chat stays at `/chat`; edit `app/routes/home.tsx` when replacing that page with a domain-specific home. Add a static link in `app/components/layout/Sidebar.tsx` before `ChatThreadsSection`; `Header.tsx` uses `APP_TITLE` elsewhere. Shared sidebar and AgentInspector remain.

Use `adding-a-feature` for functional parity and `frontend-design` for a user-facing screen. Keep feature guidance here; do not rewrite `README.md` or `DESIGN.md`. After all edits, run one typecheck, one doctor check, and one browser smoke of the primary workflow, including overlap rejection, cancellation freeing the slot, and authenticated landing. Skip production build and extra test suites.

Before building common workspace or agent UI, read `agent-native-toolkit`; for supported customization, read `customizing-agent-native`.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.
