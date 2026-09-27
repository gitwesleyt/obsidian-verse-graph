import { describe, expect, it } from 'vitest';

import { BIBLE_BOOKS } from './bible-books';
import { layoutGraph } from './graph-layout';
import { buildGraphTree } from './graph-rules';
import { vaultToGraph, type LinkIndex } from './vault-graph';

/**
 * The plan's timing check: a rebuild on a 5,000-note vault, from Obsidian's link
 * index to a laid-out graph, with every book, chapter and verse open, which is
 * the most the canvas can be asked to place. Drawing is timed in Obsidian.
 */

const NOTES = 5000;
const CITES_PER_NOTE = 3;
/** Rebuilds happen at most every 500 ms, and opening has to be under half a second. */
const BUDGET_MS = 150;

/** The same made-up vault on every run. */
function random(seed: number): () => number {
	return () => {
		seed = (seed * 1664525 + 1013904223) % 2 ** 32;
		return seed / 2 ** 32;
	};
}

function bigVault(): LinkIndex {
	const next = random(1);
	const pick = (count: number) => 1 + Math.floor(next() * count);
	const index: LinkIndex = { resolvedLinks: {}, unresolvedLinks: {} };
	for (let n = 0; n < NOTES; n++) {
		const links: Record<string, number> = {};
		for (let c = 0; c < CITES_PER_NOTE; c++) {
			const book = BIBLE_BOOKS[Math.floor(next() * BIBLE_BOOKS.length)];
			links[`Bible/${book.name}/${book.name} ${pick(book.chapters)} ${pick(30)}.md`] = 1;
		}
		index.resolvedLinks[`Journal/Note ${n}.md`] = links;
		index.unresolvedLinks[`Journal/Note ${n}.md`] = {};
	}
	return index;
}

describe('a 5,000-note vault', () => {
	it(`rebuilds in under ${BUDGET_MS} ms`, () => {
		const index = bigVault();
		const facts = () => ({ dateProperty: undefined, created: Date.UTC(2026, 0, 1) });
		// Once to warm up, as Obsidian will have by the second rebuild.
		layoutGraph(buildGraphTree(vaultToGraph(index, facts).rows));

		const start = performance.now();
		const graph = vaultToGraph(index, facts);
		const layout = layoutGraph(buildGraphTree(graph.rows));
		const took = performance.now() - start;

		// The timing is the point of the test, so it is printed. Tests never ship in main.js.
		process.stdout.write(
			`5,000 notes: ${graph.rows.length} verses, ${layout.nodes.length} boxes, rebuilt in ${took.toFixed(1)} ms\n`,
		);
		expect(graph.entries).toHaveLength(NOTES);
		expect(took).toBeLessThan(BUDGET_MS);
	});
});
