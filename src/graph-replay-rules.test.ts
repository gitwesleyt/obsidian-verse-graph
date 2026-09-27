// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-replay-rules.test.ts) on 2026-09-27.
// Unchanged. Keep in step with the original rather than editing here.

import { describe, expect, it } from "vitest";

import { buildGraphTree, keepOnly, type GraphVerseRow } from "./graph-rules";
import {
  nextShownStep,
  replayStepMs,
  replaySteps,
  revealedThrough,
  shownSteps,
} from "./graph-replay-rules";

function row(book: string, chapter: number, first: number | null, firstWritten: string): GraphVerseRow {
  return { book, chapter, first, last: first, entryCount: 1, firstWritten };
}

// Three entries: Romans 8:28 first, then Psalm 23:1 and 23:4 together, then John 3:16.
const romans = row("Romans", 8, 28, "2024-01-05T09:00:00");
const psalm1 = row("Psalms", 23, 1, "2024-02-10T21:15:00");
const psalm4 = row("Psalms", 23, 4, "2024-02-10T21:15:00");
const john = row("John", 3, 16, "2025-03-01T07:30:00");
const rows = [john, psalm4, romans, psalm1];

const everythingOpen = () => true;
const nothingOpenBelowTestaments = (key: string) => key === "old" || key === "new";

describe("replaySteps", () => {
  it("puts the oldest first, and one entry's verses in one step", () => {
    const steps = replaySteps(rows);
    expect(steps.map((step) => step.map((path) => path.at(-1)))).toEqual([
      ["Romans|8|28|28"],
      ["Psalms|23|1|1", "Psalms|23|4|4"],
      ["John|3|16|16"],
    ]);
  });

  it("walks each range's path from its testament down", () => {
    expect(replaySteps([romans])[0][0]).toEqual(["new", "Romans", "Romans|8", "Romans|8|28|28"]);
  });

  it("takes the category into the path only when the column is drawn (item 8.6)", () => {
    expect(replaySteps([romans], { categories: true })[0][0]).toEqual([
      "new",
      "category:pauline",
      "Romans",
      "Romans|8",
      "Romans|8|28|28",
    ]);
  });

  it("has no steps for an empty graph", () => {
    expect(replaySteps([])).toEqual([]);
  });
});

describe("revealedThrough", () => {
  it("is every box of every step so far", () => {
    const revealed = revealedThrough(replaySteps(rows), 1);
    expect([...revealed].sort()).toEqual(
      ["new", "Romans", "Romans|8", "Romans|8|28|28", "old", "Psalms", "Psalms|23", "Psalms|23|1|1", "Psalms|23|4|4"].sort(),
    );
  });

  it("finished, is the whole tree -- so the last step draws the graph complete", () => {
    const tree = buildGraphTree(rows);
    const steps = replaySteps(rows);
    expect(keepOnly(tree, revealedThrough(steps, steps.length - 1))).toEqual(tree);
  });
});

describe("shownSteps", () => {
  it("shows every step when everything is open", () => {
    expect(shownSteps(replaySteps(rows), everythingOpen)).toEqual([0, 1, 2]);
  });

  it("skips a step that only adds to a closed book", () => {
    const steps = replaySteps([romans, row("Romans", 5, 1, "2024-06-01T00:00:00"), john]);
    // Books closed: Romans appears, its second chapter draws nothing, John appears.
    expect(shownSteps(steps, nothingOpenBelowTestaments)).toEqual([0, 2]);
    // Romans open: its new chapter is a box of its own.
    expect(shownSteps(steps, (key) => nothingOpenBelowTestaments(key) || key === "Romans")).toEqual([0, 1, 2]);
  });

  it("does not show a closed testament's books arriving", () => {
    const steps = replaySteps(rows);
    // Only the New Testament open: the Psalms step brings the Old Testament's
    // box, and nothing inside it.
    expect(shownSteps(steps, (key) => key === "new")).toEqual([0, 1, 2]);
    expect(shownSteps(replaySteps([romans, john]), () => false)).toEqual([0]);
  });
});

describe("nextShownStep", () => {
  it("is the next step that draws something, or null at the end", () => {
    const steps = replaySteps([romans, row("Romans", 5, 1, "2024-06-01T00:00:00"), john]);
    expect(nextShownStep(steps, -1, nothingOpenBelowTestaments)).toBe(0);
    expect(nextShownStep(steps, 0, nothingOpenBelowTestaments)).toBe(2);
    expect(nextShownStep(steps, 2, nothingOpenBelowTestaments)).toBeNull();
  });

  it("plays a book opened part-way through from there on", () => {
    const steps = replaySteps([romans, row("Romans", 5, 1, "2024-06-01T00:00:00"), john]);
    expect(nextShownStep(steps, 0, (key) => nothingOpenBelowTestaments(key) || key === "Romans")).toBe(1);
  });
});

describe("replayStepMs", () => {
  it("spreads a middling journal over about six seconds", () => {
    expect(replayStepMs(30)).toBe(200);
  });

  it("never drags a small journal or races a large one", () => {
    expect(replayStepMs(1)).toBe(400);
    expect(replayStepMs(0)).toBe(400);
    expect(replayStepMs(5000)).toBe(40);
  });
});
