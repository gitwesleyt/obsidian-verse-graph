// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-rules.ts) on 2026-09-27.
// Only change: "@/lib/" imports made relative. Keep in step with the original rather than editing here.

import {
  BIBLE_BOOKS,
  BOOK_CATEGORIES,
  categoryOfBook,
  type BibleBook,
  type BookCategory,
} from "./bible-books";

/**
 * What the Graph screen draws, worked out from what the database hands back
 * (v3's item 8.2). Pure -- no network, no React.
 *
 * The database says which verse ranges the writer has cited and how often
 * (`graph_verse_nodes`, migration 0038); this file turns that flat list into
 * the Testament -> Book -> Chapter -> Verse tree the design draws, in canonical
 * order, with a count on every node -- and, with the *Literary categories*
 * setting on (item 8.6), a level of categories between Testament and Book. Where each node *sits* is
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
   * `timestamp` -- the order Replay draws the nodes in (item 8.3,
   * `graph-replay-rules.ts`), and read by nothing else.
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
 * A category's node key (item 8.6). **Prefixed so it can never be a book's**:
 * a book's key is its name, and a category could one day share a word with
 * one -- as the two *History* groups already share a name with each other.
 */
function categoryKey(category: BookCategory): string {
  return `category:${category.id}`;
}

/**
 * The key of the category a book is drawn under. A book this list does not
 * know is a group of its own name rather than lost.
 */
function categoryKeyOfBook(book: string): string {
  const category = categoryOfBook(book);
  return category ? categoryKey(category) : `category:${book}`;
}

/** Every category's key -- what opens them all, whether or not any is drawn. */
export const CATEGORY_KEYS: readonly string[] = BOOK_CATEGORIES.map(categoryKey);

/**
 * The keys of every box above a book, and the book's own: its testament, its
 * category and itself. **The category is in the path whether or not the
 * setting draws that column** -- a key nothing draws lights nothing and opens
 * nothing -- so lighting a path, opening one and choosing where a line lands
 * never have to be told which way the tree is drawn.
 */
export function bookPath(book: string): string[] {
  return [testamentOf(book), categoryKeyOfBook(book), book];
}

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

/** A group of books, like *Gospels* (item 8.6). */
export type GraphCategoryNode = {
  key: string;
  label: string;
  count: number;
  books: GraphBookNode[];
};

