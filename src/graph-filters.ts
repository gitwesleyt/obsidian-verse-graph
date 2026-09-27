import type { EntryFacet } from './entry-filter-rules';
import {
	citationFacets,
	hasDates,
	isFiltered,
	type GraphCitation,
	type GraphDates,
	type GraphFilters,
	type GraphReference,
} from './graph-filter-rules';
import { bookPath, type GraphEntry, type VerseRange } from './graph-rules';
import { rowsOf, type VaultGraph } from './vault-graph';

/**
 * The web app's graph filters (its item 8.4) applied to the vault's graph.
 * Pure. The app does this half in SQL (`graph_citations`, migration 0038);
 * here it is the same rules over the notes already in memory:
 *
 * - **A note passes** when it was written in a chosen year, month and day of
 *   the week (each only if any are chosen), and carries any one chosen tag.
 * - **A range is in scope** when it is in a ticked book or the one reference,
 *   a union; with neither, everything is.
 * - **The graph is the notes that pass, citing only what is in scope**, so a
 *   note citing Psalms and Romans shows under Books: Psalms with only its
 *   Psalms line, and a note citing nothing in scope is not in the column.
 *
 * Tags are Obsidian's tags, read by the caller from its in-memory cache, never
 * from note text.
 */

/** A note's tags, without `#`, as Obsidian has them. */
export type TagsOf = (path: string) => readonly string[];

/** One spelling of a tag: `#Grief` and `grief` are the same tag, as Obsidian treats them. */
export function tagKey(tag: string): string {
	return tag.replace(/^#/, '').toLowerCase();
}

export function filterGraph(graph: VaultGraph, filters: GraphFilters, tagsOf: TagsOf): VaultGraph {
	if (!isFiltered(filters)) return graph;
	const entries = scoped(passing(graph.entries, filters, tagsOf), filters);
	return { rows: rowsOf(entries), entries };
}

/**
 * The citations the Books picker and the reference suggestions count, under
 * every filter but the scope, so a book's number is what ticking it would add.
 */
export function unscopedCitations(graph: VaultGraph, filters: GraphFilters, tagsOf: TagsOf): GraphCitation[] {
	return citationsOf(passing(graph.entries, filters, tagsOf));
}

/**
 * What the date chips offer, read without the dates themselves, so a chosen
 * year never hides the other years there are to choose.
 */
export function dateFacets(graph: VaultGraph, filters: GraphFilters, tagsOf: TagsOf): EntryFacet[] {
	const others = { ...filters, dates: { years: [], months: [], weekdays: [] } };
	return citationFacets(citationsOf(scoped(passing(graph.entries, others, tagsOf), others)));
}

/** Every tag on a note the other filters leave, by how many of those notes carry it, most first. */
export function tagCounts(
	graph: VaultGraph,
	filters: GraphFilters,
	tagsOf: TagsOf,
): { name: string; count: number }[] {
	const others = { ...filters, tagNames: [] };
	const counts = new Map<string, { name: string; count: number }>();
	for (const entry of scoped(passing(graph.entries, others, tagsOf), others)) {
		for (const tag of new Set(tagsOf(entry.id).map(tagKey))) {
			const seen = counts.get(tag) ?? { name: tag, count: 0 };
			seen.count++;
			counts.set(tag, seen);
		}
	}
	return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Which date chips would still find a note, Home's `reachableFilters` rule: a
 * value is reachable when some note has it and the choices in the other two
 * groups. Unreachable chips are greyed, never hidden.
 */
export function reachableDates(
	facets: readonly EntryFacet[],
	dates: GraphDates,
): { years: Set<number>; months: Set<number>; weekdays: Set<number> } {
	const allows = (chosen: readonly number[], value: number) => chosen.length === 0 || chosen.includes(value);
	const reachable = { years: new Set<number>(), months: new Set<number>(), weekdays: new Set<number>() };
	for (const facet of facets) {
		const year = allows(dates.years, facet.year);
		const month = allows(dates.months, facet.month);
		const weekday = allows(dates.weekdays, facet.weekday);
		if (month && weekday) reachable.years.add(facet.year);
		if (year && weekday) reachable.months.add(facet.month);
		if (year && month) reachable.weekdays.add(facet.weekday);
	}
	return reachable;
}

/** What has to be open for a reference to be on screen: down to its chapters, or its verses. */
export function opensForReference(reference: GraphReference): string[] {
	const path = bookPath(reference.book);
	return reference.chapter === undefined ? path : [...path, `${reference.book}|${reference.chapter}`];
}

function passing(entries: readonly GraphEntry[], filters: GraphFilters, tagsOf: TagsOf): GraphEntry[] {
	const wanted = new Set(filters.tagNames.map(tagKey));
	return entries.filter((entry) => {
		if (hasDates(filters.dates) && !writtenWhen(entry, filters.dates)) return false;
		if (wanted.size > 0 && !tagsOf(entry.id).some((tag) => wanted.has(tagKey(tag)))) return false;
		return true;
	});
}

function scoped(entries: readonly GraphEntry[], filters: GraphFilters): GraphEntry[] {
	if (filters.books.length === 0 && !filters.reference) return [...entries];
	return entries
		.map((entry) => ({ ...entry, cites: entry.cites.filter((range) => inScope(range, filters)) }))
		.filter((entry) => entry.cites.length > 0);
}

function inScope(range: VerseRange, { books, reference }: GraphFilters): boolean {
	if (books.includes(range.book)) return true;
	return (
		reference !== null &&
		range.book === reference.book &&
		(reference.chapter === undefined || range.chapter === reference.chapter)
	);
}

/** On the reader's own calendar: a note dated the 26th was written on the 26th wherever the clock is. */
function writtenWhen(entry: GraphEntry, dates: GraphDates): boolean {
	const date = new Date(entry.entryDate);
	const allows = (chosen: readonly number[], value: number) => chosen.length === 0 || chosen.includes(value);
	return (
		allows(dates.years, date.getFullYear()) &&
		allows(dates.months, date.getMonth() + 1) &&
		allows(dates.weekdays, date.getDay())
	);
}

/** Every (note, range) pair, read on the reader's calendar, as the app's `graph_citations` returns them. */
function citationsOf(entries: readonly GraphEntry[]): GraphCitation[] {
	return entries.flatMap((entry) => {
		const reading = localReading(entry.entryDate);
		return entry.cites.map((range) => ({ ...range, entryId: entry.id, reading }));
	});
}

function localReading(iso: string): string {
	const date = new Date(iso);
	const two = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T00:00:00`;
}
