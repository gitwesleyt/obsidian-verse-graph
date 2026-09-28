// Compares every file copied from the Bible Journal web app or Scripture Thread
// with the original as it is now, so keeping in step is a command, not a memory.
// Development only: it reads the other repos when they are beside this one
// (or where BIBLE_JOURNAL_APP / SCRIPTURE_THREAD point), and nothing in the build
// or the tests uses it. Changes nothing; re-copying stays a deliberate step.
//
//   npm run compare-app                 which copies differ, what the app has that isn't copied,
//                                       and the app's graph commits since the plugin caught up
//   npm run compare-app -- --diff       the differences themselves
//   npm run compare-app -- --caught-up  records the app's latest commit as caught up with
//
// The commits matter because not everything the app decides is in a file copied here: the
// order of the toolbar's buttons is in its screen code and spec/graph.md. The commit caught
// up with is kept in app-caught-up.json.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPOS = {
	'bible-journal-app': process.env.BIBLE_JOURNAL_APP ?? resolve('..', 'bible-journal-app'),
	'obsidian-scripture-thread': process.env.SCRIPTURE_THREAD ?? resolve('..', 'obsidian-scripture-thread'),
};
const SHOW_DIFF = process.argv.includes('--diff');
const CAUGHT_UP = process.argv.includes('--caught-up');
const MARKER = 'app-caught-up.json';
/** What in the app is the graph: its screen, its rules, its spec and Wave 8's decisions. */
const GRAPH_PATHS = ['src/app/journal/graph', 'src/lib/graph-*', 'spec/graph.md', 'v3/decisions/8.*', 'src/components/ui/icons.tsx'];
/** App graph rules the plugin has no use for, and why, so they are not reported as missing. */
const NOT_NEEDED = {
	'src/lib/graph-address-rules.ts': "the app's ?entry= address; Obsidian keeps the chosen note in the view's saved state",
};
const HEADER = /^(?:\/\/|<!--) (Excerpt copied|Copied) from [^(]*\(([^/]+)\/([^)]+)\)/;
/** Where copies live: the code, and the written rules that go with it. */
const COPY_FOLDERS = [
	{ folder: 'src', extension: '.ts' },
	{ folder: 'spec', extension: '.md' },
];

const isHeaderLine = (line) => line.startsWith('//') || /^<!--.*-->$/.test(line);

/** The copy without its provenance header: the comment lines at the top and the blank line after. */
function body(text) {
	const lines = text.split('\n');
	let start = 0;
	while (lines[start] !== undefined && isHeaderLine(lines[start])) start++;
	if (lines[start] === '') start++;
	return lines.slice(start).join('\n');
}

/** The one change copies make: the app's "@/lib/" imports made relative. */
function asCopied(original) {
	return original.replaceAll('@/lib/', './');
}

/** An excerpt is in step when each piece of it is still in the original, word for word. */
function excerptPieces(copy) {
	return copy.split(/\n(?=\/\*\*)/).map((piece) => piece.trim()).filter(Boolean);
}

function diff(copy, original) {
	const dir = mkdtempSync(join(tmpdir(), 'compare-app-'));
	writeFileSync(join(dir, 'copy'), copy);
	writeFileSync(join(dir, 'original'), original);
	try {
		execFileSync('diff', ['-u', '--label', 'copy', '--label', 'original', join(dir, 'copy'), join(dir, 'original')]);
		return '';
	} catch (error) {
		return String(error.stdout);
	}
}

const results = { same: [], changed: [], missing: [], unreadable: new Set() };
const copiedFromApp = new Set();

const copies = COPY_FOLDERS.flatMap(({ folder, extension }) =>
	existsSync(folder)
		? readdirSync(folder)
				.filter((file) => file.endsWith(extension))
				.sort()
				.map((file) => `${folder}/${file}`)
		: [],
);

for (const name of copies) {
	const text = readFileSync(name, 'utf8');
	const match = HEADER.exec(text);
	if (!match) continue;
	const [, kind, repo, path] = match;
	if (repo === 'bible-journal-app') copiedFromApp.add(path);
	const root = REPOS[repo];
	if (!root || !existsSync(root)) {
		results.unreadable.add(repo);
		continue;
	}
	const source = join(root, path);
	if (!existsSync(source)) {
		results.missing.push(`${name} ← ${repo}/${path}`);
		continue;
	}
	const original = asCopied(readFileSync(source, 'utf8'));
	const copy = body(text);
	const inStep =
		kind === 'Excerpt copied'
			? excerptPieces(copy).every((piece) => original.includes(piece))
			: copy === original;
	if (inStep) results.same.push(name);
	else results.changed.push({ name, from: `${repo}/${path}`, diff: kind === 'Excerpt copied' ? '' : diff(copy, original) });
}

// Graph rules the app has that nothing here copies.
const appLib = join(REPOS['bible-journal-app'], 'src', 'lib');
const notCopied = existsSync(appLib)
	? readdirSync(appLib)
			.filter((file) => /^graph-.*\.ts$/.test(file) && !file.endsWith('.test.ts'))
			.map((file) => `src/lib/${file}`)
			.filter((path) => !copiedFromApp.has(path) && !(path in NOT_NEEDED))
	: [];

console.log(`In step: ${results.same.length} files.`);
if (results.changed.length > 0) {
	console.log(`\nChanged in the original since it was copied (${results.changed.length}):`);
	for (const { name, from, diff: text } of results.changed) {
		console.log(`  ${name} ← ${from}${text === '' ? ' (an excerpt: a piece of it is no longer in the original)' : ''}`);
		if (SHOW_DIFF && text) console.log(text.replace(/^/gm, '    '));
	}
	if (!SHOW_DIFF) console.log('  Run with --diff to see the differences.');
}
if (results.missing.length > 0) {
	console.log('\nThe original is gone (renamed or removed):');
	for (const line of results.missing) console.log(`  ${line}`);
}
if (notCopied.length > 0) {
	console.log('\nGraph rules in the web app that are not copied here:');
	for (const path of notCopied) console.log(`  bible-journal-app/${path}`);
}
for (const repo of results.unreadable) console.log(`\nNot found, so not compared: ${repo} (expected at ${REPOS[repo] ?? '?'})`);

// The app's graph commits since the plugin last caught up.
const app = REPOS['bible-journal-app'];
if (existsSync(join(app, '.git'))) {
	const git = (...args) => execFileSync('git', ['-C', app, ...args], { encoding: 'utf8' }).trim();
	const marker = existsSync(MARKER) ? JSON.parse(readFileSync(MARKER, 'utf8')) : {};
	if (CAUGHT_UP) {
		const head = git('rev-parse', '--short', 'HEAD');
		writeFileSync(MARKER, `${JSON.stringify({ ...marker, 'bible-journal-app': head }, null, '\t')}\n`);
		console.log(`\nCaught up with the web app at ${head}; ${MARKER} updated.`);
	} else if (marker['bible-journal-app']) {
		const since = marker['bible-journal-app'];
		const log = git('log', '--reverse', '--format=%h %cs %s', `${since}..HEAD`, '--', ...GRAPH_PATHS);
		if (log === '') console.log(`\nNo graph commits in the web app since ${since}.`);
		else {
			console.log(`\nGraph commits in the web app since ${since}, the last caught up with:`);
			for (const line of log.split('\n')) console.log(`  ${line}`);
			console.log('  Once they are dealt with: npm run compare-app -- --caught-up');
		}
	}
}
