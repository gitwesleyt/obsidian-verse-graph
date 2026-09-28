import { blockAt, verseBlocks } from './verse-block-rules';

/** A note cut round the verse block that cites a verse, so the block can be drawn on its own. */
export type NoteAroundBlock = {
	before: string;
	block: string;
	after: string;
};

/**
 * The note split round the verse block holding `citingLine` (0-based), or null
 * when that line is in no block: a heading, a callout, code or the properties.
 * The line cites the verse, so the run of lines holding it is a block, and every
 * run can be taken as opening one.
 */
export function splitAtCitingBlock(text: string, citingLine: number): NoteAroundBlock | null {
	const lines = text.split('\n');
	const block = blockAt(verseBlocks(lines, () => true), citingLine);
	if (!block) return null;
	return {
		before: lines.slice(0, block.startLine).join('\n'),
		block: lines.slice(block.startLine, block.endLine + 1).join('\n'),
		after: lines.slice(block.endLine + 1).join('\n'),
	};
}
