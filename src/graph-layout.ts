// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-layout.ts) on 2026-09-27.
// Only change: "@/lib/" imports made relative. Keep in step with the original rather than editing here.

import { bookPath, type GraphBookNode, type GraphTestamentNode } from "./graph-rules";

/**
 * Where every node on the Graph screen sits (v3's item 8.2). Pure -- rows in,
 * positions out.
 *
 * **The design's tree is a dendrogram in fixed columns**, the simplest tree
 * layout there is: Testament, Book, Chapter and Verse each at a fixed x, the
 * verses stacked at a fixed pitch in canonical order, and every parent level
 * with the middle of its own children (measured off the mock: Psalm 23 sits
 * halfway between 23:1 and 23:4). A fifth column holds the entries, stacked
 * from the top at the same pitch. **With the *Literary categories* setting on
 * (item 8.6) a column of categories sits between Testament and Book** and
 * everything to its right moves over. `v3/decisions/8.1-graph-view-spike.md` priced
 * the libraries that do this and found the twenty lines below cheaper than all
 * of them.
 *
 * **Every number here is in `rem`**, never pixels, so the whole canvas grows
 * with the reader's text size exactly as the words inside the nodes do
 * (`CORE-SPEC.md`, *Styling*). The screen multiplies by the root font size
 * only where it has to talk to the pan-and-zoom library, which works in
 * pixels.
 */

export type GraphColumn = "testament" | "category" | "book" | "chapter" | "verse" | "entry";

export type GraphColumns = Record<GraphColumn, { x: number; width: number }>;

/** How wide each column is, in rem. */
const COLUMN_WIDTHS: Record<GraphColumn, number> = {
  // Wide enough for "New Testament", its ▾ and its count, at the design's weight.
  testament: 11.5,
  // Wide enough for "Wisdom and Poetry", its ▾ and a three-figure count.
  category: 13,
  book: 9.5,
  chapter: 10,
  verse: 11,
  // Wide enough for a date, the verse count and about forty characters of
  // title -- the app owner's call on the preview, where 17rem cut most real
  // titles short. Longer ones still end in an ellipsis.
  entry: 26,
};

/** The room between two tree columns, where their lines curve. */
const TREE_GAP = 2.5;
/** The room before the entries column, a little wider -- item 8.2's spacing. */
const ENTRY_GAP = 3;

/** Left to right, with the categories column (item 8.6). */
export const GRAPH_COLUMN_ORDER: readonly GraphColumn[] = [
  "testament",
  "category",
  "book",
  "chapter",
  "verse",
  "entry",
];

/**
 * Left edge and width of each column, in rem, laid side by side in order.
 * **Without categories the column is skipped** and given no width where the
 * book column starts -- a place nothing is ever drawn, kept so every column
 * always has an answer.
 */
export function graphColumns(withCategories: boolean): GraphColumns {
  const columns = {} as GraphColumns;
  let x = 0;
  for (const column of GRAPH_COLUMN_ORDER) {
    if (column === "category" && !withCategories) continue;
    if (column === "entry") x += ENTRY_GAP - TREE_GAP;
    columns[column] = { x, width: COLUMN_WIDTHS[column] };
    x += COLUMN_WIDTHS[column] + TREE_GAP;
  }
  if (!withCategories) columns.category = { x: columns.book.x, width: 0 };
  return columns;
}

/** The columns as the graph draws them with the setting off, which is the default. */
export const GRAPH_COLUMNS: GraphColumns = graphColumns(false);

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
function widthOf(columns: GraphColumns): number {
  return columns.entry.x + columns.entry.width;
}

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
  /** Where each column is -- which depends on whether categories are drawn. */
  columns: GraphColumns;
  /** How wide everything is, in rem, entries column included. */
  width: number;
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

  /** A book and whatever of it is open; returns where the book sits. */
  function placeBook(book: GraphBookNode, parentKey: string): number {
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

    nodes.push({ key: book.key, column: "book", parentKey, y });
    return y;
  }

  /** A run of books under one parent; returns the middle of them. */
  function placeBooks(books: readonly GraphBookNode[], parentKey: string): number {
    const ys = books.map((book) => placeBook(book, parentKey));
    return middle(ys[0], ys.at(-1)!);
  }

  for (const testament of tree) {
    // A closed testament is one row, like a closed book.
    if (!isOpen(testament.key)) {
      nodes.push({ key: testament.key, column: "testament", parentKey: null, y: rowTop(row++) });
      continue;
    }

    let y: number;
    if (testament.categories) {
      // A category opens and closes like a book (item 8.6).
      const categoryYs = testament.categories.map((category) => {
        const categoryY = isOpen(category.key)
          ? placeBooks(category.books, category.key)
          : rowTop(row++);
        nodes.push({ key: category.key, column: "category", parentKey: testament.key, y: categoryY });
        return categoryY;
      });
      y = middle(categoryYs[0], categoryYs.at(-1)!);
    } else {
      y = placeBooks(testament.books, testament.key);
    }

    nodes.push({ key: testament.key, column: "testament", parentKey: null, y });
  }

  const columns = graphColumns(tree.some((testament) => testament.categories !== null));
  return {
    nodes,
    byKey: new Map(nodes.map((node) => [node.key, node])),
    treeHeight: rowTop(row),
    columns,
    width: widthOf(columns),
  };
}

/**
 * The box a line to or from a verse range lands on: the range itself if it is
 * showing, else its chapter, else its book, else its category, else its
 * testament -- so a line to an entry still says *somewhere in Psalms* while
 * Psalms is closed, rather than vanishing.
 */
export function anchorFor(
  layout: GraphLayout,
  range: { book: string; chapter: number },
  rangeKey: string,
): PlacedNode | undefined {
  const upwards = [rangeKey, `${range.book}|${range.chapter}`, ...bookPath(range.book).reverse()];
  for (const key of upwards) {
    const node = layout.byKey.get(key);
    if (node) return node;
  }
  return undefined;
}

/**
 * The line from the right edge of one box to the left edge of another, as the
 * design draws it: a cubic curve leaving and arriving horizontally.
 */
export function curveBetween(
  from: { column: GraphColumn; y: number },
  to: { column: GraphColumn; y: number },
  columns: GraphColumns = GRAPH_COLUMNS,
): string {
  const x1 = columns[from.column].x + columns[from.column].width;
  const x2 = columns[to.column].x;
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

/** A leaving node fainter than this cannot be seen, and is dropped from the blend. */
const GONE = 0.02;

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
      const opacity = was.opacity * (1 - t);
      // Faded to nothing is gone, whether or not its slide finished. A
      // replay's steps (item 8.3) come faster than a slide, so a node waiting
      // for `t` to reach 1 was carried, invisible, to the end of the replay.
      if (opacity < GONE) continue;
      const home = ancestorIn(was.parentKey, (k) => from.get(k)?.parentKey ?? to.byKey.get(k)?.parentKey ?? null, to.byKey);
      blend.set(key, {
        ...was,
        y: lerp(was.y, home?.y ?? was.y),
        opacity,
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

/**
 * `easeOut` as a CSS timing function, for a movement the browser animates that
 * has to keep pace with one this file blends -- the view following the
 * selection while *Hide dimmed* closes the tree up round it (item 8.7).
 */
export const EASE_OUT_CSS = "cubic-bezier(0.33, 1, 0.68, 1)";

/** How long an open or a close takes: noticeable, never in the way. */
export const OPEN_CLOSE_MS = 220;
