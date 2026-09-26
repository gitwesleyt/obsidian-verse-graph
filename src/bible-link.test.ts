// Copied from Scripture Thread (obsidian-scripture-thread/src/bible-link.test.ts) on 2026-09-26.
// Keep in step with the original rather than editing here.

import { describe, expect, it } from 'vitest';

import { parseBibleLink } from './bible-link';

describe('reading a link as a Bible reference', () => {
	it('reads the vault note names for verses and ranges', () => {
		expect(parseBibleLink('Psalms 23 1')).toMatchObject({
			reference: 'Psalm 23:1',
			level: 'verse',
			keys: ['Psalms|23|1'],
			chapterKeys: ['Psalms|23|'],
		});
		expect(parseBibleLink('John 3 16-18')?.keys).toEqual(['John|3|16', 'John|3|17', 'John|3|18']);
		expect(parseBibleLink('Matthew 6 1-3,7')?.keys).toHaveLength(4);
	});

	it('reads chapters and chapter ranges', () => {
		expect(parseBibleLink('Psalms 23')).toMatchObject({ level: 'chapter', keys: ['Psalms|23|'] });
		expect(parseBibleLink('Matthew 5-7')?.keys).toEqual(['Matthew|5|', 'Matthew|6|', 'Matthew|7|']);
	});

	it('reads a note path by its name, and a hand-typed colon', () => {
		expect(parseBibleLink('Bible/New Testament/John 3 16.md')?.reference).toBe('John 3:16');
		expect(parseBibleLink('John 3:16')?.keys).toEqual(['John|3|16']);
	});

	it('ignores books, testaments and names that only contain a reference', () => {
		expect(parseBibleLink('Psalms')).toBeNull();
		expect(parseBibleLink('Old Testament')).toBeNull();
		expect(parseBibleLink('Notes on John 3')).toBeNull();
		expect(parseBibleLink('John 3 16 sermon')).toBeNull();
		expect(parseBibleLink('Jonah 9')).toBeNull();
	});
});

describe('the parts of a reference', () => {
	it('gives the book and the passage without it', () => {
		expect(parseBibleLink('Psalms 23 1')).toMatchObject({ book: 'Psalms', passage: '23:1' });
		expect(parseBibleLink('1 Samuel 3')).toMatchObject({ book: '1 Samuel', passage: '3' });
		expect(parseBibleLink('Song of Solomon 2 4')).toMatchObject({ passage: '2:4' });
	});
});
