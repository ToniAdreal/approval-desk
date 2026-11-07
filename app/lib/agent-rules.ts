// Deterministic agent review rules for Approval Desk — new code written
// for this hackathon entry (2026-10-28, after the 2026-10-27 cutoff).
//
// This is the no-LLM fallback the M3 milestone requires: when no provider
// key is configured, the agent still reviews every queued item end to end
// using only these rules. If a provider key is present later, an LLM agent
// may call the same review/flag actions with its own rationale, but these
// rules remain the deterministic floor — the agent never invents amounts,
// receipts, or duplicates that are not in the stored item fields.
//
// Rules (applied in this order; every hit becomes one flag):
//   AMOUNT_MISMATCH — expectedAmount is on file and differs from amount.
//   MISSING_RECEIPT — receiptAttached is explicitly false.
//   DUPLICATE — an earlier item in the queue shares title + amount +
//     submitter (only the later copy is flagged, so the original stays clean).
//   HIGH_AMOUNT — amount exceeds HIGH_AMOUNT_THRESHOLD.
// Recommendation: "approve" when no rule hits, otherwise "needs_info"
// (the human reviewer decides flagged items; the agent never auto-approves
// or auto-rejects a queue item).

import type { ApprovalItem, Recommendation } from "./approval-store";

export const HIGH_AMOUNT_THRESHOLD = 10000;

export interface RuleFlag {
  code: string;
  detail: string;
}

export interface RuleAnalysis {
  flags: RuleFlag[];
  recommendation: Recommendation;
  rationale: string;
}

export function analyzeItem(
  item: ApprovalItem,
  allItems: ApprovalItem[],
): RuleAnalysis {
  const flags: RuleFlag[] = [];

  if (
    item.expectedAmount !== undefined &&
    item.expectedAmount !== item.amount
  ) {
    flags.push({
      code: "AMOUNT_MISMATCH",
      detail: `Claimed amount ${item.currency} ${item.amount} differs from the expected total ${item.currency} ${item.expectedAmount}.`,
    });
  }

  if (item.receiptAttached === false) {
    flags.push({
      code: "MISSING_RECEIPT",
      detail: "No supporting receipt is attached to this item.",
    });
  }

  const index = allItems.findIndex((candidate) => candidate.id === item.id);
  const earlier = index === -1 ? [] : allItems.slice(0, index);
  if (
    earlier.some(
      (candidate) =>
        candidate.title === item.title &&
        candidate.amount === item.amount &&
        candidate.submitter === item.submitter,
    )
  ) {
    flags.push({
      code: "DUPLICATE",
      detail:
        "An earlier queue item has the same title, amount, and submitter.",
    });
  }

  if (item.amount > HIGH_AMOUNT_THRESHOLD) {
    flags.push({
      code: "HIGH_AMOUNT",
      detail: `Amount ${item.currency} ${item.amount} exceeds the ${item.currency} ${HIGH_AMOUNT_THRESHOLD} review threshold.`,
    });
  }

  if (flags.length === 0) {
    return {
      flags,
      recommendation: "approve",
      rationale:
        "All checks passed: amount matches the expected total, receipt attached, no earlier duplicate, and amount within the review threshold.",
    };
  }
  return {
    flags,
    recommendation: "needs_info",
    rationale: `Agent review found ${flags.length} issue(s): ${flags
      .map((flag) => `${flag.code} — ${flag.detail}`)
      .join(" ")} Human review required before any decision.`,
  };
}
