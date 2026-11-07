// M2 tests for the Approval Desk core actions: review / flag / approve /
// reject. They exercise the actions exactly as the agent, UI, CLI and MCP
// call them (through each action's `run`), plus the shared store's own
// validation. All demo data is fictitious.
import { beforeEach, describe, expect, it } from "vitest";

import { approvalStore, ApprovalStore } from "@/lib/approval-store";

import approve from "./approve";
import flag from "./flag";
import reject from "./reject";
import review from "./review";

type RunFn<TInput, TResult> = (input: TInput) => Promise<TResult>;

function runOf<TInput, TResult>(action: unknown): RunFn<TInput, TResult> {
  return (action as { run: RunFn<TInput, TResult> }).run;
}

const runReview = runOf<
  {
    itemId: string;
    recommendation: "approve" | "reject" | "needs_info";
    rationale: string;
    idempotencyKey?: string;
  },
  ReturnType<typeof approvalStore.reviewItem>
>(review);
const runFlag = runOf<
  { itemId: string; code: string; detail: string; idempotencyKey?: string },
  ReturnType<typeof approvalStore.flagItem>
>(flag);
const runApprove = runOf<
  { itemId: string; reason?: string; idempotencyKey?: string },
  ReturnType<typeof approvalStore.approveItem>
>(approve);
const runReject = runOf<
  { itemId: string; reason: string; idempotencyKey?: string },
  ReturnType<typeof approvalStore.rejectItem>
>(reject);

beforeEach(() => {
  approvalStore.reset();
  approvalStore.addItem({
    id: "item-1",
    title: "Fictitious vendor invoice",
    summary: "Monthly software subscription",
    amount: 420,
    submitter: "demo-user",
  });
  approvalStore.addItem({
    id: "item-2",
    title: "Fictitious travel expense",
    amount: 150,
    submitter: "demo-user",
  });
});

describe("happy path: review then decide", () => {
  it("reviews a pending item and approves it", async () => {
    const reviewed = await runReview({
      itemId: "item-1",
      recommendation: "approve",
      rationale: "Amount matches the attached quote.",
    });
    expect(reviewed.status).toBe("reviewed");
    expect(reviewed.review?.recommendation).toBe("approve");

    const approved = await runApprove({ itemId: "item-1", reason: "OK" });
    expect(approved.status).toBe("approved");
    expect(approved.decision).toMatchObject({ outcome: "approved", reason: "OK" });
  });

  it("reviews a pending item and rejects it with a reason", async () => {
    await runReview({
      itemId: "item-1",
      recommendation: "reject",
      rationale: "Receipt does not match the amount.",
    });
    const rejected = await runReject({
      itemId: "item-1",
      reason: "Receipt mismatch",
    });
    expect(rejected.status).toBe("rejected");
    expect(rejected.decision).toMatchObject({
      outcome: "rejected",
      reason: "Receipt mismatch",
    });
  });

  it("allows re-review to update the recommendation", async () => {
    await runReview({
      itemId: "item-1",
      recommendation: "needs_info",
      rationale: "Need the receipt.",
    });
    const updated = await runReview({
      itemId: "item-1",
      recommendation: "approve",
      rationale: "Receipt received and verified.",
    });
    expect(updated.review?.recommendation).toBe("approve");
    expect(updated.status).toBe("reviewed");
  });
});

describe("flags and state validation", () => {
  it("flags a reviewed item and blocks approval while the flag is unresolved", async () => {
    await runReview({
      itemId: "item-1",
      recommendation: "approve",
      rationale: "Looks fine.",
    });
    const flagged = await runFlag({
      itemId: "item-1",
      code: "AMOUNT_MISMATCH",
      detail: "Total differs from the quote by $20.",
    });
    expect(flagged.flags).toHaveLength(1);
    expect(flagged.flags[0].resolved).toBe(false);

    await expect(runApprove({ itemId: "item-1" })).rejects.toThrow(
      /unresolved flag/,
    );
    // A flagged item can still be rejected.
    const rejected = await runReject({ itemId: "item-1", reason: "Mismatch" });
    expect(rejected.status).toBe("rejected");
  });

  it("refuses approval before review", async () => {
    await expect(runApprove({ itemId: "item-1" })).rejects.toThrow(
      /must be reviewed/,
    );
  });

  it("refuses any mutation on a decided item", async () => {
    await runReview({
      itemId: "item-1",
      recommendation: "approve",
      rationale: "OK",
    });
    await runApprove({ itemId: "item-1" });
    await expect(
      runReview({
        itemId: "item-1",
        recommendation: "approve",
        rationale: "Again",
      }),
    ).rejects.toThrow(/already approved/);
    await expect(
      runFlag({ itemId: "item-1", code: "X", detail: "late flag" }),
    ).rejects.toThrow(/already approved/);
    await expect(
      runReject({ itemId: "item-1", reason: "too late" }),
    ).rejects.toThrow(/already approved/);
  });

  it("rejects unknown items for every action", async () => {
    await expect(
      runReview({ itemId: "nope", recommendation: "approve", rationale: "x" }),
    ).rejects.toThrow(/not found/);
    await expect(
      runFlag({ itemId: "nope", code: "X", detail: "x" }),
    ).rejects.toThrow(/not found/);
    await expect(runApprove({ itemId: "nope" })).rejects.toThrow(/not found/);
    await expect(
      runReject({ itemId: "nope", reason: "x" }),
    ).rejects.toThrow(/not found/);
  });
});

describe("idempotency", () => {
  it("replaying a review with the same key does not re-apply it", async () => {
    const first = await runReview({
      itemId: "item-1",
      recommendation: "approve",
      rationale: "OK",
      idempotencyKey: "key-1",
    });
    const replay = await runReview({
      itemId: "item-1",
      recommendation: "reject",
      rationale: "Changed mind",
      idempotencyKey: "key-1",
    });
    expect(replay).toEqual(first);
    expect(approvalStore.getItem("item-1")?.review?.recommendation).toBe(
      "approve",
    );
  });

  it("replaying a flag with the same key adds it only once", async () => {
    await runFlag({
      itemId: "item-1",
      code: "DUPLICATE",
      detail: "Same invoice seen before.",
      idempotencyKey: "flag-1",
    });
    const replay = await runFlag({
      itemId: "item-1",
      code: "DUPLICATE",
      detail: "Same invoice seen before.",
      idempotencyKey: "flag-1",
    });
    expect(replay.flags).toHaveLength(1);
  });

  it("replaying an approval with the same key returns the same decision", async () => {
    await runReview({
      itemId: "item-1",
      recommendation: "approve",
      rationale: "OK",
    });
    const first = await runApprove({
      itemId: "item-1",
      idempotencyKey: "decide-1",
    });
    const replay = await runApprove({
      itemId: "item-1",
      idempotencyKey: "decide-1",
    });
    expect(replay).toEqual(first);
    expect(replay.decision?.outcome).toBe("approved");
  });
});

describe("store validation", () => {
  it("rejects duplicate ids and negative amounts", () => {
    const store = new ApprovalStore();
    store.addItem({ id: "a", title: "First" });
    expect(() => store.addItem({ id: "a", title: "Second" })).toThrow(
      /already exists/,
    );
    expect(() => store.addItem({ id: "b", title: "Bad", amount: -5 })).toThrow(
      /amount/,
    );
  });

  it("returns copies, so callers cannot mutate stored items", () => {
    const fetched = approvalStore.getItem("item-1");
    expect(fetched).not.toBeNull();
    fetched!.title = "tampered";
    expect(approvalStore.getItem("item-1")?.title).toBe(
      "Fictitious vendor invoice",
    );
  });
});
