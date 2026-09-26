// Copied from the Bible Journal web app (bible-journal-app/src/lib/bible-books.ts) on 2026-09-26.
// Unchanged. A superset of Scripture Thread's copy (adds BOOK_CATEGORIES). Keep in step with the original rather than editing here.

/**
 * The 66 books, how many chapters each has, and what people call them.
 *
 * Plain data, deliberately separate from `verse-rules.ts` so the rules file is
 * about matching and this file is about the Bible. Nothing here imports
 * anything.
 *
 * Two things every entry carries:
 *
 *  - `chapters` is the cheapest false-positive guard there is. "Jonah 9" is
 *    not a reference, because Jonah has four chapters. Without this, any book
 *    name followed by any number would be tagged.
 *
 *  - `aliases` are the spellings that are NOT the canonical name. The
 *    canonical name is always matched too; it does not need repeating here.
 *
 * What is deliberately NOT in the alias lists: abbreviations that are ordinary
 * English words. "Is" for Isaiah, "Am" for Amos and "So" for Song would each
 * turn a sentence like "Am 3 of them coming?" into a verse tag. The full names
 * are kept (a person writing "Amos 3" means Amos), and the short forms that
 * collide are left out. "Job", "Mark", "Acts" and "Jude" are unavoidable --
 * they are the real names of the books -- and are what the manual override in
 * `spec/verse-linking.md` exists for.
 *
 * Abbreviations that would be ambiguous between two books are also left out:
 * "Jud" could be Judges or Jude, and "Hb" could be Habakkuk or Hebrews, so
 * neither is listed.
 */

export type BibleBook = {
  /** Canonical name. This is what the `verses.book` column stores. */
  name: string;
  /** How many chapters the book has. */
  chapters: number;
  /** Other spellings, canonical name excluded. */
  aliases: string[];
  /**
   * The form used when naming a single chapter, where that differs from the
   * canonical name. Only Psalms needs it: the book is "Psalms", but one of
   * them is "Psalm 23", and a Bible journal should not say "Psalms 23".
   */
  singular?: string;
};

export const BIBLE_BOOKS: BibleBook[] = [
  // --- Old Testament ---------------------------------------------------------
  { name: "Genesis", chapters: 50, aliases: ["Gen", "Gn", "Ge"] },
  { name: "Exodus", chapters: 40, aliases: ["Exod", "Exo", "Ex"] },
  { name: "Leviticus", chapters: 27, aliases: ["Lev", "Lv"] },
  { name: "Numbers", chapters: 36, aliases: ["Num", "Nm", "Nu"] },
  { name: "Deuteronomy", chapters: 34, aliases: ["Deut", "Deu", "Dt"] },
  { name: "Joshua", chapters: 24, aliases: ["Josh", "Jos"] },
  { name: "Judges", chapters: 21, aliases: ["Judg", "Jdg"] },
  { name: "Ruth", chapters: 4, aliases: ["Rth", "Ru"] },
  { name: "1 Samuel", chapters: 31, aliases: ["1 Sam", "1 Sm", "1 Sa"] },
  { name: "2 Samuel", chapters: 24, aliases: ["2 Sam", "2 Sm", "2 Sa"] },
  { name: "1 Kings", chapters: 22, aliases: ["1 Kgs", "1 Kg", "1 Ki"] },
  { name: "2 Kings", chapters: 25, aliases: ["2 Kgs", "2 Kg", "2 Ki"] },
  { name: "1 Chronicles", chapters: 29, aliases: ["1 Chron", "1 Chr", "1 Ch"] },
  { name: "2 Chronicles", chapters: 36, aliases: ["2 Chron", "2 Chr", "2 Ch"] },
  { name: "Ezra", chapters: 10, aliases: ["Ezr"] },
  { name: "Nehemiah", chapters: 13, aliases: ["Neh", "Ne"] },
  { name: "Esther", chapters: 10, aliases: ["Esth", "Est"] },
  { name: "Job", chapters: 42, aliases: [] },
  {
    name: "Psalms",
    singular: "Psalm",
    chapters: 150,
    aliases: ["Psalm", "Pslm", "Psa", "Pss", "Ps"],
  },
  { name: "Proverbs", chapters: 31, aliases: ["Prov", "Prv", "Pro", "Pr"] },
  { name: "Ecclesiastes", chapters: 12, aliases: ["Eccles", "Eccl", "Ecc", "Ec"] },
  {
    name: "Song of Solomon",
    chapters: 8,
    aliases: ["Song of Songs", "Canticles", "Songs", "Song", "SoS"],
  },
  { name: "Isaiah", chapters: 66, aliases: ["Isai", "Isa"] },
  { name: "Jeremiah", chapters: 52, aliases: ["Jer", "Jr"] },
  { name: "Lamentations", chapters: 5, aliases: ["Lam", "Lm"] },
  { name: "Ezekiel", chapters: 48, aliases: ["Ezek", "Ezk", "Eze"] },
  { name: "Daniel", chapters: 12, aliases: ["Dan", "Dn"] },
  { name: "Hosea", chapters: 14, aliases: ["Hos", "Ho"] },
  { name: "Joel", chapters: 3, aliases: ["Jl"] },
  { name: "Amos", chapters: 9, aliases: ["Amo"] },
  { name: "Obadiah", chapters: 1, aliases: ["Obad", "Oba", "Ob"] },
  { name: "Jonah", chapters: 4, aliases: ["Jnh", "Jon"] },
  { name: "Micah", chapters: 7, aliases: ["Mic", "Mc"] },
  { name: "Nahum", chapters: 3, aliases: ["Nah", "Na"] },
  { name: "Habakkuk", chapters: 3, aliases: ["Hab"] },
  { name: "Zephaniah", chapters: 3, aliases: ["Zeph", "Zep", "Zp"] },
  { name: "Haggai", chapters: 2, aliases: ["Hag", "Hg"] },
  { name: "Zechariah", chapters: 14, aliases: ["Zech", "Zec", "Zc"] },
  { name: "Malachi", chapters: 4, aliases: ["Mal", "Ml"] },

  // --- New Testament ---------------------------------------------------------
  { name: "Matthew", chapters: 28, aliases: ["Matt", "Mat", "Mt"] },
  { name: "Mark", chapters: 16, aliases: ["Mrk", "Mk"] },
  { name: "Luke", chapters: 24, aliases: ["Luk", "Lk"] },
  { name: "John", chapters: 21, aliases: ["Jhn", "Jn"] },
  { name: "Acts", chapters: 28, aliases: ["Act"] },
  { name: "Romans", chapters: 16, aliases: ["Rom", "Rm", "Ro"] },
  { name: "1 Corinthians", chapters: 16, aliases: ["1 Cor", "1 Co"] },
  { name: "2 Corinthians", chapters: 13, aliases: ["2 Cor", "2 Co"] },
  { name: "Galatians", chapters: 6, aliases: ["Gal", "Ga"] },
  { name: "Ephesians", chapters: 6, aliases: ["Eph", "Ep"] },
  { name: "Philippians", chapters: 4, aliases: ["Phil", "Php", "Pp"] },
  { name: "Colossians", chapters: 4, aliases: ["Col", "Cl"] },
  { name: "1 Thessalonians", chapters: 5, aliases: ["1 Thess", "1 Thes", "1 Th"] },
  { name: "2 Thessalonians", chapters: 3, aliases: ["2 Thess", "2 Thes", "2 Th"] },
  { name: "1 Timothy", chapters: 6, aliases: ["1 Tim", "1 Ti"] },
  { name: "2 Timothy", chapters: 4, aliases: ["2 Tim", "2 Ti"] },
  { name: "Titus", chapters: 3, aliases: ["Tit"] },
  { name: "Philemon", chapters: 1, aliases: ["Philem", "Phlm", "Phm"] },
  { name: "Hebrews", chapters: 13, aliases: ["Heb"] },
  { name: "James", chapters: 5, aliases: ["Jas", "Jm"] },
  { name: "1 Peter", chapters: 5, aliases: ["1 Pet", "1 Pt", "1 Pe"] },
  { name: "2 Peter", chapters: 3, aliases: ["2 Pet", "2 Pt", "2 Pe"] },
  { name: "1 John", chapters: 5, aliases: ["1 Jhn", "1 Jn", "1 Jo"] },
  { name: "2 John", chapters: 1, aliases: ["2 Jhn", "2 Jn", "2 Jo"] },
  { name: "3 John", chapters: 1, aliases: ["3 Jhn", "3 Jn", "3 Jo"] },
  { name: "Jude", chapters: 1, aliases: [] },
  { name: "Revelation", chapters: 22, aliases: ["Revelations", "Rev", "Rv"] },
];

