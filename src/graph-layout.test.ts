// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-layout.test.ts) on 2026-09-27.
// Unchanged. Keep in step with the original rather than editing here.

import { describe, expect, it } from "vitest";

import {
  GRAPH_COLUMNS,
  GRAPH_COLUMN_ORDER,
  GRAPH_NODE_HEIGHT,
  graphColumns,
  anchorFor,
  blendLayouts,
  curveBetween,
  easeOut,
  entryRowTop,
  restingBlend,
  layoutGraph,
  rowTop,
} from "./graph-layout";
import { buildGraphTree, type GraphVerseRow } from "./graph-rules";

function row(book: string, chapter: number, first: number, last: number): GraphVerseRow {
  return { book, chapter, first, last, entryCount: 1, firstWritten: "2026-01-01T00:00:00" };
}

const tree = buildGraphTree([
  row("Psalms", 23, 1, 1),
  row("Psalms", 23, 4, 4),
  row("Psalms", 139, 13, 14),
  row("John", 3, 16, 16),
]);

describe("layoutGraph", () => {
  const layout = layoutGraph(tree);
  const y = (key: string) => layout.byKey.get(key)!.y;

  it("stacks the verses one row apart, in order", () => {
    expect(y("Psalms|23|1|1")).toBe(rowTop(0));
    expect(y("Psalms|23|4|4")).toBe(rowTop(1));
    expect(y("Psalms|139|13|14")).toBe(rowTop(2));
    expect(y("John|3|16|16")).toBe(rowTop(3));
  });

  it("puts every parent level with the middle of its children", () => {
    expect(y("Psalms|23")).toBe((rowTop(0) + rowTop(1)) / 2);
    expect(y("Psalms|139")).toBe(rowTop(2));
    expect(y("Psalms")).toBe((y("Psalms|23") + y("Psalms|139")) / 2);
    expect(y("old")).toBe(y("Psalms"));
    expect(y("new")).toBe(rowTop(3));
  });

  it("knows each node's parent, for drawing the lines", () => {
    expect(layout.byKey.get("John|3|16|16")!.parentKey).toBe("John|3");
    expect(layout.byKey.get("John|3")!.parentKey).toBe("John");
    expect(layout.byKey.get("John")!.parentKey).toBe("new");
    expect(layout.byKey.get("new")!.parentKey).toBeNull();
  });

  it("is as tall as its rows", () => {
    expect(layout.treeHeight).toBe(rowTop(4));
  });

  it("lays out an empty journal as nothing", () => {
    expect(layoutGraph([]).nodes).toEqual([]);
  });
});

describe("curveBetween", () => {
  it("runs from one box's right edge to the next one's left edge, mid-height", () => {
    const path = curveBetween({ column: "verse", y: 0 }, { column: "entry", y: 10 });
    const x1 = GRAPH_COLUMNS.verse.x + GRAPH_COLUMNS.verse.width;
    const x2 = GRAPH_COLUMNS.entry.x;
    const half = GRAPH_NODE_HEIGHT / 2;
    expect(path.startsWith(`M${x1} ${half}`)).toBe(true);
    expect(path.endsWith(`${x2} ${10 + half}`)).toBe(true);
  });
});

describe("the columns", () => {
  it("never overlap, left to right", () => {
    const order = ["testament", "book", "chapter", "verse", "entry"] as const;
    for (let i = 1; i < order.length; i++) {
      const before = GRAPH_COLUMNS[order[i - 1]];
      expect(GRAPH_COLUMNS[order[i]].x).toBeGreaterThan(before.x + before.width);
    }
  });

  it("are where item 8.2 put them while the categories column is off", () => {
    expect(GRAPH_COLUMNS.book.x).toBe(14);
    expect(GRAPH_COLUMNS.chapter.x).toBe(26);
    expect(GRAPH_COLUMNS.verse.x).toBe(38.5);
    expect(GRAPH_COLUMNS.entry.x).toBe(52.5);
    expect(GRAPH_COLUMNS.category.width).toBe(0);
  });

  it("make room for the categories between Testament and Book when it is on (item 8.6)", () => {
    const columns = graphColumns(true);
    for (let i = 1; i < GRAPH_COLUMN_ORDER.length; i++) {
      const before = columns[GRAPH_COLUMN_ORDER[i - 1]];
      expect(columns[GRAPH_COLUMN_ORDER[i]].x).toBeGreaterThan(before.x + before.width);
    }
    // Every column right of it moves over by the same amount.
    const shift = columns.book.x - GRAPH_COLUMNS.book.x;
    expect(shift).toBeGreaterThan(columns.category.width);
    expect(columns.entry.x - GRAPH_COLUMNS.entry.x).toBe(shift);
  });
});

