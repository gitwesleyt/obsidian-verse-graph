// Copied from Scripture Thread (obsidian-scripture-thread/src/verse-rules.ts) on 2026-09-26.
// Keep in step with the original rather than editing here.

import { BIBLE_BOOKS, MAX_VERSE_NUMBER, type BibleBook } from "./bible-books";

/**
 * Finding Bible references in ordinary writing.
 *
 * The same shape as `auth-rules.ts`, `entry-rules.ts` and `block-rules.ts`: no
 * network, no React, no Supabase, no editor. Give it a string, get back what it
 * found and where. That is what lets the tests ask "does this sentence contain
 * a reference?" directly, instead of typing into a real editor and squinting at
 * the result.
 *
 * `spec/verse-linking.md` says format handling is "refined iteratively, not solved
 * perfectly in v1", and that a wrong detection is something the writer can
 * click away. So this errs towards finding things, and the manual override is
 * the safety net -- rather than the other way round, where a reference the app
 * quietly ignored would leave the writer with no way to say "yes it is".
 *
 * What it understands today:
 *
 *   John 3:16          a single verse
 *   John 3:16-18       a verse range, hyphen or dash
 *   John 3:16-18,21    a list of verses and ranges, comma-separated
 *   Psalm 23           a whole chapter
 *   Matthew 5-7        a chapter range -- every chapter in it
 *   1 Cor 13:4         numbered books, and every abbreviation in bible-books.ts
 *   1Cor 13:4          with or without the space after the number
 *   III John 1         numbered books in Roman numerals, stored as "3 John"
 *   First Samuel 3     and written out as a word, stored as "1 Samuel"
 *   Proverbs 17:7; 30:22   a second chapter of the same book after a semicolon
 *   matthew 5          any of the above in lower case
 *   Jn. 3:16           with or without a full stop after the abbreviation
 *   John 3.16          a full stop in place of the colon
 *   Romans 8 28        or a space, when the second number could be a verse
 *
 * **One thing it deliberately refuses**: anything inside a web address, so a
 * pasted link to a passage does not sprout a chip of its own. The visible text
 * of a link is still read -- see `insideWebAddress`, which is where the line
 * between the two is drawn and why.
 *
 * What it does not, yet: "John 3:16-4:2" (a range crossing chapters), and
 * "Matthew 5-7,9" (a comma list of *chapters* -- a comma after a bare chapter
 * number is far more likely to be ordinary punctuation than one after a
 * "3:16", so this stops at ranges for chapters and allows lists only for
 * verses).
 */

/** One verse, as stored in the `verses` table. */
export type VerseTag = {
  /** Canonical book name, e.g. "1 John". Never an abbreviation. */
  book: string;
  chapter: number;
  /** null means the reference named a whole chapter, e.g. "Psalm 23". */
  verse: number | null;
  /** How it reads on screen, e.g. "John 3:16" or "Psalm 23". */
  reference: string;
};

/** One reference as the writer typed it, and every verse it tags. */
export type VerseMatch = {
  /** Where it starts in the text handed in. */
  start: number;
  /** Where it ends, exclusive. */
  end: number;
  /** The characters matched, exactly as typed. */
  text: string;
  /** The whole reference in canonical form, e.g. "John 3:16-18". */
  reference: string;
  /** Every verse this reference tags. Always at least one. */
  verses: VerseTag[];
  /** `verseKey` for each of `verses`, in the same order. */
  keys: string[];
};

/**
 * How many verses a reference is expanded into.
 *
 * "John 3:16-18" becomes three tags, which is what makes a later note on John
 * 3:17 find this one. But "Psalm 119:1-176" would become 176 tags describing a
 * note that is really about the psalm as a whole, so past this length only the
 * opening verse of that stretch is tagged.
 */
export const MAX_RANGE_VERSES = 20;

/**
 * The same idea for a chapter range: "Matthew 5-7" is three chapter tags, and
 * "Psalm 1-150" is a note about the book rather than about 150 chapters.
 *
 * Its own constant rather than sharing the one above, because the two are
 * counting different things and there is no reason they must stay equal.
 */
export const MAX_RANGE_CHAPTERS = 20;

