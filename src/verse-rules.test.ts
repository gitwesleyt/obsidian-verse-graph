// Copied from Scripture Thread (obsidian-scripture-thread/src/verse-rules.test.ts) on 2026-09-26.
// Keep in step with the original rather than editing here.

import { describe, expect, it } from "vitest";

import { BIBLE_BOOKS } from "./bible-books";
import {
  activeMatches,
  findVerseReferences,
  keptRemovals,
  MAX_RANGE_CHAPTERS,
  MAX_RANGE_VERSES,
  scanText,
  verseKey,
} from "./verse-rules";

/**
 * What these tests are really protecting.
 *
 * The detector has two ways to be wrong, and this file used to say plainly
 * which was worse: missing a reference was annoying, inventing one was worse,
 * because it puts a grey border round paragraphs that have nothing to do with
 * each other.
 *
 * **That is now the other way round, by the app owner's decision.** This is a
 * journal built around Bible verses, so a reference is far more likely to be
 * one than to be a coincidence; and clicking a wrong tag away is one click,
 * while a reference the app silently ignored gives the writer nothing to click
 * at all. So the detector leans towards finding things, and the "does not find"
 * block below has got smaller on purpose -- what is left in it is the things
 * that are not references in any reading, not the things that merely might not
 * be.
 */

/** Just the reference text of each match, which is what most tests care about. */
function referencesIn(text: string): string[] {
  return findVerseReferences(text).map((match) => match.reference);
}

describe("finding references", () => {
  it("finds a plain verse", () => {
    const [match] = findVerseReferences("Reading John 3:16 this morning.");

    expect(match.reference).toBe("John 3:16");
    expect(match.text).toBe("John 3:16");
    expect(match.verses).toEqual([
      { book: "John", chapter: 3, verse: 16, reference: "John 3:16" },
    ]);
  });

  it("reports where in the text it found it", () => {
    const text = "Reading John 3:16 this morning.";
    const [match] = findVerseReferences(text);

    // The editor draws the underline from these two numbers, so they have to
    // land exactly on the reference and not a character either side.
    expect(text.slice(match.start, match.end)).toBe("John 3:16");
  });

  it("finds several in one paragraph", () => {
    expect(referencesIn("John 3:16 and Romans 8:28, then Psalm 23.")).toEqual([
      "John 3:16",
      "Romans 8:28",
      "Psalm 23",
    ]);
  });

  it("understands abbreviations", () => {
    expect(referencesIn("Jn 3:16")).toEqual(["John 3:16"]);
    expect(referencesIn("Jn. 3:16")).toEqual(["John 3:16"]);
    expect(referencesIn("Rom 8:28")).toEqual(["Romans 8:28"]);
    expect(referencesIn("Ps 23:1")).toEqual(["Psalm 23:1"]);
  });

  it("understands numbered books, spaced or not", () => {
    expect(referencesIn("1 John 4:8")).toEqual(["1 John 4:8"]);
    expect(referencesIn("1John 4:8")).toEqual(["1 John 4:8"]);
    expect(referencesIn("1 Cor 13:4")).toEqual(["1 Corinthians 13:4"]);
    expect(referencesIn("2 Tim 1:7")).toEqual(["2 Timothy 1:7"]);
  });

  it("does not mistake a numbered book for the unnumbered one", () => {
    // The pattern tries longer spellings first for exactly this reason: with
    // "John" tried first, this would come back as John 4:8.
    const [match] = findVerseReferences("1 John 4:8");
    expect(match.verses[0].book).toBe("1 John");
  });

  it("understands Roman numerals, and stores the number", () => {
    // The tag is what a later search and the sidebar look up, so "III John"
    // has to arrive in the database as 3 John like every other spelling of it.
    const [match] = findVerseReferences("III John 1");

    expect(match.reference).toBe("3 John 1");
    expect(match.verses[0].book).toBe("3 John");

    expect(referencesIn("II Chronicles 7:14")).toEqual(["2 Chronicles 7:14"]);
    expect(referencesIn("I Cor 13:4")).toEqual(["1 Corinthians 13:4"]);
    expect(referencesIn("IIPeter 1:4")).toEqual(["2 Peter 1:4"]);
  });

  it("only reads a Roman numeral in front of a book that comes in numbers", () => {
    // "I" is an ordinary English word, and most books have no numbered form
    // for it to be part of.
    expect(referencesIn("I read Matthew 5 today")).toEqual(["Matthew 5"]);
    expect(referencesIn("I read Isaiah 40:31")).toEqual(["Isaiah 40:31"]);
  });

  it("leaves Isaiah's abbreviation to Isaiah", () => {
    // The one collision the Roman numerals create: "I Sa" and "Isa" are the
    // same thing once spaces are closed up, and "Isa 3" is the spelling people
    // actually write. The longer forms of 1 Samuel are unaffected.
    expect(referencesIn("Isa 3:10")).toEqual(["Isaiah 3:10"]);
    expect(referencesIn("I Sam 3:10")).toEqual(["1 Samuel 3:10"]);
    expect(referencesIn("1 Sa 3:10")).toEqual(["1 Samuel 3:10"]);
  });

  it("reads a reference in lower case", () => {
    // The rule that used to refuse these is gone -- see the note at the top.
    expect(referencesIn("matthew 5")).toEqual(["Matthew 5"]);
    expect(referencesIn("i sam 3")).toEqual(["1 Samuel 3"]);
    expect(referencesIn("psalm 23")).toEqual(["Psalm 23"]);
    expect(referencesIn("iii john 1")).toEqual(["3 John 1"]);
  });

  it("calls a psalm a psalm", () => {
    // The book is "Psalms"; one of them is "Psalm 23". A Bible journal saying
    // "Psalms 23" would read as a mistake.
    const [match] = findVerseReferences("Psalm 23:1");
    expect(match.reference).toBe("Psalm 23:1");
    expect(match.verses[0].book).toBe("Psalms");
  });
});

