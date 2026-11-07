import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApprovalItem, Recommendation } from "@/lib/approval-store";

export function meta() {
  return [{ title: "Approval Desk" }];
}

const STATUS_LABELS: Record<ApprovalItem["status"], string> = {
  pending: "Pending",
  reviewed: "Awaiting human decision",
  approved: "Approved",
  rejected: "Rejected",
};

function actionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Operation failed.";
}

function ItemCard({ item }: { item: ApprovalItem }) {
  const [editing, setEditing] = useState(false);
  const [recommendation, setRecommendation] = useState<Recommendation>(
    item.review?.recommendation ?? "needs_info",
  );
  const [rationale, setRationale] = useState(item.review?.rationale ?? "");
  const [rejectReason, setRejectReason] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const review = useActionMutation("review");
  const resolveFlag = useActionMutation("resolve-flag");
  const approve = useActionMutation("approve");
  const reject = useActionMutation("reject");

  const decided = item.status === "approved" || item.status === "rejected";
  const unresolvedCount = item.flags.filter((flag) => !flag.resolved).length;

  async function run<T>(fn: () => Promise<T>, ok: string) {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setNotice(ok);
    } catch (error) {
      setNotice(actionErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{item.title}</h2>
        <span className="text-sm font-medium">{STATUS_LABELS[item.status]}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{item.summary}</p>
      <p className="mt-2 text-sm">
        {item.amount.toLocaleString("en-US")} {item.currency} · submitted by{" "}
        {item.submitter} · {item.id}
      </p>

      <section className="mt-3">
        <h3 className="text-sm font-semibold">Agent review</h3>
        {item.review ? (
          <p className="mt-1 text-sm">
            Recommendation: <strong>{item.review.recommendation}</strong> —{" "}
            {item.review.rationale}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Not reviewed yet. Load the demo queue and run the agent review
            above.
          </p>
        )}
      </section>

      {item.flags.length > 0 ? (
        <section className="mt-3">
          <h3 className="text-sm font-semibold">Flags</h3>
          <ul className="mt-1 space-y-2">
            {item.flags.map((flag, index) => (
              <li
                key={`${flag.code}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  <strong>{flag.code}</strong>: {flag.detail}{" "}
                  {flag.resolved ? "(resolved)" : "(unresolved)"}
                </span>
                {!flag.resolved && !decided ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          resolveFlag.mutateAsync({
                            itemId: item.id,
                            code: flag.code,
                            idempotencyKey: `ui-resolve:${flag.code}`,
                          }),
                        `Flag ${flag.code} resolved.`,
                      )
                    }
                  >
                    Resolve flag
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {item.decision ? (
        <p className="mt-3 text-sm">
          Decision: <strong>{item.decision.outcome}</strong>
          {item.decision.reason ? ` — ${item.decision.reason}` : ""}
        </p>
      ) : null}

      {!decided && item.status === "reviewed" ? (
        <section className="mt-4 space-y-3">
          {editing ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium">
                Edited recommendation
                <select
                  className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
                  value={recommendation}
                  onChange={(event) =>
                    setRecommendation(event.target.value as Recommendation)
                  }
                >
                  <option value="approve">approve</option>
                  <option value="reject">reject</option>
                  <option value="needs_info">needs_info</option>
                </select>
              </label>
              <label className="block text-sm font-medium">
                Edited rationale
                <textarea
                  className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
                  rows={3}
                  value={rationale}
                  onChange={(event) => setRationale(event.target.value)}
                />
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={busy || rationale.trim().length === 0}
                  onClick={() =>
                    run(
                      () =>
                        review.mutateAsync({
                          itemId: item.id,
                          recommendation,
                          rationale,
                        }),
                      "Review updated.",
                    ).then(() => setEditing(false))
                  }
                >
                  Save review
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setRecommendation(item.review?.recommendation ?? "needs_info");
                setRationale(item.review?.rationale ?? "");
                setEditing(true);
              }}
            >
              Edit review
            </Button>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium">
              Approval note (optional)
              <Input
                className="mt-1"
                value={approveNote}
                onChange={(event) => setApproveNote(event.target.value)}
                placeholder="Optional note recorded on approval"
              />
            </label>
            <Button
              type="button"
              disabled={busy || unresolvedCount > 0}
              title={
                unresolvedCount > 0
                  ? `${unresolvedCount} unresolved flag(s) block approval; resolve them first.`
                  : undefined
              }
              onClick={() =>
                run(
                  () =>
                    approve.mutateAsync({
                      itemId: item.id,
                      reason: approveNote || undefined,
                    }),
                  "Item approved.",
                )
              }
            >
              Approve
            </Button>
          </div>
          {unresolvedCount > 0 ? (
            <p className="text-sm text-muted-foreground">
              Approval is blocked until all {unresolvedCount} unresolved flag(s)
              are resolved.
            </p>
          ) : null}

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium">
              Rejection reason (required)
              <Input
                className="mt-1"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Why this item is rejected"
              />
            </label>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || rejectReason.trim().length === 0}
              onClick={() =>
                run(
                  () =>
                    reject.mutateAsync({
                      itemId: item.id,
                      reason: rejectReason,
                    }),
                  "Item rejected.",
                )
              }
            >
              Reject
            </Button>
          </div>
        </section>
      ) : null}

      {notice ? <p className="mt-3 text-sm">{notice}</p> : null}
    </article>
  );
}

export default function ApprovalDeskRoute() {
  const queue = useActionQuery("list-queue", {});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const seed = useActionMutation("seed-demo-queue");
  const reviewQueue = useActionMutation("review-queue");

  async function run<T>(fn: () => Promise<T>, ok: string) {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setNotice(ok);
    } catch (error) {
      setNotice(actionErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const items = queue.data?.items ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-bold">Approval Desk</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          An agent reviews each queue item and flags anomalies; a human edits
          the review, resolves flags, and makes the final approve or reject
          decision. The agent never approves or rejects on its own. All demo
          items are fictitious.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(() => seed.mutateAsync({}), "Demo queue loaded.")
          }
        >
          Load demo queue
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={() =>
            run(
              () => reviewQueue.mutateAsync({ seedIfEmpty: true }),
              "Agent review complete.",
            )
          }
        >
          Run agent review
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || queue.isFetching}
          onClick={() => queue.refetch()}
        >
          Refresh
        </Button>
      </div>

      {notice ? <p className="text-sm">{notice}</p> : null}
      {queue.isPending ? <p className="text-sm">Loading queue…</p> : null}
      {queue.isError ? (
        <p className="text-sm">
          Could not load the queue: {actionErrorMessage(queue.error)}
        </p>
      ) : null}
      {!queue.isPending && items.length === 0 ? (
        <p className="text-sm">
          The queue is empty. Load the demo queue, then run the agent review.
        </p>
      ) : null}

      <div className="space-y-4">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
