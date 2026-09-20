/**
 * React fiber introspection for the DevInspector widget.
 *
 * React 19 removed `_debugSource`, so source locations are recovered from the
 * dev-only `_debugStack` (an Error captured at JSX creation). Frames pointing
 * at same-origin chunks are mapped back to original files by fetching and
 * decoding the chunk's source map client-side (Turbopack); anything else
 * falls back to the dev server's overlay resolver endpoint (webpack dev).
 * All of this only exists in development builds.
 */

import {
  RawStackFrame,
  normalizeSourcePath,
  parseComponentStack,
} from "./parseStack";
import { originalPositionFor, SourceMapPayload } from "./sourceMap";

interface ReactFiber {
  alternate?: ReactFiber | null;
  return?: ReactFiber | null;
  child?: ReactFiber | null;
  sibling?: ReactFiber | null;
  /** `{ current: Fiber }` on the HostRoot fiber; the DOM `Element` itself on
   * a host component fiber (tag 5) — shape depends on `tag`, hence `unknown`. */
  stateNode?: unknown;
  tag?: number;
  type: unknown;
  memoizedProps?: unknown;
  _debugOwner?: ReactFiber | ReactComponentInfo | null;
  _debugStack?: Error | string | null;
  _debugSource?: ReactDebugSource | null;
  _debugInfo?: unknown[] | null;
}

interface ReactDebugSource {
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
}

/** React 19's client-side representation of Server Component debug data. */
interface ReactComponentInfo {
  name?: string;
  env?: string;
  owner?: ReactComponentInfo | null;
  props?: unknown;
  stack?: unknown;
  debugStack?: Error | string | null;
  debugLocation?: Error | string | null;
}

export type EditorProtocol =
  | "vscode"
  | "vscode-insiders"
  | "cursor"
  | "windsurf";

export interface ResolverOptions {
  /** GET endpoint that opens a file in the editor (Next.js dev server). */
  editorEndpoint?: string;
  /**
   * POST endpoint that resolves bundled stack frames server-side — the
   * fallback for webpack-dev `webpack-internal:///` frames. Pass null to
   * disable the fallback entirely (e.g. on Vite).
   */
  stackFramesEndpoint?: string | null;
  /**
   * Force a specific editor by opening its URL scheme
   * (`vscode://file/…:line:col`) directly from the browser instead of asking
   * the dev server. Relative source paths need `projectRoot` to become
   * absolute; when they can't be, the dev-server endpoint is used as before.
   */
  editor?: EditorProtocol;
  /** Absolute path of the project root, e.g. "/Users/me/app" or "C:/dev/app". */
  projectRoot?: string;
}

export const DEFAULT_EDITOR_ENDPOINT = "/__nextjs_launch-editor";
export const DEFAULT_STACK_FRAMES_ENDPOINT = "/__nextjs_original-stack-frames";

export interface ResolvedLocation {
  /** Display path, e.g. "src/components/Cart/TipSection.tsx" */
  file: string;
  /** What the dev server's launch-editor endpoint should receive */
  editorFile: string;
  line1: number | null;
  column1: number | null;
}

export interface InspectedEntry {
  /** Stable identity for comparing observations of the same component. */
  identity?: object;
  /** "div.foo" for the host element, component name otherwise */
  name: string;
  kind: "host" | "component";
  stackFrames: RawStackFrame[];
  /** Snapshot of the fiber's props at inspect time */
  props: unknown;
  /** null = resolved to nothing app-owned (library code); undefined = pending */
  location?: ResolvedLocation | null;
  /**
   * DOM element to highlight for this entry — the inspected element itself
   * for the host entry, or the nearest host descendant this component
   * actually renders for a component entry. `null` when nothing renders to
   * the DOM (e.g. a Server Component with no client fiber, or a component
   * whose only output was removed).
   */
  element?: Element | null;
}

const MAX_OWNER_DEPTH = 32;
const MAX_FRAMES_PER_REQUEST = 12;

const identities = new WeakMap<object, object>();
function inspectionIdentity(value: ReactFiber | ReactComponentInfo): object {
  const alternate = "type" in value ? value.alternate : null;
  const identity = identities.get(value) ?? (alternate && identities.get(alternate)) ?? {};
  identities.set(value, identity);
  if (alternate) identities.set(alternate, identity);
  return identity;
}

