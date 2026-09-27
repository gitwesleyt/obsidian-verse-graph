// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-filter-rules.test.ts) on 2026-09-27.
// Only change: "@/lib/" imports made relative. Keep in step with the original rather than editing here.

import { describe, expect, it } from "vitest";

import {
  booksButtonLabel,
  booksSelectedLabel,
  citationFacets,
  datesButtonLabel,
  isFiltered,
  NO_GRAPH_FILTERS,
  nothingMatchesSentence,
  referenceSuggestions,
  scopeCounts,
  tagsButtonLabel,
  testamentSummary,
  testamentTick,
  toggleBook,
  toggleTestament,
  versesInScope,
  type GraphCitation,
} from "./graph-filter-rules";

function cite(
  entryId: string,
  book: string,
  chapter: number,
  first: number | null = 1,
): GraphCitation {
  return {
    entryId,
    book,
    chapter,
    first,
    last: first,
    reading: "2026-03-12T21:00:00",
  };
}

const CITATIONS: GraphCitation[] = [
  cite("a", "Psalms", 23),
  cite("a", "Psalms", 23, 4),
  cite("a", "Romans", 8, 28),
  cite("b", "Romans", 8, 28),
  cite("b", "Romans", 12),
  cite("c", "Proverbs", 3, 5),
];

const COUNTS = scopeCounts(CITATIONS);

describe("scopeCounts", () => {
  it("counts distinct entries, never citations (design F1b)", () => {
    expect(COUNTS.books.get("Psalms")).toBe(1);
    expect(COUNTS.books.get("Romans")).toBe(2);
    expect(COUNTS.chapters.get("Romans|8")).toBe(2);
    expect(COUNTS.chapters.get("Romans|12")).toBe(1);
  });

  it("counts an entry once under each testament it touches, so they can outnumber the journal", () => {
    expect(COUNTS.testaments.get("old")).toBe(2);
    expect(COUNTS.testaments.get("new")).toBe(2);
  });
});

describe("citationFacets", () => {
  it("files each entry once, on the writer's clock", () => {
    const facets = citationFacets([
      { ...cite("a", "John", 3), reading: "2026-03-15T23:30:00" },
      { ...cite("a", "John", 4), reading: "2026-03-15T23:30:00" },
    ]);
    // 15 March 2026 was a Sunday.
    expect(facets).toEqual([
      { year: 2026, month: 3, weekday: 0, hasVerses: true, hasTags: false },
    ]);
  });
});

describe("the buttons' words", () => {
  it("names up to two books in canonical order, then counts the rest", () => {
    expect(booksButtonLabel([])).toBe("Books");
    expect(booksButtonLabel(["Romans", "Psalms"])).toBe("Psalms, Romans");
    expect(booksButtonLabel(["Romans", "Psalms", "Genesis"])).toBe(
      "Genesis +2",
    );
  });

  it("names the dates chosen, since Home's popover chooses rather than ranges", () => {
    expect(datesButtonLabel({ years: [], months: [], weekdays: [] })).toBe(
      "Any date",
    );
    expect(
      datesButtonLabel({ years: [2024], months: [1, 2], weekdays: [0] }),
    ).toBe("2024 · Jan, Feb · Sundays");
  });

  it("names the first custom tag and counts the rest", () => {
    expect(tagsButtonLabel([])).toBe("Any tag");
    expect(tagsButtonLabel(["grief"])).toBe("#grief");
    expect(tagsButtonLabel(["grief", "joy", "rest"])).toBe("#grief +2");
  });
});

describe("the Books picker (design F3)", () => {
  it("part-ticks a testament until every cited book in it is ticked", () => {
    expect(testamentTick("old", [], COUNTS)).toBe("none");
    expect(testamentTick("old", ["Psalms"], COUNTS)).toBe("some");
    expect(testamentTick("old", ["Psalms", "Proverbs"], COUNTS)).toBe("all");
  });

  it("fills a testament with its cited books, and empties a full one, leaving the other alone", () => {
    expect(toggleTestament("old", ["Romans"], COUNTS)).toEqual([
      "Psalms",
      "Proverbs",
      "Romans",
    ]);
    expect(
      toggleTestament("old", ["Psalms", "Proverbs", "Romans"], COUNTS),
    ).toEqual(["Romans"]);
  });

  it("ticks and unticks one book, keeping canonical order", () => {
    expect(toggleBook("Psalms", ["Romans"])).toEqual(["Psalms", "Romans"]);
    expect(toggleBook("Romans", ["Psalms", "Romans"])).toEqual(["Psalms"]);
  });

  it("summarises a testament and the selection", () => {
    expect(testamentSummary("old", COUNTS)).toBe("39 books · 2 cited");
    expect(testamentSummary("new", COUNTS)).toBe("27 books · 1 cited");
    expect(booksSelectedLabel(["Romans", "Psalms"])).toBe(
      "2 books selected · Psalms, Romans",
    );
  });
});