describe("whole chapters", () => {
  it("finds a chapter with no verse", () => {
    const [match] = findVerseReferences("Sat with Psalm 23 for a while.");

    expect(match.reference).toBe("Psalm 23");
    expect(match.verses).toEqual([
      { book: "Psalms", chapter: 23, verse: null, reference: "Psalm 23" },
    ]);
  });

  it("keeps a chapter-only reference separate from its first verse", () => {
    // "Psalm 23" and "Psalm 23:1" are different notes about different things,
    // so they must not collapse into the same tag.
    expect(verseKey({ book: "Psalms", chapter: 23, verse: null })).not.toBe(
      verseKey({ book: "Psalms", chapter: 23, verse: 1 }),
    );
  });

  it("trusts a lower-case book name", () => {
    expect(referencesIn("acts 2:38")).toEqual(["Acts 2:38"]);
    expect(referencesIn("reading matthew 5 this morning")).toEqual(["Matthew 5"]);
  });

  /**
   * The cost of the decision at the top of this file, written down as a test
   * rather than left as a surprise.
   *
   * Each of these is a sentence a writer could plausibly type, and each is now
   * tagged, because nothing in the words themselves says whether "acts 3" is a
   * chapter or a verb and a number. One click on the highlight removes it, and
   * the removal is remembered on that block.
   */
  it("also tags book names used as ordinary words, and that is the trade", () => {
    expect(referencesIn("he acts 3 times a week")).toEqual(["Acts 3"]);
    expect(referencesIn("I saw mark 2 of them")).toEqual(["Mark 2"]);
    expect(referencesIn("finished the job 4 days early")).toEqual(["Job 4"]);
  });
});

