// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-key-rules.ts) on 2026-09-27.
// Unchanged. Keep in step with the original rather than editing here.

/**
 * What a key does on the Graph screen (v3's item 8.2). Pure -- a key and where
 * the keyboard is in, an action out.
 *
 * **The tree is one tab stop, and the arrow keys walk it** -- the WAI-ARIA tree
 * pattern, which is what a hierarchy is on the web. The design asked for
 * "arrow keys when the canvas has focus" to pan (G7c), and in a tree the arrows
 * already have a job; so the arrows move from node to node **and the view
 * follows the node they reach**, which pans the canvas by walking it. A reader
 * who wants to look somewhere reaches it; nothing is left that the arrows would
 * have panned to and cannot.
 *
 * **Fit is `0`, not `Mod-0`** (design G7a asked for `⌘0`). `Mod-0` is the
 * browser's own reset-zoom, and taking it would leave a reader who has zoomed
 * the page unable to un-zoom it on this screen (`spec/keyboard-shortcuts.md`,
 * *Keys already taken*). The zoom keys are plain `+`, `-` and `0` instead,
 * answered only while the keyboard is inside the graph -- there is no text
 * field in it, so a bare key cannot be somebody typing.
 *
 * `spec/keyboard-shortcuts.md#the-graph-item-82` is the list.
 */

export type GraphKeyAction =
  | { kind: "move"; to: "down" | "up" | "child" | "parent" | "first" | "last" }
  | { kind: "select" }
  | { kind: "zoom"; direction: "in" | "out" }
  | { kind: "fit" }
  | { kind: "center" }
  | { kind: "clear" };

/**
 * What a key pressed inside the graph does, or null for a key this screen
 * leaves alone -- which then keeps its own meaning, because only a key that
 * returns an action is given a `preventDefault`.
 *
 * `onTree` is whether the keyboard is on a node of the tree, where the arrows
 * and Enter mean something; elsewhere in the graph (an entry, a toolbar
 * button) they are the browser's.
 */
export function graphKeyAction(
  event: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean },
  onTree: boolean,
): GraphKeyAction | null {
  // Anything held with a modifier belongs to somebody else -- the browser's
  // zoom above all.
  if (event.metaKey || event.ctrlKey || event.altKey) return null;

  switch (event.key) {
    case "+":
    case "=":
      return { kind: "zoom", direction: "in" };
    case "-":
    case "_":
      return { kind: "zoom", direction: "out" };
    case "0":
      return { kind: "fit" };
    // Either case, so Caps Lock does not quietly switch it off.
    case "c":
    case "C":
      return { kind: "center" };
    case "Escape":
      return { kind: "clear" };
  }

  if (!onTree) return null;

  switch (event.key) {
    case "ArrowDown":
      return { kind: "move", to: "down" };
    case "ArrowUp":
      return { kind: "move", to: "up" };
    case "ArrowRight":
      return { kind: "move", to: "child" };
    case "ArrowLeft":
      return { kind: "move", to: "parent" };
    case "Home":
      return { kind: "move", to: "first" };
    case "End":
      return { kind: "move", to: "last" };
    case "Enter":
    case " ":
      return { kind: "select" };
  }

  return null;
}

/** One node of the tree as the keyboard sees it: in reading order, with its parent. */
export type TreeStop = { key: string; parentKey: string | null };

/**
 * Where a move goes from `current`, over the tree in reading order (each node,
 * then its children). **`down` and `up`, never `next` and `previous`**: the
 * first of those, quoted as a string, is what `src/lib-portability.test.ts` reads as an
 * import of Next.js. **It stops at both ends rather than wrapping** -- the
 * import review's reasoning: a list somebody holds an arrow on should stop.
 */
export function moveInTree(
  stops: readonly TreeStop[],
  current: string,
  to: Extract<GraphKeyAction, { kind: "move" }>["to"],
): string {
  const index = stops.findIndex((stop) => stop.key === current);
  if (index === -1) return stops[0]?.key ?? current;

  switch (to) {
    case "down":
      return stops[Math.min(index + 1, stops.length - 1)].key;
    case "up":
      return stops[Math.max(index - 1, 0)].key;
    case "first":
      return stops[0].key;
    case "last":
      return stops[stops.length - 1].key;
    case "child": {
      const child = stops[index + 1];
      return child && child.parentKey === current ? child.key : current;
    }
    case "parent":
      return stops[index].parentKey ?? current;
  }
}

/**
 * What an arrow or Enter does on a book or a chapter, which can be open or
 * closed (the app owner's call on the preview) -- the WAI-ARIA tree pattern:
 * → opens a closed node and steps into an open one; ← closes an open node and
 * steps out of a closed one; Enter or Space opens or closes it. On anything
 * that cannot open -- a testament, a verse -- the arrows move as before.
 */
export function treeKeyEffect(
  action: Extract<GraphKeyAction, { kind: "move" | "select" }>,
  node: { expandable: boolean; expanded: boolean },
): "open" | "close" | "move" | "select" {
  if (action.kind === "select") {
    if (!node.expandable) return "select";
    return node.expanded ? "close" : "open";
  }
  if (node.expandable && action.to === "child" && !node.expanded) return "open";
  if (node.expandable && action.to === "parent" && node.expanded) return "close";
  return "move";
}
