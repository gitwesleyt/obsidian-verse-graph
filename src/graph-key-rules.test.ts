// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-key-rules.test.ts) on 2026-09-27.
// Unchanged. Keep in step with the original rather than editing here.

import { describe, expect, it } from "vitest";

import { graphKeyAction, moveInTree, treeKeyEffect, type TreeStop } from "./graph-key-rules";

describe("graphKeyAction", () => {
  it("zooms and fits on bare keys anywhere in the graph", () => {
    expect(graphKeyAction({ key: "+" }, false)).toEqual({ kind: "zoom", direction: "in" });
    expect(graphKeyAction({ key: "=" }, false)).toEqual({ kind: "zoom", direction: "in" });
    expect(graphKeyAction({ key: "-" }, false)).toEqual({ kind: "zoom", direction: "out" });
    expect(graphKeyAction({ key: "0" }, false)).toEqual({ kind: "fit" });
    expect(graphKeyAction({ key: "Escape" }, false)).toEqual({ kind: "clear" });
  });

  it("centres on c, in either case, and leaves Mod-C to copy (item 8.8)", () => {
    expect(graphKeyAction({ key: "c" }, false)).toEqual({ kind: "center" });
    expect(graphKeyAction({ key: "c" }, true)).toEqual({ kind: "center" });
    expect(graphKeyAction({ key: "C" }, false)).toEqual({ kind: "center" });
    expect(graphKeyAction({ key: "c", metaKey: true }, true)).toBeNull();
    expect(graphKeyAction({ key: "c", ctrlKey: true }, true)).toBeNull();
  });

  it("leaves Mod-0 and the browser's other zoom keys alone", () => {
    expect(graphKeyAction({ key: "0", metaKey: true }, true)).toBeNull();
    expect(graphKeyAction({ key: "0", ctrlKey: true }, true)).toBeNull();
    expect(graphKeyAction({ key: "=", ctrlKey: true }, true)).toBeNull();
  });

  it("walks the tree only when the keyboard is on it", () => {
    expect(graphKeyAction({ key: "ArrowDown" }, true)).toEqual({ kind: "move", to: "down" });
    expect(graphKeyAction({ key: "ArrowLeft" }, true)).toEqual({ kind: "move", to: "parent" });
    expect(graphKeyAction({ key: "Enter" }, true)).toEqual({ kind: "select" });
    expect(graphKeyAction({ key: "ArrowDown" }, false)).toBeNull();
    expect(graphKeyAction({ key: "Enter" }, false)).toBeNull();
  });

  it("leaves every other key alone", () => {
    expect(graphKeyAction({ key: "a" }, true)).toBeNull();
    expect(graphKeyAction({ key: "Tab" }, true)).toBeNull();
  });
});

describe("moveInTree", () => {
  const stops: TreeStop[] = [
    { key: "old", parentKey: null },
    { key: "Psalms", parentKey: "old" },
    { key: "Psalms|23", parentKey: "Psalms" },
    { key: "Psalms|23|1|1", parentKey: "Psalms|23" },
    { key: "new", parentKey: null },
  ];

  it("goes down and up in reading order, stopping at the ends", () => {
    expect(moveInTree(stops, "old", "down")).toBe("Psalms");
    expect(moveInTree(stops, "Psalms|23|1|1", "down")).toBe("new");
    expect(moveInTree(stops, "new", "down")).toBe("new");
    expect(moveInTree(stops, "old", "up")).toBe("old");
  });

  it("steps into a child and back out to the parent", () => {
    expect(moveInTree(stops, "Psalms", "child")).toBe("Psalms|23");
    expect(moveInTree(stops, "Psalms|23|1|1", "child")).toBe("Psalms|23|1|1");
    expect(moveInTree(stops, "Psalms|23|1|1", "parent")).toBe("Psalms|23");
    expect(moveInTree(stops, "old", "parent")).toBe("old");
  });

  it("jumps to either end", () => {
    expect(moveInTree(stops, "Psalms", "first")).toBe("old");
    expect(moveInTree(stops, "Psalms", "last")).toBe("new");
  });

  it("starts at the top from a node that is not there", () => {
    expect(moveInTree(stops, "gone", "down")).toBe("old");
  });
});

describe("treeKeyEffect, on a book or chapter that opens and closes", () => {
  const closed = { expandable: true, expanded: false };
  const open = { expandable: true, expanded: true };
  const leaf = { expandable: false, expanded: false };

  it("opens with → and steps in once open", () => {
    expect(treeKeyEffect({ kind: "move", to: "child" }, closed)).toBe("open");
    expect(treeKeyEffect({ kind: "move", to: "child" }, open)).toBe("move");
  });

  it("closes with ← and steps out once closed", () => {
    expect(treeKeyEffect({ kind: "move", to: "parent" }, open)).toBe("close");
    expect(treeKeyEffect({ kind: "move", to: "parent" }, closed)).toBe("move");
  });

  it("toggles with Enter, and selects a verse", () => {
    expect(treeKeyEffect({ kind: "select" }, closed)).toBe("open");
    expect(treeKeyEffect({ kind: "select" }, open)).toBe("close");
    expect(treeKeyEffect({ kind: "select" }, leaf)).toBe("select");
  });

  it("moves up and down as before", () => {
    expect(treeKeyEffect({ kind: "move", to: "down" }, closed)).toBe("move");
  });
});