/**
 * A verse's identity as a single string, for comparing and for the set of tags
 * a writer has switched off.
 *
 * Built from the canonical book name, so "Jn 3:16" and "John 3:16" produce the
 * same key -- which is the whole point of canonicalising first.
 */
export function verseKey(verse: {
  book: string;
  chapter: number;
  verse: number | null;
}): string {
  return `${verse.book}|${verse.chapter}|${verse.verse ?? ""}`;
}

/**
 * How one tag reads on screen.
 *
 * `singular` is why Psalms is not a special case scattered through this file:
 * the book is "Psalms", one of them is "Psalm 23" (see `bible-books.ts`).
 */
function tagReference(
  book: BibleBook,
  chapter: number,
  verse: number | null,
): string {
  const name = book.singular ?? book.name;
  return verse === null ? `${name} ${chapter}` : `${name} ${chapter}:${verse}`;
}

/**
 * How a whole reference reads on screen, which is not the same question.
 *
 * One match can cover many tags -- "Matthew 6:1-3,7" is four of them -- and
 * this is the line the remove-tag panel and the search headings show. Written
 * back in canonical form rather than echoing what was typed, so "matthew
 * 6:1-3,7" and "Mt 6:1-3,7" read the same afterwards.
 */
function matchReference(book: BibleBook, chapter: number, tail: Tail): string {
  const name = book.singular ?? book.name;

  if (tail.kind === "chapter") return `${name} ${chapter}`;
  if (tail.kind === "chapters") return `${name} ${chapter}-${tail.lastChapter}`;

  // Spans of the same chapter join with commas and a new chapter starts after a
  // semicolon, so a reference reads back the way it is written: "John 3:16-18",
  // "Matthew 6:1-3,7" and "Proverbs 17:7; 30:22".
  const runs: { chapter: number; parts: string[] }[] = [];

  for (const span of tail.spans) {
    const part = span.first === span.last ? `${span.first}` : `${span.first}-${span.last}`;
    const open = runs.at(-1);

    if (open && open.chapter === span.chapter) open.parts.push(part);
    else runs.push({ chapter: span.chapter, parts: [part] });
  }

  return `${name} ${runs.map((run) => `${run.chapter}:${run.parts.join(",")}`).join("; ")}`;
}

/**
 * How a book name is compared: case and punctuation thrown away, spaces
 * closed up. So "1 John", "1john", "1 JOHN." and "1Jn" all reduce to something
 * that can be looked up in one map.
 */
function normalizeName(raw: string): string {
  return raw.toLowerCase().replace(/[.\s\u00a0]/g, "");
}

/** Every spelling of every book, pointing at the book it names. */
const BY_NAME = new Map<string, BibleBook>();

/** The same spellings as literal text, which is what the pattern is built from. */
const SPELLINGS: string[] = [];

/**
 * Adds one spelling, unless another book already owns it.
 *
 * The collision is real and there is exactly one of it today: the Roman form
 * of "1 Sa" is "I Sa", and with spaces closed up that is "isa" -- which is
 * Isaiah's abbreviation. Isaiah gets it, because "Isa 3" is a spelling people
 * actually write and "I Sa 3" is not. The cost is that "I Sa 3" is not
 * recognised; "I Sam 3" and "1 Sa 3" both are.
 */
function register(spelling: string, book: BibleBook): void {
  const key = normalizeName(spelling);
  const claimed = BY_NAME.get(key);

  if (claimed && claimed !== book) return;
  if (!claimed) BY_NAME.set(key, book);

  SPELLINGS.push(spelling);
}

/**
 * The other ways a numbered book gets written: "1John" with the space closed
 * up, and the Roman numerals "I John" and "IJohn".
 *
 * Generated rather than listed in `bible-books.ts`, so a book cannot be given
 * one form and not the others. Generating them as spellings of "1 John" --
 * rather than as books of their own -- is also what makes "III John 1" store
 * its tag as 3 John, which is what `spec/data-model.md` says the `verses` table
 * holds: the canonical name, never an abbreviation.
 */
const ROMAN_FOR_DIGIT: Record<string, string> = { "1": "I", "2": "II", "3": "III" };