describe("ranges", () => {
  it("tags every verse in the range", () => {
    const [match] = findVerseReferences("John 3:16-18");

    expect(match.reference).toBe("John 3:16-18");
    expect(match.verses.map((verse) => verse.verse)).toEqual([16, 17, 18]);
  });

  it("accepts a dash as well as a hyphen", () => {
    const [match] = findVerseReferences("John 3:16–18");
    expect(match.verses).toHaveLength(3);
  });

  it("tags only the opening verse of a very long range", () => {
    const [match] = findVerseReferences("Psalm 119:1-176");

    // A note on the whole psalm is not 176 notes.
    expect(match.verses).toHaveLength(1);
    expect(match.verses[0].verse).toBe(1);
  });

  it("expands a range right up to the limit", () => {
    const [match] = findVerseReferences(`Psalm 119:1-${MAX_RANGE_VERSES}`);
    expect(match.verses).toHaveLength(MAX_RANGE_VERSES);
  });

  it("tags every chapter in a chapter range", () => {
    const [match] = findVerseReferences("Matthew 5-7");

    expect(match.reference).toBe("Matthew 5-7");
    expect(match.text).toBe("Matthew 5-7");
    expect(match.verses).toEqual([
      { book: "Matthew", chapter: 5, verse: null, reference: "Matthew 5" },
      { book: "Matthew", chapter: 6, verse: null, reference: "Matthew 6" },
      { book: "Matthew", chapter: 7, verse: null, reference: "Matthew 7" },
    ]);
  });

  it("tags only the opening chapter of a very long chapter range", () => {
    const [match] = findVerseReferences("Psalm 1-150");

    expect(match.verses).toHaveLength(1);
    expect(match.verses[0].chapter).toBe(1);
    // The range was understood, so the whole of it is still highlighted --
    // only the tagging stops short.
    expect(match.text).toBe("Psalm 1-150");
  });

  it("expands a chapter range right up to the limit", () => {
    const [match] = findVerseReferences(`Psalm 1-${MAX_RANGE_CHAPTERS}`);
    expect(match.verses).toHaveLength(MAX_RANGE_CHAPTERS);
  });

  it("ignores a chapter range the book is not long enough for", () => {
    // Jonah has four chapters, so the "-9" is not a range. The chapter itself
    // is still a reference.
    const text = "Jonah 2-9";
    const [match] = findVerseReferences(text);

    expect(match.reference).toBe("Jonah 2");
    expect(text.slice(match.start, match.end)).toBe("Jonah 2");
  });

  it("ignores a range that counts backwards, keeping the opening verse", () => {
    const text = "John 3:16-4";
    const [match] = findVerseReferences(text);

    expect(match.verses).toHaveLength(1);
    expect(match.verses[0].verse).toBe(16);
    // The highlight stops before the part that was not understood, rather than
    // underlining characters the tag does not cover.
    expect(text.slice(match.start, match.end)).toBe("John 3:16");
  });
});

describe("lists of verses", () => {
  it("tags a range and a single verse after it", () => {
    const [match] = findVerseReferences("Matthew 6:1-3,7");

    expect(match.reference).toBe("Matthew 6:1-3,7");
    expect(match.text).toBe("Matthew 6:1-3,7");
    expect(match.verses.map((verse) => verse.verse)).toEqual([1, 2, 3, 7]);
  });

  it("tags two ranges", () => {
    const [match] = findVerseReferences("Matthew 6:1-3,7-9");

    expect(match.reference).toBe("Matthew 6:1-3,7-9");
    expect(match.verses.map((verse) => verse.verse)).toEqual([1, 2, 3, 7, 8, 9]);
  });

  it("accepts a space after the comma, which is how people type it", () => {
    const [match] = findVerseReferences("John 3:16, 18");

    expect(match.verses.map((verse) => verse.verse)).toEqual([16, 18]);
    expect(match.text).toBe("John 3:16, 18");
  });

  it("keeps going for as many as are listed", () => {
    const [match] = findVerseReferences("Psalm 119:1,11,105");
    expect(match.verses.map((verse) => verse.verse)).toEqual([1, 11, 105]);
  });

  it("names the same verse twice as one tag", () => {
    const [match] = findVerseReferences("Matthew 6:1-3,3");
    expect(match.verses.map((verse) => verse.verse)).toEqual([1, 2, 3]);
  });

  it("counts the whole list against the range limit", () => {
    // A stretch that would push the list past the cap keeps its opening verse
    // rather than expanding, exactly as a single over-long range does.
    const [match] = findVerseReferences("Psalm 119:1-15,20-40");

    expect(match.verses.map((verse) => verse.verse)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20,
    ]);
  });

  it("stops before a number that starts a book (TD-98)", () => {
    const text = "Jeremiah 7:1-2, 2 Corinthians 10:4";
    const [jeremiah, corinthians] = findVerseReferences(text);

    expect(jeremiah.text).toBe("Jeremiah 7:1-2");
    expect(jeremiah.verses.map((verse) => verse.verse)).toEqual([1, 2]);
    expect(corinthians.text).toBe("2 Corinthians 10:4");
    expect(jeremiah.end).toBeLessThanOrEqual(corinthians.start);
  });

  it("stops before every numbered book, however it is spelled (TD-98)", () => {
    expect(referencesIn("John 3:16, 1 John 1:9")).toEqual(["John 3:16", "1 John 1:9"]);
    expect(referencesIn("Psalm 23:1, 2 Sam 7:12")).toEqual(["Psalm 23:1", "2 Samuel 7:12"]);
    expect(referencesIn("Romans 8:28,1Cor 13:4")).toEqual(["Romans 8:28", "1 Corinthians 13:4"]);
  });

  it("still takes a number that only looks like the start of one (TD-98)", () => {
    // "1 and" is not a book, so the 1 is another verse of the list.
    const [match] = findVerseReferences("John 3:16, 1 and more");
    expect(match.verses.map((verse) => verse.verse)).toEqual([16, 1]);
  });

  it("stops at a comma that is ordinary punctuation", () => {
    const text = "John 3:16, and then we prayed";
    const [match] = findVerseReferences(text);

    expect(match.verses).toHaveLength(1);
    expect(text.slice(match.start, match.end)).toBe("John 3:16");
  });
});

