import { describe, expect, it } from "vitest";
import { pruneToFound } from "../src/ComponentBrowser";
import type { ComponentNode } from "../src/componentTree";
import type { ResolvedLocation } from "../src/fiber";

function node(name: string, children: ComponentNode[] = []): ComponentNode {
  return {
    identity: {},
    element: {} as Element,
    entry: { name, kind: "component", stackFrames: [], props: undefined },
    children,
  };
}

const found: ResolvedLocation = {
  file: "src/App.tsx",
  editorFile: "src/App.tsx",
  line1: 1,
  column1: 1,
};

describe("pruneToFound", () => {
  it("keeps nodes with a resolved location", () => {
    const app = node("App");
    const locations = new Map([[app.identity, found]]);
    expect(pruneToFound([app], locations)).toEqual([{ ...app, children: [] }]);
  });

  it("drops confirmed no-source nodes and promotes their children", () => {
    const item1 = node("Item");
    const item2 = node("Item");
    const container = node("Container", [item1, item2]);
    const app = node("App", [container]);
    const locations = new Map<object, ResolvedLocation | null>([
      [app.identity, found],
      [container.identity, null], // resolved: library/generated, no app source
      [item1.identity, found],
      [item2.identity, found],
    ]);
    const pruned = pruneToFound([app], locations);
    expect(pruned.map((n) => n.entry.name)).toEqual(["App"]);
    expect(pruned[0].children.map((n) => n.entry.name)).toEqual([
      "Item",
      "Item",
    ]);
  });

  it("keeps not-yet-resolved nodes rather than dropping them prematurely", () => {
    const pending = node("Pending");
    // No entry in `locations` at all — resolution hasn't come back yet.
    expect(pruneToFound([pending], new Map())).toEqual([
      { ...pending, children: [] },
    ]);
  });

  it("promotes through multiple consecutive no-source ancestors", () => {
    const leaf = node("Leaf");
    const middle = node("Middle", [leaf]);
    const outer = node("Outer", [middle]);
    const locations = new Map<object, ResolvedLocation | null>([
      [outer.identity, null],
      [middle.identity, null],
      [leaf.identity, found],
    ]);
    const pruned = pruneToFound([outer], locations);
    expect(pruned.map((n) => n.entry.name)).toEqual(["Leaf"]);
  });
});
