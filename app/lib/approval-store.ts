// Approval Desk domain state — new code written for this hackathon entry
// (2026-10-28, after the 2026-10-27 cutoff; no code reused from any prior
// project, only the generic approval-flow pattern described in CONCEPT.md).
//
// The four core actions (actions/review.ts, flag.ts, approve.ts, reject.ts)
// all operate on this one store, so the UI, the agent, the CLI and MCP see
// the same state machine. M2 keeps the store in memory: a server restart
// resets the queue, and tests/dev seed items through addItem(). A durable
// SQL backing is follow-up work for a later milestone, not M2 scope.
//
// M3 added two optional check fields (expectedAmount, receiptAttached) so
// the deterministic agent rules can compare claimed vs expected totals and
// receipt presence without changing the M2 state machine:
//
// State machine:
//   pending --review--> reviewed --approve--> approved
//                              \--reject---> rejected
//   flag() may attach to a pending or reviewed item at any time; an item
//   with unresolved flags cannot be approved (it can still be rejected).
//   Approved/rejected are terminal: no further action may mutate them.
//
// Idempotency: every mutating method accepts an optional idempotencyKey.
// Replaying the same action + item + key returns the originally recorded
// item snapshot without re-applying the mutation, so a retried agent call
// or double-clicked UI button can never double-review, double-flag, or
// double-decide an item.

export type ItemStatus = "pending" | "reviewed" | "approved" | "rejected";

export type Recommendation = "approve" | "reject" | "needs_info";

export interface ApprovalFlag {
  code: string;
  detail: string;
  resolved: boolean;
  createdAt: string;
}

export interface ApprovalReview {
  recommendation: Recommendation;
  rationale: string;
  reviewedAt: string;
}

export interface ApprovalDecision {
  outcome: "approved" | "rejected";
  reason: string;
  decidedAt: string;
}

