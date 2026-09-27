import { describe, expect, it } from 'vitest';

import { readViewState } from './view-state';

const JOHN_3_16 = { book: 'John', chapter: 3, first: 16, last: 16 };
const PSALM_23 = { book: 'Psalms', chapter: 23, first: null, last: null };

describe('readViewState', () => {
	it('reads back what the graph saved', () => {
		expect(readViewState({ verse: JOHN_3_16, entry: 'Journal/A.md', open: ['old', 'new', 'John'] })).toEqual({
			verse: JOHN_3_16,
			entry: 'Journal/A.md',
			open: ['old', 'new', 'John'],
		});
		expect(readViewState({ verse: PSALM_23, entry: null, open: [] })).toEqual({ verse: PSALM_23, entry: null, open: [] });
	});

	it('reads a state saved before verses and open books were kept', () => {
		expect(readViewState({ entry: 'Journal/A.md' })).toEqual({ entry: 'Journal/A.md' });
	});

	it('leaves out whatever is not the right shape, keeping the rest', () => {
		expect(readViewState(null)).toEqual({});
		expect(readViewState('John 3:16')).toEqual({});
		expect(readViewState({ verse: { book: 'John', chapter: '3', first: 16, last: 16 }, entry: 7, open: ['old', 2] })).toEqual({});
		expect(readViewState({ verse: { ...JOHN_3_16, last: null }, open: ['old'] })).toEqual({ open: ['old'] });
	});
});
