// Writes a 5,000-note vault to test-vault-big/ for the timing check, with the built
// plugin installed and enabled. Each journal note cites three verses at random; every
// cited verse gets a verse note with Scripture Thread's parent chain, as in a real vault.
// The same vault every run. Rerun after a build to update the plugin; notes already there are kept.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const VAULT = 'test-vault-big';
const PLUGIN = join(VAULT, '.obsidian', 'plugins', 'verse-graph');
const NOTES = 5000;
const CITES_PER_NOTE = 3;

// Enough of the canon to spread the verses: [testament, book, chapters].
const BOOKS = [
	['Old Testament', 'Genesis', 50], ['Old Testament', 'Exodus', 40], ['Old Testament', 'Deuteronomy', 34],
	['Old Testament', 'Joshua', 24], ['Old Testament', '1 Samuel', 31], ['Old Testament', '1 Kings', 22],
	['Old Testament', 'Job', 42], ['Old Testament', 'Psalms', 150], ['Old Testament', 'Proverbs', 31],
	['Old Testament', 'Isaiah', 66], ['Old Testament', 'Jeremiah', 52], ['Old Testament', 'Daniel', 12],
	['New Testament', 'Matthew', 28], ['New Testament', 'Mark', 16], ['New Testament', 'Luke', 24],
	['New Testament', 'John', 21], ['New Testament', 'Acts', 28], ['New Testament', 'Romans', 16],
	['New Testament', '1 Corinthians', 16], ['New Testament', 'Galatians', 6], ['New Testament', 'Ephesians', 6],
	['New Testament', 'Hebrews', 13], ['New Testament', 'James', 5], ['New Testament', 'Revelation', 22],
];

let seed = 1;
function random() {
	seed = (seed * 1664525 + 1013904223) % 2 ** 32;
	return seed / 2 ** 32;
}
const pick = (count) => 1 + Math.floor(random() * count);

const written = new Set();
function note(path, text) {
	if (written.has(path)) return;
	written.add(path);
	const full = join(VAULT, path);
	// Rerunning writes the same notes, so ones already there are left alone: the vault may be open.
	if (existsSync(full)) return;
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, text);
}

const start = Date.UTC(2020, 0, 1);
for (let n = 0; n < NOTES; n++) {
	const links = [];
	for (let c = 0; c < CITES_PER_NOTE; c++) {
		const [testament, book, chapters] = BOOKS[Math.floor(random() * BOOKS.length)];
		const chapter = `${book} ${pick(chapters)}`;
		const verse = `${chapter} ${pick(30)}`;
		note(`Bible/${testament}.md`, '');
		note(`Bible/${testament}/${book}.md`, `[[${testament}]]\n`);
		note(`Bible/${testament}/${book}/${chapter}.md`, `[[${book}]]\n`);
		note(`Bible/${testament}/${book}/${verse}.md`, `[[${chapter}]]\n`);
		links.push(`[[${verse}]]`);
	}
	// About three notes a day, back from 2020.
	const day = new Date(start + Math.floor(n / 3) * 86_400_000).toISOString().slice(0, 10);
	note(`Journal/${day} Note ${n}.md`, `Today I read ${links.join(', ')}.\n`);
}

mkdirSync(PLUGIN, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) copyFileSync(file, join(PLUGIN, file));
writeFileSync(join(VAULT, '.obsidian', 'community-plugins.json'), JSON.stringify(['verse-graph']));

console.log(`${written.size.toLocaleString()} notes written to ${VAULT}/, ${NOTES.toLocaleString()} of them journal notes.`);