/**
 * The same idea again for the ordinal written as a word (GitHub issue #38).
 *
 * **Generated as spellings of the digit form, exactly like the Roman numerals,
 * and for the same reason**: that is what makes "First Samuel 3" store its tag
 * as 1 Samuel rather than inventing a book of its own. It also means every
 * abbreviation comes along free -- "First Sam", "First Sm" and "First Sa" are
 * spellings nobody had to list.
 *
 * **No closed-up form.** `numberedVariants` generates "1John" and "IJohn"
 * because people write them; "FirstJohn" is not something anybody writes, and
 * a spelling nobody uses is only a chance to collide with one somebody does.
 */
const WORD_FOR_DIGIT: Record<string, string> = {
  "1": "First",
  "2": "Second",
  "3": "Third",
};

function numberedVariants(alias: string): string[] {
  const found = /^([123])\s+(.+)$/.exec(alias);
  if (!found) return [];

  const [, digit, rest] = found;
  if (digit === undefined || rest === undefined) return [];

  const roman = ROMAN_FOR_DIGIT[digit];
  const word = WORD_FOR_DIGIT[digit];

  return [`${digit}${rest}`, `${roman} ${rest}`, `${roman}${rest}`, `${word} ${rest}`];
}

// Every real spelling first, all of them, so a generated form can never take a
// key that a book genuinely uses.
for (const book of BIBLE_BOOKS) {
  for (const alias of [book.name, ...book.aliases]) register(alias, book);
}

for (const book of BIBLE_BOOKS) {
  for (const alias of [book.name, ...book.aliases]) {
    for (const variant of numberedVariants(alias)) register(variant, book);
  }
}

/**
 * Characters that mean "the same line" -- a newline ends a reference.
 *
 * **Every Unicode space separator, not just the two.** A thin space and a
 * six-per-em space both turned up between a book and its chapter in a real
 * journal, and each of them stopped the reference being found. They are
 * visible characters that a reader would call a space, so they are read as one
 * rather than taken out of the writing the way the invisible ones are
 * (`hidden-characters.ts`). `\s` is not usable here: it includes the newline,
 * and a newline is what ends a reference.
 */
const GAP = "[ \\u00a0\\u2000-\\u200a\\u202f\\u205f\\u3000]";

/** Hyphen, en dash, em dash and the rest: all of them mean "to". */
const DASH = "[-\\u2010-\\u2015]";

/**
 * The book name and its chapter, built from the book list rather than written
 * out.
 *
 * Longest spelling first, because a regular expression takes the first
 * alternative that matches: with "John" ahead of "1 John", the text "1 John
 * 3:16" would match only the "John" part and be filed under the wrong book.
 *
 * `(?!\d)` after the number stops a partial match. Without it, "John 2024"
 * would match chapter 202 and quietly tag something nobody wrote.
 *
 * Everything after the chapter -- the verse, the ranges, the commas -- is read
 * by `parseTail` below rather than by this pattern. A regular expression
 * cannot capture a list of unknown length, and the tail is also where "and
 * then stop, because the rest was not understood" has to be decided.
 */
function bookNames(): string {
  return [...new Set(SPELLINGS)]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, `${GAP}+`))
    .join("|");
}

function buildPattern(): RegExp {
  return new RegExp(`\\b(${bookNames()})\\.?${GAP}{0,2}(\\d{1,3})(?!\\d)`, "gi");
}

const PATTERN = buildPattern();

/**
 * A book name starting exactly here, whatever follows it (TD-98).
 *
 * **What tells "John 3:16, 18" from "Jeremiah 7:1-2, 2 Corinthians 10:4"**: a
 * comma list takes the next number as another verse, and in the second line
 * that number is the start of a book. Taken, the `2` belonged to two matches
 * at once -- Jeremiah 7:2 *and* 2 Corinthians 10:4 -- and the chip drawing
 * split the overlap into three boxes. A number that begins a book name is a
 * new reference, and the scan finds it on its own pass.
 *
 * The name alone is enough, with no chapter asked after it: "John 3:16, 2
 * Corinthians is where..." names a book, not a verse 2.
 */
const BOOK_NAME_HERE = new RegExp(`(?:${bookNames()})(?![a-z])`, "iy");

function startsABookName(text: string, at: number): boolean {
  BOOK_NAME_HERE.lastIndex = at;
  return BOOK_NAME_HERE.test(text);
}

