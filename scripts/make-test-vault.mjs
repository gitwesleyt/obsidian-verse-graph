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
note('Journal/2026-09-20 Morning.md', 'The shepherd [[Psalms 23 1]] and [[John 3 16-18]]. #grief\n');
note('Journal/2026-09-21 Evening.md', '---\nverses: "[[Romans 8 28]]"\ntags: [hope, Grief]\n---\nAll of [[Psalms 23]], especially [[Psalms 23 4]].\n');
note('Journal/Sermon on the Mount.md', '---\ndate: 2026-09-14\n---\n[[Matthew 5-7]]\n');
note('Journal/Quick thought.md', 'Not converted yet: [[Jn 3 16]]. A book link is not a citation: [[Psalms]].\n');
note('Journal/2026-09-22 Proverbs.md', '[[Proverbs 3 5]], then [[Proverbs 3 5-6]], and [[Genesis 1 1]].\n');
note('Journal/Old folder link.md', '[[Old notes/John 3 16]]\n');
note('Journal/No verses.md', 'Just a note about [[Sermon on the Mount]].\n');

// Long entries for the note panel's verse block (Scripture Thread's spec/verse-blocks.md):
// select a verse, then one of these, and the block citing it should be boxed and in view.
const FILLER = [
	'The morning was quiet and I sat with coffee longer than I meant to, turning the same thought over.',
	'Work was busy, but the busyness felt lighter than last week, and I noticed that without trying to.',
	'I wrote a letter I may not send. Writing it was the point, I think, more than whoever reads it.',
	'A walk after lunch: cold air, a dog that would not stop barking, and the light going gold early.',
];
const paragraphs = (count) => Array.from({ length: count }, (_, index) => FILLER[index % FILLER.length]).join('\n\n');
const entry = (name, ...parts) => note(`Journal/${name}.md`, `${parts.join('\n\n')}\n`);

entry(
	'2026-09-23 Far down the page',
	'Several paragraphs before the citation, so the panel has to scroll to it.',
	paragraphs(8),
	'Lines above the link are in the block too.\nThis evening [[Romans 8 28]] came back to me,\nand I kept thinking about it until late.',
	paragraphs(6),
);
entry(
	'2026-09-24 A list under the paragraph',
	paragraphs(3),
	'What [[John 3 16]] asks of me, today:\n- to take it at its word\n- to stop arguing with it\n- [ ] write back to Sam',
	'This paragraph is after a blank line, so it sits outside the box.',
	paragraphs(3),
);
entry(
	'2026-09-25 Headings and callouts',
	'## Morning with [[Psalms 23 1]]',
	'A citation in a heading is in no block, so the heading is tinted instead.',
	paragraphs(2),
	'> [!note] From the study group\n> Someone read [[Proverbs 3 5]] aloud and nobody said anything for a minute.',
	'A citation in a callout is in no block either: select Proverbs 3:5 to see the tint.',
	paragraphs(2),
	'Straight under this line comes a heading, which ends the block: [[Genesis 1 1]]\n## Afternoon',
	paragraphs(2),
);
entry(
	'2026-09-26 Two blocks, one verse',
	paragraphs(2),
	'The first mention of [[Psalms 23 4]] is the one boxed.',
	paragraphs(4),
	'A second mention of [[Psalms 23 4]], further down, stays unboxed.',
	paragraphs(2),
);
entry(
	'2026-09-27 Quote, code and math',
	'> A quote holding [[John 3 16-18]]\n> is an ordinary block, and boxed.',
	paragraphs(2),
	'Math right under the block ends it: [[Matthew 5-7]]\n$$\na^2 + b^2 = c^2\n$$',
	'```\nA link in code is no citation: [[Romans 8 28]]\n```',
	paragraphs(2),
);
entry(
	'2026-09-28 Footnote across the cut',
	'A known limit: [[Psalms 23]] with a footnote[^1] whose definition is outside the block, so it does not resolve.',
	paragraphs(3),
	'[^1]: The footnote, defined far below.',
);

// The plugin.
mkdirSync(PLUGIN, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) copyFileSync(file, join(PLUGIN, file));
writeFileSync(join(VAULT, '.obsidian', 'community-plugins.json'), JSON.stringify(['verse-graph']));

console.log(`Test vault ready at ${VAULT}/. Open it in Obsidian with Open folder as vault.`);
