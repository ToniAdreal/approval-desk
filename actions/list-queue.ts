import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { approvalStore } from "@/lib/approval-store";

export default defineAction({
  description:
    "List the full Approval Desk queue (the human-review queue after an agent run): every item with its status, review, flags, and decision.",
  mcpTool: true,
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    return { items: approvalStore.listItems() };
  },
});
