// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-filter-rules.ts) on 2026-09-27.
// Only change: "@/lib/" imports made relative. Keep in step with the original rather than editing here.

import { BIBLE_BOOKS } from "./bible-books";
import {
  monthName,
  weekdayPlural,
  type EntryFacet,
} from "./entry-filter-rules";
import {
  chapterLabel,
  testamentOf,
  type Testament,
  type VerseRange,
} from "./graph-rules";

/**
 * The Graph screen's filter bar (v3's item 8.4, design F1-F6), as plain
 * functions: what is filtered, what each control's button says, the counts the
 * Books picker and the reference suggestions show, and the sentence the canvas
 * says when nothing matches.
 *
 * `v3/design/8-graph-view/README.md` is the design in words; `spec/graph.md`
 * is what the screen does.
 */

/** One reference: a book, or a book and one chapter (design F2a -- never a verse). */
export type GraphReference = { book: string; chapter?: number };

/** A date filter is Home's: years, months and days of the week (design F1c). */
export type GraphDates = {
  years: number[];
  months: number[];
  weekdays: number[];
};

export type GraphFilters = {
  /** Ticked books. With `reference`, one scope and a union (design F2b). */
  books: string[];
  reference: GraphReference | null;
  dates: GraphDates;
  /** Custom tags by name, never verse tags: an entry carrying any one of them. */
  tagNames: string[];
};

export const NO_DATES: GraphDates = { years: [], months: [], weekdays: [] };

export const NO_GRAPH_FILTERS: GraphFilters = {
  books: [],
  reference: null,
  dates: NO_DATES,
  tagNames: [],
};

export function hasDates(dates: GraphDates): boolean {
  return dates.years.length + dates.months.length + dates.weekdays.length > 0;
}

/** Whether anything narrows the graph -- what lights Reset and the `Filtered` badge. */
export function isFiltered(filters: GraphFilters): boolean {
  return (
    filters.books.length > 0 ||
    filters.reference !== null ||
    hasDates(filters.dates) ||
    filters.tagNames.length > 0
  );
}

// -----------------------------------------------------------------------------
// What each button says
// -----------------------------------------------------------------------------

/** The name a reference goes by: `Romans`, `Romans 8`, `Psalm 23`. */
export function referenceLabel(reference: GraphReference): string {
  return reference.chapter === undefined
    ? reference.book
    : chapterLabel(reference.book, reference.chapter);
}

/**
 * The Books button (design F3, F4): `Books` at rest, the names when two or
 * fewer are ticked, and the first with a count of the rest beyond that -- a
 * button carrying twelve book names is a button wider than the screen.
 */
export function booksButtonLabel(books: readonly string[]): string {
  const ordered = canonicalOrder(books);
  if (ordered.length === 0) return "Books";
  if (ordered.length <= 2) return ordered.join(", ");
  return `${ordered[0]} +${ordered.length - 1}`;
}

/**
 * The date button (design F4's `1 Jan – 30 Jun 2024`). **Home's popover chooses
 * years, months and days of the week, not a continuous range**, so this names
 * what was chosen: `2024 · Jan, Feb · Sundays`.
 */
export function datesButtonLabel(dates: GraphDates): string {
  if (!hasDates(dates)) return "Any date";
  const parts = [
    dates.years.join(", "),
    dates.months.map((m) => monthName(m, "short")).join(", "),
    dates.weekdays.map(weekdayPlural).join(", "),
  ];
  return parts.filter((part) => part !== "").join(" · ");
}

/** The tag button (design F5's `Tag grief`): `Any tag`, `#grief`, `#grief +2`. */
export function tagsButtonLabel(tagNames: readonly string[]): string {
  if (tagNames.length === 0) return "Any tag";
  const first = `#${tagNames[0]}`;
  return tagNames.length === 1 ? first : `${first} +${tagNames.length - 1}`;
}

