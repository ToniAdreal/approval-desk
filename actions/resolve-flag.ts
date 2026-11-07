import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { approvalStore } from "@/lib/approval-store";

export default defineAction({
  description:
    "Resolve an unresolved flag on an Approval Desk queue item (human intervention): mark the first unresolved flag with the given code as resolved, unblocking approval once all flags are resolved. Resolving a code with no unresolved flag, or touching a decided item, is rejected.",
  mcpTool: true,
  schema: z.object({
    itemId: z.string().describe("ID of the queue item holding the flag"),
    code: z
      .string()
      .describe("Anomaly code of the flag to resolve (for example AMOUNT_MISMATCH)"),
    idempotencyKey: z
      .string()
      .optional()
      .describe(
        "Optional client-supplied key; replaying the same key for the same item returns the original result without re-applying it",
      ),
  }),
  run: async ({ itemId, code, idempotencyKey }) => {
    return approvalStore.resolveFlagItem({ itemId, code, idempotencyKey });
  },
});
