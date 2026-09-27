// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-rules.test.ts) on 2026-09-27.
// Unchanged. Keep in step with the original rather than editing here.

import { describe, expect, it } from "vitest";

import {
  blocksCiting,
  bookPath,
  buildGraphTree,
  CATEGORY_KEYS,
  collapseOneLevel,
  expandOneLevel,
  openLevelsOf,
  chapterLabel,
  compareRanges,
  onlyLit,
  litPath,
  rangeKey,
  rangeLabel,
  rangesOfBlock,
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
  it("lights a range and everything above it, its category included", () => {
    const range = { book: "Romans", chapter: 8, first: 28, last: 28 };
    const lit = litPath([range]);
    expect([...lit].sort()).toEqual(
      [rangeKey(range), "Romans|8", "Romans", "category:pauline", "new"].sort(),
    );
  });
});

describe("onlyLit (item 8.7)", () => {
  const rows = [
    row("Genesis", 1, 1, 1, 1),
    row("Exodus", 3, 14, 14, 1),
    row("Romans", 8, 28, 28, 1),
    row("Romans", 8, 31, 31, 1),
    row("Romans", 12, 1, 1, 1),
    row("Galatians", 2, 20, 20, 1),
  ];
  const romans828 = { book: "Romans", chapter: 8, first: 28, last: 28 };

  it("keeps only the lit path, down to the verse", () => {
    const pruned = onlyLit(buildGraphTree(rows), litPath([romans828]));
    expect(pruned.map((t) => t.key)).toEqual(["new"]);
    expect(pruned[0].books.map((b) => b.key)).toEqual(["Romans"]);
    expect(pruned[0].books[0].chapters.map((c) => c.key)).toEqual(["Romans|8"]);
    expect(pruned[0].books[0].chapters[0].verses.map((v) => v.key)).toEqual([rangeKey(romans828)]);
  });

  it("keeps the counts the journal has, not what is left showing", () => {
    const tree = buildGraphTree(rows);
    const pruned = onlyLit(tree, litPath([romans828]));
    expect(pruned[0].count).toBe(tree[1].count);
    expect(pruned[0].books[0].count).toBe(3);
  });

  it("keeps a category's books the same objects as its testament's", () => {
    const pruned = onlyLit(buildGraphTree(rows, { categories: true }), litPath([romans828]));
    expect(pruned[0].categories?.map((c) => c.key)).toEqual(["category:pauline"]);
    expect(pruned[0].categories?.[0].books[0]).toBe(pruned[0].books[0]);
  });

  it("gives the whole tree back with nothing lit", () => {
    const tree = buildGraphTree(rows);
    expect(onlyLit(tree, new Set())).toBe(tree);
  });
});

describe("bookPath", () => {
  it("is the testament, the category and the book, top down", () => {
    expect(bookPath("Acts")).toEqual(["new", "category:history-new", "Acts"]);
    expect(bookPath("Ruth")).toEqual(["old", "category:history-old", "Ruth"]);
  });

  it("names a key for every category, and only those", () => {
    expect(CATEGORY_KEYS).toHaveLength(10);
    expect(CATEGORY_KEYS).toContain(bookPath("Psalms")[1]);
  });
});

describe("buildGraphTree with literary categories (item 8.6)", () => {
  const rows = [
    row("Psalms", 23, 1, 1, 5),
    row("Proverbs", 3, 5, 6, 2),
    row("Isaiah", 40, 31, 31, 1),
    row("Acts", 2, 38, 38, 4),
    row("John", 3, 16, 16, 3),
  ];

  it("has no categories when the setting is off", () => {
    expect(buildGraphTree(rows).every((t) => t.categories === null)).toBe(true);
  });

  it("groups the cited books in canonical order, with only cited categories", () => {
    const [old, nt] = buildGraphTree(rows, { categories: true });
    expect(old.categories!.map((c) => c.label)).toEqual(["Wisdom and Poetry", "Major Prophets"]);
    expect(old.categories![0].books.map((b) => b.label)).toEqual(["Psalms", "Proverbs"]);
    expect(nt.categories!.map((c) => c.label)).toEqual(["Gospels", "History"]);
  });

  it("rolls the counts up through the category, as every level does", () => {
    const [old, nt] = buildGraphTree(rows, { categories: true });
    expect(old.categories![0].count).toBe(7);
    expect(old.count).toBe(8);
    expect(nt.categories!.map((c) => c.count)).toEqual([3, 4]);
  });

  it("shares its book nodes with the flat list, so both describe one tree", () => {
    const [old] = buildGraphTree(rows, { categories: true });
    expect(old.categories![0].books[0]).toBe(old.books[0]);
    expect(old.books.map((b) => b.label)).toEqual(["Psalms", "Proverbs", "Isaiah"]);
  });

  it("gives the two History groups different keys", () => {
    const tree = buildGraphTree([row("Ruth", 1, 16, 16, 1), row("Acts", 1, 8, 8, 1)], {
      categories: true,
    });
    const keys = tree.flatMap((t) => t.categories!.map((c) => c.key));
    expect(keys).toEqual(["category:history-old", "category:history-new"]);
  });
});