describe("what it does not find", () => {
  it("ignores a book name with no numbers after it", () => {
    expect(referencesIn("Reading John today.")).toEqual([]);
    expect(referencesIn("Genesis is a good place to start.")).toEqual([]);
  });

  it("ignores a chapter the book does not have", () => {
    // Jonah has four chapters.
    expect(referencesIn("Jonah 9:1")).toEqual([]);
    expect(referencesIn("Jude 5:2")).toEqual([]);
  });

  it("ignores a verse number no chapter is long enough for", () => {
    expect(referencesIn("John 3:400")).toEqual([]);
  });

  it("ignores a number that is only part of a longer one", () => {
    // Without the guard this reads as chapter 202.
    expect(referencesIn("John 2024")).toEqual([]);
    expect(referencesIn("Psalm 1234")).toEqual([]);
  });

  it("ignores a book name buried inside a longer word", () => {
    expect(referencesIn("Johnson 3:16 Street")).toEqual([]);
    expect(referencesIn("Marker 3:16")).toEqual([]);
  });

  it("does not read across a line break", () => {
    // Two bullet points, not one reference. `blockText` is what puts the
    // newline there, for exactly this case.
    expect(referencesIn("read John\n3:16 today")).toEqual([]);
  });

  it("leaves ordinary sentences alone", () => {
    const diary =
      "Woke at 6:30, walked 2 miles, and spent 45 minutes on the 3:15 train.";
    expect(referencesIn(diary)).toEqual([]);
  });
});

describe("switching a tag off", () => {
  const text = "John 3:16 and Romans 8:28.";

  it("keeps the references the writer has not removed", () => {
    const romans = verseKey({ book: "Romans", chapter: 8, verse: 28 });
    const left = activeMatches(text, [romans]);

    expect(left.map((match) => match.reference)).toEqual(["John 3:16"]);
  });

  it("keeps a range until every verse in it is removed", () => {
    const range = "John 3:16-18";
    const [match] = findVerseReferences(range);

    // Removing one verse of a range is not something the app offers -- one
    // click removes the whole reference -- so a partly removed range means
    // something else changed, and the safe reading is that it still counts.
    expect(activeMatches(range, match.keys.slice(0, 2))).toHaveLength(1);
    expect(activeMatches(range, match.keys)).toHaveLength(0);
  });

  it("treats no removals as nothing removed", () => {
    expect(activeMatches(text, null)).toHaveLength(2);
    expect(activeMatches(text, [])).toHaveLength(2);
  });
});

describe("scanning the same words twice", () => {
  it("gives the same answer, and the same one", () => {
    // The cache is what makes live scanning affordable (`spec/verse-linking.md`:
    // only re-check the text that changed). Identity, not just equality --
    // if this ever returns a fresh array the cache has stopped working.
    const text = "Hebrews 11:1 is the verse.";
    expect(scanText(text)).toBe(scanText(text));
  });
});