/**
 * One "16" or "16-18" in a verse list.
 *
 * **It carries its own chapter**, which it did not before GitHub issue #40. A
 * semicolon starts a new chapter inside one reference -- "Proverbs 17:7; 30:22"
 * is Proverbs 17:7 *and* Proverbs 30:22 -- so a span can no longer take the
 * chapter from the match it belongs to. Every span in a reference with no
 * semicolon in it simply carries the same one.
 */
type Span = { chapter: number; first: number; last: number };

/** What follows the chapter number. */
type Tail =
  /** Nothing this understands: "Psalm 23". */
  | { kind: "chapter"; end: number }
  /** A chapter range: "Matthew 5-7". */
  | { kind: "chapters"; end: number; lastChapter: number }
  /** A verse, or a list of them: "John 3:16", "Matthew 6:1-3,7". */
  | { kind: "verses"; end: number; spans: Span[] };

// Sticky (`y`) rather than global: each of these asks "is this exactly here?",
// which is what reading left to right through a tail needs. A global pattern
// would happily find a comma four words later.
const COLON = new RegExp(`${GAP}*:${GAP}*`, "y");
const COMMA = new RegExp(`${GAP}*,${GAP}*`, "y");

/**
 * A full stop in place of the colon: "John 3.16".
 *
 * Only with a digit straight after it, so "I sat with Psalm 23. Then..." is
 * still a sentence ending after a whole chapter.
 */
const DOT = /\.(?=\d)/y;

/**
 * A space in place of the colon: "Romans 8 28", which is also how the note
 * names in an Obsidian vault are written ("Romans 8 28.md").
 *
 * The weakest of the three, because a space after a chapter is usually just the
 * next word. See `takeFirstVerse` for what it takes to count.
 */
const SPACE = new RegExp(`${GAP}{1,2}`, "y");
const TO = new RegExp(`${GAP}*${DASH}${GAP}*`, "y");
const NUMBER = new RegExp(`\\d{1,3}(?!\\d)`, "y");

/**
 * A semicolon between two chapters of the same book (GitHub issue #40).
 *
 * **What has to follow it is a chapter *and* a verse, never a bare number.**
 * "Proverbs 17:7; 30:22" is unambiguous; "Proverbs 17:7; 22" is not, because a
 * comma already means "another verse in this chapter" and the two separators
 * would then overlap. So a semicolon with anything else after it -- including
 * "...as in Proverbs 17:7; and that is the point" -- is ordinary punctuation,
 * and the reference ends where it was. That is the same answer the comma rule
 * gives to the same shape.
 */
const SEMICOLON = new RegExp(`${GAP}*;${GAP}*`, "y");

/** Where `matcher` ends if it is at `at`, or null if it is not. */
function take(matcher: RegExp, text: string, at: number): number | null {
  matcher.lastIndex = at;
  return matcher.test(text) ? matcher.lastIndex : null;
}

function takeNumber(
  text: string,
  at: number,
): { value: number; end: number } | null {
  NUMBER.lastIndex = at;
  const found = NUMBER.exec(text);
  return found === null ? null : { value: Number(found[0]), end: NUMBER.lastIndex };
}

function isVerseNumber(value: number): boolean {
  return value >= 1 && value <= MAX_VERSE_NUMBER;
}

/**
 * The verse number after a chapter, if one is there.
 *
 * Returns null when there is no verse -- "John 3: he says" is a whole chapter
 * and the colon is punctuation -- and "nonsense" when the whole match should be
 * thrown away.
 *
 * **A colon or full stop says a verse was meant**, so "John 3:400" and "John
 * 3.0" are not references at all, rather than quietly falling back to "John 3",
 * which is not what was written.
 *
 * **A space says nothing of the kind.** "John 3 400 people" is John 3 and a
 * number, and "Genesis 1 2 Corinthians 5" is two references, so a number that
 * is not a verse, or that begins a book name, leaves the chapter standing. What
 * is left is the stated cost of reading a space as a separator at all: "Luke 2 3
 * times" is Luke 2:3.
 */
