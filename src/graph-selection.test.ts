import { describe, expect, it } from 'vitest';

import type { GraphEntry, GraphVerseRow, VerseRange } from './graph-rules';
import {
	NOTHING_SELECTED,
	clearSelection,
	columnHeading,
	columnOf,
	followRename,
	hidePanel,
	keepSelection,
	opensFor,
	selectEntry,
	selectVerse,
	statusLine,
	type Selection,
} from './graph-selection';

const JOHN_3_16: VerseRange = { book: 'John', chapter: 3, first: 16, last: 16 };
const PSALM_23: VerseRange = { book: 'Psalms', chapter: 23, first: null, last: null };

function entry(id: string, cites: VerseRange[]): GraphEntry {
	return { id, title: id.replace(/\.md$/, ''), entryDate: '2026-01-01T00:00:00.000Z', entryDateOffset: null, cites };
}

function row(range: VerseRange, entryCount = 1): GraphVerseRow {
	return { ...range, entryCount, firstWritten: '2026-01-01T00:00:00.000Z' };
}

const A = entry('A.md', [JOHN_3_16, PSALM_23]);
const B = entry('B.md', [PSALM_23]);

describe('selecting', () => {
	it('selects a verse, and lets go of it on a second click', () => {
		const selected = selectVerse(NOTHING_SELECTED, JOHN_3_16);
		expect(selected).toEqual({ verse: JOHN_3_16, entryId: null, panelShowing: false });
		expect(selectVerse(selected, JOHN_3_16)).toEqual(NOTHING_SELECTED);
	});

	it('goes back to a verse when clicked with a note chosen from its column', () => {
		const chosen = selectEntry(selectVerse(NOTHING_SELECTED, JOHN_3_16), 'A.md');
		expect(selectVerse(chosen, JOHN_3_16)).toEqual({ verse: JOHN_3_16, entryId: null, panelShowing: false });
	});

	it('chooses a note with its panel, and lets go on a second click', () => {
		const chosen = selectEntry(NOTHING_SELECTED, 'A.md');
		expect(chosen).toEqual({ verse: null, entryId: 'A.md', panelShowing: true });
		expect(selectEntry(chosen, 'A.md')).toEqual(NOTHING_SELECTED);
	});

	it('brings a hidden panel back rather than letting go', () => {
		const hidden = hidePanel(selectEntry(NOTHING_SELECTED, 'A.md'));
		expect(hidden.entryId).toBe('A.md');
		expect(selectEntry(hidden, 'A.md')).toEqual({ verse: null, entryId: 'A.md', panelShowing: true });
	});

	it('selecting a verse sets a chosen note aside', () => {
		const chosen = selectEntry(NOTHING_SELECTED, 'A.md');
		expect(selectVerse(chosen, PSALM_23)).toEqual({ verse: PSALM_23, entryId: null, panelShowing: false });
	});
});

describe('clearing', () => {
	const fromVerse: Selection = { verse: JOHN_3_16, entryId: 'A.md', panelShowing: true };

	it('lets go of the note first, back to the verse', () => {
		expect(clearSelection(fromVerse)).toEqual({ verse: JOHN_3_16, entryId: null, panelShowing: false });
		expect(clearSelection(clearSelection(fromVerse))).toEqual(NOTHING_SELECTED);
	});

	it('lets go of everything on Escape or empty canvas', () => {
		expect(clearSelection(fromVerse, true)).toEqual(NOTHING_SELECTED);
	});
});

describe('the notes column', () => {
	it('holds every note, or those citing exactly the selected verse', () => {
		expect(columnOf([A, B], null)).toEqual([A, B]);
		expect(columnOf([A, B], JOHN_3_16)).toEqual([A]);
		expect(columnOf([A, B], { ...PSALM_23, first: 1, last: 1 })).toEqual([]);
	});

	it('is headed by what it holds', () => {
		expect(columnHeading(null)).toBe('Notes, newest first');
		expect(columnHeading(PSALM_23)).toBe('Notes citing Psalm 23');
	});
});

describe('opensFor', () => {
	it('opens the testament, literary category, book and chapter of every verse a note cites', () => {
		expect(opensFor(A)).toEqual([
			'new',
			'category:gospels',
			'John',
			'John|3',
			'old',
			'category:wisdom',
			'Psalms',
			'Psalms|23',
		]);
	});
});

describe('keeping a selection when the vault changes', () => {
	const rows = [row(JOHN_3_16), row(PSALM_23, 2)];

	it('keeps what is still there', () => {
		const selection: Selection = { verse: PSALM_23, entryId: 'B.md', panelShowing: true };
		expect(keepSelection(selection, rows, [A, B])).toBe(selection);
	});

	it('lets go of a verse nobody cites any more', () => {
		expect(keepSelection(selectVerse(NOTHING_SELECTED, JOHN_3_16), [row(PSALM_23)], [B])).toEqual(
			NOTHING_SELECTED,
		);
	});

	it('lets go of a note that no longer cites the verse, keeping the verse', () => {
		const selection: Selection = { verse: JOHN_3_16, entryId: 'A.md', panelShowing: true };
		const edited = entry('A.md', [PSALM_23]);
		expect(keepSelection(selection, rows, [edited, B])).toEqual({
			verse: JOHN_3_16,
			entryId: null,
			panelShowing: false,
		});
	});
});

describe('followRename', () => {
	it('keeps a renamed note chosen, and leaves any other selection alone', () => {
		const chosen: Selection = { verse: PSALM_23, entryId: 'A.md', panelShowing: true };
		expect(followRename(chosen, 'A.md', 'Journal/A.md')).toEqual({ ...chosen, entryId: 'Journal/A.md' });
		expect(followRename(chosen, 'B.md', 'C.md')).toBe(chosen);
	});
});

describe('statusLine', () => {
	it('sums up the graph when nothing is selected', () => {
		expect(statusLine([row(JOHN_3_16), row(PSALM_23)], [A, B], NOTHING_SELECTED)).toEqual({
			bold: '',
			rest: '2 verses referenced across 2 notes',
		});
		expect(statusLine([], [], NOTHING_SELECTED).rest).toBe('No verses cited yet');
	});

	it('names the selected verse and its notes, or the chosen note and its verses', () => {
		expect(statusLine([], [A, B], selectVerse(NOTHING_SELECTED, PSALM_23))).toEqual({
			bold: 'Psalm 23',
			rest: ' · 2 notes',
		});
		expect(statusLine([], [A, B], selectEntry(NOTHING_SELECTED, 'B.md'))).toEqual({
			bold: 'B',
			rest: ' · cites 1 verse',
		});
	});
});
