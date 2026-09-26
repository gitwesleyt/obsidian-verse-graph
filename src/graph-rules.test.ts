// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-rules.test.ts) on 2026-09-26.
// Unchanged. Keep in step with the original rather than editing here.

import { describe, expect, it } from "vitest";

import {
  buildGraphTree,
  collapseOneLevel,
  expandOneLevel,
  openLevelsOf,
  chapterLabel,
  compareRanges,
  litPath,
  rangeKey,
  rangeLabel,
  testamentOf,
  verseNodesOf,
  type GraphVerseRow,
} from "./graph-rules";

function row(
  book: string,
  chapter: number,
  first: number | null,
  last: number | null,
  entryCount: number,
): GraphVerseRow {
  return { book, chapter, first, last, entryCount, firstWritten: "2026-01-01T00:00:00" };
}

describe("rangeLabel", () => {
  it("names a single verse, a range and a whole chapter", () => {
    expect(rangeLabel({ book: "John", chapter: 3, first: 16, last: 16 })).toBe("John 3:16");
    expect(rangeLabel({ book: "Proverbs", chapter: 3, first: 5, last: 6 })).toBe("Proverbs 3:5–6");
    expect(rangeLabel({ book: "Psalms", chapter: 23, first: null, last: null })).toBe("Psalm 23");
  });

  it("says Psalm for one of them, never Psalms", () => {
    expect(chapterLabel("Psalms", 139)).toBe("Psalm 139");
    expect(rangeLabel({ book: "Psalms", chapter: 139, first: 13, last: 14 })).toBe("Psalm 139:13–14");
  });
});

describe("testamentOf", () => {
  it("splits at Malachi", () => {
    expect(testamentOf("Genesis")).toBe("old");
    expect(testamentOf("Malachi")).toBe("old");
    expect(testamentOf("Matthew")).toBe("new");
    expect(testamentOf("Revelation")).toBe("new");
  });
});

describe("compareRanges", () => {
  it("puts books in canonical order, not alphabetical", () => {
    const books = ["Romans", "Genesis", "Psalms", "James", "Matthew"].map((book) => ({
      book,
      chapter: 1,
      first: 1,
      last: 1,
    }));
    expect(books.sort(compareRanges).map((r) => r.book)).toEqual([
      "Genesis",
      "Psalms",
      "Matthew",
      "Romans",
      "James",
    ]);
  });

  it("puts a whole chapter before its verses and a shorter range before a longer one", () => {
    const ranges = [
      { book: "Proverbs", chapter: 3, first: 5, last: 6 },
      { book: "Proverbs", chapter: 3, first: 5, last: 5 },
      { book: "Proverbs", chapter: 3, first: null, last: null },
      { book: "Proverbs", chapter: 2, first: 9, last: 9 },
    ];
    expect(ranges.sort(compareRanges).map(rangeLabel)).toEqual([
      "Proverbs 2:9",
      "Proverbs 3",
      "Proverbs 3:5",
      "Proverbs 3:5–6",
    ]);
  });
});

describe("buildGraphTree", () => {
  // The design's own numbers (Graph view.dc.html, G1): Psalms 14 is 23:1 (5) +
  // 23:4 (3) + 46:10 (4) + 139:13–14 (2).
  const rows = [
    row("Romans", 8, 28, 28, 5),
    row("Psalms", 139, 13, 14, 2),
    row("Psalms", 23, 4, 4, 3),
    row("Psalms", 23, 1, 1, 5),
    row("Psalms", 46, 10, 10, 4),
    row("Romans", 8, 38, 39, 2),
  ];

  it("builds Testament, Book, Chapter and Verse in canonical order", () => {
    const tree = buildGraphTree(rows);
    expect(tree.map((t) => t.label)).toEqual(["Old Testament", "New Testament"]);
    expect(tree[0].books.map((b) => b.label)).toEqual(["Psalms"]);
    expect(tree[0].books[0].chapters.map((c) => c.label)).toEqual([
      "Psalm 23",
      "Psalm 46",
      "Psalm 139",
    ]);
    expect(verseNodesOf(tree).map((v) => v.label)).toEqual([
      "Psalm 23:1",
      "Psalm 23:4",
      "Psalm 46:10",
      "Psalm 139:13–14",
      "Romans 8:28",
      "Romans 8:38–39",
    ]);
  });

  it("rolls the counts up by summing, as design G1b says", () => {
    const tree = buildGraphTree(rows);
    expect(tree[0].books[0].chapters[0].count).toBe(8);
    expect(tree[0].books[0].count).toBe(14);
    expect(tree[0].count).toBe(14);
    expect(tree[1].count).toBe(7);
  });

  it("has no node for anything never cited", () => {
    const tree = buildGraphTree([row("Matthew", 6, 33, 33, 1)]);
    expect(tree.map((t) => t.key)).toEqual(["new"]);
  });

  it("is empty for an empty journal", () => {
    expect(buildGraphTree([])).toEqual([]);
  });
});

describe("litPath", () => {
  it("lights a range and everything above it", () => {
    const range = { book: "Romans", chapter: 8, first: 28, last: 28 };
    const lit = litPath([range]);
    expect([...lit]).toEqual([rangeKey(range), "Romans|8", "Romans", "new"]);
  });
});

describe("expanding and collapsing one level at a time", () => {
  const tree = buildGraphTree([row("Psalms", 23, 1, 1, 1), row("John", 3, 16, 16, 1)]);
  const levels = openLevelsOf(tree);
  const everything = new Set([...levels[0], ...levels[1], ...levels[2]]);
  const startingView = new Set(levels[0]);

  it("collapse hides the verses, then the chapters, then the books", () => {
    const once = collapseOneLevel(everything, levels);
    expect([...once].sort()).toEqual([...levels[0], ...levels[1]].sort());
    const twice = collapseOneLevel(once, levels);
    expect([...twice].sort()).toEqual([...startingView].sort());
    const thrice = collapseOneLevel(twice, levels);
    expect(thrice.size).toBe(0);
    expect(collapseOneLevel(thrice, levels).size).toBe(0);
  });

  it("expand shows the chapters, then the verses, from the starting view", () => {
    const once = expandOneLevel(startingView, levels);
    expect([...once].sort()).toEqual([...levels[0], ...levels[1]].sort());
    const twice = expandOneLevel(once, levels);
    expect(twice).toEqual(everything);
  });

  it("expand fills in a level only partly open before going deeper", () => {
    const oneBookOpen = new Set([...levels[0], "Psalms"]);
    expect(expandOneLevel(oneBookOpen, levels).has("John")).toBe(true);
    expect(expandOneLevel(oneBookOpen, levels).has("Psalms|23")).toBe(false);
  });

  it("collapse closes the deepest level anything is open at, even partly", () => {
    const oneChapterOpen = new Set([...levels[0], "Psalms", "John", "Psalms|23"]);
    expect(collapseOneLevel(oneChapterOpen, levels).has("Psalms|23")).toBe(false);
    expect(collapseOneLevel(oneChapterOpen, levels).has("John")).toBe(true);
  });
});
