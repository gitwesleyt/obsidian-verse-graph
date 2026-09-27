import { describe, expect, it } from 'vitest';

import { NO_GRAPH_FILTERS, type GraphFilters } from './graph-filter-rules';
import { rangeKey, type GraphEntry, type VerseRange } from './graph-rules';
import {
	dateFacets,
	filterGraph,
	opensForReference,
	reachableDates,
	tagCounts,
	unscopedCitations,
} from './graph-filters';
import { rowsOf, type VaultGraph } from './vault-graph';

const PSALM_23_1: VerseRange = { book: 'Psalms', chapter: 23, first: 1, last: 1 };
const PSALM_51_10: VerseRange = { book: 'Psalms', chapter: 51, first: 10, last: 10 };
const ROMANS_8_28: VerseRange = { book: 'Romans', chapter: 8, first: 28, last: 28 };
const JOHN_3_16: VerseRange = { book: 'John', chapter: 3, first: 16, last: 16 };

/** A note on a local calendar day. */
function note(id: string, day: [number, number, number], cites: VerseRange[]): GraphEntry {
	const [year, month, date] = day;
	return {
		id,
		title: id,
		entryDate: new Date(year, month - 1, date).toISOString(),
		entryDateOffset: null,
		cites,
	};
}

// 2024-03-03 was a Sunday; 2025-06-10 a Tuesday; 2025-03-05 a Wednesday.
const A = note('A.md', [2024, 3, 3], [PSALM_23_1, ROMANS_8_28]);
const B = note('B.md', [2025, 6, 10], [PSALM_51_10]);
const C = note('C.md', [2025, 3, 5], [JOHN_3_16]);
const GRAPH: VaultGraph = { entries: [A, B, C], rows: rowsOf([A, B, C]) };
const TAGS: Record<string, string[]> = { 'A.md': ['Grief'], 'B.md': ['grief', 'hope'], 'C.md': [] };
const tagsOf = (path: string) => TAGS[path] ?? [];

const filters = (change: Partial<GraphFilters>): GraphFilters => ({ ...NO_GRAPH_FILTERS, ...change });
const shown = (graph: VaultGraph) => ({
	notes: graph.entries.map((entry) => `${entry.id}:${entry.cites.map(rangeKey).join(',')}`),
	rows: graph.rows.map((row) => `${rangeKey(row)}×${row.entryCount}`),
});

describe('filterGraph', () => {
	it('leaves the graph alone with nothing chosen', () => {
		expect(filterGraph(GRAPH, NO_GRAPH_FILTERS, tagsOf)).toBe(GRAPH);
	});

	it('keeps only what is in scope, dropping a note citing nothing there', () => {
		expect(shown(filterGraph(GRAPH, filters({ books: ['Psalms'] }), tagsOf))).toEqual({
			notes: ['A.md:Psalms|23|1|1', 'B.md:Psalms|51|10|10'],
			rows: ['Psalms|23|1|1×1', 'Psalms|51|10|10×1'],
		});
	});

	it('takes the ticked books and the reference as one scope, a union', () => {
		const graph = filterGraph(GRAPH, filters({ books: ['John'], reference: { book: 'Psalms', chapter: 23 } }), tagsOf);
		expect(shown(graph).notes).toEqual(['A.md:Psalms|23|1|1', 'C.md:John|3|16|16']);
	});

	it('filters by year, month and day of the week, each only if chosen', () => {
		expect(shown(filterGraph(GRAPH, filters({ dates: { years: [2025], months: [], weekdays: [] } }), tagsOf)).notes).toEqual([
			'B.md:Psalms|51|10|10',
			'C.md:John|3|16|16',
		]);
		const march = filters({ dates: { years: [], months: [3], weekdays: [0] } });
		expect(shown(filterGraph(GRAPH, march, tagsOf)).notes).toEqual(['A.md:Psalms|23|1|1,Romans|8|28|28']);
	});

	it('keeps a note carrying any one chosen tag, in any case', () => {
		expect(shown(filterGraph(GRAPH, filters({ tagNames: ['#GRIEF'] }), tagsOf)).notes).toHaveLength(2);
		expect(shown(filterGraph(GRAPH, filters({ tagNames: ['hope', 'absent'] }), tagsOf)).notes).toEqual([
			'B.md:Psalms|51|10|10',
		]);
	});
});

describe('what the controls offer', () => {
	it('counts citations under every filter but the scope', () => {
		const citations = unscopedCitations(GRAPH, filters({ books: ['John'], tagNames: ['grief'] }), tagsOf);
		expect(citations.map((c) => `${c.entryId}:${c.book}`)).toEqual(['A.md:Psalms', 'A.md:Romans', 'B.md:Psalms']);
	});

	it('offers the dates there are, whatever dates are chosen', () => {
		const facets = dateFacets(GRAPH, filters({ dates: { years: [2024], months: [], weekdays: [] } }), tagsOf);
		expect(facets.map((facet) => facet.year).sort()).toEqual([2024, 2025, 2025]);
	});

	it('greys a date chip that would find nothing with the other groups chosen', () => {
		const facets = dateFacets(GRAPH, NO_GRAPH_FILTERS, tagsOf);
		const reach = reachableDates(facets, { years: [2025], months: [], weekdays: [] });
		expect([...reach.months].sort()).toEqual([3, 6]);
		expect([...reach.weekdays].sort()).toEqual([2, 3]);
		// Years are offered against the other groups only, so 2024 stays reachable.
		expect([...reach.years].sort()).toEqual([2024, 2025]);
	});

	it('counts tags on the notes the other filters leave', () => {
		expect(tagCounts(GRAPH, NO_GRAPH_FILTERS, tagsOf)).toEqual([
			{ name: 'grief', count: 2 },
			{ name: 'hope', count: 1 },
		]);
		expect(tagCounts(GRAPH, filters({ books: ['Romans'] }), tagsOf)).toEqual([{ name: 'grief', count: 1 }]);
	});
});

describe('opensForReference', () => {
	it('opens a book to its chapters, and a chapter to its verses', () => {
		expect(opensForReference({ book: 'Psalms' })).toEqual(['old', 'category:wisdom', 'Psalms']);
		expect(opensForReference({ book: 'Psalms', chapter: 23 })).toEqual(['old', 'category:wisdom', 'Psalms', 'Psalms|23']);
	});
});
