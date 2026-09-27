// Writes a 5,000-note vault to test-vault-big/ for the timing check and everyday
// testing, with the built plugin installed and enabled. The same vault every run.
//
// Notes are shaped like a real journal kept with Scripture Thread, with every case
// the small test vault has, spread through it:
// - single verses, verse ranges, whole chapters and chapter ranges, each cited verse,
//   range or chapter getting its note with Scripture Thread's parent chain
// - unconverted references (`[[Jn 3 16]]`, no note behind them) and book links, which
//   are not citations
// - tags in the body and in properties; a `date` property on notes whose name has no
//   date, and some notes with neither (their date is when the file was made)
// - verse links in a property, commentary written inside a verse note, a duplicate
//   verse note in another folder, and notes that cite nothing
//
// Rerunning rewrites only the notes whose text changed, takes out notes an earlier
// version of this script made that this one doesn't, and updates the plugin. It never
// touches .obsidian, so it is safe while the vault is open in Obsidian.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const VAULT = 'test-vault-big';
const PLUGIN = join(VAULT, '.obsidian', 'plugins', 'verse-graph');
const NOTES = 5000;

// Enough of the canon to spread the verses: [testament, book, chapters, abbreviation].
const BOOKS = [
	['Old Testament', 'Genesis', 50, 'Gen'], ['Old Testament', 'Exodus', 40, 'Exod'],
	['Old Testament', 'Deuteronomy', 34, 'Deut'], ['Old Testament', 'Joshua', 24, 'Josh'],
	['Old Testament', '1 Samuel', 31, '1 Sam'], ['Old Testament', '1 Kings', 22, '1 Kgs'],
	['Old Testament', 'Job', 42, 'Job'], ['Old Testament', 'Psalms', 150, 'Ps'],
	['Old Testament', 'Proverbs', 31, 'Prov'], ['Old Testament', 'Isaiah', 66, 'Isa'],
	['Old Testament', 'Jeremiah', 52, 'Jer'], ['Old Testament', 'Daniel', 12, 'Dan'],
	['New Testament', 'Matthew', 28, 'Matt'], ['New Testament', 'Mark', 16, 'Mk'],
	['New Testament', 'Luke', 24, 'Lk'], ['New Testament', 'John', 21, 'Jn'],
	['New Testament', 'Acts', 28, 'Acts'], ['New Testament', 'Romans', 16, 'Rom'],
	['New Testament', '1 Corinthians', 16, '1 Cor'], ['New Testament', 'Galatians', 6, 'Gal'],
	['New Testament', 'Ephesians', 6, 'Eph'], ['New Testament', 'Hebrews', 13, 'Heb'],
	['New Testament', 'James', 5, 'Jas'], ['New Testament', 'Revelation', 22, 'Rev'],
];
const TAGS = ['grief', 'hope', 'prayer', 'gratitude', 'lament', 'sermon', 'family', 'doubt', 'study/greek', 'study/history'];

let seed = 1;
function random() {
	seed = (seed * 1664525 + 1013904223) % 2 ** 32;
	return seed / 2 ** 32;
}
const pick = (count) => 1 + Math.floor(random() * count);
const choose = (list) => list[Math.floor(random() * list.length)];

let written = 0;
let unchanged = 0;
const seen = new Set();
/** Writes a note, unless it is already there with this text. */
function note(path, text) {
	if (seen.has(path)) return;
	seen.add(path);
	const full = join(VAULT, path);
	if (existsSync(full) && readFileSync(full, 'utf8') === text) {
		unchanged++;
		return;
	}
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, text);
	written++;
}

/** The parent chain for a book, as Scripture Thread writes it. */
function chain(testament, book) {
	note(`Bible/${testament}.md`, '');
	note(`Bible/${testament}/${book}.md`, `[[${testament}]]\n`);
}

