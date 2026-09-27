import { parseBibleLink, type BibleLink } from './bible-link';
import { compareRanges, rangeKey, type GraphEntry, type GraphVerseRow, type VerseRange } from './graph-rules';

/**
 * Turns Obsidian's link index into the two shapes the web app's graph logic
 * expects: `GraphVerseRow[]` for the tree and `GraphEntry[]` for the notes
 * column. Pure, so it is tested with a made-up vault and no Obsidian.
 *
 * It never reads a note's text. Everything comes from `resolvedLinks` and
 * `unresolvedLinks`, which Obsidian keeps in memory and already covers links
 * in properties as well as the body.
 */

/** The parts of `metadataCache` this reads. */
export type LinkIndex = {
	/** Source note path → resolved target path → link count. */
	resolvedLinks: Record<string, Record<string, number>>;
	/** Source note path → link text of a note not created yet → link count. */
	unresolvedLinks: Record<string, Record<string, number>>;
};

/** What a note's date is worked out from, see `noteDate`. */
export type NoteFacts = {
	/** The note's `date` property, whatever type it has. */
	dateProperty: unknown;
	/** When the file was created, in milliseconds. */
	created: number;
};

export type VaultGraph = {
	rows: GraphVerseRow[];
	/** Newest first. */
	entries: GraphEntry[];
};

export function vaultToGraph(index: LinkIndex, factsOf: (path: string) => NoteFacts): VaultGraph {
	const entries: (GraphEntry & { time: number })[] = [];

	for (const path of new Set([...Object.keys(index.resolvedLinks), ...Object.keys(index.unresolvedLinks)])) {
		const targets = [
			...Object.keys(index.resolvedLinks[path] ?? {}),
			...Object.keys(index.unresolvedLinks[path] ?? {}),
		];
		const cites = citedRanges(path, targets);
		if (cites.length === 0) continue;

		const time = noteDate(path, factsOf(path));
		entries.push({
			id: path,
			title: titleOf(path),
			entryDate: new Date(time).toISOString(),
			entryDateOffset: null,
			cites,
			time,
		});
	}

	entries.sort((a, b) => b.time - a.time || byTitle.compare(a.title, b.title));
	const sorted = entries.map(({ time: _time, ...entry }) => entry);
	return { rows: rowsOf(sorted), entries: sorted };
}

/**
 * The tree's rows from the notes: each range any of them cites, with how many
 * notes cite it and when the first of them was written. Filtering builds the
 * rows again from the notes that pass, through here.
 */
export function rowsOf(entries: readonly GraphEntry[]): GraphVerseRow[] {
	const cited = new Map<string, { range: VerseRange; notes: number; firstWritten: string }>();
	for (const entry of entries) {
		for (const range of entry.cites) {
			const key = rangeKey(range);
			const node = cited.get(key);
			if (!node) cited.set(key, { range, notes: 1, firstWritten: entry.entryDate });
			else {
				node.notes++;
				// ISO strings in UTC sort as their times do.
				if (entry.entryDate < node.firstWritten) node.firstWritten = entry.entryDate;
			}
		}
	}
	return [...cited.values()]
		.map(({ range, notes, firstWritten }) => ({ ...range, entryCount: notes, firstWritten }))
		.sort(compareRanges);
}

/** One collator for the sort; `localeCompare` makes one per call, which shows on thousands of notes. */
const byTitle = new Intl.Collator();

/**
 * Every verse range a note cites, once each, in canonical order.
 *
 * **Ranges are keyed by the verses they name, not by the note's path**, so two
 * `John 3 16.md` in different folders, or an unconverted `[[Jn 3 16]]` beside
 * a real `John 3 16.md`, are one node.
 */
function citedRanges(path: string, targets: string[]): VerseRange[] {
	const note = parseBibleLink(path);
	const ranges = new Map<string, VerseRange>();
	for (const target of targets) {
		const read = readTarget(target);
		if (!read || isParentLink(note, read.link)) continue;
		for (const range of read.ranges) ranges.set(rangeKey(range), range);
	}
	return [...ranges.values()].sort(compareRanges);
}

/**
 * A link target's verses, remembered: the same few thousand targets come up on
 * every rebuild. Links are read back from here, never changed, so sharing the
 * ranges is safe.
 */
const targets = new Map<string, { link: BibleLink; ranges: VerseRange[] } | null>();

function readTarget(target: string): { link: BibleLink; ranges: VerseRange[] } | null {
	let read = targets.get(target);
	if (read === undefined) {
		const link = parseBibleLink(linkpathOf(target));
		read = link ? { link, ranges: rangesOf(link) } : null;
		targets.set(target, read);
	}
	return read;
}

/**
 * A link's verses as the graph's ranges: each run of consecutive verses in one
 * chapter is a range (`Matthew 6 1-3,7` is 6:1–3 and 6:7), and each chapter of
 * a chapter link is a whole chapter (`Matthew 5-7` is three).
 */
export function rangesOf(link: BibleLink): VerseRange[] {
	const ranges: VerseRange[] = [];
	for (const key of link.keys) {
		const [book = '', chapterText = '', verseText = ''] = key.split('|');
		const chapter = Number(chapterText);
		const verse = verseText === '' ? null : Number(verseText);
		const last = ranges.at(-1);

		if (verse !== null && last?.book === book && last.chapter === chapter && last.last === verse - 1) {
			last.last = verse;
		} else {
			ranges.push({ book, chapter, first: verse, last: verse });
		}
	}
	return ranges;
}

/**
 * The `[[John 3]]` inside `John 3 16.md` is the parent chain Scripture Thread
 * wrote, not something said about John 3. Same rule as Scripture Thread's
 * `isParentLink` (src/context/find-mentions.ts), so other links written inside
 * a verse note still count.
 */
function isParentLink(note: BibleLink | null, destination: BibleLink): boolean {
	return (
		destination.level === 'chapter' &&
		note?.level === 'verse' &&
		note.chapterKeys.some((key) => destination.keys.includes(key))
	);
}

/** Link text without its alias or heading, as Scripture Thread's `linkpathOf` does. */
function linkpathOf(linktext: string): string {
	const withoutAlias = linktext.split('|')[0] ?? '';
	return (withoutAlias.split('#')[0] ?? '').trim();
}

function titleOf(path: string): string {
	return (path.split('/').pop() ?? path).replace(/\.md$/i, '');
}

const DATE = /(\d{4})-(\d{2})-(\d{2})/;

/**
 * When a note was written, in milliseconds: its `date` property if it has one,
 * else a date in its name (`2026-09-26 Sermon notes`), else when the file was
 * created. Creation dates shift when files are synced or copied, which is why
 * they are the last resort.
 */
export function noteDate(path: string, facts: NoteFacts): number {
	return dateFrom(facts.dateProperty) ?? dateFrom(titleOf(path)) ?? facts.created;
}

/** The first calendar date (`YYYY-MM-DD`) anywhere in a string, at local midnight. */
function dateFrom(value: unknown): number | null {
	if (typeof value !== 'string') return null;
	const match = DATE.exec(value);
	if (!match) return null;

	const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const date = new Date(year, month - 1, day);
	// `new Date` rolls 2026-02-31 over to March; that is not a date anyone wrote.
	const real = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
	return real ? date.getTime() : null;
}
