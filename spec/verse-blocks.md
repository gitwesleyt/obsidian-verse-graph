<!-- Copied from Scripture Thread (obsidian-scripture-thread/spec/verse-blocks.md) on 2026-09-28. Keep in step with the original rather than editing here. -->

# Verse blocks

A grey rounded border round the paragraph that holds a Bible reference and the lines typed under
it. Enter grows it to the new line at once; Enter again closes it back over the paragraph above.
Behaviour follows the Bible Journal web app's item 4.1. The rule is `src/verse-block-rules.ts`;
Verse Graph copies this file and that one together.

## What a block is

1. **A verse block is a run of non-blank lines that holds a verse or chapter link.** A link
   counts when `parseBibleLink` accepts its target: `[[Psalms 23 3]]`, `[[John 3 16-18]]`,
   `[[Psalms 23]]`, `[[Matthew 5-7]]`, with or without an alias. `[[Psalms]]`,
   `[[Old Testament]]`, embeds (`![[John 3 16]]`) and plain-text references don't.
2. **The whole run is boxed**, including lines above the link: Reading view draws a paragraph as
   one element, and half of one can't be boxed.
3. **A blank line ends it.** A line of only spaces or tabs is blank.
4. **Never boxed, and each ends a run:** frontmatter, fenced code, `$$` math, callouts, a line
   that is only an embed, and headings. A link in any of them opens nothing. Live Preview draws
   these as widgets that hide their lines, so a box running into one would be left open.
4a. **No boxes inside an embed or a hover preview**, and a verse note's parent link (the
   `[[John 3]]` the converter writes into `John 3 16.md`, as `isParentLink` decides) doesn't open
   a block.

## Enter

5. **The empty line holding the caret, directly under a block, is inside it.** The first Enter
   makes that line, so the box grows the moment it exists, with nothing typed. Only the main
   caret counts, and only when nothing is selected.
6. **When the caret leaves that line and the line is still empty, the block closes.** The second
   Enter does this, as does an arrow key or a tap elsewhere. Typing on the line instead joins it
   to the paragraph, so it stays in. Enter from the line after that is an ordinary new paragraph.
7. **Nothing is stored.** "Closed" is the blank line; the caret's line is where the caret is. The
   plugin never takes the Enter key and never writes note text.

In a list, Enter on an empty bullet only clears the bullet (Obsidian's own behaviour), so closing
a block that ends in a list takes three Enters.

## Drawing

8. **Obsidian's theme only**: a 1px `--background-modifier-border` line (`--background-modifier-border-hover`
   in dark themes, where the plain one is too faint) down both sides of every
   line of the block, the top edge and `--radius-m` corners on the first line, the bottom edge and
   corners on the last. The text doesn't move when a box opens or closes.
9. **Closing animation**: the border settles from `--text-muted` to its resting colour over 320ms
   `ease-out`, on every line of the block at once. `prefers-reduced-motion` removes it. Nothing
   waits for it to finish.

## Examples

`|` marks the caret.

| Note text | Blocks |
|---|---|
| `[[John 3 16\|John 3:16]] is the one.` | line 1 |
| `A thought.` / `[[Psalms 23]] came to mind.` / `And more.` | lines 1–3 |
| `[[John 3 16]] one.` / *(blank)* / `Next paragraph.` | line 1 |
| `[[John 3 16]] one.` / `\|` | lines 1–2 (first Enter) |
| `[[John 3 16]] one.` / *(blank)* / `\|` | line 1 (second Enter: closed) |
| `[[John 3 16]] one.` / `- a point` / `- another` | lines 1–3 |
| `[[John 3 16]] one.` / `## Heading` / `text` | line 1 |
| `[[John 3 16]] one.` / `$$` / `x` / `$$` | line 1 |
| `[[John 3 16]] one.` / `![[Other note]]` | line 1 |
| `> [!note]` / `> [[John 3 16]]` | none |
| `[[John 3]]` as the parent line of `John 3 16.md` | none |
| `[[Psalms]] and [[Old Testament]]` | none |
| `![[John 3 16]]` | none |
| `John 3:16, not yet converted` | none |
| `` ``` `` / `[[John 3 16]]` / `` ``` `` | none |

## Known limits

Filled in by the build (`PLAN.md`, "Verse blocks", session 1): which Live Preview widgets (tables,
callouts, embeds, images, math) break the border, and Reading view sections that Obsidian gives no
section info for. With **Strict line breaks** on, Reading view runs a block's lines into one
paragraph.