function takeFirstVerse(
  text: string,
  at: number,
): { value: number; end: number } | "nonsense" | null {
  const afterSeparator = take(COLON, text, at) ?? take(DOT, text, at);

  if (afterSeparator !== null) {
    const verse = takeNumber(text, afterSeparator);
    if (verse === null) return null;
    return isVerseNumber(verse.value) ? verse : "nonsense";
  }

  const afterSpace = take(SPACE, text, at);
  if (afterSpace === null || startsABookName(text, afterSpace)) return null;

  const verse = takeNumber(text, afterSpace);
  return verse !== null && isVerseNumber(verse.value) ? verse : null;
}

/**
 * Everything after the chapter number, read left to right.
 *
 * Returns null when what it read means the whole match is not a reference at
 * all. Otherwise it reports where the reference ends, which is deliberately
 * *before* anything it did not understand -- the highlight then stops there
 * rather than covering characters no tag was made from.
 */
function parseTail(
  text: string,
  at: number,
  book: BibleBook,
  chapter: number,
): Tail | null {
  const first = takeFirstVerse(text, at);

  if (first === "nonsense") return null;

  if (first !== null) {
    const spans: Span[] = [];

    // The chapter every following span belongs to. It only ever moves at a
    // semicolon, which is the whole of what issue #40 added.
    let on = chapter;
    let cursor = closeSpan(text, first, on, spans);

    // Two separators, read in one loop because either may come next.
    //
    //  - **A comma is another verse in the same chapter** -- "1-3,7" and
    //    "1-3,7-9". A comma followed by anything else ("John 3:16, and then")
    //    is ordinary punctuation and stops the match where it was.
    //  - **A semicolon is another chapter of the same book** -- "17:7; 30:22",
    //    and a chain of them follows from the same loop. See `SEMICOLON` for
    //    why a bare number after one is refused.
    //
    // Neither can swallow a new book name: "Proverbs 17:7; John 3:16" stops
    // here at the "J", and the scan finds "John 3:16" on its own pass, because
    // book names are matched anywhere in the text.
    for (;;) {
      const afterComma = take(COMMA, text, cursor);

      if (afterComma !== null) {
        if (startsABookName(text, afterComma)) break;

        const next = takeNumber(text, afterComma);
        if (next === null || next.value < 1 || next.value > MAX_VERSE_NUMBER) break;

        cursor = closeSpan(text, next, on, spans);
        continue;
      }

      const afterSemicolon = take(SEMICOLON, text, cursor);
      if (afterSemicolon === null) break;

      const nextChapter = takeNumber(text, afterSemicolon);
      if (nextChapter === null || nextChapter.value < 1) break;
      if (nextChapter.value > book.chapters) break;

      const verse = takeFirstVerse(text, nextChapter.end);
      if (verse === null || verse === "nonsense") break;

      on = nextChapter.value;
      cursor = closeSpan(text, verse, on, spans);
    }

    return { kind: "verses", end: cursor, spans };
  }

  // No verse, so a dash here joins chapters rather than verses: "Matthew 5-7".
  const afterTo = take(TO, text, at);
  const lastChapter = afterTo === null ? null : takeNumber(text, afterTo);

  if (
    lastChapter !== null &&
    lastChapter.value > chapter &&
    lastChapter.value <= book.chapters
  ) {
    return { kind: "chapters", end: lastChapter.end, lastChapter: lastChapter.value };
  }

  return { kind: "chapter", end: at };
}

/**
 * Reads the "-18" of "16-18", if it is there and it makes sense, and records
 * the span either way.
 *
 * A range that counts backwards, or runs past the longest chapter there is, is
 * not a range this understands. The opening number is still real, so the
 * reference stands and the match simply ends before the part that was not
 * understood -- which is why this hands back where it got to.
 */
function closeSpan(
  text: string,
  first: { value: number; end: number },
  chapter: number,
  spans: Span[],
): number {
  const afterTo = take(TO, text, first.end);
  const last = afterTo === null ? null : takeNumber(text, afterTo);

  if (last !== null && last.value > first.value && last.value <= MAX_VERSE_NUMBER) {
    spans.push({ chapter, first: first.value, last: last.value });
    return last.end;
  }

  spans.push({ chapter, first: first.value, last: first.value });
  return first.end;
}