// -----------------------------------------------------------------------------
// The counts behind the Books picker and the suggestions
// -----------------------------------------------------------------------------

/** One range one entry cites -- `graph_citations`' row. */
export type GraphCitation = VerseRange & {
  entryId: string;
  /** The entry's date on the writer's clock, `YYYY-MM-DDTHH:MM:SS`. */
  reading: string;
};

/**
 * How many **distinct entries** cite each book, each chapter and each testament
 * (design F1b). An entry citing Psalm 23 and Romans 8 counts once under each
 * testament, so the two can add up to more than the journal holds -- correct,
 * not a bug. **The tree counts the other way** (a node is the sum of its
 * children, design G1b); these are a different question on a different
 * surface.
 */
export type ScopeCounts = {
  books: ReadonlyMap<string, number>;
  /** Keyed `book|chapter`. */
  chapters: ReadonlyMap<string, number>;
  testaments: ReadonlyMap<Testament, number>;
};

export function scopeCounts(citations: readonly GraphCitation[]): ScopeCounts {
  const books = new Map<string, Set<string>>();
  const chapters = new Map<string, Set<string>>();
  const testaments = new Map<Testament, Set<string>>();

  const add = <K>(map: Map<K, Set<string>>, key: K, entryId: string) => {
    const seen = map.get(key) ?? new Set<string>();
    seen.add(entryId);
    map.set(key, seen);
  };

  for (const citation of citations) {
    add(books, citation.book, citation.entryId);
    add(chapters, `${citation.book}|${citation.chapter}`, citation.entryId);
    add(testaments, testamentOf(citation.book), citation.entryId);
  }

  const sizes = <K>(map: Map<K, Set<string>>) =>
    new Map([...map].map(([key, seen]) => [key, seen.size] as const));

  return {
    books: sizes(books),
    chapters: sizes(chapters),
    testaments: sizes(testaments),
  };
}

/**
 * Every entry that cites anything, as the facet Home's date popover greys its
 * chips from (`reachableFilters`). Read off `reading`, which is already the
 * writer's clock, so no offset is applied twice.
 */
export function citationFacets(
  citations: readonly GraphCitation[],
): EntryFacet[] {
  const byEntry = new Map<string, EntryFacet>();
  for (const citation of citations) {
    if (byEntry.has(citation.entryId)) continue;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(citation.reading);
    if (!match) continue;
    const [year, month, day] = match.slice(1).map(Number);
    byEntry.set(citation.entryId, {
      year,
      month,
      weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
      hasVerses: true,
      hasTags: false,
    });
  }
  return [...byEntry.values()];
}

// -----------------------------------------------------------------------------
// The Books picker (design F3)
// -----------------------------------------------------------------------------

const BOOK_ORDER = new Map(
  BIBLE_BOOKS.map((book, index) => [book.name, index]),
);

/** Books in canonical order, unknown names last -- the order every list here uses. */
export function canonicalOrder(books: readonly string[]): string[] {
  return [...new Set(books)].sort(
    (a, b) =>
      (BOOK_ORDER.get(a) ?? BIBLE_BOOKS.length) -
      (BOOK_ORDER.get(b) ?? BIBLE_BOOKS.length),
  );
}

export type TestamentTick = "none" | "some" | "all";

/**
 * A testament heading's select-all box (design F3a): empty with nothing
 * ticked, ticked when every **cited** book is, part-ticked between. A book
 * nobody has cited cannot be ticked, so it cannot hold the heading short of
 * full.
 */
export function testamentTick(
  testament: Testament,
  ticked: readonly string[],
  counts: ScopeCounts,
): TestamentTick {
  const cited = citedBooksOf(testament, counts);
  const chosen = cited.filter((book) => ticked.includes(book)).length;
  if (chosen === 0) return "none";
  return chosen === cited.length ? "all" : "some";
}

