// Writes a small throwaway vault to test-vault/ with the built plugin installed and
// enabled. Notes are shaped like Scripture Thread's: each verse, chapter and book note
// links to its parent. Rerun after a build to update the plugin; notes are rewritten.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const VAULT = 'test-vault';
const PLUGIN = join(VAULT, '.obsidian', 'plugins', 'verse-graph');

function note(path, text) {
	const full = join(VAULT, path);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, text);
}

/** A Bible note and its parent link, as Scripture Thread writes them. */
function bible(testament, book, name, parent) {
	note(`Bible/${testament}/${book}/${name}.md`, `[[${parent}]]\n`);
}

// The parent chain.
note('Bible/Old Testament.md', '');
note('Bible/New Testament.md', '');
for (const [testament, book, chapters] of [
	['Old Testament', 'Genesis', { 1: [1] }],
	['Old Testament', 'Psalms', { 23: [1, 4] }],
	['Old Testament', 'Proverbs', { 3: [5, '5-6'] }],
	['New Testament', 'Matthew', { 5: [], 6: [], 7: [] }],
	['New Testament', 'John', { 3: [16, '16-18'] }],
	['New Testament', 'Romans', { 8: [28] }],
]) {
	note(`Bible/${testament}/${book}.md`, `[[${testament}]]\n`);
	for (const [chapter, verses] of Object.entries(chapters)) {
		bible(testament, book, `${book} ${chapter}`, book);
		for (const verse of verses) bible(testament, book, `${book} ${chapter} ${verse}`, `${book} ${chapter}`);
	}
}
bible('New Testament', 'Matthew', 'Matthew 5-7', 'Matthew');

// Commentary inside a verse note: [[Romans 8 28]] counts, its parent link does not.
note('Bible/New Testament/John/John 3 16.md', '[[John 3]]\n\nCompare [[Romans 8 28]].\n');
// A duplicate verse note in another folder: one node with the real one.
note('Old notes/John 3 16.md', '[[John 3]]\n');

// Entries.
note('Journal/2026-09-20 Morning.md', 'The shepherd [[Psalms 23 1]] and [[John 3 16-18]].\n');
note('Journal/2026-09-21 Evening.md', '---\nverses: "[[Romans 8 28]]"\n---\nAll of [[Psalms 23]], especially [[Psalms 23 4]].\n');
note('Journal/Sermon on the Mount.md', '---\ndate: 2026-09-14\n---\n[[Matthew 5-7]]\n');
note('Journal/Quick thought.md', 'Not converted yet: [[Jn 3 16]]. A book link is not a citation: [[Psalms]].\n');
note('Journal/2026-09-22 Proverbs.md', '[[Proverbs 3 5]], then [[Proverbs 3 5-6]], and [[Genesis 1 1]].\n');
note('Journal/Old folder link.md', '[[Old notes/John 3 16]]\n');
note('Journal/No verses.md', 'Just a note about [[Sermon on the Mount]].\n');

// The plugin.
mkdirSync(PLUGIN, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) copyFileSync(file, join(PLUGIN, file));
writeFileSync(join(VAULT, '.obsidian', 'community-plugins.json'), JSON.stringify(['verse-graph']));

console.log(`Test vault ready at ${VAULT}/. Open it in Obsidian with Open folder as vault.`);
