import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { approvalStore } from "@/lib/approval-store";

export default defineAction({
  description:
    "Review an Approval Desk queue item: record the reviewer's recommendation (approve, reject, or needs_info) with a rationale, moving the item to reviewed so a human can approve or reject it.",
  mcpTool: true,
  schema: z.object({
    itemId: z.string().describe("ID of the queue item to review"),
    recommendation: z
      .enum(["approve", "reject", "needs_info"])
      .describe(
        'Reviewer recommendation: "approve", "reject", or "needs_info"',
      ),
    rationale: z
      .string()
      .min(1)
      .describe("Why this recommendation was made; shown to the human reviewer"),
    idempotencyKey: z
      .string()
      .optional()
      .describe(
        "Optional client-supplied key; replaying the same key for the same item returns the original result without applying the review twice",
      ),
  }),
  run: async ({ itemId, recommendation, rationale, idempotencyKey }) => {
    return approvalStore.reviewItem({
      itemId,
      recommendation,
      rationale,
      idempotencyKey,
    });
  },
});
