// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-replay-rules.ts) on 2026-09-27.
// Only change: "@/lib/" imports made relative. Keep in step with the original rather than editing here.

import { bookPath, compareRanges, rangeKey, type GraphVerseRow } from "./graph-rules";

/**
 * Replay on the Graph screen (v3's item 8.3, design G1d, G7d): the tree drawn
 * again in the order the entries were written, then left complete. Pure -- the
 * screen owns the timer, and `graph-layout.ts`'s `blendLayouts` is what makes
 * each new box grow out of its parent, exactly as opening a book does.
 *
 * **The order is `first_written`**, the earliest writer's-clock reading among
 * the entries citing a range (migration 0038, returned for this item). Ranges
 * sharing one reading were first cited by the same entry, so they arrive
 * together: **a step is an entry's worth of new verses**, never one verse of it.
 */

/** The keys of one range's boxes, top down: testament, category, book, chapter, verse. */
type Path = readonly string[];

/** Every range first cited at one moment -- in practice, by one entry. */
export type ReplayStep = readonly Path[];

/**
 * The replay's steps, oldest first. **The category key is in a path only when
 * the column is drawn** (item 8.6), because whether a box is showing is asked
 * of every key above it, and a column that is not drawn has nothing to close.
 *
 * The readings are compared as text: the database writes a `timestamp` as ISO
 * text with fixed-width fields, which sorts the way the instants do.
 */
export function replaySteps(
  rows: readonly GraphVerseRow[],
  { categories = false }: { categories?: boolean } = {},
): ReplayStep[] {
  const sorted = [...rows].sort(
    (a, b) =>
      (a.firstWritten < b.firstWritten ? -1 : a.firstWritten > b.firstWritten ? 1 : 0) ||
      compareRanges(a, b),
  );

  const steps: Path[][] = [];
  let moment: string | null = null;
  for (const row of sorted) {
    if (row.firstWritten !== moment) {
      steps.push([]);
      moment = row.firstWritten;
    }
    const [testament, category, book] = bookPath(row.book);
    steps.at(-1)!.push([
      testament,
      ...(categories ? [category] : []),
      book,
      `${row.book}|${row.chapter}`,
      rangeKey(row),
    ]);
  }
  return steps;
}

/** Every box the replay has drawn by the end of step `index` -- what `keepOnly` keeps. */
export function revealedThrough(steps: readonly ReplayStep[], index: number): Set<string> {
  const revealed = new Set<string>();
  steps.slice(0, index + 1).forEach((step) => step.forEach((path) => path.forEach((key) => revealed.add(key))));
  return revealed;
}

/** The boxes of a path that show: each one whose every box above it is open. */
function showing(path: Path, isOpen: (key: string) => boolean): Path {
  const firstClosed = path.findIndex((key) => !isOpen(key));
  return firstClosed === -1 ? path : path.slice(0, firstClosed + 1);
}

/**
 * The steps that put a box on screen that was not there, in order.
 *
 * **A step that only adds to something closed is skipped**: a new verse of a
 * closed book draws nothing, and the graph opens with every book closed, so a
 * replay that waited on each of them would spend most of its time on a screen
 * that is not changing. The replay plays what is open -- Expand before it to
 * watch the verses arrive.
 */
export function shownSteps(steps: readonly ReplayStep[], isOpen: (key: string) => boolean): number[] {
  const revealed = new Set<string>();
  const shown: number[] = [];
  steps.forEach((step, index) => {
    if (step.some((path) => showing(path, isOpen).some((key) => !revealed.has(key)))) shown.push(index);
    step.forEach((path) => path.forEach((key) => revealed.add(key)));
  });
  return shown;
}

/**
 * The next step after `after` that shows something, or null when the replay is
 * done. **Asked afresh at every step**, so opening a book part-way through
 * plays its verses from there on rather than skipping them.
 */
export function nextShownStep(
  steps: readonly ReplayStep[],
  after: number,
  isOpen: (key: string) => boolean,
): number | null {
  return shownSteps(steps, isOpen).find((index) => index > after) ?? null;
}

/**
 * About how long a whole replay takes, however big the journal. **No speed
 * control** (design G7d), so this is the one answer: long enough to watch, and
 * short enough that a reader does not reach for the button to stop it.
 */
const REPLAY_MS = 6000;
/** Faster than this and a box has not finished growing before the next starts. */
const FASTEST_STEP_MS = 40;
/** Slower than this and a journal of five entries drags. */
const SLOWEST_STEP_MS = 400;

/** How long each step is held, given how many there are to show. */
export function replayStepMs(stepCount: number): number {
  const even = REPLAY_MS / Math.max(1, stepCount);
  return Math.round(Math.min(SLOWEST_STEP_MS, Math.max(FASTEST_STEP_MS, even)));
}