/**
 * Where a web address sits in the text, so nothing inside one is read as a
 * reference (GitHub issue #34).
 *
 * **A YouVersion link carries the reference in its path.** Pasting the verse
 * brings "https://bible.com/bible/1588/job.8.20.AMP" along with it, and the
 * "job.8" in there matched Job 8 -- a spurious chip on a web address, a grey
 * verse-group border round the paragraph, and a wrong entry in Linked
 * References, which is the feature the whole app is built around. In the app
 * owner's own journal the address was often the *only* thing tagged, because
 * the real reference above it was carrying the invisible characters
 * `hidden-characters.ts` now takes out.
 *
 * **The address, never the link text.** `[John 3:16](https://...)` still tags
 * John 3:16: the label is what the writer wrote and what a reader sees, and a
 * link's destination never reaches this function anyway -- it is an attribute
 * on the mark, and `blockText` reads text. What is caught here is an address
 * that is *also* the visible words, which is exactly what a pasted link is.
 *
 * `[[Psalm 23]]` is deliberately left alone for the same reason: a wikilink is
 * link text with no destination beside it, so its words are the writer's.
 *
 * `www.` without a scheme is included because it is how people write an address
 * in prose. An address ends at the first space -- there is no way to know where
 * one stops otherwise, and over-reaching by a word costs a reference nobody was
 * making.
 */
const WEB_ADDRESS = /(?:https?:\/\/|www\.)[^\s]+/gi;

/** True when `[start, end)` touches any web address in the text. */
function insideWebAddress(text: string, start: number, end: number): boolean {
  // A cheap way out for the overwhelming majority of blocks, which have no
  // address in them at all -- this runs on every block on every scan.
  if (!text.includes("//") && !text.includes("www.")) return false;

  WEB_ADDRESS.lastIndex = 0;

  for (const found of text.matchAll(WEB_ADDRESS)) {
    const from = found.index ?? 0;
    if (start < from + found[0].length && from < end) return true;
  }

  return false;
}

/**
 * Every reference in a piece of text.
 *
 * The checks that reject a match, and why each one is here:
 *
 *  - an unknown book name: the pattern is built from the book list, so this
 *    can only happen for a spelling that normalises differently. Belt and
 *    braces.
 *  - chapter 0, or past the end of the book: "Jonah 9" is not a reference,
 *    because Jonah has four chapters.
 *  - verse 0, or past 176: no chapter in the Bible is longer than Psalm 119.
 *
 * **What is deliberately NOT checked any more: whether the book name was
 * capitalised.** Until this was reconsidered, a chapter-only reference in
 * lower case was thrown away, so that "he acts 3 times" was not tagged as Acts
 * 3. The app owner's call is that the trade runs the other way round: this is
 * a Bible journal, one click removes a wrong tag, and a reference the app
 * silently ignored gives the writer nothing to click. So "matthew 5" and "i
 * sam 3" are references now, and so is "he acts 3 times". `spec/verse-linking.md`
 * records the reversal.
 */
export function findVerseReferences(text: string): VerseMatch[] {
  if (typeof text !== "string" || text === "") return [];

  const matches: VerseMatch[] = [];

  // A fresh index each call: the pattern is shared, and a global regular
  // expression remembers where it got to.
  PATTERN.lastIndex = 0;

  for (const found of text.matchAll(PATTERN)) {
    const [whole, name, rawChapter] = found;
    if (name === undefined) continue;

    const start = found.index ?? 0;

    const book = BY_NAME.get(normalizeName(name));
    if (!book) continue;

    const chapter = Number(rawChapter);
    if (chapter < 1 || chapter > book.chapters) continue;

    const tail = parseTail(text, start + whole.length, book, chapter);
    if (tail === null) continue;

    if (insideWebAddress(text, start, tail.end)) continue;

    const verses = expand(book, chapter, tail);

    matches.push({
      start,
      end: tail.end,
      text: text.slice(start, tail.end),
      reference: matchReference(book, chapter, tail),
      verses,
      keys: verses.map(verseKey),
    });
  }

  return matches;
}