describe("expanding and collapsing with literary categories", () => {
  const tree = buildGraphTree([row("Psalms", 23, 1, 1, 1), row("John", 3, 16, 16, 1)], {
    categories: true,
  });
  const levels = openLevelsOf(tree);

  it("steps through the categories between the testaments and the books", () => {
    expect(levels).toHaveLength(4);
    expect(levels[1]).toEqual(["category:wisdom", "category:gospels"]);
    expect(levels[2]).toEqual(["Psalms", "John"]);
  });

  it("opens the books first from where the screen opens, with every category open", () => {
    const opening = new Set([...levels[0], ...levels[1]]);
    expect([...expandOneLevel(opening, levels)].sort()).toEqual(
      [...levels[0], ...levels[1], ...levels[2]].sort(),
    );
    expect([...collapseOneLevel(opening, levels)].sort()).toEqual([...levels[0]].sort());
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

describe("rangesOfBlock", () => {
  const tag = (book: string, chapter: number, verse: number | null) => ({ book, chapter, verse });

  it("reads a run of consecutive verses as one range, as migration 0038 does", () => {
    expect(rangesOfBlock([tag("Proverbs", 3, 6), tag("Proverbs", 3, 5)])).toEqual([
      { book: "Proverbs", chapter: 3, first: 5, last: 6 },
    ]);
  });

  it("splits at a gap, and keeps a single verse as a range of one", () => {
    expect(rangesOfBlock([tag("John", 3, 16), tag("John", 3, 17), tag("John", 3, 20)])).toEqual([
      { book: "John", chapter: 3, first: 16, last: 17 },
      { book: "John", chapter: 3, first: 20, last: 20 },
    ]);
  });

  it("keeps a whole chapter apart from that chapter's verses, before them", () => {
    expect(rangesOfBlock([tag("Psalms", 23, 1), tag("Psalms", 23, null)])).toEqual([
      { book: "Psalms", chapter: 23, first: null, last: null },
      { book: "Psalms", chapter: 23, first: 1, last: 1 },
    ]);
  });

  it("never joins verses of two chapters", () => {
    expect(rangesOfBlock([tag("John", 3, 36), tag("John", 4, 1)])).toHaveLength(2);
  });
});

describe("blocksCiting", () => {
  const cited = new Map([
    ["a", [{ book: "Proverbs", chapter: 3, verse: 5 }]],
    ["b", [{ book: "Proverbs", chapter: 3, verse: 5 }, { book: "Proverbs", chapter: 3, verse: 6 }]],
    ["c", [{ book: "Psalms", chapter: 23, verse: null }]],
  ]);
  const order = ["a", "b", "c", "d"];

  it("finds the blocks citing exactly that range, in reading order", () => {
    expect(blocksCiting(order, cited, { book: "Proverbs", chapter: 3, first: 5, last: 5 })).toEqual(["a"]);
    expect(blocksCiting(order, cited, { book: "Proverbs", chapter: 3, first: 5, last: 6 })).toEqual(["b"]);
    expect(blocksCiting(order, cited, { book: "Psalms", chapter: 23, first: null, last: null })).toEqual(["c"]);
  });

  it("falls back to any block citing a verse inside the range when none cites it exactly", () => {
    expect(blocksCiting(order, cited, { book: "Proverbs", chapter: 3, first: 4, last: 6 })).toEqual(["a", "b"]);
  });

  it("finds nothing for a range the entry does not cite", () => {
    expect(blocksCiting(order, cited, { book: "Romans", chapter: 8, first: 28, last: 28 })).toEqual([]);
  });
});
