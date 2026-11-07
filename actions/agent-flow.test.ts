// M3 tests for the Approval Desk agent flow end to end: deterministic
// rules, demo seeding, the review-queue action, and the human-review
// queue read. All demo data is fictitious.
import { beforeEach, describe, expect, it } from "vitest";

import { analyzeItem } from "@/lib/agent-rules";
import {
  type ApprovalItem,
  approvalStore,
} from "@/lib/approval-store";
import { DEMO_ITEMS, seedDemoQueue } from "@/lib/demo-queue";

import listQueue from "./list-queue";
import reviewQueue from "./review-queue";
import seedDemoQueueAction from "./seed-demo-queue";

type RunFn<TInput, TResult> = (input: TInput) => Promise<TResult>;

function runOf<TInput, TResult>(action: unknown): RunFn<TInput, TResult> {
  return (action as { run: RunFn<TInput, TResult> }).run;
}

const runSeed = runOf<
  Record<string, never>,
  { seeded: string[]; skipped: string[]; items: ApprovalItem[] }
>(seedDemoQueueAction);
const runReviewQueue = runOf<
  { seedIfEmpty: boolean },
  {
    seeded: { seeded: string[]; skipped: string[] } | null;
    reviewed: { id: string; recommendation: string; flags: string[] }[];
    reviewedCount: number;
    flaggedCount: number;
    queue: ApprovalItem[];
  }
>(reviewQueue);
const runListQueue = runOf<
  Record<string, never>,
  { items: ApprovalItem[] }
>(listQueue);

function itemWith(overrides: Partial<ApprovalItem>): ApprovalItem {
  return {
    id: "x",
    title: "Title",
    summary: "",
    amount: 100,
    currency: "USD",
    submitter: "someone",
    status: "pending",
    review: null,
    flags: [],
    decision: null,
    createdAt: "2026-10-28T00:00:00.000Z",
    updatedAt: "2026-10-28T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  approvalStore.reset();
});

describe("deterministic agent rules", () => {
  it("approves a clean item with no flags", () => {
    const analysis = analyzeItem(
      itemWith({ expectedAmount: 100, receiptAttached: true }),
      [itemWith({})],
    );
    expect(analysis.flags).toHaveLength(0);
    expect(analysis.recommendation).toBe("approve");
    expect(analysis.rationale).toMatch(/All checks passed/);
  });

  it("flags an amount mismatch", () => {
    const analysis = analyzeItem(
      itemWith({ amount: 2500, expectedAmount: 2300 }),
      [itemWith({ amount: 2500 })],
    );
    expect(analysis.flags.map((flag) => flag.code)).toEqual([
      "AMOUNT_MISMATCH",
    ]);
    expect(analysis.recommendation).toBe("needs_info");
  });

  it("flags a missing receipt", () => {
    const analysis = analyzeItem(
      itemWith({ receiptAttached: false }),
      [itemWith({})],
    );
    expect(analysis.flags.map((flag) => flag.code)).toEqual([
      "MISSING_RECEIPT",
    ]);
  });

  it("flags only the later copy of a duplicate", () => {
    const first = itemWith({ id: "a", title: "Same", amount: 50 });
    const second = itemWith({ id: "b", title: "Same", amount: 50 });
    const all = [first, second];
    expect(analyzeItem(first, all).flags).toHaveLength(0);
    expect(analyzeItem(second, all).flags.map((flag) => flag.code)).toEqual([
      "DUPLICATE",
    ]);
  });

  it("flags amounts over the threshold", () => {
    const analysis = analyzeItem(
      itemWith({ amount: 12000, expectedAmount: 12000 }),
      [itemWith({ amount: 12000 })],
    );
    expect(analysis.flags.map((flag) => flag.code)).toEqual(["HIGH_AMOUNT"]);
  });

  it("accumulates several flags on one item", () => {
    const analysis = analyzeItem(
      itemWith({
        amount: 12000,
        expectedAmount: 11000,
        receiptAttached: false,
      }),
      [itemWith({ amount: 12000 })],
    );
    expect(analysis.flags.map((flag) => flag.code)).toEqual([
      "AMOUNT_MISMATCH",
      "MISSING_RECEIPT",
      "HIGH_AMOUNT",
    ]);
  });
});

describe("demo seeding", () => {
  it("seeds five fictitious items and skips them on re-seed", () => {
    const first = seedDemoQueue(approvalStore);
    expect(first.seeded).toEqual(DEMO_ITEMS.map((item) => item.id));
    expect(first.skipped).toHaveLength(0);
    const second = seedDemoQueue(approvalStore);
    expect(second.seeded).toHaveLength(0);
    expect(second.skipped).toHaveLength(5);
    expect(approvalStore.listItems()).toHaveLength(5);
  });

  it("seeds through the seed-demo-queue action", async () => {
    const result = await runSeed({});
    expect(result.seeded).toHaveLength(5);
    expect(result.items).toHaveLength(5);
  });
});

describe("review-queue action end to end", () => {
  it("reviews the seeded queue into the human-review queue", async () => {
    await runSeed({});
    const result = await runReviewQueue({ seedIfEmpty: false });
    expect(result.reviewedCount).toBe(5);
    expect(result.flaggedCount).toBe(4);
    expect(result.queue).toHaveLength(5);
    expect(result.queue.every((item) => item.status === "reviewed")).toBe(
      true,
    );

    const byId = new Map(result.queue.map((item) => [item.id, item]));
    expect(byId.get("demo-001")?.review?.recommendation).toBe("approve");
    expect(byId.get("demo-001")?.flags).toHaveLength(0);
    expect(byId.get("demo-002")?.review?.recommendation).toBe("needs_info");
    expect(byId.get("demo-002")?.flags.map((flag) => flag.code)).toEqual([
      "AMOUNT_MISMATCH",
    ]);
    expect(byId.get("demo-003")?.flags.map((flag) => flag.code)).toEqual([
      "MISSING_RECEIPT",
    ]);
    expect(byId.get("demo-004")?.flags.map((flag) => flag.code)).toEqual([
      "DUPLICATE",
    ]);
    expect(byId.get("demo-005")?.flags.map((flag) => flag.code)).toEqual([
      "HIGH_AMOUNT",
    ]);
    for (const item of result.queue) {
      expect(item.review?.rationale.length).toBeGreaterThan(0);
    }
  });

  it("auto-seeds from an empty store and re-runs review nothing", async () => {
    const first = await runReviewQueue({ seedIfEmpty: true });
    expect(first.seeded?.seeded).toHaveLength(5);
    expect(first.reviewedCount).toBe(5);

    const second = await runReviewQueue({ seedIfEmpty: true });
    expect(second.seeded).toBeNull();
    expect(second.reviewedCount).toBe(0);
    // No duplicated flags from the second pass.
    const listed = await runListQueue({});
    expect(listed.items).toHaveLength(5);
    expect(
      listed.items.find((item) => item.id === "demo-004")?.flags,
    ).toHaveLength(1);
  });

  it("does not seed when seedIfEmpty is false and the store is empty", async () => {
    const result = await runReviewQueue({ seedIfEmpty: false });
    expect(result.seeded).toBeNull();
    expect(result.reviewedCount).toBe(0);
    expect(result.queue).toHaveLength(0);
  });
});