/**
 * The books grouped the way a study Bible groups them (item 8.6) -- what the
 * Graph screen's *Literary categories* column draws.
 *
 * **Each group is a run of the list above, named by its first and last book**,
 * never a second list of books: the order and the membership both come from
 * `BIBLE_BOOKS`, and `bible-books.test.ts` holds that the runs cover every book
 * exactly once, in order. The usual Protestant grouping, as item 8.6's brief
 * gave it; `v3/design/8.6-graph-literary-categories/README.md` is the calls.
 *
 * **History is two groups**, one in each testament, because Acts is history
 * too and a group never straddles the two testaments. `id` is what tells them
 * apart; the name is what the reader sees, and both say *History*.
 */
export type BookCategory = {
  id: string;
  name: string;
  first: string;
  last: string;
};

export const BOOK_CATEGORIES: readonly BookCategory[] = [
  { id: "law", name: "Law", first: "Genesis", last: "Deuteronomy" },
  { id: "history-old", name: "History", first: "Joshua", last: "Esther" },
  { id: "wisdom", name: "Wisdom and Poetry", first: "Job", last: "Song of Solomon" },
  { id: "major-prophets", name: "Major Prophets", first: "Isaiah", last: "Daniel" },
  { id: "minor-prophets", name: "Minor Prophets", first: "Hosea", last: "Malachi" },
  { id: "gospels", name: "Gospels", first: "Matthew", last: "John" },
  { id: "history-new", name: "History", first: "Acts", last: "Acts" },
  { id: "pauline", name: "Pauline Epistles", first: "Romans", last: "Philemon" },
  { id: "general", name: "General Epistles", first: "Hebrews", last: "Jude" },
  { id: "prophecy", name: "Prophecy", first: "Revelation", last: "Revelation" },
];

const CATEGORY_OF_BOOK = new Map<string, BookCategory>();
{
  const position = new Map(BIBLE_BOOKS.map((book, index) => [book.name, index]));
  for (const category of BOOK_CATEGORIES) {
    const from = position.get(category.first) ?? 0;
    const to = position.get(category.last) ?? -1;
    for (let index = from; index <= to; index++) {
      CATEGORY_OF_BOOK.set(BIBLE_BOOKS[index].name, category);
    }
  }
}

/** The group a book belongs to, by its canonical name; undefined for a name this list does not know. */
export function categoryOfBook(name: string): BookCategory | undefined {
  return CATEGORY_OF_BOOK.get(name);
}

/** The longest chapter in the Bible is Psalm 119, at 176 verses. */
export const MAX_VERSE_NUMBER = 176;
