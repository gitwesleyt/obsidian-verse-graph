// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-layout.ts) on 2026-09-26.
// Only change: "@/lib/" imports made relative. Keep in step with the original rather than editing here.

import { testamentOf, type GraphTestamentNode } from "./graph-rules";

/**
 * Where every node on the Graph screen sits (v3's item 8.2). Pure -- rows in,
 * positions out.
 *
 * **The design's tree is a dendrogram in fixed columns**, the simplest tree
 * layout there is: Testament, Book, Chapter and Verse each at a fixed x, the
 * verses stacked at a fixed pitch in canonical order, and every parent level
 * with the middle of its own children (measured off the mock: Psalm 23 sits
 * halfway between 23:1 and 23:4). A fifth column holds the entries, stacked
 * from the top at the same pitch. `v3/decisions/8.1-graph-view-spike.md` priced
 * the libraries that do this and found the twenty lines below cheaper than all
 * of them.
 *
 * **Every number here is in `rem`**, never pixels, so the whole canvas grows
 * with the reader's text size exactly as the words inside the nodes do
 * (`CORE-SPEC.md`, *Styling*). The screen multiplies by the root font size
 * only where it has to talk to the pan-and-zoom library, which works in
 * pixels.
 */

export type GraphColumn = "testament" | "book" | "chapter" | "verse" | "entry";

/** Left edge and width of each column, in rem. */
export const GRAPH_COLUMNS: Record<GraphColumn, { x: number; width: number }> = {
  // Wide enough for "New Testament", its ▾ and its count, at the design's weight.
  testament: { x: 0, width: 11.5 },
  book: { x: 14, width: 9.5 },
  chapter: { x: 26, width: 10 },
  verse: { x: 38.5, width: 11 },
  // Wide enough for a date, the verse count and about forty characters of
  // title -- the app owner's call on the preview, where 17rem cut most real
  // titles short. Longer ones still end in an ellipsis.
  entry: { x: 52.5, width: 26 },
};

export const GRAPH_COLUMN_ORDER: readonly GraphColumn[] = [
  "testament",
  "book",
  "chapter",
  "verse",
  "entry",
];

/** One row of the stack: the design's 38px at a 16px root. */
export const GRAPH_ROW_PITCH = 2.375;

/** How tall a node is: the design's 30px. The rest of the pitch is the gap. */
export const GRAPH_NODE_HEIGHT = 1.875;

/**
 * Room above the first row for the column headings, so a heading never sits
 * on a node.
 */
export const GRAPH_TOP = 2.5;

/** The width of everything, entries column included. */
export const GRAPH_WIDTH = GRAPH_COLUMNS.entry.x + GRAPH_COLUMNS.entry.width;

export type PlacedNode = {
  key: string;
  column: Exclude<GraphColumn, "entry">;
  /** The node one column to the left; null for a testament. */
  parentKey: string | null;
  /** Top edge, in rem. */
  y: number;
};

export type GraphLayout = {
  nodes: PlacedNode[];
  /** By key, for drawing lines between nodes. */
  byKey: Map<string, PlacedNode>;
  /** How tall the tree is, in rem, headings included. */
  treeHeight: number;
};

/** The top edge of row `index` in either stacked column. */
export function rowTop(index: number): number {
  return GRAPH_TOP + index * GRAPH_ROW_PITCH;
}

/**
 * The top edge of row `index` of the entries column. **Beside the selected
 * verse when there is one** -- `besideY` is that verse's top edge, so the
 * first entry sits level with it and the rest run down from there -- and from
 * the top of the canvas when there is not. The app owner's call on the
 * preview: a verse deep in an open book had its entries at the top of the
 * canvas, a long scroll away from the box that was clicked.
 */
export function entryRowTop(index: number, besideY?: number): number {
  return (besideY ?? rowTop(0)) + index * GRAPH_ROW_PITCH;
}

/** The middle of a stack of children, given the first and the last. */
function middle(first: number, last: number): number {
  return (first + last) / 2;
}

/**
 * Whether a testament, a book or a chapter is open (the app owner's calls on
 * the preview):
 * a closed one takes one row of its own and hides everything under it. Left
 * out, everything is open -- which is what the tests of the arithmetic below
 * want, and nothing else.
 */
export type IsOpen = (key: string) => boolean;

const ALL_OPEN: IsOpen = () => true;

export function layoutGraph(
  tree: readonly GraphTestamentNode[],
  isOpen: IsOpen = ALL_OPEN,
): GraphLayout {
  const nodes: PlacedNode[] = [];
  let row = 0;

  for (const testament of tree) {
    // A closed testament is one row, like a closed book.
    if (!isOpen(testament.key)) {
      nodes.push({ key: testament.key, column: "testament", parentKey: null, y: rowTop(row++) });
      continue;
    }

    const bookYs: number[] = [];

    for (const book of testament.books) {
      let y: number;

      if (!isOpen(book.key)) {
        // Closed: a row of its own, and nothing drawn to its right.
        y = rowTop(row++);
      } else {
        const chapterYs: number[] = [];

        for (const chapter of book.chapters) {
          let chapterY: number;

          if (!isOpen(chapter.key)) {
            chapterY = rowTop(row++);
          } else {
            const verseYs: number[] = [];
            for (const verse of chapter.verses) {
              const verseY = rowTop(row++);
              verseYs.push(verseY);
              nodes.push({ key: verse.key, column: "verse", parentKey: chapter.key, y: verseY });
            }
            chapterY = middle(verseYs[0], verseYs.at(-1)!);
          }

          chapterYs.push(chapterY);
          nodes.push({ key: chapter.key, column: "chapter", parentKey: book.key, y: chapterY });
        }

        y = middle(chapterYs[0], chapterYs.at(-1)!);
      }

      bookYs.push(y);
      nodes.push({ key: book.key, column: "book", parentKey: testament.key, y });
    }

    nodes.push({
      key: testament.key,
      column: "testament",
      parentKey: null,
      y: middle(bookYs[0], bookYs.at(-1)!),
    });
  }

  return {
    nodes,
    byKey: new Map(nodes.map((node) => [node.key, node])),
    treeHeight: rowTop(row),
  };
}