/** Resolve React's committed branch, including shared children after a bailout. */
export function currentFiber(fiber: ReactFiber): ReactFiber | null {
  const alternate = fiber.alternate;
  if (!alternate) return fiber;
  let a = fiber;
  let b = alternate;
  for (let depth = 0; depth < 1000; depth++) {
    const parentA = a.return;
    if (!parentA) return a.tag === 3
      ? ((a.stateNode as { current?: ReactFiber } | null)?.current === a ? fiber : alternate) : null;
    const parentB = parentA.alternate;
    if (!parentB) {
      if (!parentA.return) return null;
      a = parentA.return;
      continue;
    }
    if (parentA.child === parentB.child) {
      for (let child = parentA.child; child; child = child.sibling) {
        if (child === a) return fiber;
        if (child === b) return alternate;
      }
      return null;
    }
    if (a.return !== b.return) {
      a = parentA;
      b = parentB;
    } else {
      let found = false;
      for (const parent of [parentA, parentB]) {
        for (let child = parent.child; child; child = child.sibling) {
          if (child !== a && child !== b) continue;
          const other = parent === parentA ? parentB : parentA;
          [a, b] = child === a ? [parent, other] : [other, parent];
          found = true;
          break;
        }
        if (found) break;
      }
      if (!found) return null;
    }
    if (a.alternate !== b) return null;
  }
  return null;
}

export function getFiberFromNode(node: Node | null): ReactFiber | null {
  let el: Element | null =
    node instanceof Element ? node : (node?.parentElement ?? null);
  while (el) {
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    if (key) {
      return currentFiber((el as unknown as Record<string, ReactFiber>)[key]);
    }
    el = el.parentElement;
  }
  return null;
}

// A full subtree visit, not a depth cap — hovering a high ancestor (e.g.
// the whole page layout) can legitimately have a large fiber subtree
// before hitting its first host node.
const MAX_HOST_SEARCH_NODES = 5000;

/**
 * A component fiber has no DOM node of its own — only host fibers (tag 5)
 * do. To highlight a component's rendered footprint (e.g. hovering an
 * ancestor in the Source chain), search its subtree for the first host
 * descendant it actually renders, in document order.
 *
 * This has to be a full pre-order walk (child *and* sibling), not a
 * straight descent through `.child` — e.g. Emotion's `styled()` (which MUI
 * builds on) renders a `<Fragment><Insertion/><StyledHost/></Fragment>`
 * internally: `Insertion` is a real first child that renders `null` for a
 * CSS side effect, so `.child` alone dead-ends there and never reaches the
 * actual host element sitting right next to it as a sibling.
 */
export function nearestHostElement(
  fiber: ReactFiber | null | undefined
): Element | null {
  const siblingStack: ReactFiber[] = [];
  let node: ReactFiber | null | undefined = fiber;
  let visited = 0;
  while (node && visited++ < MAX_HOST_SEARCH_NODES) {
    if (typeof node.type === "string" && node.stateNode instanceof Element) {
      return node.stateNode;
    }
    if (node.sibling) siblingStack.push(node.sibling);
    node = node.child ?? siblingStack.pop() ?? null;
  }
  return null;
}

function getDisplayName(type: unknown): string | null {
  if (typeof type === "string") return type;
  if (typeof type === "function") {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName || fn.name || null;
  }
  if (type && typeof type === "object") {
    const obj = type as {
      displayName?: string;
      render?: unknown;
      type?: unknown;
    };
    if (obj.displayName) return obj.displayName;
    if (obj.render) return getDisplayName(obj.render); // forwardRef
    if (obj.type) return getDisplayName(obj.type); // memo
  }
  return null;
}

function parseDebugStack(
  debugStack: Error | string | null | undefined
): RawStackFrame[] {
  const stack =
    typeof debugStack === "string" ? debugStack : debugStack?.stack;
  return parseComponentStack(stack);
}