describe("layoutGraph with literary categories (item 8.6)", () => {
  const grouped = buildGraphTree(
    [row("Psalms", 23, 1, 1), row("Proverbs", 3, 5, 6), row("Isaiah", 40, 31, 31), row("John", 3, 16, 16)],
    { categories: true },
  );
  const open = (keys: string[]) => (key: string) => keys.includes(key);

  it("hangs the books off their category, and the categories off the testament", () => {
    const layout = layoutGraph(grouped, open(["old", "new", "category:wisdom", "category:major-prophets", "category:gospels"]));
    expect(layout.byKey.get("Psalms")!.parentKey).toBe("category:wisdom");
    expect(layout.byKey.get("category:wisdom")!.parentKey).toBe("old");
    expect(layout.byKey.get("category:wisdom")!.column).toBe("category");
    const y = (key: string) => layout.byKey.get(key)!.y;
    expect(y("category:wisdom")).toBe((y("Psalms") + y("Proverbs")) / 2);
    expect(y("old")).toBe((y("category:wisdom") + y("category:major-prophets")) / 2);
  });

  it("gives a closed category one row and draws nothing to its right", () => {
    const layout = layoutGraph(grouped, open(["old", "new"]));
    expect(layout.nodes.map((n) => n.key).sort()).toEqual(
      ["category:gospels", "category:major-prophets", "category:wisdom", "new", "old"].sort(),
    );
    expect(layout.treeHeight).toBe(rowTop(3));
  });

  it("is wider, by the categories column, and says where its columns are", () => {
    const flat = layoutGraph(tree);
    const layout = layoutGraph(grouped);
    expect(layout.columns).toEqual(graphColumns(true));
    expect(flat.columns).toEqual(GRAPH_COLUMNS);
    expect(layout.width - flat.width).toBe(layout.columns.book.x - flat.columns.book.x);
  });

  it("lands a line on the category while it is closed, before the testament", () => {
    const layout = layoutGraph(grouped, open(["old", "new"]));
    expect(anchorFor(layout, { book: "Psalms", chapter: 23 }, "Psalms|23|1|1")!.key).toBe("category:wisdom");
  });
});

describe("layoutGraph with books and chapters closed", () => {
  const open = (keys: string[]) => (key: string) => keys.includes(key);

  it("gives a closed book one row and draws nothing to its right", () => {
    const layout = layoutGraph(tree, open(["old", "new"]));
    expect(layout.nodes.map((n) => n.key).sort()).toEqual(["John", "Psalms", "new", "old"]);
    expect(layout.byKey.get("Psalms")!.y).toBe(rowTop(0));
    expect(layout.byKey.get("John")!.y).toBe(rowTop(1));
    expect(layout.treeHeight).toBe(rowTop(2));
  });

  it("opens a book onto its chapters, and a chapter onto its verses", () => {
    const layout = layoutGraph(tree, open(["old", "new", "Psalms", "Psalms|23"]));
    expect(layout.byKey.get("Psalms|23|1|1")!.y).toBe(rowTop(0));
    expect(layout.byKey.get("Psalms|23|4|4")!.y).toBe(rowTop(1));
    expect(layout.byKey.has("Psalms|139|13|14")).toBe(false);
    expect(layout.byKey.get("Psalms|139")!.y).toBe(rowTop(2));
    expect(layout.byKey.get("John")!.y).toBe(rowTop(3));
  });
});

describe("anchorFor", () => {
  const range = { book: "Psalms", chapter: 23 };

  it("lands on the verse when it shows, else its chapter, else its book", () => {
    const key = "Psalms|23|1|1";
    expect(anchorFor(layoutGraph(tree), range, key)!.key).toBe(key);
    const testaments = ["old", "new"];
    expect(anchorFor(layoutGraph(tree, (k) => [...testaments, "Psalms"].includes(k)), range, key)!.key).toBe("Psalms|23");
    expect(anchorFor(layoutGraph(tree, (k) => testaments.includes(k)), range, key)!.key).toBe("Psalms");
  });
});

