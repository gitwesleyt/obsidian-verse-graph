// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-rules.ts) on 2026-09-26.
// Only change: "@/lib/" imports made relative. Keep in step with the original rather than editing here.

import { BIBLE_BOOKS, type BibleBook } from "./bible-books";

/**
 * What the Graph screen draws, worked out from what the database hands back
 * (v3's item 8.2). Pure -- no network, no React.
 *
 * The database says which verse ranges the writer has cited and how often
 * (`graph_verse_nodes`, migration 0038); this file turns that flat list into
 * the Testament -> Book -> Chapter -> Verse tree the design draws, in canonical
 * order, with a count on every node. Where each node *sits* is
 * `graph-layout.ts`, and what the zoom does is `graph-zoom-rules.ts`.
 *
 * **The book order lives here rather than in SQL** because `BIBLE_BOOKS` is
 * already in canonical order and a second copy of it in the database would be
 * free to disagree -- `v3/decisions/8.1-graph-view-spike.md`.
 */

/**
 * One verse range as the graph knows it: a run of consecutive verses of one
 * chapter (`Proverbs 3:5–6`), a single verse (`first === last`), or a whole
 * chapter (both ends null).
 *
 * **A range is not stored anywhere** -- `John 3:16-18` is three verse tags --
 * so migration 0038 recovers it from runs of consecutive verses on one block.
 * That is why `Proverbs 3:5` and `Proverbs 3:5–6` are two different ranges here
 * and two different nodes on the screen (design G3c).
 */
export type VerseRange = {
  /** The canonical book name, as `verses.book` stores it: "Psalms". */
  book: string;
  chapter: number;
  first: number | null;
  last: number | null;
};

/** One leaf of the tree, as `graph_verse_nodes` returns it. */
export type GraphVerseRow = VerseRange & {
  /** Distinct live entries citing exactly this range. */
  entryCount: number;
  /**
   * The earliest writer's-clock reading among them, as the database writes a
   * `timestamp`. Nothing in 8.2 reads it; it is the order item 8.3's replay
   * draws the nodes in.
   */
  firstWritten: string;
};

/** One entry in the entries column, as `graph_entries` returns it. */
export type GraphEntry = {
  id: string;
  title: string;
  /** The instant and the clock that set it -- `EntryDate`'s two halves. */
  entryDate: string;
  entryDateOffset: number | null;
  /** Every range this entry cites, so selecting it lights them all. */
  cites: VerseRange[];
};

export type Testament = "old" | "new";

/** Where the Old Testament ends in `BIBLE_BOOKS`: Genesis to Malachi. */
const OLD_TESTAMENT_BOOKS = 39;

const BOOK_INDEX = new Map(BIBLE_BOOKS.map((book, index) => [book.name, index]));

/** A book this list does not know sorts after every book it does. */
function bookIndex(book: string): number {
  return BOOK_INDEX.get(book) ?? BIBLE_BOOKS.length;
}

function bookOf(name: string): BibleBook | undefined {
  const index = BOOK_INDEX.get(name);
  return index === undefined ? undefined : BIBLE_BOOKS[index];
}

export function testamentOf(book: string): Testament {
  return bookIndex(book) < OLD_TESTAMENT_BOOKS ? "old" : "new";
}

export const TESTAMENT_LABELS: Record<Testament, string> = {
  old: "Old Testament",
  new: "New Testament",
};

/**
 * What one chapter is called: "Psalm 23", never "Psalms 23" -- the `singular`
 * `bible-books.ts` keeps for exactly this.
 */
export function chapterLabel(book: string, chapter: number): string {
  const name = bookOf(book)?.singular ?? book;
  return `${name} ${chapter}`;
}

/**
 * What a range is called on its node: "Psalm 23:1", "Proverbs 3:5–6", or
 * "Psalm 23" for a whole chapter.
 *
 * **An en dash, as the design draws it**, where the writing and Search keep
 * the hyphen the writer typed. A node is the app's own label for a span rather
 * than an echo of anybody's keystrokes, so it is written the way a span is
 * typeset.
 */
export function rangeLabel(range: VerseRange): string {
  const chapter = chapterLabel(range.book, range.chapter);
  if (range.first === null) return chapter;
  if (range.last === null || range.last === range.first) {
    return `${chapter}:${range.first}`;
  }
  return `${chapter}:${range.first}–${range.last}`;
}

/** One string per range, for keys, sets and comparing two ranges. */
export function rangeKey(range: VerseRange): string {
  return `${range.book}|${range.chapter}|${range.first ?? ""}|${range.last ?? ""}`;
}

/**
 * Canonical order: book, chapter, then a whole chapter before its verses, then
 * by first verse and a shorter range before a longer one starting there.
 */
export function compareRanges(a: VerseRange, b: VerseRange): number {
  return (
    bookIndex(a.book) - bookIndex(b.book) ||
    a.book.localeCompare(b.book) ||
    a.chapter - b.chapter ||
    (a.first ?? -1) - (b.first ?? -1) ||
    (a.last ?? -1) - (b.last ?? -1)
  );
}