function parseServerComponentStack(stack: unknown): RawStackFrame[] {
  if (!Array.isArray(stack)) return [];
  const frames: RawStackFrame[] = [];
  for (const value of stack) {
    if (!Array.isArray(value)) continue;
    const [methodName, file, line1, column1] = value;
    if (
      typeof file === "string" &&
      typeof line1 === "number" &&
      typeof column1 === "number"
    ) {
      frames.push({
        methodName: typeof methodName === "string" ? methodName : "<unknown>",
        file,
        line1,
        column1,
      });
    }
  }
  return frames;
}

function getStackFrames(fiber: ReactFiber): RawStackFrame[] {
  return parseDebugStack(fiber._debugStack);
}

function getComponentInfoFrames(info: ReactComponentInfo): RawStackFrame[] {
  let frames = parseDebugStack(info.debugStack);
  if (frames.length === 0) frames = parseDebugStack(info.debugLocation);
  if (frames.length === 0) frames = parseServerComponentStack(info.stack);
  const runtime = /edge/i.test(info.env ?? "") ? "edge-server" : "server";
  return frames.map((frame) => ({ ...frame, runtime }));
}

function isComponentInfo(value: unknown): value is ReactComponentInfo {
  return !!value && typeof value === "object" && !("type" in value);
}

function debugSourceLocation(
  source: ReactDebugSource | null | undefined
): ResolvedLocation | undefined {
  if (
    !source ||
    typeof source.fileName !== "string" ||
    typeof source.lineNumber !== "number"
  ) {
    return undefined;
  }
  const info = describeSource(source.fileName);
  if (info.ignored) return undefined;
  return {
    file: info.display,
    editorFile: info.editorFile,
    line1: source.lineNumber,
    column1: source.columnNumber ?? null,
  };
}

function describeHost(fiber: ReactFiber, el: Element): string {
  const tag = typeof fiber.type === "string" ? fiber.type : el.tagName.toLowerCase();
  const cls = typeof el.className === "string" ? el.className.trim() : "";
  return cls ? `${tag}.${cls.split(/\s+/)[0]}` : tag;
}

/**
 * Builds the chain to display: the clicked host element first (its JSX
 * callsite is inside the file that authored it), then the owner components
 * outward (each entry's callsite = where that component is used).
 */
export function buildInspectChain(el: Element): InspectedEntry[] {
  const fiber = getFiberFromNode(el);
  if (!fiber) return [];

  const debugInfo = fiber._debugInfo;
  const serverRuntime = Array.isArray(debugInfo)
    ? debugInfo.find(
        (value): value is ReactComponentInfo =>
          isComponentInfo(value) && typeof value.env === "string"
      )?.env
    : undefined;
  const hostRuntime: RawStackFrame["runtime"] = serverRuntime
    ? /edge/i.test(serverRuntime)
      ? "edge-server"
      : "server"
    : undefined;
  let hostFrames = getStackFrames(fiber);
  if (hostFrames.length === 0 && Array.isArray(debugInfo)) {
    for (let i = debugInfo.length - 1; i >= 0; i--) {
      const info = debugInfo[i];
      if (!isComponentInfo(info)) continue;
      hostFrames = parseDebugStack(info.debugLocation);
      if (hostFrames.length > 0) break;
    }
  }
  hostFrames = hostFrames.map((frame) =>
    hostRuntime ? { ...frame, runtime: hostRuntime } : frame
  );

  const entries: InspectedEntry[] = [
    {
      name: describeHost(fiber, el),
      identity: inspectionIdentity(fiber),
      kind: "host",
      stackFrames: hostFrames,
      props: fiber.memoizedProps,
      location: debugSourceLocation(fiber._debugSource),
      element: el,
    },
  ];

  // React 19 transports Server Component names, props, and callsites in
  // `_debugInfo` instead of representing those components as client fibers.
  // React stores the outer component first, so reverse it for the same
  // innermost-first order as the normal `_debugOwner` chain.
  const seenComponentInfo = new Set<ReactComponentInfo>();
  const appendComponentInfo = (start: ReactComponentInfo) => {
    let info: ReactComponentInfo | null | undefined = start;
    let depth = 0;
    while (info && depth++ < MAX_OWNER_DEPTH && !seenComponentInfo.has(info)) {
      seenComponentInfo.add(info);
      if (typeof info.name === "string") {
        entries.push({
          name: info.name,
          identity: inspectionIdentity(info),
          kind: "component",
          stackFrames: getComponentInfoFrames(info),
          props: info.props,
          // Server Components have no client fiber, so no DOM element to
          // point to independent of the host boundary above.
          element: null,
        });
      }
      info = info.owner;
    }
  };
  if (Array.isArray(debugInfo)) {
    for (let i = debugInfo.length - 1; i >= 0; i--) {
      const info = debugInfo[i];
      if (isComponentInfo(info)) appendComponentInfo(info);
    }
  }

  let owner = fiber._debugOwner;
  let depth = 0;
  while (owner && depth++ < MAX_OWNER_DEPTH) {
    if (isComponentInfo(owner)) {
      appendComponentInfo(owner);
      owner = owner.owner;
      continue;
    }
    const currentOwner = currentFiber(owner);
    if (!currentOwner) break;
    owner = currentOwner;
    entries.push({
      name: getDisplayName(owner.type) ?? "Anonymous",
      identity: inspectionIdentity(owner),
      kind: "component",
      stackFrames: getStackFrames(owner),
      props: owner.memoizedProps,
      location: debugSourceLocation(owner._debugSource),
      element: nearestHostElement(owner),
    });
    owner = owner._debugOwner;
  }
  return entries;
}

