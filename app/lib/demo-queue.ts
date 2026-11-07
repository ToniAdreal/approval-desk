// Fictitious demo queue for Approval Desk — new code written for this
// hackathon entry (2026-10-28). All five items are invented; no real
// vendor, person, or transaction is represented. Each item exercises a
// different branch of the deterministic agent rules in agent-rules.ts:
//
//   demo-001 clean invoice          -> approve, no flags
//   demo-002 amount differs         -> AMOUNT_MISMATCH, needs_info
//   demo-003 receipt missing        -> MISSING_RECEIPT, needs_info
//   demo-004 same title/amount/     -> DUPLICATE, needs_info
//            submitter as demo-001
//   demo-005 over the threshold     -> HIGH_AMOUNT, needs_info
//
// seedDemoQueue() is idempotent: items already in the store are skipped
// and reported, never duplicated, so re-seeding a live queue is safe.

import type { ApprovalStore, NewApprovalItem } from "./approval-store";

export const DEMO_ITEMS: NewApprovalItem[] = [
  {
    id: "demo-001",
    title: "Acme Office Supplies — monthly stationery invoice",
    summary: "Fictitious monthly stationery order for the demo office.",
    amount: 420,
    currency: "USD",
    submitter: "fictitious-vendor-acme",
    expectedAmount: 420,
    receiptAttached: true,
  },
  {
    id: "demo-002",
    title: "Globex Consulting — October advisory invoice",
    summary: "Fictitious advisory services for October.",
    amount: 2500,
    currency: "USD",
    submitter: "fictitious-vendor-globex",
    expectedAmount: 2300,
    receiptAttached: true,
  },
  {
    id: "demo-003",
    title: "Initech Travel — conference flights",
    summary: "Fictitious conference travel booking.",
    amount: 1180,
    currency: "USD",
    submitter: "fictitious-vendor-initech",
    expectedAmount: 1180,
    receiptAttached: false,
  },
  {
    id: "demo-004",
    title: "Acme Office Supplies — monthly stationery invoice",
    summary: "Fictitious monthly stationery order for the demo office.",
    amount: 420,
    currency: "USD",
    submitter: "fictitious-vendor-acme",
    expectedAmount: 420,
    receiptAttached: true,
  },
  {
    id: "demo-005",
    title: "Umbrella Labs — prototype hardware order",
    summary: "Fictitious prototype hardware purchase.",
    amount: 12000,
    currency: "USD",
    submitter: "fictitious-vendor-umbrella",
    expectedAmount: 12000,
    receiptAttached: true,
  },
];

export interface SeedResult {
  seeded: string[];
  skipped: string[];
}

export function seedDemoQueue(store: ApprovalStore): SeedResult {
  const seeded: string[] = [];
  const skipped: string[] = [];
  for (const item of DEMO_ITEMS) {
    if (store.getItem(item.id)) {
      skipped.push(item.id);
    } else {
      store.addItem(item);
      seeded.push(item.id);
    }
  }
  return { seeded, skipped };
}
