import { describe, expect, it } from 'vitest';

import { parseBibleLink } from './bible-link';
import { rangeLabel, type GraphVerseRow } from './graph-rules';
import { noteDate, rangesOf, vaultToGraph, type LinkIndex, type NoteFacts } from './vault-graph';

const JAN_1 = new Date(2026, 0, 1).getTime();

/** A made-up vault: each note's links, with `?` marking a note not created yet. */
function vault(notes: Record<string, string[]>): LinkIndex {
	const index: LinkIndex = { resolvedLinks: {}, unresolvedLinks: {} };
	for (const [path, links] of Object.entries(notes)) {
		index.resolvedLinks[path] = {};
		index.unresolvedLinks[path] = {};
		for (const link of links) {
			if (link.startsWith('?')) index.unresolvedLinks[path][link.slice(1)] = 1;
			else index.resolvedLinks[path][link] = 1;
		}
	}
	return index;
}

function graph(notes: Record<string, string[]>, facts: Record<string, Partial<NoteFacts>> = {}) {
	return vaultToGraph(vault(notes), (path) => ({ dateProperty: undefined, created: JAN_1, ...facts[path] }));
}

/** Rows as "label ×count", which reads better in a failure than the objects. */
function counted(rows: GraphVerseRow[]): string[] {
	return rows.map((row) => `${rangeLabel(row)} ×${row.entryCount}`);
}

describe('which links are verses', () => {
	it('reads a verse, a range and a whole chapter', () => {
		const { rows } = graph({
			'Journal/Monday.md': ['Bible/Psalms 23 1.md', 'Bible/John 3 16-18.md', 'Bible/Psalms 23.md'],
		});
		expect(counted(rows)).toEqual(['Psalm 23 ×1', 'Psalm 23:1 ×1', 'John 3:16–18 ×1']);
	});

	it('reads a chapter range as every chapter in it', () => {
		const { rows } = graph({ 'Sermon.md': ['Bible/Matthew 5-7.md'] });
		expect(counted(rows)).toEqual(['Matthew 5 ×1', 'Matthew 6 ×1', 'Matthew 7 ×1']);
	});

	it('ignores links to books, testaments and other notes', () => {
		const { rows, entries } = graph({
			'Monday.md': ['Bible/Psalms.md', 'Bible/Old Testament.md', 'Recipes.md', '?Notes on John 3'],
		});
		expect(rows).toEqual([]);
		expect(entries).toEqual([]);
	});

	it('counts links to notes not created yet, alias and heading stripped', () => {
		const { rows } = graph({ 'Monday.md': ['?Romans 8 28', '?Romans 12 1|living sacrifice', '?John 1 1#Notes'] });
		expect(counted(rows)).toEqual(['John 1:1 ×1', 'Romans 8:28 ×1', 'Romans 12:1 ×1']);
	});
});

describe('the parent chain', () => {
	it('leaves out a verse note linking to its own chapter, and chapter and book notes linking up', () => {
		const { rows, entries } = graph({
			'Bible/John 3 16.md': ['Bible/John 3.md'],
			'Bible/John 3 16-18.md': ['Bible/John 3.md'],
			'Bible/John 3.md': ['Bible/John.md'],
			'Bible/John.md': ['Bible/New Testament.md'],
		});
		expect(rows).toEqual([]);
		expect(entries).toEqual([]);
	});

	it('keeps commentary written inside a verse note', () => {
		const { rows, entries } = graph({ 'Bible/John 3 16.md': ['Bible/John 3.md', 'Bible/Romans 8 28.md'] });
		expect(counted(rows)).toEqual(['Romans 8:28 ×1']);
		expect(entries.map((entry) => entry.title)).toEqual(['John 3 16']);
	});

	it('keeps a verse note linking to a different chapter', () => {
		const { rows } = graph({ 'Bible/John 3 16.md': ['Bible/John 3.md', 'Bible/John 4.md'] });
		expect(counted(rows)).toEqual(['John 4 ×1']);
	});
});

