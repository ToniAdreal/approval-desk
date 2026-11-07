import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { approvalStore } from "@/lib/approval-store";
import { seedDemoQueue } from "@/lib/demo-queue";

export default defineAction({
  description:
    "Seed the Approval Desk queue with the five fictitious demo items (idempotent: items already present are skipped, never duplicated).",
  mcpTool: true,
  schema: z.object({}),
  run: async () => {
    const result = seedDemoQueue(approvalStore);
    return {
      ...result,
      items: approvalStore.listItems(),
    };
  },
});