describe("blendLayouts -- opening and closing, part-way", () => {
  const closed = layoutGraph(tree, (key) => key === "old" || key === "new");
  const psalmsOpen = layoutGraph(tree, (key) => ["old", "new", "Psalms"].includes(key));

  it("grows a book's chapters out of the book, fading in", () => {
    const start = blendLayouts(restingBlend(closed), psalmsOpen, 0);
    const psalms = closed.byKey.get("Psalms")!;
    expect(start.get("Psalms|23")!.y).toBe(psalms.y);
    expect(start.get("Psalms|23")!.opacity).toBe(0);

    const end = blendLayouts(restingBlend(closed), psalmsOpen, 1);
    expect(end.get("Psalms|23")!.y).toBe(psalmsOpen.byKey.get("Psalms|23")!.y);
    expect(end.get("Psalms|23")!.opacity).toBe(1);
  });

  it("slides the books below down to make room, halfway at halfway", () => {
    const from = closed.byKey.get("John")!.y;
    const to = psalmsOpen.byKey.get("John")!.y;
    const mid = blendLayouts(restingBlend(closed), psalmsOpen, 0.5);
    expect(mid.get("John")!.y).toBe((from + to) / 2);
  });

  it("slides closing chapters back into their book, fading out, then drops them", () => {
    const mid = blendLayouts(restingBlend(psalmsOpen), closed, 0.5);
    const chapter = mid.get("Psalms|139")!;
    expect(chapter.leaving).toBe(true);
    expect(chapter.opacity).toBe(0.5);
    const from = psalmsOpen.byKey.get("Psalms|139")!.y;
    expect(chapter.y).toBe((from + closed.byKey.get("Psalms")!.y) / 2);

    expect(blendLayouts(restingBlend(psalmsOpen), closed, 1).has("Psalms|139")).toBe(false);
  });

  it("starts a second move from where the boxes actually are", () => {
    const halfway = blendLayouts(restingBlend(closed), psalmsOpen, 0.5);
    const reversed = blendLayouts(halfway, closed, 0);
    expect(reversed.get("John")!.y).toBe(halfway.get("John")!.y);
    expect(reversed.get("Psalms|23")!.opacity).toBe(0.5);
  });

  it("drops a node that has faded to nothing, even when the next move cuts its slide short", () => {
    // A replay's steps (item 8.3) arrive before a slide ends: each one starts
    // from the last, so `t` never reaches 1 for what is leaving.
    const nearlyGone = blendLayouts(restingBlend(psalmsOpen), closed, 0.99);
    expect(nearlyGone.has("Psalms|139")).toBe(false);
    const stillFading = blendLayouts(restingBlend(psalmsOpen), closed, 0.9);
    expect(blendLayouts(stillFading, closed, 0.9).has("Psalms|139")).toBe(false);
  });
});

describe("easeOut", () => {
  it("runs 0 to 1, fast then slow", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });
});

describe("a closed testament", () => {
  it("is one row, with nothing to its right", () => {
    const layout = layoutGraph(tree, (key) => key === "new");
    expect(layout.byKey.get("old")!.y).toBe(rowTop(0));
    expect(layout.byKey.has("Psalms")).toBe(false);
    expect(layout.byKey.get("John")).toBeDefined();
  });

  it("is where a line to anything inside it lands", () => {
    const layout = layoutGraph(tree, () => false);
    expect(anchorFor(layout, { book: "Psalms", chapter: 23 }, "Psalms|23|1|1")!.key).toBe("old");
  });
});

describe("entryRowTop", () => {
  it("stacks the column from the top of the canvas when no verse is selected", () => {
    expect(entryRowTop(0)).toBe(rowTop(0));
    expect(entryRowTop(3)).toBe(rowTop(3));
  });

  it("starts level with the selected verse and runs down from it", () => {
    const layout = layoutGraph(tree);
    const verseY = layout.byKey.get("John|3|16|16")!.y;
    expect(entryRowTop(0, verseY)).toBe(verseY);
    expect(entryRowTop(2, verseY) - entryRowTop(1, verseY)).toBe(rowTop(1) - rowTop(0));
  });
});