describe('one node per passage', () => {
	it('merges duplicate verse notes in different folders', () => {
		const { rows } = graph({
			'Monday.md': ['Old/John 3 16.md'],
			'Tuesday.md': ['Bible/John 3 16.md'],
		});
		expect(counted(rows)).toEqual(['John 3:16 ×2']);
	});

	it('merges an unconverted abbreviation with the real note', () => {
		const { rows } = graph({
			'Monday.md': ['?Jn 3 16'],
			'Tuesday.md': ['Bible/John 3 16.md'],
		});
		expect(counted(rows)).toEqual(['John 3:16 ×2']);
	});

	it('counts a note once however many ways it links the same verse', () => {
		const { rows, entries } = graph({ 'Monday.md': ['?Jn 3 16', 'Bible/John 3 16.md'] });
		expect(counted(rows)).toEqual(['John 3:16 ×1']);
		expect(entries[0]?.cites).toHaveLength(1);
	});

	it('keeps a verse and a range starting there as two nodes', () => {
		const { rows } = graph({ 'Monday.md': ['Bible/Proverbs 3 5.md', 'Bible/Proverbs 3 5-6.md'] });
		expect(counted(rows)).toEqual(['Proverbs 3:5 ×1', 'Proverbs 3:5–6 ×1']);
	});
});

describe('entries and counts', () => {
	it('counts the notes citing exactly each passage', () => {
		const { rows } = graph({
			'A.md': ['Bible/Psalms 23 1.md', 'Bible/Psalms 23 4.md'],
			'B.md': ['Bible/Psalms 23 1.md'],
			'C.md': ['Bible/Psalms 23.md'],
		});
		expect(counted(rows)).toEqual(['Psalm 23 ×1', 'Psalm 23:1 ×2', 'Psalm 23:4 ×1']);
	});

	it('lists each citing note with its title and everything it cites, in canonical order', () => {
		const { entries } = graph({ 'Journal/Monday.md': ['Bible/John 3 16.md', 'Bible/Genesis 1 1.md', 'Recipes.md'] });
		expect(entries).toEqual([
			{
				id: 'Journal/Monday.md',
				title: 'Monday',
				entryDate: new Date(JAN_1).toISOString(),
				entryDateOffset: null,
				cites: [
					{ book: 'Genesis', chapter: 1, first: 1, last: 1 },
					{ book: 'John', chapter: 3, first: 16, last: 16 },
				],
			},
		]);
	});

	it('sorts entries newest first, then by title', () => {
		const { entries } = graph(
			{
				'Old.md': ['?John 3 16'],
				'B same day.md': ['?John 3 16'],
				'A same day.md': ['?John 3 16'],
				'2026-09-26 Sermon.md': ['?John 3 16'],
			},
			{ 'Old.md': { created: JAN_1 - 1000 } },
		);
		expect(entries.map((entry) => entry.title)).toEqual(['2026-09-26 Sermon', 'A same day', 'B same day', 'Old']);
	});

	it('gives each row the earliest date among its notes', () => {
		const { rows } = graph(
			{ 'A.md': ['?John 3 16'], 'B.md': ['?John 3 16'] },
			{ 'A.md': { dateProperty: '2026-03-01' }, 'B.md': { dateProperty: '2026-02-01' } },
		);
		expect(rows[0]?.firstWritten).toBe(new Date(2026, 1, 1).toISOString());
	});
});

describe('rangesOf', () => {
	it('splits a verse list into runs of consecutive verses', () => {
		const link = parseBibleLink('Matthew 6 1-3,7');
		expect(link && rangesOf(link)).toEqual([
			{ book: 'Matthew', chapter: 6, first: 1, last: 3 },
			{ book: 'Matthew', chapter: 6, first: 7, last: 7 },
		]);
	});
});

describe('noteDate', () => {
	const created = JAN_1;

	it('prefers the date property', () => {
		expect(noteDate('2026-05-05 Notes.md', { dateProperty: '2026-09-26', created })).toBe(
			new Date(2026, 8, 26).getTime(),
		);
	});

	it('reads a date and time property by its date', () => {
		expect(noteDate('Notes.md', { dateProperty: '2026-09-26T14:30', created })).toBe(
			new Date(2026, 8, 26).getTime(),
		);
	});

	it('falls back to a date in the file name, then to when the file was created', () => {
		expect(noteDate('Journal/2026-09-26 Sermon.md', { dateProperty: undefined, created })).toBe(
			new Date(2026, 8, 26).getTime(),
		);
		expect(noteDate('Journal/Sermon.md', { dateProperty: undefined, created })).toBe(created);
	});

	it('ignores a property that is not a real date', () => {
		expect(noteDate('Notes.md', { dateProperty: 'someday', created })).toBe(created);
		expect(noteDate('Notes.md', { dateProperty: '2026-02-31', created })).toBe(created);
		expect(noteDate('Notes.md', { dateProperty: 20260926, created })).toBe(created);
	});
});