describe("the book list itself", () => {
  it("has all 66 books", () => {
    expect(BIBLE_BOOKS).toHaveLength(66);
  });

  it("gives every book a spelling nothing else uses", () => {
    // An abbreviation claimed by two books would silently file references
    // under whichever happened to be listed first.
    const seen = new Map<string, string>();

    for (const book of BIBLE_BOOKS) {
      for (const alias of [book.name, ...book.aliases]) {
        const normal = alias.toLowerCase().replace(/[.\s]/g, "");
        expect(seen.get(normal) ?? book.name).toBe(book.name);
        seen.set(normal, book.name);
      }
    }
  });

  it("finds a reference in every book", () => {
    // A typo in one book's name or chapter count would otherwise sit unnoticed
    // until the day somebody wrote about that book.
    for (const book of BIBLE_BOOKS) {
      const found = findVerseReferences(`${book.name} 1:1`);
      expect(found[0]?.verses[0]?.book, book.name).toBe(book.name);
    }
  });

  it("finds every numbered book by its Roman numeral too", () => {
    // The Roman forms are generated from the book list rather than listed, so
    // this is what proves the generation covers all of them and files each
    // under the right book.
    const roman: Record<string, string> = { "1": "I", "2": "II", "3": "III" };

    for (const book of BIBLE_BOOKS) {
      const numbered = /^([123]) (.+)$/.exec(book.name);
      if (!numbered) continue;

      const [, digit, rest] = numbered;
      const found = findVerseReferences(`${roman[digit]} ${rest} 1:1`);

      expect(found[0]?.verses[0]?.book, book.name).toBe(book.name);
    }
  });

  it("rejects the chapter after the last one, in every book", () => {
    for (const book of BIBLE_BOOKS) {
      const found = findVerseReferences(`${book.name} ${book.chapters + 1}:1`);
      expect(found, book.name).toEqual([]);
    }
  });
});

describe("a numbered book written out as a word (GitHub issue #38)", () => {
  it("reads the three ordinals and stores the canonical name", () => {
    const [samuel] = findVerseReferences("Read First Samuel 3 this morning.");
    expect(samuel.reference).toBe("1 Samuel 3");
    expect(samuel.verses[0].book).toBe("1 Samuel");

    const [corinthians] = findVerseReferences("Second Corinthians 2 next.");
    expect(corinthians.reference).toBe("2 Corinthians 2");
    expect(corinthians.verses[0].book).toBe("2 Corinthians");

    const [john] = findVerseReferences("Third John 1 is short.");
    expect(john.reference).toBe("3 John 1");
    expect(john.verses[0].book).toBe("3 John");
  });

  it("files a word form and a digit form under the same verse", () => {
    const [word] = findVerseReferences("First Peter 5:7");
    const [digit] = findVerseReferences("1 Peter 5:7");

    // The whole reason the word forms are generated as spellings of the digit
    // form rather than registered as books of their own.
    expect(word.keys).toEqual(digit.keys);
  });

  it("brings every abbreviation along with it", () => {
    expect(referencesIn("First Sam 3")).toEqual(["1 Samuel 3"]);
    expect(referencesIn("Second Cor 13:4")).toEqual(["2 Corinthians 13:4"]);
    expect(referencesIn("first john 4:8")).toEqual(["1 John 4:8"]);
  });

  it("has a word form for all seventeen numbered books", () => {
    const numbered = BIBLE_BOOKS.filter((book) => /^[123] /.test(book.name));
    expect(numbered).toHaveLength(17);

    for (const book of numbered) {
      const words: Record<string, string> = { "1": "First", "2": "Second", "3": "Third" };
      const word = words[book.name.charAt(0)];
      const written = `${word} ${book.name.slice(2)} 1`;

      // Not an assertion about the spelling but about the *book*: a collision
      // with another book's abbreviation would be swallowed silently by
      // `register`, and this is what would notice.
      expect(findVerseReferences(written)[0]?.verses[0].book).toBe(book.name);
    }
  });

  it("does not invent a closed-up form nobody writes", () => {
    expect(referencesIn("FirstJohn 1")).toEqual([]);
  });
});