const MAX_RENDER_DEPTH = 200;

/** Host tags and unnamed internals (Fragment, Context.Provider/Consumer,
 * Suspense, …) don't get a tree node; named function/class/forwardRef/memo
 * components do. */
function renderAncestorName(type: unknown): string | null {
  if (typeof type === "string") return null;
  if (typeof type === "function") return getDisplayName(type) ?? "Anonymous";
  return getDisplayName(type);
}

/**
 * Builds the *actual* component nesting for `el` by walking committed
 * `fiber.return` links, unlike `buildInspectChain`'s `_debugOwner` walk
 * (who authored this JSX — right for jump-to-source, but not the same as
 * who actually renders whom). A component that only renders
 * `{props.children}` — very common in layout/grid/provider wrappers — has
 * no distinguishing owner of its own, so the owner chain skips straight to
 * whoever wrote that JSX and flattens the real nesting. Walking `.return`
 * instead keeps every real ancestor, matching what the Tree view should
 * show.
 */
export function buildRenderChain(el: Element): InspectedEntry[] {
  const fiber = getFiberFromNode(el);
  if (!fiber) return [];

  const entries: InspectedEntry[] = [
    {
      name: describeHost(fiber, el),
      identity: inspectionIdentity(fiber),
      kind: "host",
      stackFrames: getStackFrames(fiber),
      props: fiber.memoizedProps,
      location: debugSourceLocation(fiber._debugSource),
      element: el,
    },
  ];

  // Server Components have no client fiber; `_debugInfo` on the boundary
  // fiber is the only ancestry React exposes for them, so this part still
  // has to go through owner-style info rather than `.return`.
  const debugInfo = fiber._debugInfo;
  const seenComponentInfo = new Set<ReactComponentInfo>();
  const appendComponentInfo = (start: ReactComponentInfo) => {
    let info: ReactComponentInfo | null | undefined = start;
    let depth = 0;
    while (info && depth++ < MAX_OWNER_DEPTH && !seenComponentInfo.has(info)) {
      seenComponentInfo.add(info);
      if (typeof info.name === "string") {
        entries.push({
          name: info.name,
          identity: inspectionIdentity(info),
          kind: "component",
          stackFrames: getComponentInfoFrames(info),
          props: info.props,
          element: null,
        });
      }
      info = info.owner;
    }
  };
  if (Array.isArray(debugInfo)) {
    for (let i = debugInfo.length - 1; i >= 0; i--) {
      const info = debugInfo[i];
      if (isComponentInfo(info)) appendComponentInfo(info);
    }
  }

  let current = fiber.return;
  let depth = 0;
  while (current && depth++ < MAX_RENDER_DEPTH) {
    // A bailed-out subtree can leave `.return`/`.type` pointing at a stale
    // alternate — the fiber React reused unchanged from a previous render,
    // which may even have been a different component at that tree position.
    // Resolve to the committed branch at each hop, same as the owner walk
    // above does for `_debugOwner`, instead of trusting `.return` as-is.
    const resolved = currentFiber(current);
    if (!resolved) break;
    const name = renderAncestorName(resolved.type);
    if (name) {
      entries.push({
        name,
        identity: inspectionIdentity(resolved),
        kind: "component",
        stackFrames: getStackFrames(resolved),
        props: resolved.memoizedProps,
        location: debugSourceLocation(resolved._debugSource),
        element: nearestHostElement(resolved),
      });
    }
    current = resolved.return;
  }
  return entries;
}