/** One citation, and the note behind it when there is one. Returns the link text. */
function citation() {
	const [testament, book, chapters, abbreviation] = choose(BOOKS);
	const chapter = pick(chapters);
	const verse = pick(28);
	const roll = random();
	chain(testament, book);
	const chapterNote = () => note(`Bible/${testament}/${book}/${book} ${chapter}.md`, `[[${book}]]\n`);

	if (roll < 0.6) {
		// A single verse.
		chapterNote();
		note(`Bible/${testament}/${book}/${book} ${chapter} ${verse}.md`, `[[${book} ${chapter}]]\n`);
		return `${book} ${chapter} ${verse}`;
	}
	if (roll < 0.75) {
		// A verse range.
		const last = verse + pick(4);
		chapterNote();
		note(`Bible/${testament}/${book}/${book} ${chapter} ${verse}-${last}.md`, `[[${book} ${chapter}]]\n`);
		return `${book} ${chapter} ${verse}-${last}`;
	}
	if (roll < 0.87) {
		// A whole chapter.
		chapterNote();
		return `${book} ${chapter}`;
	}
	if (roll < 0.93 && chapter < chapters) {
		// A chapter range.
		const last = Math.min(chapters, chapter + pick(3));
		note(`Bible/${testament}/${book}/${book} ${chapter}-${last}.md`, `[[${book}]]\n`);
		return `${book} ${chapter}-${last}`;
	}
	// Not converted yet: an abbreviation with no note behind it.
	return `${abbreviation} ${chapter} ${verse}`;
}

/** A note's front matter, from whichever properties it has. */
function frontMatter(properties) {
	const lines = Object.entries(properties).map(([key, value]) =>
		Array.isArray(value) ? `${key}: [${value.join(', ')}]` : `${key}: ${value}`,
	);
	return lines.length === 0 ? '' : `---\n${lines.join('\n')}\n---\n`;
}

const start = Date.UTC(2020, 0, 1);
for (let n = 0; n < NOTES; n++) {
	// About three notes a day, back from 2020.
	const day = new Date(start + Math.floor(n / 3) * 86_400_000).toISOString().slice(0, 10);
	const properties = {};
	const roll = random();

	// Most notes are dated by their name; some by a property; a few by nothing but the file.
	let name = `Journal/${day} Note ${n}.md`;
	if (roll < 0.1) {
		name = `Journal/Undated/Note ${n}.md`;
		properties.date = day;
	} else if (roll < 0.13) {
		name = `Journal/Undated/Note ${n} (file date).md`;
	}

	// Most notes cite one to four passages; some cite nothing at all.
	const count = random() < 0.04 ? 0 : pick(4);
	const links = Array.from({ length: count }, () => `[[${citation()}]]`);
	if (links.length > 1 && random() < 0.1) properties.verses = `"${links.shift()}"`;

	// Tags: none, one or two, in the body or in the properties.
	const tags = random() < 0.4 ? [] : [...new Set(Array.from({ length: pick(2) }, () => choose(TAGS)))];
	let tagText = '';
	if (tags.length > 0 && random() < 0.5) properties.tags = tags;
	else tagText = tags.map((tag) => ` #${tag}`).join('');

	// Now and then a book link, which is not a citation.
	const bookLink = random() < 0.05 ? ` See also [[${choose(BOOKS)[1]}]].` : '';
	const body = links.length > 0 ? `Today I read ${links.join(', ')}.` : 'Nothing read today.';
	note(name, `${frontMatter(properties)}${body}${bookLink}${tagText}\n`);
}

// The one-off cases, as in the small test vault.
chain('New Testament', 'John');
note('Bible/New Testament/John/John 3.md', '[[John]]\n');
// Commentary inside a verse note: [[Romans 8 28]] counts, its parent link does not.
note('Bible/New Testament/John/John 3 16.md', '[[John 3]]\n\nCompare [[Romans 8 28]]. #study/greek\n');
chain('New Testament', 'Romans');
note('Bible/New Testament/Romans/Romans 8.md', '[[Romans]]\n');
note('Bible/New Testament/Romans/Romans 8 28.md', '[[Romans 8]]\n');
// A duplicate verse note in another folder, cited through its folder: one node with the real one.
note('Old notes/John 3 16.md', '[[John 3]]\n');
note('Journal/Old folder link.md', '---\ndate: 2021-05-02\n---\n[[Old notes/John 3 16]]\n');

// Notes an earlier version of this script made and this one doesn't.
let removed = 0;
for (const entry of readdirSync(VAULT, { recursive: true, withFileTypes: true })) {
	if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
	const path = join(entry.parentPath, entry.name).slice(VAULT.length + 1);
	if (path.startsWith('.obsidian') || seen.has(path)) continue;
	rmSync(join(VAULT, path));
	removed++;
}

mkdirSync(PLUGIN, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) copyFileSync(file, join(PLUGIN, file));
writeFileSync(join(VAULT, '.obsidian', 'community-plugins.json'), JSON.stringify(['verse-graph']));

console.log(
	`${seen.size.toLocaleString()} notes in ${VAULT}/: ${written.toLocaleString()} written, ` +
		`${unchanged.toLocaleString()} already up to date, ${removed.toLocaleString()} left over and removed.`,
);
