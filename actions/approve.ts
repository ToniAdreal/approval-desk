import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { approvalStore } from "@/lib/approval-store";

export default defineAction({
  description:
    "Approve an Approval Desk queue item. Requires the item to be reviewed and to have no unresolved flags; approving an already decided item is rejected.",
  mcpTool: true,
  schema: z.object({
    itemId: z.string().describe("ID of the queue item to approve"),
    reason: z
      .string()
      .optional()
      .describe("Optional approval note recorded on the decision"),
    idempotencyKey: z
      .string()
      .optional()
      .describe(
        "Optional client-supplied key; replaying the same key for the same item returns the original decision without re-applying it",
      ),
  }),
  run: async ({ itemId, reason, idempotencyKey }) => {
    return approvalStore.approveItem({ itemId, reason, idempotencyKey });
  },
});
