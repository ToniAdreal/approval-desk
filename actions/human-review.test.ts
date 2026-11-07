// M4 tests for the Approval Desk human-intervention flow: the human edits
// the agent's review, resolves flags, and makes the final approve/reject
// decision through the same defineActions the UI calls. All demo data is
// fictitious.
import { beforeEach, describe, expect, it } from "vitest";

import {
  type ApprovalItem,
  approvalStore,
} from "@/lib/approval-store";

import approve from "./approve";
import listQueue from "./list-queue";
import reject from "./reject";
import resolveFlag from "./resolve-flag";
import review from "./review";
import reviewQueue from "./review-queue";
import seedDemoQueueAction from "./seed-demo-queue";

type RunFn<TInput, TResult> = (input: TInput) => Promise<TResult>;

function runOf<TInput, TResult>(action: unknown): RunFn<TInput, TResult> {
  return (action as { run: RunFn<TInput, TResult> }).run;
}

const runSeed = runOf<Record<string, never>, { items: ApprovalItem[] }>(
  seedDemoQueueAction,
);
const runReviewQueue = runOf<
  { seedIfEmpty: boolean },
  { reviewedCount: number; flaggedCount: number; queue: ApprovalItem[] }
>(reviewQueue);
const runListQueue = runOf<Record<string, never>, { items: ApprovalItem[] }>(
  listQueue,
);
const runReview = runOf<
  { itemId: string; recommendation: string; rationale: string },
  ApprovalItem
>(review);
const runResolveFlag = runOf<
  { itemId: string; code: string; idempotencyKey?: string },
  ApprovalItem
>(resolveFlag);
const runApprove = runOf<
  { itemId: string; reason?: string },
  ApprovalItem
>(approve);
const runReject = runOf<{ itemId: string; reason: string }, ApprovalItem>(
  reject,
);

beforeEach(() => {
  approvalStore.reset();
});

async function reviewedDemoQueue(): Promise<ApprovalItem[]> {
  await runSeed({});
  const result = await runReviewQueue({ seedIfEmpty: true });
  expect(result.reviewedCount).toBe(5);
  return result.queue;
}

describe("resolve-flag (M4 gap closure)", () => {
  it("unblocks approval: a flagged item cannot approve until its flags resolve", async () => {
    const queue = await reviewedDemoQueue();
    const flagged = queue.find((item) => item.id === "demo-002");
    expect(flagged?.flags.map((flag) => flag.code)).toEqual([
      "AMOUNT_MISMATCH",
    ]);

    await expect(runApprove({ itemId: "demo-002" })).rejects.toThrow(
      /unresolved flag/,
    );

    const resolved = await runResolveFlag({
      itemId: "demo-002",
      code: "AMOUNT_MISMATCH",
    });
    expect(resolved.flags[0]?.resolved).toBe(true);

    const approved = await runApprove({
      itemId: "demo-002",
      reason: "Corrected total confirmed by human.",
    });
    expect(approved.status).toBe("approved");
    expect(approved.decision?.reason).toBe(
      "Corrected total confirmed by human.",
    );
  });

  it("rejects resolving a code with no unresolved flag", async () => {
    await reviewedDemoQueue();
    await expect(
      runResolveFlag({ itemId: "demo-001", code: "AMOUNT_MISMATCH" }),
    ).rejects.toThrow(/no unresolved flag/);
  });

  it("rejects resolving flags on a decided item", async () => {
    await reviewedDemoQueue();
    await runReject({ itemId: "demo-001", reason: "No longer needed." });
    await expect(
      runResolveFlag({ itemId: "demo-002", code: "AMOUNT_MISMATCH" }),
    ).resolves.toBeDefined();
    // demo-001 itself has no flags; use a flagged item that gets decided.
    await runReject({ itemId: "demo-002", reason: "Rejected instead." });
    await expect(
      runResolveFlag({ itemId: "demo-002", code: "AMOUNT_MISMATCH" }),
    ).rejects.toThrow(/already rejected/);
  });

  it("replays an idempotent resolve without changing state", async () => {
    await reviewedDemoQueue();
    const first = await runResolveFlag({
      itemId: "demo-005",
      code: "HIGH_AMOUNT",
      idempotencyKey: "ui-resolve:HIGH_AMOUNT",
    });
    const replay = await runResolveFlag({
      itemId: "demo-005",
      code: "HIGH_AMOUNT",
      idempotencyKey: "ui-resolve:HIGH_AMOUNT",
    });
    expect(replay).toEqual(first);
    expect(replay.flags.filter((flag) => flag.resolved)).toHaveLength(1);
  });
});

describe("human edits and decisions (M4 UI contract)", () => {
  it("lets the human rewrite the agent recommendation and rationale", async () => {
    await reviewedDemoQueue();
    const edited = await runReview({
      itemId: "demo-002",
      recommendation: "reject",
      rationale: "Human override: vendor confirmed the lower total is wrong.",
    });
    expect(edited.status).toBe("reviewed");
    expect(edited.review?.recommendation).toBe("reject");
    expect(edited.review?.rationale).toContain("Human override");
  });

  it("runs the full human flow end to end and keeps list-queue consistent", async () => {
    await reviewedDemoQueue();

    // demo-001 was clean: approve straight from the agent recommendation.
    await runApprove({ itemId: "demo-001" });
    // demo-005 stays blocked while its HIGH_AMOUNT flag is unresolved.
    await expect(runApprove({ itemId: "demo-005" })).rejects.toThrow(
      /unresolved flag/,
    );
    await runResolveFlag({ itemId: "demo-005", code: "HIGH_AMOUNT" });
    await runApprove({ itemId: "demo-005", reason: "Budget holder confirmed." });
    // demo-003 is rejected by the human with a reason.
    await runReject({ itemId: "demo-003", reason: "Receipt still missing." });

    const { items } = await runListQueue({});
    const byId = new Map(items.map((item) => [item.id, item]));
    expect(byId.get("demo-001")?.status).toBe("approved");
    expect(byId.get("demo-005")?.status).toBe("approved");
    expect(byId.get("demo-003")?.status).toBe("rejected");
    expect(byId.get("demo-003")?.decision?.reason).toBe(
      "Receipt still missing.",
    );
    // Untouched items still await a human decision.
    expect(byId.get("demo-002")?.status).toBe("reviewed");
    expect(byId.get("demo-004")?.status).toBe("reviewed");
  });
});
