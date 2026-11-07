import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { approvalStore } from "@/lib/approval-store";

export default defineAction({
  description:
    "Reject an Approval Desk queue item with a reason. Allowed from pending or reviewed; rejecting an already decided item is rejected.",
  mcpTool: true,
  schema: z.object({
    itemId: z.string().describe("ID of the queue item to reject"),
    reason: z
      .string()
      .min(1)
      .describe("Why the item is rejected; shown to the submitter"),
    idempotencyKey: z
      .string()
      .optional()
      .describe(
        "Optional client-supplied key; replaying the same key for the same item returns the original decision without re-applying it",
      ),
  }),
  run: async ({ itemId, reason, idempotencyKey }) => {
    return approvalStore.rejectItem({ itemId, reason, idempotencyKey });
  },
});
