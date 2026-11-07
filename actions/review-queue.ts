import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { analyzeItem } from "@/lib/agent-rules";
import { approvalStore } from "@/lib/approval-store";
import { seedDemoQueue } from "@/lib/demo-queue";

export default defineAction({
  description:
    "Run the Approval Desk agent review end to end: seed the fictitious demo queue when empty, then review each pending item with the deterministic no-LLM rules (flag anomalies, record a recommendation with rationale), leaving every item in the human-review queue. Re-running reviews nothing new.",
  mcpTool: true,
  schema: z.object({
    seedIfEmpty: z
      .boolean()
      .default(true)
      .describe(
        "Seed the fictitious demo queue first when the store is empty (default true, so a fresh process runs end to end)",
      ),
  }),
  run: async ({ seedIfEmpty }) => {
    const seeded =
      seedIfEmpty && approvalStore.listItems().length === 0
        ? seedDemoQueue(approvalStore)
        : null;

    const snapshot = approvalStore.listItems();
    const reviewed: {
      id: string;
      recommendation: string;
      flags: string[];
    }[] = [];
    for (const item of snapshot) {
      if (item.status !== "pending") {
        continue;
      }
      const analysis = analyzeItem(item, snapshot);
      for (const flag of analysis.flags) {
        approvalStore.flagItem({
          itemId: item.id,
          code: flag.code,
          detail: flag.detail,
          idempotencyKey: `review-queue:${item.id}:${flag.code}`,
        });
      }
      const result = approvalStore.reviewItem({
        itemId: item.id,
        recommendation: analysis.recommendation,
        rationale: analysis.rationale,
        idempotencyKey: `review-queue:${item.id}:review`,
      });
      reviewed.push({
        id: result.id,
        recommendation: result.review?.recommendation ?? "unknown",
        flags: result.flags.map((flag) => flag.code),
      });
    }

    const queue = approvalStore
      .listItems()
      .filter((item) => item.status === "reviewed");
    return {
      seeded,
      reviewed,
      reviewedCount: reviewed.length,
      flaggedCount: reviewed.reduce(
        (total, entry) => total + entry.flags.length,
        0,
      ),
      queue,
    };
  },
});
