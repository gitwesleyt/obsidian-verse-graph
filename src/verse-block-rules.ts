// Copied from Scripture Thread (obsidian-scripture-thread/src/verse-block-rules.ts) on 2026-09-28.
// Keep in step with the original rather than editing here.

/**
 * Which lines of a note are in a verse block. `spec/verse-blocks.md` is the
 * rule in words.
 *
 * A block is a run of non-blank lines holding a verse link, closed by a blank
 * line. Nothing is stored: "closed" is the blank line, and the one thing that
 * isn't in the text -- the empty line the first Enter makes -- comes from where
 * the caret is.
 *
 * No imports, so Verse Graph can copy this file as it copies `verse-rules.ts`.
 * What counts as a verse link is passed in as `opensBlock`.
 */

export type VerseBlock = {
	/** 0-based, inclusive. */
	startLine: number;
	endLine: number;
};

export type LineRole = 'only' | 'start' | 'middle' | 'end';

export type LineSource = {
	lineCount: number;
	/** 0-based. */
	line(index: number): string;
};

const HEADING = /^\s{0,3}#{1,6}(\s|$)/;
const CODE_FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const MATH_FENCE = /^\s{0,3}\$\$/;
const ONE_LINE_MATH = /^\s{0,3}\$\$.*\S.*\$\$\s*$/;
const CALLOUT_START = /^\s{0,3}>\s*\[!/;
const QUOTE = /^\s{0,3}>/;
const EMBED_ONLY = /^\s*(!\[\[[^\]\n]*\]\]|!\[[^\]\n]*\]\([^)\n]*\))\s*$/;

/** Every verse block in the note, top to bottom. */
export function verseBlocks(
	lines: LineSource | readonly string[],
	opensBlock: (line: string) => boolean,
	caretLine: number | null = null,
): VerseBlock[] {
	const source = asSource(lines);
	return growToCaret(runsHoldingALink(source, opensBlock), source, caretLine);
}

/** Where `line` sits in `block`, for drawing its edges. */
export function lineRole(block: VerseBlock, line: number): LineRole {
	const isStart = line === block.startLine;
	const isEnd = line === block.endLine;
	if (isStart && isEnd) return 'only';
	if (isStart) return 'start';
	return isEnd ? 'end' : 'middle';
}

/** The block holding `line`, if any. */
export function blockAt(blocks: readonly VerseBlock[], line: number): VerseBlock | undefined {
	return blocks.find((block) => block.startLine <= line && line <= block.endLine);
}

function runsHoldingALink(source: LineSource, opensBlock: (line: string) => boolean): VerseBlock[] {
	const blocks: VerseBlock[] = [];
	const outside = linesNeverBoxed(source);
	let runStart: number | null = null;
	let runHasLink = false;

	const endRun = (lastLine: number) => {
		if (runStart !== null && runHasLink) blocks.push({ startLine: runStart, endLine: lastLine });
		runStart = null;
		runHasLink = false;
	};

	for (let index = 0; index < source.lineCount; index++) {
		const text = source.line(index);
		if (outside[index] || isBlank(text)) {
			endRun(index - 1);
			continue;
		}
		runStart ??= index;
		if (!runHasLink && opensBlock(text)) runHasLink = true;
	}
	endRun(source.lineCount - 1);

	return blocks;
}

/**
 * The first Enter: an empty caret line directly under a block is in it, so the
 * box grows the moment the line exists. Separate so an editor can keep the
 * blocks while only the caret moves.
 */
export function growToCaret(
	blocks: VerseBlock[],
	lines: LineSource | readonly string[],
	caretLine: number | null,
): VerseBlock[] {
	const source = asSource(lines);
	if (caretLine === null || caretLine >= source.lineCount || !isBlank(source.line(caretLine))) {
		return blocks;
	}
	return blocks.map((block) =>
		block.endLine === caretLine - 1 ? { ...block, endLine: caretLine } : block,
	);
}

/**
 * Frontmatter, code, math, callouts, embed-only lines and headings. Live Preview
 * draws most of them as widgets that hide their lines, which would leave a box
 * running into one open at the bottom, so each ends a run instead.
 */
function linesNeverBoxed(source: LineSource): boolean[] {
	const outside = new Array<boolean>(source.lineCount).fill(false);
	let index = markFrontmatter(source, outside);
	let fence: 'code' | 'math' | null = null;
	let inCallout = false;

	for (; index < source.lineCount; index++) {
		const text = source.line(index);

		if (fence) {
			outside[index] = true;
			if (closesFence(text, fence)) fence = null;
			continue;
		}

		fence = opensFence(text);
		inCallout = CALLOUT_START.test(text) || (inCallout && QUOTE.test(text));
		outside[index] =
			fence !== null ||
			inCallout ||
			ONE_LINE_MATH.test(text) ||
			HEADING.test(text) ||
			EMBED_ONLY.test(text);
	}
	return outside;
}

function markFrontmatter(source: LineSource, outside: boolean[]): number {
	if (source.lineCount === 0 || source.line(0).trim() !== '---') return 0;
	for (let index = 1; index < source.lineCount; index++) {
		if (source.line(index).trim() === '---') {
			outside.fill(true, 0, index + 1);
			return index + 1;
		}
	}
	return 0;
}

function opensFence(text: string): 'code' | 'math' | null {
	if (CODE_FENCE.test(text)) return 'code';
	if (MATH_FENCE.test(text) && !ONE_LINE_MATH.test(text)) return 'math';
	return null;
}

function closesFence(text: string, fence: 'code' | 'math'): boolean {
	return fence === 'code' ? CODE_FENCE.test(text) : MATH_FENCE.test(text);
}

function asSource(lines: LineSource | readonly string[]): LineSource {
	if (!Array.isArray(lines)) return lines as LineSource;
	const array = lines as readonly string[];
	return { lineCount: array.length, line: (index) => array[index] ?? '' };
}

function isBlank(text: string): boolean {
	return text.trim() === '';
}