/** One tag per verse or chapter a reference covers, subject to the two caps. */
function expand(book: BibleBook, chapter: number, tail: Tail): VerseTag[] {
  const tags: VerseTag[] = [];
  const seen = new Set<string>();

  const add = (on: number, verse: number | null): void => {
    const tag: VerseTag = {
      book: book.name,
      chapter: on,
      verse,
      reference: tagReference(book, on, verse),
    };

    // "Matthew 6:1-3,3" names the same verse twice, and that is one tag.
    const key = verseKey(tag);
    if (seen.has(key)) return;

    seen.add(key);
    tags.push(tag);
  };

  if (tail.kind === "chapter") {
    add(chapter, null);
    return tags;
  }

  if (tail.kind === "chapters") {
    if (tail.lastChapter - chapter + 1 > MAX_RANGE_CHAPTERS) {
      add(chapter, null);
      return tags;
    }

    for (let on = chapter; on <= tail.lastChapter; on += 1) add(on, null);
    return tags;
  }

  for (const span of tail.spans) {
    const length = span.last - span.first + 1;

    // Counted against everything already added, so a list cannot get past the
    // cap a single range could not. A stretch too long to expand keeps its
    // opening verse, which is what makes the reference still findable.
    if (length > 1 && tags.length + length > MAX_RANGE_VERSES) {
      add(span.chapter, span.first);
      continue;
    }

    for (let on = span.first; on <= span.last; on += 1) add(span.chapter, on);
  }

  return tags;
}

/**
 * The same answer, remembered.
 *
 * `spec/verse-linking.md` asks that live scanning "only re-check the text that
 * changed". This is how: the editor asks about every block on every pass, and
 * every block whose words have not changed is answered from here without the
 * pattern running at all. Typing a letter re-scans one paragraph, not the
 * entry.
 *
 * The cache is capped and cleared wholesale rather than one entry at a time.
 * Keeping a strict least-recently-used order would cost more bookkeeping than
 * the scan it is saving, and a cleared cache is only ever slower, never wrong.
 */
const CACHE_LIMIT = 500;
const cache = new Map<string, VerseMatch[]>();

export function scanText(text: string): VerseMatch[] {
  const hit = cache.get(text);
  if (hit) return hit;

  const found = findVerseReferences(text);

  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(text, found);

  return found;
}

/**
 * The references in a block that are still tagged, given the ones the writer
 * has switched off.
 *
 * A reference counts as switched off only when every verse it covers has been
 * removed. That matters for ranges: "John 3:16-18" is three tags, and it goes
 * on being highlighted until all three are gone -- which is what one click on
 * it does.
 */
export function activeMatches(
  text: string,
  removed: readonly string[] | null | undefined,
): VerseMatch[] {
  const matches = scanText(text);
  if (!removed || removed.length === 0) return matches;

  const off = new Set(removed);
  return matches.filter((match) => !match.keys.every((key) => off.has(key)));
}

/**
 * The removals a block should still be remembering, given what it now says.
 *
 * **A removal is a decision about a reference, so it lasts exactly as long as
 * the reference does.** Switching "Matthew 5:6" off writes its key onto the
 * block; a key whose verse the block's words no longer name is forgotten. So
 * deleting the reference and typing it again detects it afresh -- and so does
 * deleting *part* of it, which is how somebody actually undoes a removal:
 * backspace the ":6", type it back, and the chip returns (GitHub issue #21).
 *
 * **There is deliberately no "but they might still be typing" guard.** The two
 * cases are the same keystrokes and cannot be told apart: backspacing to
 * "Matthew 5" and retyping ":6" is both the writer half way through an edit and
 * the writer asking for the reference back. Held, the removal is permanent in
 * every shape but one and there is no way to see why; forgotten, the worst case
 * is a chip the writer dismisses a second time -- visible, and one click. This
 * is the opposite call to the one `beingTyped` makes for a custom tag, and the
 * asymmetry is the reason: an unwanted tag is written to the database and to
 * the writer's vocabulary, where an unwanted chip is drawn on a word.
 *
 * `scanText` rather than `activeMatches`, and that is the point: this asks what
 * the words *say*, where `activeMatches` asks what is left after this very list
 * has been applied. Asking the filtered question here would answer itself --
 * a removed reference is always missing from `activeMatches`.
 *
 * Returns null when nothing changes, so a caller with a document to edit can
 * tell "leave it alone" from "write an empty list".
 */
export function keptRemovals(
  text: string,
  removed: readonly string[] | null | undefined,
): string[] | null {
  if (!removed || removed.length === 0) return null;

  const written = new Set(scanText(text).flatMap((match) => match.keys));
  const kept = removed.filter((key) => written.has(key));

  return kept.length === removed.length ? null : kept;
}
