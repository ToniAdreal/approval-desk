# Approval Desk

An Agent-Native app where a human and an agent collaborate on a real task:
reviewing a queue of invoices and expense items. The agent reviews each item,
flags anomalies, and explains its reasoning; the human edits the review,
resolves flags, and makes the final approve / reject decision. The agent
never approves or rejects anything on its own.

Built for the Builder.io Agent-Native Hackathon
([builder.io/hackathon](https://www.builder.io/hackathon),
rules: [builder.io/hackathon/rules](https://www.builder.io/hackathon/rules)).
Submission deadline: 2026-11-09 23:59 PT.

## The problem

Approval queues are where agents usually fail the trust test: an agent that
auto-approves spending is a liability, and an agent that only produces a
report still leaves the human to re-do the work in another tool. Approval
Desk keeps both sides in one shared workflow — the agent does the tedious
first pass (checking totals, receipts, duplicates, and large amounts) and
the human keeps the decision, with every step visible and editable.

## How it works

One shared action surface, defined once with `defineAction()` from
`@agent-native/core/action` and used by the React UI, the agent, the CLI,
and MCP alike:

| Action | What it does |
| --- | --- |
| `seed-demo-queue` | Loads five fictitious demo items (idempotent — re-seeding never duplicates). |
| `review-queue` | Runs the agent review over every pending item: deterministic rules flag anomalies and set a recommendation (`approve` or `needs_info`). |
| `list-queue` | Reads the full queue for the human-review UI. |
| `review` | Reviews (or re-reviews) one item with a rationale. |
| `flag` | Attaches a coded anomaly to an item without changing its status. |
| `resolve-flag` | Marks one flag resolved, after a human has checked it. |
| `approve` / `reject` | Human-only decisions. Approve is blocked while any flag is unresolved; reject requires a reason. |

Agent review rules (deterministic, no LLM key required):

- `AMOUNT_MISMATCH` — the expected total on file differs from the claimed amount.
- `MISSING_RECEIPT` — no receipt is attached.
- `DUPLICATE` — an earlier queue item shares title, amount, and submitter.
- `HIGH_AMOUNT` — the amount exceeds USD 10,000.

Every action is idempotent via an optional `idempotencyKey`, so a retried
agent call or a double-click cannot double-review, double-flag, or
double-decide. Approved and rejected items are terminal. The demo queue
outcome: one clean item recommended for approval, four flagged items
waiting for human review.

Human intervention UI: open `/approval-desk` in the app. It shows the
agent's recommendation and rationale per item, the flag list, an edit
control for the review, per-flag resolution, and approve / reject controls
(approve is disabled with an on-screen explanation while flags are
unresolved). The same actions power the UI and the agent, so the state
the human sees is exactly the state the agent wrote — no separate copy.

## Develop locally

```bash
pnpm install
pnpm dev
```

Then open the app and go to `/approval-desk`: click "Load demo queue",
then "Run agent review", then work the queue as the human reviewer.

No provider key is needed for the demo flow: the deterministic rule
engine is the fallback when no LLM provider is configured, so the full
flow runs offline. With a provider key configured, the in-app agent chat
can call the same actions conversationally.

## Tests

```bash
pnpm test        # vitest suite: action behaviour, rules, end-to-end flows
pnpm typecheck   # typecheck must be clean
pnpm agent-native:doctor  # framework doctor check must report no findings
```

Test coverage: core actions (state machine, flag gating, idempotency),
the deterministic rule engine, the full agent review flow, and the human
review flow (flag resolution unblocking approval, re-review edits,
terminal-state protection).

## Honest scope note (new development)

All Approval Desk code — the store, the rule engine, the demo queue, the
actions, and the `/approval-desk` UI — was written new for this hackathon
entry starting 2026-10-28. Only generic engineering patterns were reused
(approval state machines, idempotency keys, tests). No code was copied
from any earlier project. The app shell and the `hello` example action
come from the official Agent-Native chat template scaffold
(`npx @agent-native/core create scaffold --template chat`); the template
is the starting point, not the submission. All demo data is fictitious
(invented company names, amounts, and submitters). No real user data,
spending, or credentials are involved.

## Known limitations

- The queue store is in-memory: restarting the dev server resets the
  queue (re-seed with "Load demo queue"). Persistent storage is future
  work, not a demo claim.
- The agent review in the demo flow is rule-based, not LLM-based; it
  flags only what the four rules above can detect.

## License

MIT — see [LICENSE](LICENSE).
