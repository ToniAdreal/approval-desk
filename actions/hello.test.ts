// M1 smoke test for the official Chat-template example action.
// Proves the defineAction contract used by every later Approval Desk
// action: a typed input produces the expected result via `run`.
import { describe, expect, it } from "vitest";

import hello from "./hello";

describe("hello action (official template example)", () => {
  it("greets the given name", async () => {
    const result = await (hello as unknown as { run: (input: { name: string }) => Promise<unknown> }).run({ name: "Alex" });
    expect(result).toEqual({ message: "Hello, Alex!" });
  });

  it("defaults to world when no name is supplied", async () => {
    const result = await (hello as unknown as { run: (input: Record<string, unknown>) => Promise<unknown> }).run({});
    expect(result).toEqual({ message: "Hello, world!" });
  });
});
