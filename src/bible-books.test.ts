// Copied from the Bible Journal web app (bible-journal-app/src/lib/bible-books.test.ts) on 2026-09-26.
// Unchanged. A superset of Scripture Thread's copy (adds BOOK_CATEGORIES). Keep in step with the original rather than editing here.

import { describe, expect, it } from "vitest";

import { BIBLE_BOOKS, BOOK_CATEGORIES, categoryOfBook } from "./bible-books";

describe("BOOK_CATEGORIES (item 8.6)", () => {
  it("covers every book exactly once, in canonical order", () => {
    const covered = BIBLE_BOOKS.map((book) => categoryOfBook(book.name)?.id);
    expect(covered.every(Boolean)).toBe(true);
    // In order: each group's books are one unbroken run, and the groups
    // follow one another as the list does.
    const runs = covered.filter((id, index) => id !== covered[index - 1]);
    expect(runs).toEqual(BOOK_CATEGORIES.map((category) => category.id));
  });

  it("names only real books as the ends of a run", () => {
    const names = new Set(BIBLE_BOOKS.map((book) => book.name));
    for (const category of BOOK_CATEGORIES) {
      expect(names.has(category.first)).toBe(true);
      expect(names.has(category.last)).toBe(true);
    }
  });

  it("never lets a group straddle the two testaments", () => {
    const malachi = BIBLE_BOOKS.findIndex((book) => book.name === "Malachi");
    expect(categoryOfBook("Malachi")!.id).not.toBe(categoryOfBook(BIBLE_BOOKS[malachi + 1].name)!.id);
  });

  it("puts the usual books where a study Bible does", () => {
    expect(categoryOfBook("Deuteronomy")!.name).toBe("Law");
    expect(categoryOfBook("Esther")!.name).toBe("History");
    expect(categoryOfBook("Song of Solomon")!.name).toBe("Wisdom and Poetry");
    expect(categoryOfBook("Lamentations")!.name).toBe("Major Prophets");
    expect(categoryOfBook("Acts")!.name).toBe("History");
    expect(categoryOfBook("Philemon")!.name).toBe("Pauline Epistles");
    expect(categoryOfBook("Hebrews")!.name).toBe("General Epistles");
    expect(categoryOfBook("Revelation")!.name).toBe("Prophecy");
  });

  it("knows nothing of a name that is not a book", () => {
    expect(categoryOfBook("Hezekiah")).toBeUndefined();
  });
});