export type GraphTestamentNode = {
  key: Testament;
  label: string;
  count: number;
  /** Every book in it, whichever way the tree is drawn. */
  books: GraphBookNode[];
  /**
   * The same books grouped into categories, when the *Literary categories*
   * setting is on (item 8.6); **null when it is off**, which is how the rest
   * of the screen knows the column is not drawn. The book nodes are the same
   * objects as in `books`, not copies.
   */
  categories: GraphCategoryNode[] | null;
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
 *
 * **`categories` adds a level between testament and book** (item 8.6), and
 * its counts roll up like every other level's. A category nobody has cited a
 * book of has no node, for the reason a book does not.
 */
export function buildGraphTree(
  rows: readonly GraphVerseRow[],
  { categories = false }: { categories?: boolean } = {},
): GraphTestamentNode[] {
  const sorted = [...rows].sort(compareRanges);
  const testaments: GraphTestamentNode[] = [];

  for (const row of sorted) {
    const testamentKey = testamentOf(row.book);
    let testament = testaments.find((t) => t.key === testamentKey);
    if (!testament) {
      testament = {
        key: testamentKey,
        label: TESTAMENT_LABELS[testamentKey],
        count: 0,
        books: [],
        categories: categories ? [] : null,
      };
      testaments.push(testament);
    }

    const lastBook = testament.books.at(-1);
    const book: GraphBookNode =
      lastBook?.key === row.book ? lastBook : { key: row.book, label: row.book, count: 0, chapters: [] };
    const newBook = book !== lastBook;
    if (newBook) testament.books.push(book);

    let group = testament.categories?.at(-1);
    const groupKey = categoryKeyOfBook(row.book);
    if (testament.categories && group?.key !== groupKey) {
      group = { key: groupKey, label: categoryOfBook(row.book)?.name ?? row.book, count: 0, books: [] };
      testament.categories.push(group);
    }
    if (group && newBook) group.books.push(book);

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
    if (group) group.count += row.entryCount;
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
 * selected ranges, their chapters, their books, their categories and their
 * testaments. Anything not in the set is dimmed.
 */
export function litPath(ranges: readonly VerseRange[]): Set<string> {
  const lit = new Set<string>();
  for (const range of ranges) {
    lit.add(rangeKey(range));
    lit.add(`${range.book}|${range.chapter}`);
    bookPath(range.book).forEach((key) => lit.add(key));
  }
  return lit;
}

/**
 * The tree with only the nodes `keep` names -- what a selection lights (item
 * 8.7, the toolbar's *Hide dimmed*), or what a replay has drawn so far (item
 * 8.3). **Laid out again rather than left with holes**, so what is left
 * closes up; everything else slides away into its parent the way a closed
 * book's chapters do.
 *
 * **Counts are kept as they were**: Genesis still reads 21 with one of its
 * chapters showing, because this changes what is on the canvas, not what is
 * in the journal. **With nothing to keep, the tree comes back whole** -- *Hide
 * dimmed* can be on with nothing selected, and waits for a selection. A
 * category keeps the same book objects as its testament's `books`, as
 * `buildGraphTree` does.
 */
export function keepOnly(
  tree: readonly GraphTestamentNode[],
  keep: ReadonlySet<string>,
): readonly GraphTestamentNode[] {
  if (keep.size === 0) return tree;

  return tree
    .filter((testament) => keep.has(testament.key))
    .map((testament) => {
      const books = new Map(
        testament.books
          .filter((book) => keep.has(book.key))
          .map((book): [string, GraphBookNode] => [
            book.key,
            {
              ...book,
              chapters: book.chapters
                .filter((chapter) => keep.has(chapter.key))
                .map((chapter) => ({
                  ...chapter,
                  verses: chapter.verses.filter((verse) => keep.has(verse.key)),
                })),
            },
          ]),
      );
      return {
        ...testament,
        books: [...books.values()],
        categories:
          testament.categories
            ?.filter((category) => keep.has(category.key))
            .map((category) => ({
              ...category,
              books: category.books.flatMap((book) => books.get(book.key) ?? []),
            })) ?? null,
      };
    });
}

/**
 * The levels that open and close, shallowest first: testaments, then --
 * with the *Literary categories* setting on (item 8.6) -- categories, then
 * books and chapters. Expand and Collapse step through them one at a time.
 */
export type OpenLevels = readonly (readonly string[])[];

export function openLevelsOf(tree: readonly GraphTestamentNode[]): OpenLevels {
  const categories = tree.flatMap((t) => (t.categories ?? []).map((c) => c.key));
  return [
    tree.map((t) => t.key),
    ...(categories.length > 0 ? [categories] : []),
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

/**
 * **Expand with Cmd or Ctrl held opens every level at once**, and Collapse
 * with it closes every one -- the app owner's ask, the end each would reach
 * pressed again and again. Keys outside `levels` are left as they were.
 */
export function expandAllLevels(open: ReadonlySet<string>, levels: OpenLevels): Set<string> {
  return new Set([...open, ...levels.flat()]);
}

export function collapseAllLevels(open: ReadonlySet<string>, levels: OpenLevels): Set<string> {
  const closing = new Set(levels.flat());
  return new Set([...open].filter((key) => !closing.has(key)));
}

/**
 * The ranges one block cites, recovered the way migration 0038 recovers them:
 * each whole-chapter tag on its own, and each run of consecutive verses of one
 * chapter as one range. **The same reading as the tree's**, so the paragraph
 * the entry panel opens at is the one the node it came from was counted from
 * (item 8.5).
 */
export function rangesOfBlock(
  verses: readonly { book: string; chapter: number; verse: number | null }[],
): VerseRange[] {
  const ranges: VerseRange[] = [];
  const numbered = new Map<string, { book: string; chapter: number; verses: Set<number> }>();

  for (const tag of verses) {
    if (tag.verse === null) {
      ranges.push({ book: tag.book, chapter: tag.chapter, first: null, last: null });
      continue;
    }
    const key = `${tag.book}|${tag.chapter}`;
    const chapter = numbered.get(key) ?? { book: tag.book, chapter: tag.chapter, verses: new Set() };
    chapter.verses.add(tag.verse);
    numbered.set(key, chapter);
  }

  for (const { book, chapter, verses: set } of numbered.values()) {
    const sorted = [...set].sort((a, b) => a - b);
    let first = sorted[0];
    sorted.forEach((verse, index) => {
      const next = sorted[index + 1];
      if (next === verse + 1) return;
      ranges.push({ book, chapter, first, last: verse });
      first = next;
    });
  }

  return ranges.sort(compareRanges);
}

/**
 * The blocks of an entry that cite `range`, in reading order -- what the entry
 * panel highlights and opens at (design P3a).
 *
 * **Exactly first**, by `rangesOfBlock`. Only if no block cites it exactly does
 * a block citing any verse inside it count, so a reading that disagrees with
 * the database's in some case nobody has met still opens near the right place
 * rather than at the top.
 */
export function blocksCiting(
  blockIds: readonly string[],
  citedByBlock: ReadonlyMap<string, readonly { book: string; chapter: number; verse: number | null }[]>,
  range: VerseRange,
): string[] {
  const key = rangeKey(range);
  const exact = blockIds.filter((id) =>
    rangesOfBlock(citedByBlock.get(id) ?? []).some((cited) => rangeKey(cited) === key),
  );
  if (exact.length > 0) return exact;

  return blockIds.filter((id) =>
    (citedByBlock.get(id) ?? []).some(
      (tag) =>
        tag.book === range.book &&
        tag.chapter === range.chapter &&
        (range.first === null ||
          (tag.verse !== null && tag.verse >= range.first && tag.verse <= (range.last ?? range.first))),
    ),
  );
}