describe("a semicolon between two chapters (GitHub issue #40)", () => {
  it("reads both halves as one reference", () => {
    const [match] = findVerseReferences("Proverbs 17:7; 30:22");

    expect(match.reference).toBe("Proverbs 17:7; 30:22");
    expect(match.text).toBe("Proverbs 17:7; 30:22");
    expect(match.verses.map((verse) => verse.reference)).toEqual([
      "Proverbs 17:7",
      "Proverbs 30:22",
    ]);
  });

  it("follows a chain of them", () => {
    const [match] = findVerseReferences("Proverbs 17:7; 30:22; 31:10");

    expect(match.reference).toBe("Proverbs 17:7; 30:22; 31:10");
    expect(match.verses).toHaveLength(3);
  });

  it("keeps commas meaning the same chapter", () => {
    const [match] = findVerseReferences("Matthew 6:1-3,7; 7:12");

    expect(match.reference).toBe("Matthew 6:1-3,7; 7:12");
    expect(match.verses.map((verse) => verse.reference)).toEqual([
      "Matthew 6:1",
      "Matthew 6:2",
      "Matthew 6:3",
      "Matthew 6:7",
      "Matthew 7:12",
    ]);
  });

  it("leaves a new book name to its own match", () => {
    const matches = findVerseReferences("Proverbs 17:7; John 3:16");

    expect(matches.map((match) => match.reference)).toEqual([
      "Proverbs 17:7",
      "John 3:16",
    ]);
    // And the first match stops before the semicolon rather than swallowing it.
    expect(matches[0].text).toBe("Proverbs 17:7");
  });

  it("treats a semicolon used as punctuation as punctuation", () => {
    const [match] = findVerseReferences(
      "...as in Proverbs 17:7; and that is the point.",
    );

    expect(match.reference).toBe("Proverbs 17:7");
    expect(match.text).toBe("Proverbs 17:7");
  });

  it("refuses a bare number after a semicolon", () => {
    // Ambiguous -- a comma already means "another verse in this chapter" -- so
    // the reference ends where it was understood.
    const [match] = findVerseReferences("Proverbs 17:7; 22");

    expect(match.reference).toBe("Proverbs 17:7");
    expect(match.text).toBe("Proverbs 17:7");
  });

  it("stops at a chapter the book does not have", () => {
    const [match] = findVerseReferences("Jonah 1:1; 9:2");

    expect(match.reference).toBe("Jonah 1:1");
  });

  it("is not a way past the verse cap", () => {
    const [match] = findVerseReferences("Psalm 119:1-100; 120:1-100");

    expect(match.verses.length).toBeLessThanOrEqual(MAX_RANGE_VERSES);
  });
});

describe("a full stop in place of the colon", () => {
  it("reads it as the colon", () => {
    expect(referencesIn("John 3.16")).toEqual(["John 3:16"]);
    expect(referencesIn("Jn 3.16-18")).toEqual(["John 3:16-18"]);
    expect(referencesIn("Proverbs 17.7; 30.22")).toEqual(["Proverbs 17:7; 30:22"]);
  });

  it("leaves a full stop that ends a sentence alone", () => {
    expect(referencesIn("Sat with Psalm 23. Then prayed.")).toEqual(["Psalm 23"]);
    expect(referencesIn("Read John 3. 16 people came.")).toEqual(["John 3"]);
  });

  it("refuses a verse no chapter is long enough for, as the colon does", () => {
    expect(referencesIn("John 3.400")).toEqual([]);
  });
});

