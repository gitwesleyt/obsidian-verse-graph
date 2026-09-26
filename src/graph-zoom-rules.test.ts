// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-zoom-rules.test.ts) on 2026-09-26.
// Unchanged. Keep in step with the original rather than editing here.

import { describe, expect, it } from "vitest";

import {
  FIT_MARGIN,
  KEEP_IN_VIEW,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  bringIntoView,
  centerView,
  clampZoom,
  fitView,
  keepInView,
  nextZoomStep,
  OPENING_ZOOM,
  openingView,
  pinchTo,
  zoomAt,
  WHEEL_MAX_STEP,
  wheelIntent,
  wheelPan,
  wheelZoom,
  zoomDelta,
  zoomPercent,
} from "./graph-zoom-rules";

describe("the zoom range", () => {
  it("is 20% to 200%, 10% a press (the app owner's floor and step)", () => {
    expect(MIN_ZOOM).toBe(0.2);
    expect(MAX_ZOOM).toBe(2);
    expect(ZOOM_STEP).toBe(0.1);
  });
});

describe("nextZoomStep", () => {
  it("moves 10% either way from a round number", () => {
    expect(nextZoomStep(1, "in")).toBe(1.1);
    expect(nextZoomStep(1, "out")).toBe(0.9);
    expect(nextZoomStep(0.8, "in")).toBe(0.9);
  });

  it("goes to the next round 10% from between two", () => {
    expect(nextZoomStep(0.87, "in")).toBe(0.9);
    expect(nextZoomStep(0.87, "out")).toBe(0.8);
  });

  it("stops at the ends", () => {
    expect(nextZoomStep(2, "in")).toBe(2);
    expect(nextZoomStep(0.2, "out")).toBe(0.2);
    expect(nextZoomStep(0.3, "out")).toBe(0.2);
    expect(nextZoomStep(1.95, "in")).toBe(2);
  });

  it("treats a step reached through floating point as that step", () => {
    expect(nextZoomStep(0.8000001, "in")).toBe(0.9);
    expect(nextZoomStep(0.7999999, "out")).toBe(0.7);
  });

  it("never hands back a floating-point tail", () => {
    let scale = 0.2;
    for (let i = 0; i < 18; i++) scale = nextZoomStep(scale, "in");
    expect(scale).toBe(2);
    expect(zoomPercent(nextZoomStep(0.2 + 0.1, "in"))).toBe("40%");
  });
});