/** The cited books of one testament, in canonical order. */
export function citedBooksOf(
  testament: Testament,
  counts: ScopeCounts,
): string[] {
  return BIBLE_BOOKS.map((book) => book.name).filter(
    (name) =>
      testamentOf(name) === testament && (counts.books.get(name) ?? 0) > 0,
  );
}

/**
 * What the heading's box does when pressed: a full testament empties, anything
 * less fills with every cited book. The other testament is left alone.
 */
export function toggleTestament(
  testament: Testament,
  ticked: readonly string[],
  counts: ScopeCounts,
): string[] {
  const cited = citedBooksOf(testament, counts);
  const others = ticked.filter((book) => testamentOf(book) !== testament);
  const filling = testamentTick(testament, ticked, counts) !== "all";
  return canonicalOrder(filling ? [...others, ...cited] : others);
}

export function toggleBook(book: string, ticked: readonly string[]): string[] {
  return ticked.includes(book)
    ? ticked.filter((b) => b !== book)
    : canonicalOrder([...ticked, book]);
}

/** The footer: `2 books selected · Psalms, Romans`. */
export function booksSelectedLabel(books: readonly string[]): string {
  if (books.length === 0) return "No books selected";
  const noun = books.length === 1 ? "book" : "books";
  return `${books.length} ${noun} selected · ${canonicalOrder(books).join(", ")}`;
}

/** A testament heading's second line: `39 books · 3 cited`. */
export function testamentSummary(
  testament: Testament,
  counts: ScopeCounts,
): string {
  const total = BIBLE_BOOKS.filter(
    (book) => testamentOf(book.name) === testament,
  ).length;
  return `${total} books · ${citedBooksOf(testament, counts).length} cited`;
}

// -----------------------------------------------------------------------------
// The reference field's suggestions (design F2)
// -----------------------------------------------------------------------------

export type ReferenceSuggestion = GraphReference & {
  label: string;
  kind: "Book" | "Chapter";
  /** Distinct entries citing it. */
  count: number;
};

export type ReferenceAnswer =
  | { kind: "rows"; rows: ReferenceSuggestion[] }
  /** A real book, or chapter, nobody has cited (design F2c) -- not a typo. */
  | { kind: "uncited"; label: string }
  | { kind: "nothing" };

/** How many suggestions are listed, so a one-letter query is not a scroll. */
export const MAX_SUGGESTIONS = 8;

function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** The books whose name, or any name they go by, starts with what was typed. */
function booksStartingWith(typed: string): string[] {
  const wanted = fold(typed);
  return BIBLE_BOOKS.filter((book) =>
    [book.name, book.singular ?? "", ...book.aliases].some(
      (name) => name !== "" && fold(name).startsWith(wanted),
    ),
  ).map((book) => book.name);
}

/**
 * Splits `Romans 8` into the book part and the chapter. A number on its own
 * (`1`) is the start of `1 John`, never a chapter of nothing.
 */
function splitReference(typed: string): { book: string; chapter?: string } {
  const match = /^(.*\S)\s+(\d+)$/.exec(fold(typed));
  return match ? { book: match[1], chapter: match[2] } : { book: fold(typed) };
}

/**
 * The suggestions for what has been typed (design F2): book and chapter level
 * only, from references in the writer's own entries, each with its entry
 * count. `Rom` offers Romans and its cited chapters; `Romans 8` offers only the
 * chapter; `Gen`, when nobody has cited Genesis, says so rather than showing an
 * empty list.
 */
