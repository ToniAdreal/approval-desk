import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { approvalStore } from "@/lib/approval-store";

export default defineAction({
  description:
    "Flag an anomaly on an Approval Desk queue item (pending or reviewed): attach a coded flag with detail for the human reviewer. An item with unresolved flags cannot be approved.",
  mcpTool: true,
  schema: z.object({
    itemId: z.string().describe("ID of the queue item to flag"),
    code: z
      .string()
      .min(1)
      .describe(
        "Short anomaly code, e.g. AMOUNT_MISMATCH, MISSING_RECEIPT, DUPLICATE",
      ),
    detail: z
      .string()
      .min(1)
      .describe("What is anomalous, shown to the human reviewer"),
    idempotencyKey: z
      .string()
      .optional()
      .describe(
        "Optional client-supplied key; replaying the same key for the same item returns the original result without adding the flag twice",
      ),
  }),
  run: async ({ itemId, code, detail, idempotencyKey }) => {
    return approvalStore.flagItem({ itemId, code, detail, idempotencyKey });
  },
});
