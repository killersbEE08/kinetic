import { describe, expect, it } from "vitest";
import { fuzzyScore } from "./palette-score";

describe("command palette search", () => {
  it("matches substrings and ranks word starts first", () => {
    expect(fuzzyScore("pro", "Acme proposal")).toBeGreaterThan(0);
    expect(fuzzyScore("pro", "Proposal")).toBeGreaterThan(fuzzyScore("pro", "Approve"));
  });
  it("matches letters in order (subsequence)", () => {
    expect(fuzzyScore("qrv", "Q3 review")).toBeGreaterThan(0);
    expect(fuzzyScore("zzz", "Q3 review")).toBe(0);
  });
  it("matches everything for an empty query", () => {
    expect(fuzzyScore("  ", "Anything")).toBe(1);
  });
});
