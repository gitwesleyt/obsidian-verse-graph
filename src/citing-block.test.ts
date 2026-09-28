import { describe, expect, it } from 'vitest';
import { splitAtCitingBlock } from './citing-block';

const note = (...lines: string[]) => lines.join('\n');

describe('splitAtCitingBlock', () => {
	it('cuts out the paragraph holding the citing line, lines above it included', () => {
		const text = note('Intro.', '', 'A thought.', 'On [[John 3 16]] today.', 'More.', '', 'After.');
		expect(splitAtCitingBlock(text, 3)).toEqual({
			before: note('Intro.', ''),
			block: note('A thought.', 'On [[John 3 16]] today.', 'More.'),
			after: note('', 'After.'),
		});
	});

	it('takes in a list directly under the paragraph', () => {
		const text = note('[[John 3 16]] then:', '- a point', '', 'After.');
		expect(splitAtCitingBlock(text, 0)?.block).toBe(note('[[John 3 16]] then:', '- a point'));
	});

	it('handles a block that is the whole note', () => {
		expect(splitAtCitingBlock('[[John 3 16]]', 0)).toEqual({ before: '', block: '[[John 3 16]]', after: '' });
	});

	it('stops the block at a heading above it', () => {
		const text = note('## Morning', '[[John 3 16]] here.');
		expect(splitAtCitingBlock(text, 1)).toEqual({ before: '## Morning', block: '[[John 3 16]] here.', after: '' });
	});

	it('gives no block for a citation in a heading, a callout, code or the properties', () => {
		expect(splitAtCitingBlock(note('## [[John 3 16]]', 'text'), 0)).toBeNull();
		expect(splitAtCitingBlock(note('> [!note]', '> [[John 3 16]]'), 1)).toBeNull();
		expect(splitAtCitingBlock(note('```', '[[John 3 16]]', '```'), 1)).toBeNull();
		expect(splitAtCitingBlock(note('---', 'related: "[[John 3 16]]"', '---', 'Text.'), 1)).toBeNull();
	});

	it('gives no block for a line past the end of the note', () => {
		expect(splitAtCitingBlock('[[John 3 16]]', 4)).toBeNull();
	});
});
