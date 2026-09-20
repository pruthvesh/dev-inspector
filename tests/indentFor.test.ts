import { describe, expect, it } from "vitest";
import { indentFor } from "../src/ComponentBrowser";

describe("indentFor", () => {
  it("steps 12px per level for the first 10 levels", () => {
    expect(indentFor(0)).toBe(0);
    expect(indentFor(1)).toBe(12);
    expect(indentFor(10)).toBe(120);
  });

  it("keeps increasing past 10 levels instead of flattening", () => {
    const ten = indentFor(10);
    const twenty = indentFor(20);
    const thirty = indentFor(30);
    expect(twenty).toBeGreaterThan(ten);
    expect(thirty).toBeGreaterThan(twenty);
  });

  it("keeps growing however deep the tree goes, never flattening out", () => {
    expect(indentFor(100)).toBeGreaterThan(indentFor(60));
    expect(indentFor(1000)).toBeGreaterThan(indentFor(100));
  });

  it("is strictly increasing at every depth", () => {
    let previous = -1;
    for (let depth = 0; depth <= 120; depth++) {
      const current = indentFor(depth);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });
});
