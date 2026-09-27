import {
	rangeKey,
	rangeLabel,
	testamentOf,
	type GraphEntry,
	type GraphVerseRow,
	type VerseRange,
} from './graph-rules';

/**
 * What is selected on the graph, and what the notes column holds. Pure, and the
 * same rules as the web app's `GraphScreen.tsx`.
 *
 * Two things can be selected, and choosing one sets the other aside: a verse
 * filters the notes column to the notes citing it; a note lights every verse it
 * cites and opens its panel. A note chosen from a verse's column keeps the
 * verse, so letting go of the note goes back to that column.
 */
export type Selection = {
	verse: VerseRange | null;
	/** The chosen note's path. */
	entryId: string | null;
	/** The chosen note's read-only panel is showing. Its × hides it and keeps the note chosen. */
	panelShowing: boolean;
};

export const NOTHING_SELECTED: Selection = { verse: null, entryId: null, panelShowing: false };

/** Both testaments open and every book closed, as the app opens. */
export const OPENING_OPEN: readonly string[] = ['old', 'new'];

/** How many notes the column shows before its "more" button, as the app pages them. */
export const COLUMN_PAGE = 50;

/** A second click on the verse already selected lets go of it. */
export function selectVerse(selection: Selection, range: VerseRange): Selection {
	if (!selection.entryId && selection.verse && rangeKey(selection.verse) === rangeKey(range)) {
		return NOTHING_SELECTED;
	}
	return { verse: range, entryId: null, panelShowing: false };
}

/**
 * The same toggle as a verse. A chosen note whose panel was hidden brings its
 * panel back instead of letting go.
 */
export function selectEntry(selection: Selection, id: string): Selection {
	if (selection.entryId === id && !selection.panelShowing) return { ...selection, panelShowing: true };
	if (selection.entryId === id) return { ...selection, entryId: null, panelShowing: false };
	return { ...selection, entryId: id, panelShowing: true };
}

/**
 * Clear lets go of the note first, back to the verse it was chosen from, then
 * the verse. `everything` is Escape and a click on empty canvas.
 */
export function clearSelection(selection: Selection, everything = false): Selection {
	if (selection.entryId && selection.verse && !everything) {
		return { ...selection, entryId: null, panelShowing: false };
	}
	return NOTHING_SELECTED;
}

export function hidePanel(selection: Selection): Selection {
	return { ...selection, panelShowing: false };
}

/** The notes column: every note, or only those citing exactly the selected verse. */
export function columnOf(entries: readonly GraphEntry[], verse: VerseRange | null): GraphEntry[] {
	if (!verse) return [...entries];
	const key = rangeKey(verse);
	return entries.filter((entry) => entry.cites.some((range) => rangeKey(range) === key));
}

/** What has to be open for a note's verses to be on screen to be lit. */
export function opensFor(entry: GraphEntry): string[] {
	return entry.cites.flatMap((range) => [testamentOf(range.book), range.book, `${range.book}|${range.chapter}`]);
}

/**
 * After the vault changes: a verse nobody cites any more, or a note that is gone
 * from the column, is let go of. What is still there stays selected.
 */
export function keepSelection(
	selection: Selection,
	rows: readonly GraphVerseRow[],
	entries: readonly GraphEntry[],
): Selection {
	const verse = selection.verse;
	if (verse && !rows.some((row) => rangeKey(row) === rangeKey(verse))) return NOTHING_SELECTED;
	if (selection.entryId && !columnOf(entries, verse).some((entry) => entry.id === selection.entryId)) {
		return { ...selection, entryId: null, panelShowing: false };
	}
	return selection;
}

/** A renamed or moved note stays chosen under its new path. */
export function followRename(selection: Selection, oldPath: string, newPath: string): Selection {
	return selection.entryId === oldPath ? { ...selection, entryId: newPath } : selection;
}

export function plural(count: number, one: string, many: string): string {
	return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/** The line above the canvas: what is selected, or the summary. The bold part first. */
export function statusLine(
	rows: readonly GraphVerseRow[],
	entries: readonly GraphEntry[],
	selection: Selection,
): { bold: string; rest: string } {
	const entry = selection.entryId ? entries.find((candidate) => candidate.id === selection.entryId) : undefined;
	if (entry) return { bold: entry.title, rest: ` · cites ${plural(entry.cites.length, 'verse', 'verses')}` };

	if (selection.verse) {
		const count = columnOf(entries, selection.verse).length;
		return { bold: rangeLabel(selection.verse), rest: ` · ${plural(count, 'note', 'notes')}` };
	}

	if (rows.length === 0) return { bold: '', rest: 'No verses cited yet' };
	return {
		bold: '',
		rest: `${plural(rows.length, 'verse', 'verses')} referenced across ${plural(entries.length, 'note', 'notes')}`,
	};
}

export function columnHeading(verse: VerseRange | null): string {
	return verse ? `Notes citing ${rangeLabel(verse)}` : 'Notes, newest first';
}