/**
 * The box a line to or from a verse range lands on: the range itself if it is
 * showing, else its chapter, else its book, else its testament -- so a line
 * to an entry still says
 * *somewhere in Psalms* while Psalms is closed, rather than vanishing.
 */
export function anchorFor(
  layout: GraphLayout,
  range: { book: string; chapter: number },
  rangeKey: string,
): PlacedNode | undefined {
  return (
    layout.byKey.get(rangeKey) ??
    layout.byKey.get(`${range.book}|${range.chapter}`) ??
    layout.byKey.get(range.book) ??
    layout.byKey.get(testamentOf(range.book))
  );
}

/**
 * The line from the right edge of one box to the left edge of another, as the
 * design draws it: a cubic curve leaving and arriving horizontally.
 */
export function curveBetween(
  from: { column: GraphColumn; y: number },
  to: { column: GraphColumn; y: number },
): string {
  const x1 = GRAPH_COLUMNS[from.column].x + GRAPH_COLUMNS[from.column].width;
  const x2 = GRAPH_COLUMNS[to.column].x;
  const y1 = from.y + GRAPH_NODE_HEIGHT / 2;
  const y2 = to.y + GRAPH_NODE_HEIGHT / 2;
  const mid = (x1 + x2) / 2;
  return `M${x1} ${y1}C${mid} ${y1},${mid} ${y2},${x2} ${y2}`;
}

/**
 * One node part-way through opening or closing a book or chapter -- the app
 * owner found the instant open and close jarring. `opacity` is 0 to 1;
 * `leaving` marks a node that is sliding back into its parent to vanish.
 */
export type BlendedNode = PlacedNode & { opacity: number; leaving: boolean };

export type Blend = Map<string, BlendedNode>;

/** A layout at rest, as a blend: every node where it is, fully showing. */
export function restingBlend(layout: GraphLayout): Blend {
  return new Map(
    layout.nodes.map((node) => [node.key, { ...node, opacity: 1, leaving: false }]),
  );
}

/**
 * Where everything is, `t` of the way (0 to 1, already eased) from what was
 * on screen to a new layout.
 *
 * **Everything moves, lines included**, which is why this is arithmetic on the
 * layout rather than a CSS transition: the lines are drawn from these same
 * positions, so a line cannot arrive before the box it runs to.
 *
 * - A node in both slides from where it was to where it is going.
 * - **A node appearing grows out of its nearest ancestor that was already on
 *   screen** -- a chapter out of the book just opened -- fading in.
 * - **A node disappearing slides back into its nearest ancestor still on
 *   screen**, fading out, and is gone once `t` reaches 1.
 *
 * `from` is whatever was being drawn, which may itself be part-way through
 * another move: opening a second book before the first has finished starts
 * from where the boxes actually are, not from where they were headed.
 */
export function blendLayouts(from: Blend, to: GraphLayout, t: number): Blend {
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const blend: Blend = new Map();

  // Walks up from a key until one is found in `where`.
  const ancestorIn = <T,>(
    key: string | null,
    parentOf: (key: string) => string | null,
    where: Map<string, T>,
  ): T | undefined => {
    for (let k = key; k !== null; k = parentOf(k)) {
      const found = where.get(k);
      if (found) return found;
    }
    return undefined;
  };

  for (const node of to.nodes) {
    const was = from.get(node.key);
    if (was && !was.leaving) {
      blend.set(node.key, { ...node, y: lerp(was.y, node.y), opacity: lerp(was.opacity, 1), leaving: false });
      continue;
    }
    const origin =
      was ?? ancestorIn(node.parentKey, (k) => to.byKey.get(k)?.parentKey ?? from.get(k)?.parentKey ?? null, from);
    const startY = origin?.y ?? node.y;
    const startOpacity = was ? was.opacity : 0;
    blend.set(node.key, { ...node, y: lerp(startY, node.y), opacity: lerp(startOpacity, 1), leaving: false });
  }

  if (t < 1) {
    for (const [key, was] of from) {
      if (to.byKey.has(key)) continue;
      const home = ancestorIn(was.parentKey, (k) => from.get(k)?.parentKey ?? to.byKey.get(k)?.parentKey ?? null, to.byKey);
      blend.set(key, {
        ...was,
        y: lerp(was.y, home?.y ?? was.y),
        opacity: was.opacity * (1 - t),
        leaving: true,
      });
    }
  }

  return blend;
}

/** Quick at first and gentle at the end, like a drawer. */
export function easeOut(t: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
}

/** How long an open or a close takes: noticeable, never in the way. */
export const OPEN_CLOSE_MS = 220;