describe("clampZoom and zoomPercent", () => {
  it("keeps a zoom inside the range", () => {
    expect(clampZoom(5)).toBe(2);
    expect(clampZoom(0.1)).toBe(0.2);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it("writes a whole percentage", () => {
    expect(zoomPercent(0.853)).toBe("85%");
  });
});

describe("fitView", () => {
  it("fits a small graph and centres it", () => {
    const { scale, pan } = fitView({ width: 500, height: 200 }, { width: 1048, height: 448 });
    expect(scale).toBe(2);
    // Centred: (1048 - 1000) / 2 = 24 on screen, 12 unscaled.
    expect(pan.x).toBe(12);
    expect(pan.y * scale).toBe((448 - 400) / 2);
  });

  it("shows a graph whole as far down as 20%", () => {
    // Too tall for the old 40% floor, short enough to fit whole above 20%.
    const { scale } = fitView({ width: 1000, height: 3000 }, { width: 1200, height: 800 });
    expect(scale).toBeGreaterThan(0.2);
    expect(scale).toBeLessThan(0.4);
  });

  it("never goes below 20%, and pins a tall graph to the top", () => {
    const { scale, pan } = fitView({ width: 1000, height: 11000 }, { width: 1200, height: 800 });
    expect(scale).toBe(0.2);
    expect(pan.y * scale).toBe(FIT_MARGIN);
  });
});

describe("keepInView", () => {
  const content = { width: 1000, height: 1000 };
  const viewport = { width: 800, height: 600 };

  it("leaves a graph that is on screen alone", () => {
    expect(keepInView({ x: 0, y: 0 }, 1, content, viewport)).toEqual({ x: 0, y: 0 });
  });

  it("brings back a graph dragged off the left, leaving a strip showing", () => {
    const pan = keepInView({ x: -5000, y: 0 }, 1, content, viewport);
    // The right edge of the graph is KEEP_IN_VIEW from the left of the screen.
    expect(pan.x + content.width).toBe(KEEP_IN_VIEW);
  });

  it("brings back a graph dragged off the bottom", () => {
    const pan = keepInView({ x: 0, y: 5000 }, 1, content, viewport);
    expect(pan.y).toBe(viewport.height - KEEP_IN_VIEW);
  });

  it("works in unscaled pixels at any zoom", () => {
    const pan = keepInView({ x: -5000, y: 0 }, 0.5, content, viewport);
    expect(0.5 * (pan.x + content.width)).toBe(KEEP_IN_VIEW);
  });
});

describe("bringIntoView", () => {
  const viewport = { width: 800, height: 600 };
  const box = { x: 1000, y: 100, width: 100, height: 30 };

  it("moves just far enough to show a box off the right", () => {
    const pan = bringIntoView({ x: 0, y: 0 }, 1, box, viewport);
    expect(pan.x + box.x + box.width).toBe(viewport.width - FIT_MARGIN);
    expect(pan.y).toBe(0);
  });

  it("does not move for a box already on screen", () => {
    expect(bringIntoView({ x: -500, y: 0 }, 1, box, viewport)).toEqual({ x: -500, y: 0 });
  });
});

describe("keeping clear of the toolbar", () => {
  it("fits into the room below a toolbar at the top", () => {
    const inset = { top: 60, bottom: 0 };
    const { scale, pan } = fitView({ width: 500, height: 100 }, { width: 1048, height: 448 }, inset);
    // Centred in the 388px under the toolbar, not in the whole 448.
    expect(pan.y * scale).toBe(60 + (388 - 100 * scale) / 2);
  });

  it("opens a big journal below the toolbar", () => {
    const { scale, pan } = openingView(
      { width: 1100, height: 11000 },
      { width: 1200, height: 700 },
      { top: 60, bottom: 0 },
    );
    expect(pan.y * scale).toBe(60 + FIT_MARGIN);
  });
});

describe("openingView", () => {
  it("fits a graph that fits at a readable size", () => {
    // 1100 wide in 1048 less the margins fits below 100%, under the cap.
    const content = { width: 1100, height: 300 };
    const viewport = { width: 1048, height: 448 };
    const fit = fitView(content, viewport);
    expect(fit.scale).toBeLessThan(1);
    expect(openingView(content, viewport)).toEqual(fit);
  });

  it("opens a small graph at 100%, centred, not blown up to 200%", () => {
    const content = { width: 500, height: 200 };
    const viewport = { width: 1048, height: 448 };
    const { scale, pan } = openingView(content, viewport);
    expect(fitView(content, viewport).scale).toBe(2);
    expect(scale).toBe(1);
    expect(pan.x).toBe((1048 - 500) / 2);
  });

  it("opens a big journal at 80% from its top-left corner, not at Fit", () => {
    const { scale, pan } = openingView({ width: 1100, height: 11000 }, { width: 390, height: 700 });
    expect(scale).toBe(OPENING_ZOOM);
    expect(pan.x * scale).toBe(FIT_MARGIN);
    expect(pan.y * scale).toBe(FIT_MARGIN);
  });
});

describe("centerView -- Center (item 8.8)", () => {
  const viewport = { width: 1048, height: 448 };
  const inset = { top: 60, bottom: 0 };

  it("keeps the zoom the reader is at", () => {
    expect(centerView({ width: 500, height: 200 }, viewport, 0.6).scale).toBe(0.6);
    expect(centerView({ width: 1100, height: 11000 }, viewport, 1.7).scale).toBe(1.7);
  });

  it("is the opening view itself at the opening zoom, for every kind of graph", () => {
    const graphs = [
      { width: 500, height: 200 }, // small: opens at 100%, centred
      { width: 1100, height: 300 }, // fits below 100%
      { width: 1100, height: 11000 }, // a real journal: 80% from the corner
      { width: 300, height: 5000 }, // tall and narrow
    ];
    for (const content of graphs) {
      for (const room of [viewport, { width: 390, height: 700 }]) {
        const opening = openingView(content, room, inset);
        const center = centerView(content, room, opening.scale, inset);
        expect(center.scale).toBe(opening.scale);
        expect(center.pan.x).toBeCloseTo(opening.pan.x, 6);
        expect(center.pan.y).toBeCloseTo(opening.pan.y, 6);
      }
    }
  });

  it("centres a graph that fits whole at this zoom, clear of the toolbar", () => {
    const content = { width: 500, height: 200 };
    const { pan } = centerView(content, viewport, 0.5, inset);
    // Drawn at 250 x 100: the same room either side, and under the toolbar.
    expect(pan.x * 0.5).toBeCloseTo((1048 - 250) / 2, 6);
    expect(pan.y * 0.5).toBeCloseTo(60 + (448 - 60 - 100) / 2, 6);
  });

  it("puts the top-left corner in the corner once the graph no longer fits", () => {
    // Fits at 50% and not at 200%, where it is 400 tall in 388: zooming in is
    // what lost it.
    const content = { width: 500, height: 200 };
    const { pan } = centerView(content, viewport, 2, inset);
    expect(pan.x * 2).toBeCloseTo(FIT_MARGIN, 6);
    expect(pan.y * 2).toBeCloseTo(60 + FIT_MARGIN, 6);
  });

  it("pins both axes when only one does not fit, as the screen opens a tall tree", () => {
    // 300 wide fits across 1048 easily; 5000 tall does not fit 448.
    const { pan } = centerView({ width: 300, height: 5000 }, viewport, 0.8);
    expect(pan.x * 0.8).toBeCloseTo(FIT_MARGIN, 6);
    expect(pan.y * 0.8).toBeCloseTo(FIT_MARGIN, 6);
  });

  it("treats the zoom Fit chose as fitting, not as a rounding error away from it", () => {
    const content = { width: 1100, height: 300 };
    const fit = fitView(content, viewport, inset);
    expect(centerView(content, viewport, fit.scale, inset)).toEqual(fit);
  });
});

describe("wheelZoom", () => {
  it("scrolling up zooms in and down zooms out", () => {
    expect(wheelZoom(1, -10)).toBeGreaterThan(1);
    expect(wheelZoom(1, 10)).toBeLessThan(1);
  });

  it("moves a little for a little and never more than one step per event", () => {
    expect(wheelZoom(1, -4)).toBeLessThan(1.01);
    expect(wheelZoom(1, -100)).toBeCloseTo(Math.exp(WHEEL_MAX_STEP));
    expect(wheelZoom(1, -10000)).toBeCloseTo(Math.exp(WHEEL_MAX_STEP));
  });

  it("reads a line as sixteen pixels", () => {
    expect(wheelZoom(1, -1, 1)).toBeCloseTo(wheelZoom(1, -16, 0));
  });

  it("stays inside 20%-200%", () => {
    expect(wheelZoom(2, -100)).toBe(2);
    expect(wheelZoom(0.2, 100)).toBe(0.2);
  });
});

describe("what the wheel does", () => {
  it("moves the graph on a plain scroll, and zooms with Shift or Ctrl held", () => {
    expect(wheelIntent({ shiftKey: false, ctrlKey: false })).toBe("pan");
    expect(wheelIntent({ shiftKey: true, ctrlKey: false })).toBe("zoom");
    // A trackpad pinch arrives as Ctrl and the wheel.
    expect(wheelIntent({ shiftKey: false, ctrlKey: true })).toBe("zoom");
  });

  it("reads a zoom from the sideways delta a browser turns Shift and the wheel into", () => {
    expect(zoomDelta(0, 100)).toBe(100);
    expect(zoomDelta(100, 0)).toBe(100);
  });
});

describe("wheelPan", () => {
  it("moves the graph up when the wheel rolls down, so what is below comes into view", () => {
    expect(wheelPan(0, 100)).toEqual({ x: 0, y: -100 });
    expect(wheelPan(0, -100)).toEqual({ x: 0, y: 100 });
  });

  it("moves it sideways for a trackpad's sideways swipe", () => {
    expect(wheelPan(100, 0)).toEqual({ x: -100, y: 0 });
    expect(wheelPan(30, 40)).toEqual({ x: -30, y: -40 });
  });

  it("reads a line as sixteen pixels", () => {
    expect(wheelPan(0, 3, 1)).toEqual({ x: 0, y: -48 });
  });
});

describe("zoomAt -- zooming about a point", () => {
  // Where a graph point lands on the screen: s * (c + t).
  const onScreen = (c: { x: number; y: number }, v: { scale: number; pan: { x: number; y: number } }) => ({
    x: v.scale * (c.x + v.pan.x),
    y: v.scale * (c.y + v.pan.y),
  });

  it("keeps the graph point under the cursor under the cursor", () => {
    const before = { scale: 1, pan: { x: -100, y: -50 } };
    const cursor = { x: 600, y: 300 };
    const under = { x: cursor.x / before.scale - before.pan.x, y: cursor.y / before.scale - before.pan.y };
    const after = zoomAt(cursor, before.scale, before.pan, 1.5);
    expect(after.scale).toBe(1.5);
    expect(onScreen(under, after).x).toBeCloseTo(600);
    expect(onScreen(under, after).y).toBeCloseTo(300);
  });

  it("zooming about the top-left corner leaves the pan alone -- the old behaviour, now only there", () => {
    const after = zoomAt({ x: 0, y: 0 }, 1, { x: 20, y: 30 }, 2);
    expect(after.pan).toEqual({ x: 20, y: 30 });
  });

  it("stays inside the zoom range", () => {
    expect(zoomAt({ x: 10, y: 10 }, 1, { x: 0, y: 0 }, 9).scale).toBe(2);
  });
});

describe("pinchTo", () => {
  const start = { middle: { x: 200, y: 400 }, distance: 100, scale: 1, pan: { x: 0, y: 0 } };

  it("zooms by how far apart the fingers have moved", () => {
    expect(pinchTo(start, { middle: { x: 200, y: 400 }, distance: 150 }).scale).toBe(1.5);
    expect(pinchTo(start, { middle: { x: 200, y: 400 }, distance: 50 }).scale).toBe(0.5);
  });

  it("keeps the point that was between the fingers between them, even as they move", () => {
    const v = pinchTo(start, { middle: { x: 260, y: 380 }, distance: 150 });
    // The graph point (200, 400) should now be under (260, 380).
    expect(v.scale * (200 + v.pan.x)).toBeCloseTo(260);
    expect(v.scale * (400 + v.pan.y)).toBeCloseTo(380);
  });
});
