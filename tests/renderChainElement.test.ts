// @vitest-environment jsdom
import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRenderChain, nearestHostElement } from "../src/fiber";

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("buildRenderChain element tracking", () => {
  it("points the host entry at the clicked element itself", () => {
    function App() {
      return createElement("button", { id: "target" }, "click me");
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      act(() => root.render(createElement(App)));
      const button = document.getElementById("target")!;
      const chain = buildRenderChain(button);
      expect(chain[0].kind).toBe("host");
      expect(chain[0].element).toBe(button);
    } finally {
      act(() => root.unmount());
    }
  });

  it("resolves a wrapping host component's element to its own root, not the clicked descendant", () => {
    // Container renders <section>{children}</section> — its own host
    // output — so hovering "Container" in Source should highlight the
    // whole section, not just whichever child element was clicked.
    function Container({ children }: { children?: React.ReactNode }) {
      return createElement("section", { id: "wrapper" }, children as never);
    }
    function App() {
      return createElement(
        Container,
        null,
        createElement("span", { id: "leaf" }, "hi"),
      );
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      act(() => root.render(createElement(App)));
      const leaf = document.getElementById("leaf")!;
      const section = document.getElementById("wrapper")!;
      const chain = buildRenderChain(leaf);
      expect(chain[0].element).toBe(leaf);
      const containerEntry = chain.find((e) => e.name === "Container")!;
      expect(containerEntry).toBeDefined();
      expect(containerEntry.element).toBe(section);
    } finally {
      act(() => root.unmount());
    }
  });

  it("descends past a true passthrough component (no host of its own) to the nearest host descendant", () => {
    // Passthrough renders `children` directly with no wrapping host node,
    // so its own `element` should resolve past it to whatever the first
    // real DOM descendant is — mirroring componentTree.ts's convention.
    function Passthrough({ children }: { children?: React.ReactNode }) {
      return children as never;
    }
    function App() {
      return createElement(
        Passthrough,
        null,
        createElement("span", { id: "first" }, "a"),
      );
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      act(() => root.render(createElement(App)));
      const first = document.getElementById("first")!;
      const chain = buildRenderChain(first);
      const passthroughEntry = chain.find((e) => e.name === "Passthrough")!;
      expect(passthroughEntry).toBeDefined();
      expect(passthroughEntry.element).toBe(first);
    } finally {
      act(() => root.unmount());
    }
  });

  it("finds the host sibling of a first child that renders null (Emotion's Insertion pattern)", () => {
    // MUI's styled() (built on Emotion) renders internally as
    // `<Fragment><Insertion/><StyledHost/></Fragment>` — a real first
    // *child* fiber (Insertion) that renders null for a CSS side effect,
    // with the actual host sitting next to it as a *sibling*, not a
    // descendant. A walk that only follows `.child` dead-ends at
    // Insertion and never finds the host at all.
    function SideEffect() {
      return null;
    }
    function StyledLike({ children }: { children?: React.ReactNode }) {
      return createElement(
        Fragment,
        null,
        createElement(SideEffect),
        createElement("div", { id: "styled-host" }, children as never),
      );
    }
    function App() {
      return createElement(
        StyledLike,
        null,
        createElement("span", { id: "leaf" }, "hi"),
      );
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      act(() => root.render(createElement(App)));
      const leaf = document.getElementById("leaf")!;
      const host = document.getElementById("styled-host")!;
      const chain = buildRenderChain(leaf);
      const styledEntry = chain.find((e) => e.name === "StyledLike")!;
      expect(styledEntry).toBeDefined();
      expect(styledEntry.element).toBe(host);
    } finally {
      act(() => root.unmount());
    }
  });

  it("nearestHostElement returns null when nothing in the subtree renders a host", () => {
    // A chain of function-component fibers with no host (tag 5) fiber
    // anywhere below — e.g. a component that renders null.
    const leaf = { type: Object, child: null };
    const middle = { type: Object, child: leaf };
    expect(nearestHostElement(middle)).toBeNull();
    expect(nearestHostElement(null)).toBeNull();
  });
});