interface SourceInfo {
  display: string;
  editorFile: string;
  ignored: boolean;
}

/** Turns a source-map `sources` entry into display + editor-openable forms. */
function describeSource(source: string): SourceInfo {
  const ignored = source.includes("node_modules");

  if (source.startsWith("turbopack://[project]/")) {
    const rel = source.slice("turbopack://[project]/".length);
    return { display: rel, editorFile: rel, ignored };
  }
  if (source.startsWith("file://")) {
    // launch-editor accepts file:// URLs as-is; for display, prefer the
    // repo-relative tail (e.g. "src/…"), falling back to the last segments.
    let path = "";
    try {
      path = decodeURIComponent(new URL(source).pathname).replace(
        /^\/(?=[A-Za-z]:)/,
        ""
      );
    } catch {
      path = source;
    }
    const rootMarker = path.match(/\/(src|app|pages|components|lib|tests|scripts|public)\//);
    const display =
      rootMarker?.index !== undefined
        ? path.slice(rootMarker.index + 1)
        : path.split("/").slice(-2).join("/");
    return { display, editorFile: source, ignored };
  }
  if (source.startsWith("webpack-internal:///")) {
    const rel = source
      .slice("webpack-internal:///".length)
      .replace(/^\.\//, "");
    return { display: rel, editorFile: rel, ignored };
  }
  const normalized = normalizeSourcePath(source);
  return { display: normalized, editorFile: normalized, ignored };
}

const sourceMapCache = new Map<string, Promise<SourceMapPayload | null>>();

/** Fetches (and caches) the sibling ".map" of a same-origin chunk URL. */
function fetchSourceMap(chunkUrl: string): Promise<SourceMapPayload | null> {
  const cached = sourceMapCache.get(chunkUrl);
  if (cached) return cached;
  const promise = fetch(`${chunkUrl}.map`)
    .then((res) => (res.ok ? (res.json() as Promise<SourceMapPayload>) : null))
    .catch(() => null);
  sourceMapCache.set(chunkUrl, promise);
  return promise;
}

async function resolveFrameViaSourceMap(
  frame: RawStackFrame
): Promise<ResolvedLocation | null> {
  let url: URL;
  try {
    url = new URL(frame.file);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.origin !== window.location.origin) return null;

  const map = await fetchSourceMap(url.origin + url.pathname);
  if (!map) return null;
  const pos = originalPositionFor(map, frame.line1 - 1, frame.column1 - 1);
  if (!pos) return null;
  const info = describeSource(pos.source);
  if (info.ignored) return null;
  return {
    file: info.display,
    editorFile: info.editorFile,
    line1: pos.line1,
    column1: pos.column1,
  };
}

interface OriginalStackFrameResult {
  status: "fulfilled" | "rejected";
  value?: {
    originalStackFrame?: {
      file: string | null;
      line1: number | null;
      column1: number | null;
      ignored: boolean;
    } | null;
  };
}

/**
 * Fallback for frames the source-map path can't handle (e.g. webpack dev's
 * "webpack-internal:///" URLs): the dev server's own overlay resolver.
 */
async function resolveViaServer(
  frames: RawStackFrame[],
  endpoint: string
): Promise<ResolvedLocation | null> {
  if (frames.length === 0) return null;
  try {
    const isEdgeServer = frames.some(
      (frame) => frame.runtime === "edge-server"
    );
    const isServer =
      !isEdgeServer &&
      frames.some(
        (frame) =>
          frame.runtime === "server" ||
          /^about:\/\/React\/Server\//i.test(frame.file)
      );
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        frames,
        // RSC stacks use this URL scheme. Older Next versions require the
        // server/app flags to select the correct source-map compilation.
        isServer,
        isEdgeServer,
        isAppDirectory: isServer || isEdgeServer,
      }),
    });
    if (!res.ok) return null;
    const results = (await res.json()) as OriginalStackFrameResult[];
    for (const result of results) {
      const frame =
        result.status === "fulfilled" ? result.value?.originalStackFrame : null;
      if (!frame?.file || frame.ignored) continue;
      const file = normalizeSourcePath(frame.file);
      if (file.includes("node_modules")) continue;
      return {
        file,
        editorFile: file,
        line1: frame.line1,
        column1: frame.column1,
      };
    }
  } catch {
    // Dev server unreachable — nothing to resolve against.
  }
  return null;
}