export function referenceSuggestions(
  typed: string,
  counts: ScopeCounts,
): ReferenceAnswer {
  if (fold(typed) === "") return { kind: "nothing" };

  const { book: bookPart, chapter: chapterPart } = splitReference(typed);
  const books = booksStartingWith(bookPart);
  if (books.length === 0) return { kind: "nothing" };

  const chaptersOf = (book: string): number[] =>
    [...counts.chapters.keys()]
      .filter((key) => key.startsWith(`${book}|`))
      .map((key) => Number(key.slice(book.length + 1)))
      .sort((a, b) => a - b);

  const chapterRow = (book: string, chapter: number): ReferenceSuggestion => ({
    book,
    chapter,
    label: chapterLabel(book, chapter),
    kind: "Chapter",
    count: counts.chapters.get(`${book}|${chapter}`) ?? 0,
  });

  const rows: ReferenceSuggestion[] = [];
  for (const book of books) {
    if (!counts.books.has(book)) continue;
    if (chapterPart === undefined) {
      rows.push({
        book,
        label: book,
        kind: "Book",
        count: counts.books.get(book) ?? 0,
      });
      for (const chapter of chaptersOf(book))
        rows.push(chapterRow(book, chapter));
    } else {
      for (const chapter of chaptersOf(book)) {
        if (String(chapter).startsWith(chapterPart))
          rows.push(chapterRow(book, chapter));
      }
    }
  }

  if (rows.length > 0)
    return { kind: "rows", rows: rows.slice(0, MAX_SUGGESTIONS) };

  const first = books[0];
  const label =
    chapterPart === undefined
      ? first
      : chapterLabel(first, Number(chapterPart));
  return { kind: "uncited", label };
}

// -----------------------------------------------------------------------------
// When nothing matches (design F5)
// -----------------------------------------------------------------------------

function orList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/**
 * The canvas's sentence when the filters leave nothing to draw, in terms of the
 * filters themselves (design F5a): *None of your entries citing Isaiah are
 * tagged grief and were written in 2025.* **Never `EmptyGraph`'s words**, which
 * say the journal has no verses at all -- `CORE-SPEC.md`'s rule about a
 * narrowed list read as an empty journal.
 */
export function nothingMatchesSentence(filters: GraphFilters): string {
  const scope = [
    ...canonicalOrder(filters.books),
    ...(filters.reference ? [referenceLabel(filters.reference)] : []),
  ];

  const written: string[] = [];
  const { years, months, weekdays } = filters.dates;
  if (years.length > 0) written.push(`in ${orList(years.map(String))}`);
  if (months.length > 0)
    written.push(`in ${orList(months.map((m) => monthName(m, "long")))}`);
  if (weekdays.length > 0)
    written.push(`on ${orList(weekdays.map(weekdayPlural))}`);

  const said: string[] = [];
  if (filters.tagNames.length > 0)
    said.push(`are tagged ${orList(filters.tagNames)}`);
  if (written.length > 0) said.push(`were written ${written.join(", ")}`);

  if (said.length === 0) {
    return scope.length > 0
      ? `None of your entries cite ${orList(scope)}.`
      : "None of your entries match.";
  }

  const subject =
    scope.length > 0
      ? `None of your entries citing ${orList(scope)}`
      : "None of your entries";
  return `${subject} ${said.join(" and ")}.`;
}

// -----------------------------------------------------------------------------
// The phone's Books sheet (design F6c)
// -----------------------------------------------------------------------------

/**
 * How many verse ranges a scope would draw, from citations already read under
 * the other filters -- the sheet's `Show 5 verses`, so an empty result shows
 * before the sheet is left. The same union the query takes: a ticked book, or
 * the reference. No scope at all is everything.
 */
export function versesInScope(
  citations: readonly GraphCitation[],
  books: readonly string[],
  reference: GraphReference | null,
): number {
  const unscoped = books.length === 0 && reference === null;
  const inScope = (c: GraphCitation) =>
    unscoped ||
    books.includes(c.book) ||
    (reference !== null &&
      c.book === reference.book &&
      (reference.chapter === undefined || c.chapter === reference.chapter));

  return new Set(
    citations
      .filter(inScope)
      .map((c) => `${c.book}|${c.chapter}|${c.first ?? ""}|${c.last ?? ""}`),
  ).size;
}