describe("a space in place of the colon", () => {
  it("reads a second number as the verse", () => {
    expect(referencesIn("Romans 8 28 is my verse")).toEqual(["Romans 8:28"]);
    expect(referencesIn("Romans 8 28-30")).toEqual(["Romans 8:28-30"]);
    expect(referencesIn("Matthew 6 1-3,7")).toEqual(["Matthew 6:1-3,7"]);
    expect(referencesIn("Proverbs 17 7; 30 22")).toEqual(["Proverbs 17:7; 30:22"]);
  });

  it("reads a vault note name as the verse it names", () => {
    expect(referencesIn("Psalms 23 1")).toEqual(["Psalm 23:1"]);
  });

  it("leaves the chapter standing when the number is not a verse", () => {
    expect(referencesIn("John 3 400 people")).toEqual(["John 3"]);
    expect(referencesIn("John 3 0")).toEqual(["John 3"]);
  });

  it("leaves a numbered book to its own match", () => {
    expect(referencesIn("Genesis 1 2 Corinthians 5")).toEqual([
      "Genesis 1",
      "2 Corinthians 5",
    ]);
  });

  it("still joins chapters with a dash", () => {
    expect(referencesIn("Matthew 5 - 7")).toEqual(["Matthew 5-7"]);
  });

  it("does not read across a line break", () => {
    expect(referencesIn("Luke 2\n3 times")).toEqual(["Luke 2"]);
  });

  /** The cost of reading a space as a separator, written down rather than discovered. */
  it("also tags a chapter followed by an ordinary number, and that is the trade", () => {
    expect(referencesIn("Luke 2 3 times")).toEqual(["Luke 2:3"]);
  });
});

describe("a reference inside a web address (GitHub issue #34)", () => {
  it("does not tag one in a pasted link", () => {
    expect(referencesIn("https://bible.com/bible/1588/job.8.20.AMP")).toEqual([]);
    expect(
      referencesIn("https://www.biblegateway.com/passage/?search=John+3:16"),
    ).toEqual([]);
    expect(referencesIn("See www.example.com/psalm.23 for more")).toEqual([]);
  });

  it("still reads the words around the address", () => {
    const text =
      "Job 8:20 AMP\nhttps://bible.com/bible/1588/job.8.20.AMP\nWorth sitting with.";

    // The reference on its own line is found; the one in the address is not.
    expect(referencesIn(text)).toEqual(["Job 8:20"]);
  });

  it("still reads the visible text of a link", () => {
    // A Markdown link's destination is a mark attribute and never reaches this
    // function -- what arrives is the label, and the label is the writer's own
    // words. `[John 3:16](https://example.com)` gets here as "John 3:16".
    expect(referencesIn("John 3:16")).toEqual(["John 3:16"]);

    // And a wikilink, which is link text with no destination beside it.
    expect(referencesIn("As in [[Psalm 23]], he leads.")).toEqual(["Psalm 23"]);
  });
});

describe("forgetting a removal the writing no longer supports (GitHub issue #21)", () => {
  const MATTHEW = "Matthew|5|6";

  it("keeps a removal while its reference is still written", () => {
    // Null is "leave the block alone", which is what the writer clicking a
    // chip and then carrying on typing has to mean.
    expect(keptRemovals("Matthew 5:6 is about hunger.", [MATTHEW])).toBeNull();
  });

  it("forgets it once the reference is gone from the words", () => {
    // The bug: without this the block goes on filtering Matthew 5:6 out for
    // ever, so typing it again links nothing and there is no way back.
    expect(keptRemovals("is about hunger.", [MATTHEW])).toEqual([]);
    expect(keptRemovals("", [MATTHEW])).toEqual([]);
  });

  it("forgets it when only part of the reference is deleted", () => {
    // How somebody actually takes a removal back: backspace the ":6" and type
    // it again. "Matthew 5" is a perfectly good reference of its own, and it is
    // not the one that was switched off.
    expect(keptRemovals("Matthew 5", [MATTHEW])).toEqual([]);
    expect(keptRemovals("Matthew 5:", [MATTHEW])).toEqual([]);
  });

  it("forgets it when the reference is edited into a different one", () => {
    expect(keptRemovals("Matthew 5:7", [MATTHEW])).toEqual([]);
  });

  it("forgets verse by verse when a range is edited down", () => {
    const range = findVerseReferences("John 3:16-18")[0];

    // "John 3:16-18" narrowed to "John 3:16-17". The two verses still written
    // stay switched off, so the chip does not come back; 3:18 is no longer
    // anything this block says.
    expect(keptRemovals("John 3:16-17", range.keys)).toEqual([
      "John|3|16",
      "John|3|17",
    ]);
  });

  it("has nothing to say about a block with no removals on it", () => {
    expect(keptRemovals("Matthew 5:6", null)).toBeNull();
    expect(keptRemovals("Matthew 5:6", [])).toBeNull();
  });
});
