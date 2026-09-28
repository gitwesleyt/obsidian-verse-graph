// Copied from Scripture Thread (obsidian-scripture-thread/src/verse-block-rules.test.ts) on 2026-09-28.
// Keep in step with the original rather than editing here.

import { describe, expect, it } from 'vitest';
import { blockAt, lineRole, verseBlocks, type VerseBlock } from './verse-block-rules';

/** In these tests a line opens a block when it holds `[[v]]`. */
const opens = (line: string) => line.includes('[[v]]');

const blocksOf = (lines: string[], caretLine: number | null = null): [number, number][] =>
	verseBlocks(lines, opens, caretLine).map((block) => [block.startLine, block.endLine]);

describe('verseBlocks', () => {
	it('boxes a one-line paragraph holding a link', () => {
		expect(blocksOf(['[[v]] one line'])).toEqual([[0, 0]]);
	});

	it('boxes every line of the run, including lines above the link', () => {
		expect(blocksOf(['above', '[[v]] middle', 'below'])).toEqual([[0, 2]]);
	});

	it('leaves a run with no link unboxed', () => {
		expect(blocksOf(['just writing', 'more writing'])).toEqual([]);
	});

	it('ends a block at a blank line, and at a line of only spaces', () => {
		expect(blocksOf(['[[v]]', '', 'outside'])).toEqual([[0, 0]]);
		expect(blocksOf(['[[v]]', '  \t', 'outside'])).toEqual([[0, 0]]);
	});

	it('keeps two blocks one blank line apart as two blocks', () => {
		expect(blocksOf(['[[v]] one', '', '[[v]] two'])).toEqual([
			[0, 0],
			[2, 2],
		]);
	});

	it('takes in a list directly under the paragraph', () => {
		expect(blocksOf(['[[v]] then a list:', '- a point', '- [ ] a checkbox'])).toEqual([[0, 2]]);
	});

	it('takes in a quote', () => {
		expect(blocksOf(['> [[v]] in a quote', '> second line'])).toEqual([[0, 1]]);
	});

	it('ends a block at a heading, and never boxes the heading', () => {
		expect(blocksOf(['[[v]]', '## Heading', 'text'])).toEqual([[0, 0]]);
		expect(blocksOf(['## [[v]] in a heading', 'text under it'])).toEqual([]);
		expect(blocksOf(['[[v]]', '#', 'text'])).toEqual([[0, 0]]);
	});

	it('never boxes frontmatter', () => {
		expect(blocksOf(['---', 'related: "[[v]]"', '---', 'text'])).toEqual([]);
		expect(blocksOf(['---', 'related: "[[v]]"', '---', '[[v]] after'])).toEqual([[3, 3]]);
	});

	it('reads an unclosed frontmatter fence as ordinary text', () => {
		expect(blocksOf(['---', '[[v]]'])).toEqual([[0, 1]]);
	});

	it('never boxes fenced code, and a link inside it opens nothing', () => {
		expect(blocksOf(['```', '[[v]]', '```'])).toEqual([]);
		expect(blocksOf(['~~~', '[[v]]', '', 'still code', '~~~', 'text'])).toEqual([]);
		expect(blocksOf(['[[v]]', '```js', 'code', '```'])).toEqual([[0, 0]]);
	});

	it('ends a block at $$ math, and never boxes it', () => {
		expect(blocksOf(['[[v]] then math:', '$$', 'E = mc^2', '$$'])).toEqual([[0, 0]]);
		expect(blocksOf(['[[v]]', '$$ x^2 $$', 'after'])).toEqual([
			[0, 0],
		]);
		expect(blocksOf(['$$', '[[v]]', '$$'])).toEqual([]);
	});

	it('ends a block at a callout, and a link in a callout opens nothing', () => {
		expect(blocksOf(['[[v]]', '> [!note] A callout', '> inside'])).toEqual([[0, 0]]);
		expect(blocksOf(['> [!note]', '> [[v]] inside'])).toEqual([]);
	});

	it('closes the callout when its quote lines stop', () => {
		expect(blocksOf(['> [!note]', '> body', '[[v]] right under it'])).toEqual([[2, 2]]);
	});

	it('ends a block at a line that is only an embed or image', () => {
		expect(blocksOf(['[[v]]', '![[Other note]]', 'after'])).toEqual([[0, 0]]);
		expect(blocksOf(['[[v]]', '![alt](picture.png)'])).toEqual([[0, 0]]);
		expect(blocksOf(['[[v]] and ![[inline embed]] on one line'])).toEqual([[0, 0]]);
	});

	describe('the caret line (the first Enter)', () => {
		const note = ['[[v]] one', '', '', 'outside'];

		it('draws the empty caret line directly under a block inside it', () => {
			expect(blocksOf(note, 1)).toEqual([[0, 1]]);
		});

		it('leaves an empty caret line one further down outside (the second Enter)', () => {
			expect(blocksOf(note, 2)).toEqual([[0, 0]]);
		});

		it('changes nothing when the caret line has text', () => {
			expect(blocksOf(note, 3)).toEqual([[0, 0]]);
			expect(blocksOf(note, 0)).toEqual([[0, 0]]);
		});

		it('grows a block at the very end of the note', () => {
			expect(blocksOf(['[[v]]', ''], 1)).toEqual([[0, 1]]);
		});

		it('ignores a caret line past the end', () => {
			expect(blocksOf(['[[v]]'], 5)).toEqual([[0, 0]]);
		});
	});

	it('handles an empty note', () => {
		expect(blocksOf([])).toEqual([]);
		expect(blocksOf([''], 0)).toEqual([]);
	});

	it('reads a line source as well as an array', () => {
		const lines = ['a', '[[v]]'];
		const source = { lineCount: lines.length, line: (index: number) => lines[index] ?? '' };
		expect(verseBlocks(source, opens)).toEqual([{ startLine: 0, endLine: 1 }]);
	});
});

describe('lineRole and blockAt', () => {
	const block: VerseBlock = { startLine: 2, endLine: 4 };

	it('names each line of a block by its edges', () => {
		expect([2, 3, 4].map((line) => lineRole(block, line))).toEqual(['start', 'middle', 'end']);
		expect(lineRole({ startLine: 1, endLine: 1 }, 1)).toBe('only');
	});

	it('finds the block holding a line', () => {
		expect(blockAt([block], 3)).toBe(block);
		expect(blockAt([block], 5)).toBeUndefined();
	});
});

describe('timing', () => {
	it('works out a 10,000-line note quickly enough to run on every keystroke', () => {
		const lines = Array.from({ length: 10_000 }, (_, index) =>
			index % 3 === 2 ? '' : index % 9 === 0 ? `Thinking about [[v]] today.` : 'An ordinary line.',
		);
		verseBlocks(lines, opens);

		const runs = 20;
		const started = performance.now();
		for (let run = 0; run < runs; run++) verseBlocks(lines, opens, 4);
		const each = (performance.now() - started) / runs;

		// A guard against getting much slower, not the target: a phone is several
		// times slower than this, and a keystroke has one screen refresh (16 ms).
		expect(each).toBeLessThan(5);
	});
});