const locationCache = new Map<string, Promise<ResolvedLocation | null>>();

/**
 * Resolves raw (bundled) stack frames to the first app-owned original source
 * location. Returns null when everything is library code.
 */
export function resolveLocation(
  frames: RawStackFrame[],
  options?: ResolverOptions
): Promise<ResolvedLocation | null> {
  const batch = frames.slice(0, MAX_FRAMES_PER_REQUEST);
  if (batch.length === 0) return Promise.resolve(null);

  const stackFramesEndpoint =
    options?.stackFramesEndpoint === undefined
      ? DEFAULT_STACK_FRAMES_ENDPOINT
      : options.stackFramesEndpoint;

  const cacheKey = `${stackFramesEndpoint ?? "<disabled>"}|${batch
    .map((f) => `${f.runtime ?? "client"}:${f.file}:${f.line1}:${f.column1}`)
    .join("|")}`;
  const cached = locationCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    for (const frame of batch) {
      const loc = await resolveFrameViaSourceMap(frame);
      if (loc) return loc;
    }
    if (!stackFramesEndpoint) return null;
    // The dev server resolver hangs on full http URLs — only send the rest.
    const serverFrames = batch.filter((f) => !/^https?:\/\//.test(f.file));
    return resolveViaServer(serverFrames, stackFramesEndpoint);
  })().catch(() => {
    locationCache.delete(cacheKey);
    return null;
  });

  locationCache.set(cacheKey, promise);
  return promise;
}

/**
 * Editor deep link (`vscode://file/<abs path>:<line>:<col>`), or null when
 * the source path can't be made absolute (relative path, no projectRoot).
 */
export function buildEditorUrl(
  location: ResolvedLocation,
  editor: EditorProtocol,
  projectRoot?: string
): string | null {
  let path = location.editorFile;
  if (path.startsWith("file://")) {
    try {
      path = decodeURIComponent(new URL(path).pathname);
    } catch {
      return null;
    }
  }
  // "/C:/…" (URL pathname of a Windows file) → "C:/…"
  path = path.replace(/\\/g, "/").replace(/^\/(?=[A-Za-z]:)/, "");
  if (!path.startsWith("/") && !/^[A-Za-z]:/.test(path)) {
    if (!projectRoot) return null;
    const root = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    path = `${root}/${path}`;
  }
  return `${editor}://file/${path}:${location.line1 ?? 1}:${location.column1 ?? 1}`;
}

/**
 * Opens the file in the editor: via its URL scheme when `editor` is forced
 * (and the path is resolvable), otherwise by asking the dev server.
 */
export function openInEditor(
  location: ResolvedLocation,
  options?: ResolverOptions
): void {
  if (options?.editor) {
    const url = buildEditorUrl(location, options.editor, options.projectRoot);
    if (url) {
      window.location.href = url;
      return;
    }
  }
  const endpoint = options?.editorEndpoint ?? DEFAULT_EDITOR_ENDPOINT;
  const params = new URLSearchParams({
    file: location.editorFile,
    line1: String(location.line1 ?? 1),
    column1: String(location.column1 ?? 1),
  });
  fetch(`${endpoint}?${params.toString()}`).catch(() => {
    // Dev-only convenience; nothing to do if the server rejects it.
  });
}
