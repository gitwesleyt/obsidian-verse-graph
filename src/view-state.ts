import type { VerseRange } from './graph-rules';

/**
 * What the graph keeps with its tab, so a graph reopened at launch comes back
 * as it was left: the selected verse, the chosen note, and what is open. The
 * web app keeps only the chosen entry in its address (its item 8.5) and loses
 * the rest (its TD-117); the plugin keeps all three.
 *
 * Read back through `readViewState`, because Obsidian hands back whatever was
 * in the workspace file, which a hand edit or an older version could have left
 * in any shape.
 */
export type ViewState = {
	verse: VerseRange | null;
	/** The chosen note's path. */
	entry: string | null;
	/** Keys of every open testament, category, book and chapter. */
	open: string[];
};

export function readViewState(saved: unknown): Partial<ViewState> {
	if (typeof saved !== 'object' || saved === null) return {};
	const { verse, entry, open } = saved as Record<string, unknown>;
	const state: Partial<ViewState> = {};
	if (verse === null || isVerseRange(verse)) state.verse = verse;
	if (entry === null || typeof entry === 'string') state.entry = entry;
	if (Array.isArray(open) && open.every((key) => typeof key === 'string')) state.open = open;
	return state;
}

function isVerseRange(value: unknown): value is VerseRange {
	if (typeof value !== 'object' || value === null) return false;
	const { book, chapter, first, last } = value as Record<string, unknown>;
	const verse = (n: unknown) => n === null || (typeof n === 'number' && Number.isInteger(n) && n > 0);
	return (
		typeof book === 'string' &&
		typeof chapter === 'number' &&
		Number.isInteger(chapter) &&
		chapter > 0 &&
		verse(first) &&
		verse(last) &&
		(first === null) === (last === null)
	);
}