export interface ApprovalItem {
  id: string;
  title: string;
  summary: string;
  amount: number;
  currency: string;
  submitter: string;
  /** M3: expected total for mismatch checks; undefined means "no expectation on file". */
  expectedAmount?: number | undefined;
  /** M3: false means the supporting receipt is missing; undefined means unknown. */
  receiptAttached?: boolean | undefined;
  status: ItemStatus;
  review: ApprovalReview | null;
  flags: ApprovalFlag[];
  decision: ApprovalDecision | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewApprovalItem {
  id: string;
  title: string;
  summary?: string | undefined;
  amount?: number | undefined;
  currency?: string | undefined;
  submitter?: string | undefined;
  expectedAmount?: number | undefined;
  receiptAttached?: boolean | undefined;
}

export interface ReviewInput {
  itemId: string;
  recommendation: Recommendation;
  rationale: string;
  idempotencyKey?: string | undefined;
}

export interface FlagInput {
  itemId: string;
  code: string;
  detail: string;
  idempotencyKey?: string | undefined;
}

export interface ApproveInput {
  itemId: string;
  reason?: string | undefined;
  idempotencyKey?: string | undefined;
}

export interface RejectInput {
  itemId: string;
  reason: string;
  idempotencyKey?: string | undefined;
}

export interface ResolveFlagInput {
  itemId: string;
  code: string;
  idempotencyKey?: string | undefined;
}

function now(): string {
  return new Date().toISOString();
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function requireNonEmpty(value: string, field: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${field} must not be empty.`);
  }
}

export class ApprovalStore {
  private items = new Map<string, ApprovalItem>();
  private idempotency = new Map<string, ApprovalItem>();

  /** Test/dev seeding. Throws on duplicate id or invalid input. */
  addItem(input: NewApprovalItem): ApprovalItem {
    requireNonEmpty(input.id, "id");
    requireNonEmpty(input.title, "title");
    if (this.items.has(input.id)) {
      throw new Error(`Item ${input.id} already exists.`);
    }
    const amount = input.amount ?? 0;
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`amount for item ${input.id} must be a finite number >= 0.`);
    }
    if (
      input.expectedAmount !== undefined &&
      (!Number.isFinite(input.expectedAmount) || input.expectedAmount < 0)
    ) {
      throw new Error(
        `expectedAmount for item ${input.id} must be a finite number >= 0.`,
      );
    }
    const timestamp = now();
    const item: ApprovalItem = {
      id: input.id,
      title: input.title,
      summary: input.summary ?? "",
      amount,
      currency: input.currency ?? "USD",
      submitter: input.submitter ?? "unknown",
      expectedAmount: input.expectedAmount,
      receiptAttached: input.receiptAttached,
      status: "pending",
      review: null,
      flags: [],
      decision: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.items.set(item.id, item);
    return copy(item);
  }

  getItem(id: string): ApprovalItem | null {
    const item = this.items.get(id);
    return item ? copy(item) : null;
  }

  listItems(): ApprovalItem[] {
    return [...this.items.values()].map((item) => copy(item));
  }

  /** Clears all items and idempotency records. Test/dev only. */
  reset(): void {
    this.items.clear();
    this.idempotency.clear();
  }

  reviewItem(input: ReviewInput): ApprovalItem {
    return this.runIdempotent("review", input.itemId, input.idempotencyKey, () => {
      requireNonEmpty(input.rationale, "rationale");
      const item = this.requireStatus(
        input.itemId,
        ["pending", "reviewed"],
        "review",
      );
      const timestamp = now();
      item.review = {
        recommendation: input.recommendation,
        rationale: input.rationale,
        reviewedAt: timestamp,
      };
      item.status = "reviewed";
      item.updatedAt = timestamp;
      return copy(item);
    });
  }

  flagItem(input: FlagInput): ApprovalItem {
    return this.runIdempotent("flag", input.itemId, input.idempotencyKey, () => {
      requireNonEmpty(input.code, "code");
      requireNonEmpty(input.detail, "detail");
      const item = this.requireStatus(
        input.itemId,
        ["pending", "reviewed"],
        "flag",
      );
      item.flags.push({
        code: input.code,
        detail: input.detail,
        resolved: false,
        createdAt: now(),
      });
      item.updatedAt = now();
      return copy(item);
    });
  }

  approveItem(input: ApproveInput): ApprovalItem {
    return this.runIdempotent("approve", input.itemId, input.idempotencyKey, () => {
      const item = this.requireStatus(
        input.itemId,
        ["reviewed"],
        "approve",
        `Item ${input.itemId} must be reviewed before it can be approved (current status: ${this.items.get(input.itemId)?.status}).`,
      );
      const unresolved = item.flags.filter((flag) => !flag.resolved).length;
      if (unresolved > 0) {
        throw new Error(
          `Item ${input.itemId} has ${unresolved} unresolved flag(s); resolve flags before approving.`,
        );
      }
      const timestamp = now();
      item.status = "approved";
      item.decision = {
        outcome: "approved",
        reason: input.reason ?? "",
        decidedAt: timestamp,
      };
      item.updatedAt = timestamp;
      return copy(item);
    });
  }

  rejectItem(input: RejectInput): ApprovalItem {
    return this.runIdempotent("reject", input.itemId, input.idempotencyKey, () => {
      requireNonEmpty(input.reason, "reason");
      const item = this.requireStatus(
        input.itemId,
        ["pending", "reviewed"],
        "reject",
      );
      const timestamp = now();
      item.status = "rejected";
      item.decision = {
        outcome: "rejected",
        reason: input.reason,
        decidedAt: timestamp,
      };
      item.updatedAt = timestamp;
      return copy(item);
    });
  }

  /**
   * M4: resolve the first unresolved flag with the given code. This is the
   * human-intervention step that unblocks approval: approveItem() refuses
   * items with unresolved flags, so a human must resolve each flag (after
   * checking the underlying issue) before approving. Resolving an
   * already-resolved code, or a code the item never had, throws; decided
   * items are terminal and cannot have flags resolved.
   */
  resolveFlagItem(input: ResolveFlagInput): ApprovalItem {
    return this.runIdempotent(
      "resolve-flag",
      input.itemId,
      input.idempotencyKey,
      () => {
        requireNonEmpty(input.code, "code");
        const item = this.requireStatus(
          input.itemId,
          ["pending", "reviewed"],
          "resolve flag on",
        );
        const flag = item.flags.find(
          (candidate) => candidate.code === input.code && !candidate.resolved,
        );
        if (!flag) {
          throw new Error(
            `Item ${input.itemId} has no unresolved flag with code ${input.code}.`,
          );
        }
        flag.resolved = true;
        item.updatedAt = now();
        return copy(item);
      },
    );
  }

  private requireStatus(
    itemId: string,
    allowed: ItemStatus[],
    verb: string,
    wrongStatusMessage?: string,
  ): ApprovalItem {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not found.`);
    }
    if (item.status === "approved" || item.status === "rejected") {
      throw new Error(
        `Item ${itemId} is already ${item.status}; ${verb} is not allowed on a decided item.`,
      );
    }
    if (!allowed.includes(item.status)) {
      throw new Error(
        wrongStatusMessage ??
          `Item ${itemId} cannot be ${verb}ed from status ${item.status}.`,
      );
    }
    return item;
  }

  private runIdempotent(
    action: string,
    itemId: string,
    key: string | undefined,
    fn: () => ApprovalItem,
  ): ApprovalItem {
    if (!key) {
      return fn();
    }
    const recordKey = `${action}:${itemId}:${key}`;
    const hit = this.idempotency.get(recordKey);
    if (hit) {
      return copy(hit);
    }
    const result = fn();
    this.idempotency.set(recordKey, copy(result));
    return result;
  }
}

/** Process-wide store shared by the four core actions (UI, agent, CLI, MCP). */
export const approvalStore = new ApprovalStore();