describe("referenceSuggestions (design F2)", () => {
  it("offers a cited book and its cited chapters, each with its entry count", () => {
    expect(referenceSuggestions("rom", COUNTS)).toEqual({
      kind: "rows",
      rows: [
        { book: "Romans", label: "Romans", kind: "Book", count: 2 },
        {
          book: "Romans",
          chapter: 8,
          label: "Romans 8",
          kind: "Chapter",
          count: 2,
        },
        {
          book: "Romans",
          chapter: 12,
          label: "Romans 12",
          kind: "Chapter",
          count: 1,
        },
      ],
    });
  });

  it("offers only chapters once a chapter is typed", () => {
    const answer = referenceSuggestions("Romans 1", COUNTS);
    expect(answer.kind === "rows" && answer.rows.map((r) => r.label)).toEqual([
      "Romans 12",
    ]);
  });

  it("answers by any name a book goes by, and names a chapter the singular way", () => {
    const answer = referenceSuggestions("Psalm 2", COUNTS);
    expect(answer.kind === "rows" && answer.rows.map((r) => r.label)).toEqual([
      "Psalm 23",
    ]);
  });

  it("says a real book is uncited rather than showing nothing (design F2c)", () => {
    expect(referenceSuggestions("Gen", COUNTS)).toEqual({
      kind: "uncited",
      label: "Genesis",
    });
    expect(referenceSuggestions("Romans 3", COUNTS)).toEqual({
      kind: "uncited",
      label: "Romans 3",
    });
  });

  it("says nothing for a word that is no book at all, or for nothing typed", () => {
    expect(referenceSuggestions("zzz", COUNTS)).toEqual({ kind: "nothing" });
    expect(referenceSuggestions("  ", COUNTS)).toEqual({ kind: "nothing" });
  });

  it("reads a leading number as the start of a book, not a chapter", () => {
    const counts = scopeCounts([cite("a", "1 John", 4)]);
    const answer = referenceSuggestions("1 J", counts);
    expect(answer.kind === "rows" && answer.rows.map((r) => r.label)).toEqual([
      "1 John",
      "1 John 4",
    ]);
  });
});

describe("nothingMatchesSentence (design F5)", () => {
  it("states the mismatch in the filters' own terms", () => {
    expect(
      nothingMatchesSentence({
        ...NO_GRAPH_FILTERS,
        books: ["Isaiah"],
        tagNames: ["grief"],
        dates: { years: [2025], months: [], weekdays: [] },
      }),
    ).toBe(
      "None of your entries citing Isaiah are tagged grief and were written in 2025.",
    );
  });

  it("joins a union of scope with 'or', as the query does", () => {
    expect(
      nothingMatchesSentence({
        ...NO_GRAPH_FILTERS,
        books: ["Romans", "Psalms"],
        reference: { book: "John", chapter: 3 },
        dates: { years: [], months: [3], weekdays: [0, 6] },
      }),
    ).toBe(
      "None of your entries citing Psalms, Romans or John 3 were written in March, on Sundays or Saturdays.",
    );
  });

  it("knows whether anything is filtered", () => {
    expect(isFiltered(NO_GRAPH_FILTERS)).toBe(false);
    expect(isFiltered({ ...NO_GRAPH_FILTERS, tagNames: ["grief"] })).toBe(true);
  });
});

describe("versesInScope (design F6c)", () => {
  it("counts distinct ranges in the union of ticked books and the reference", () => {
    expect(versesInScope(CITATIONS, [], null)).toBe(5);
    expect(versesInScope(CITATIONS, ["Psalms"], null)).toBe(2);
    expect(
      versesInScope(CITATIONS, ["Psalms"], { book: "Romans", chapter: 8 }),
    ).toBe(3);
    expect(versesInScope(CITATIONS, ["Genesis"], null)).toBe(0);
  });
});