export type GraphVerseNode = {
  key: string;
  range: VerseRange;
  label: string;
  count: number;
};

export type GraphChapterNode = {
  key: string;
  label: string;
  count: number;
  verses: GraphVerseNode[];
};

export type GraphBookNode = {
  key: string;
  label: string;
  count: number;
  chapters: GraphChapterNode[];
};

export type GraphTestamentNode = {
  key: Testament;
  label: string;
  count: number;
  books: GraphBookNode[];
};

/**
 * The flat list of ranges, as the tree the screen draws.
 *
 * **Only what the writer has cited is in it** (design G1a): a book nobody has
 * written about has no node, and a testament with no books has none either.
 *
 * **A node's count is the sum of its children's** (design G1b) -- "Psalms 14 is
 * the sum of its chapters". An entry citing Psalm 23:1 and Psalm 23:4 counts
 * twice under Psalm 23, once for each verse, which is why a roll-up can exceed
 * the number of entries. The filter bar's chips (item 8.4) count the other
 * way, distinct entries (design F1b), and that is a different question on a
 * different surface rather than a disagreement.
 */
export function buildGraphTree(rows: readonly GraphVerseRow[]): GraphTestamentNode[] {
  const sorted = [...rows].sort(compareRanges);
  const testaments: GraphTestamentNode[] = [];

  for (const row of sorted) {
    const testamentKey = testamentOf(row.book);
    let testament = testaments.find((t) => t.key === testamentKey);
    if (!testament) {
      testament = { key: testamentKey, label: TESTAMENT_LABELS[testamentKey], count: 0, books: [] };
      testaments.push(testament);
    }

    let book = testament.books.at(-1);
    if (book?.key !== row.book) {
      book = { key: row.book, label: row.book, count: 0, chapters: [] };
      testament.books.push(book);
    }

    const chapterKey = `${row.book}|${row.chapter}`;
    let chapter = book.chapters.at(-1);
    if (chapter?.key !== chapterKey) {
      chapter = { key: chapterKey, label: chapterLabel(row.book, row.chapter), count: 0, verses: [] };
      book.chapters.push(chapter);
    }

    const range: VerseRange = {
      book: row.book,
      chapter: row.chapter,
      first: row.first,
      last: row.last,
    };
    chapter.verses.push({
      key: rangeKey(range),
      range,
      label: rangeLabel(range),
      count: row.entryCount,
    });

    chapter.count += row.entryCount;
    book.count += row.entryCount;
    testament.count += row.entryCount;
  }

  // Old before New, whichever the first row happened to be.
  return testaments.sort((a, b) => (a.key === b.key ? 0 : a.key === "old" ? -1 : 1));
}

/** Every verse node in the tree, top to bottom. */
export function verseNodesOf(tree: readonly GraphTestamentNode[]): GraphVerseNode[] {
  return tree.flatMap((t) => t.books.flatMap((b) => b.chapters.flatMap((c) => c.verses)));
}

/**
 * Which nodes a selection lights, all the way up (design P2a, P3b): the
 * selected ranges, their chapters, their books and their testaments. Anything
 * not in the set is dimmed.
 */
export function litPath(ranges: readonly VerseRange[]): Set<string> {
  const lit = new Set<string>();
  for (const range of ranges) {
    lit.add(rangeKey(range));
    lit.add(`${range.book}|${range.chapter}`);
    lit.add(range.book);
    lit.add(testamentOf(range.book));
  }
  return lit;
}

/**
 * The three levels that open and close, shallowest first: testaments (which
 * show books), books (chapters) and chapters (verses).
 */
export type OpenLevels = readonly [testaments: string[], books: string[], chapters: string[]];

export function openLevelsOf(tree: readonly GraphTestamentNode[]): OpenLevels {
  return [
    tree.map((t) => t.key),
    tree.flatMap((t) => t.books.map((b) => b.key)),
    tree.flatMap((t) => t.books.flatMap((b) => b.chapters.map((c) => c.key))),
  ];
}

/**
 * **Collapse closes one level: the deepest that has anything open** -- the
 * app owner's call on the preview, in place of closing everything at once.
 * With everything open, the first press hides the verses (closes every
 * chapter), the second the chapters, the third the books.
 */
export function collapseOneLevel(open: ReadonlySet<string>, levels: OpenLevels): Set<string> {
  const next = new Set(open);
  for (let depth = levels.length - 1; depth >= 0; depth--) {
    if (levels[depth].some((key) => next.has(key))) {
      levels[depth].forEach((key) => next.delete(key));
      return next;
    }
  }
  return next;
}

/**
 * **Expand opens one level: the shallowest that has anything closed** -- so
 * from the starting view the first press shows every book's chapters and the
 * second every chapter's verses. The mirror of `collapseOneLevel`.
 */
export function expandOneLevel(open: ReadonlySet<string>, levels: OpenLevels): Set<string> {
  const next = new Set(open);
  for (const level of levels) {
    if (level.some((key) => !next.has(key))) {
      level.forEach((key) => next.add(key));
      return next;
    }
  }
  return next;
}
