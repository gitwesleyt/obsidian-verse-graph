// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-zoom-rules.ts) on 2026-09-26.
// Unchanged. Keep in step with the original rather than editing here.

/**
 * The arithmetic behind the Graph screen's pan and zoom (v3's item 8.2).
 * Pure -- sizes in, a scale or a position out.
 *
 * `@panzoom/panzoom` does the gestures -- wheel, pinch, drag -- and transforms
 * one element. What it does not do is anything the design asks beyond that:
 * the eight steps the −/+ buttons move between, **Fit**, **Center**, keeping the graph from
 * being dragged out of sight (design G7c), and bringing a node the keyboard
 * has reached into view. Those are here, where they can be tested without a
 * browser.
 *
 * **The library's coordinates, written down once.** With its origin at the
 * top-left, it draws `scale(s) translate(x, y)`: a point `p` of the graph, in
 * unscaled pixels, lands on the screen at `s * (p + t)`. Every function below
 * speaks that convention, so `pan` is always in unscaled pixels and a
 * viewport is always in screen pixels.
 */

/**
 * 20%–200%, and − and + move **10% at a time** -- the app owner's calls on
 * the preview. The step replaced the design's eight uneven ones (40, 50, 60,
 * 80, 100, 125, 160, 200), which jumped a quarter at a time at the top of the
 * range. **The floor was the design's 40% (G7a) until item 8.4**, where the
 * app owner lowered it so that Fit can show a real journal whole as an
 * overview -- names are hard to read that small, and that is the trade taken.
 */
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2;
export const ZOOM_STEP = 0.1;

/**
 * Below this the nodes carry their names only (design G7b): "at 40% the verse
 * pills carry the reference only". Counts and entry dates come back above it.
 */
export const THIN_LABELS_BELOW = 0.7;

/** Room left round the graph when it is fitted, in screen pixels. */
export const FIT_MARGIN = 24;

/**
 * How much of the graph always stays on screen, in screen pixels (design G7c):
 * "the graph cannot be dragged entirely out of view".
 */
export const KEEP_IN_VIEW = 96;

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

/**
 * Screen pixels at the top and bottom of the canvas that the toolbar sits
 * over. Fit and the opening view keep the graph out of them, so the toolbar
 * never covers a node at rest (design G1d).
 */
export type Inset = { top: number; bottom: number };

const NO_INSET: Inset = { top: 0, bottom: 0 };

export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

/**
 * The zoom the − or + button goes to from wherever the zoom is now: the next
 * whole 10%.
 *
 * **To the next round number, not 10% on from where it is**: a pinch, a wheel
 * or Fit leaves the zoom at 87%, and + should then read 90% -- after which
 * every press is a round number -- rather than 97%, 107%, 117% for ever.
 */
export function nextZoomStep(scale: number, direction: "in" | "out"): number {
  // A hair of tolerance, so 0.8000001 after a transform counts as 80%.
  const EPSILON = 0.001;
  const tenths = scale / ZOOM_STEP;
  const next =
    direction === "in"
      ? Math.floor(tenths + EPSILON) + 1
      : Math.ceil(tenths - EPSILON) - 1;
  // Rounded, so 0.30000000000000004 does not leak into the percentage.
  return clampZoom(Math.round(next * ZOOM_STEP * 100) / 100);
}

/**
 * The zoom one wheel event moves to, in proportion to how far the wheel
 * turned -- the app owner found the library's own wheel zoom far too quick.
 *
 * **The library moves a fixed step per event, whatever its size**, and a
 * smooth-scrolling mouse or a trackpad sends dozens of small events for one
 * flick, so every one of them was a full 7% step. Here a tiny event is a tiny
 * change, and one event can never move more than `WHEEL_MAX_STEP`, which is
 * roughly what one notch of an ordinary wheel sends.
 *
 * `deltaMode` 1 is lines rather than pixels (Firefox on some mice); a line is
 * taken as 16 pixels.
 */
export const WHEEL_SENSITIVITY = 0.0008;
export const WHEEL_MAX_STEP = 0.06;
const PIXELS_PER_LINE = 16;

export function wheelZoom(scale: number, deltaY: number, deltaMode = 0): number {
  const pixels = deltaMode === 1 ? deltaY * PIXELS_PER_LINE : deltaY;
  const change = Math.max(-WHEEL_MAX_STEP, Math.min(WHEEL_MAX_STEP, -pixels * WHEEL_SENSITIVITY));
  return clampZoom(scale * Math.exp(change));
}

/**
 * What a wheel event over the graph does -- the app owner's call on the
 * preview: **scrolling moves the graph, and Shift and scrolling zooms it**,
 * the reverse of the design's "scroll to zoom" (G7a).
 *
 * **Ctrl and scrolling zooms too**, because that is how a laptop trackpad's
 * pinch reaches a page: without it, pinching would start moving the graph.
 */
export function wheelIntent(event: { shiftKey: boolean; ctrlKey: boolean }): "zoom" | "pan" {
  return event.shiftKey || event.ctrlKey ? "zoom" : "pan";
}

/**
 * Which way the wheel turned, for zooming. **A browser turns Shift and a
 * mouse wheel into a sideways scroll** before the page sees it -- `deltaY`
 * arrives as 0 and the turn is in `deltaX` -- so a zoom reads whichever of the
 * two moved.
 */
export function zoomDelta(deltaX: number, deltaY: number): number {
  return deltaY !== 0 ? deltaY : deltaX;
}

/**
 * How far a plain scroll moves the graph, in screen pixels: up and down with
 * the wheel, and sideways too with a trackpad's two-finger swipe.
 *
 * The result is how far the *content* moves, which is the opposite way to the
 * scroll: rolling down brings what is further down into view.
 */
export function wheelPan(
  deltaX: number,
  deltaY: number,
  deltaMode = 0,
): Point {
  const unit = deltaMode === 1 ? PIXELS_PER_LINE : 1;
  const x = deltaX * unit;
  const y = deltaY * unit;
  return { x: x === 0 ? 0 : -x, y: y === 0 ? 0 : -y };
}

/** What the toolbar says: "85%". */
export function zoomPercent(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

/**
 * Fit (design G7a): the largest zoom at which the whole graph fits, inside the
 * zoom range, and where to put it.
 *
 * **A tall journal cannot fit at 20%**, and three hundred verses is a graph
 * about 11,000px tall. So Fit centres what fits and, for what does not, puts
 * the top of the graph at the top -- the first branch is where a reader starts,
 * and "the tree scales by scrolling" (design G7c).
 */
export function fitView(
  content: Size,
  viewport: Size,
  inset: Inset = NO_INSET,
): { scale: number; pan: Point } {
  const room = {
    width: Math.max(1, viewport.width - FIT_MARGIN * 2),
    height: Math.max(1, viewport.height - inset.top - inset.bottom - FIT_MARGIN * 2),
  };
  const scale = clampZoom(
    Math.min(room.width / content.width, room.height / content.height),
  );

  return { scale, pan: placeAt(content, viewport, scale, inset) };
}

/**
 * Where the graph opens: Fit, unless Fit would be smaller than
 * `OPENING_ZOOM`, and then that zoom with the top-left of the graph in the
 * corner.
 *
 * **Not Fit alone**, because a real journal is taller than a screen and Fit
 * would open it at 20%, where the labels thin out to names (design G7b) --
 * a first look at one's own journal as a field of grey boxes. The design's
 * own landing frame is at 80–85%, and its phone frame (G8) is exactly this:
 * the tree at a readable size from its left edge, running off the right of
 * the screen to be dragged across.
 */
export const OPENING_ZOOM = 0.8;
export const OPENING_MAX = 1;

export function openingView(
  content: Size,
  viewport: Size,
  inset: Inset = NO_INSET,
): { scale: number; pan: Point } {
  const fit = fitView(content, viewport, inset);
  // **Never above 100% either**: the graph opens with every book closed, and
  // that small a tree fits at 200%, which is a first look at one's journal in
  // letters an inch high.
  const scale = Math.min(OPENING_MAX, Math.max(OPENING_ZOOM, fit.scale));
  return centerView(content, viewport, scale, inset);
}

/**
 * **Center** (item 8.8): the graph put back where the screen opens it, at the
 * zoom it is at now -- for a reader who has panned off into the dots and lost
 * it. Fit is the other way back, and it changes the zoom to do it.
 *
 * **The opening view's own placement, asked at another zoom**, which is why
 * `openingView` is written with it: centred when the whole graph fits, and
 * otherwise its top-left corner in the corner, where the first branch is. At
 * the opening zoom the two answers are the same view.
 *
 * **Both axes, not each on its own** -- `placeAt` centres one axis and pins the
 * other, which on a tall, narrow tree at 80% would put the testaments in the
 * middle of the screen with nothing to their left, where the screen opens
 * them at the left edge.
 */
export function centerView(
  content: Size,
  viewport: Size,
  scale: number,
  inset: Inset = NO_INSET,
): { scale: number; pan: Point } {
  // Half a pixel of tolerance, so the zoom Fit worked out -- at which the
  // graph fits exactly -- is not a rounding error away from fitting.
  const fits = (contentSize: number, room: number) =>
    contentSize * scale + FIT_MARGIN * 2 <= room + 0.5;
  const wholeGraphFits =
    fits(content.width, viewport.width) &&
    fits(content.height, viewport.height - inset.top - inset.bottom);

  return {
    scale,
    pan: wholeGraphFits
      ? placeAt(content, viewport, scale, inset)
      : { x: FIT_MARGIN / scale, y: (inset.top + FIT_MARGIN) / scale },
  };
}

/** Centred on an axis the graph fits on, pinned to the margin on one it does not. */
function placeAt(content: Size, viewport: Size, scale: number, inset: Inset): Point {
  const axis = (contentSize: number, viewportSize: number, before: number) => {
    const drawn = contentSize * scale;
    const screen = drawn + FIT_MARGIN * 2 <= viewportSize
      ? before + (viewportSize - drawn) / 2
      : before + FIT_MARGIN;
    return screen / scale;
  };

  return {
    x: axis(content.width, viewport.width, 0),
    y: axis(content.height, viewport.height - inset.top - inset.bottom, inset.top),
  };
}

/**
 * Where the graph has to be to keep at least `KEEP_IN_VIEW` of it on screen --
 * or `pan` unchanged when it already is (design G7c: "releasing past the edge
 * eases it back").
 */
export function keepInView(
  pan: Point,
  scale: number,
  content: Size,
  viewport: Size,
): Point {
  const axis = (value: number, contentSize: number, viewportSize: number) => {
    const keep = Math.min(KEEP_IN_VIEW, contentSize * scale, viewportSize);
    const lowest = keep / scale - contentSize;
    const highest = (viewportSize - keep) / scale;
    return Math.min(highest, Math.max(lowest, value));
  };

  return {
    x: axis(pan.x, content.width, viewport.width),
    y: axis(pan.y, content.height, viewport.height),
  };
}

/**
 * Where the graph has to be for one box of it to be fully on screen, with a
 * margin -- moving as little as possible, and not at all if it already is.
 * For the keyboard: arrow keys walk the tree, and the view follows the node
 * they reach.
 */
export function bringIntoView(
  pan: Point,
  scale: number,
  box: { x: number; y: number; width: number; height: number },
  viewport: Size,
  margin = FIT_MARGIN,
): Point {
  const axis = (value: number, start: number, size: number, viewportSize: number) => {
    const left = scale * (start + value);
    const right = scale * (start + size + value);
    if (left < margin) return margin / scale - start;
    if (right > viewportSize - margin) return (viewportSize - margin) / scale - start - size;
    return value;
  };

  return {
    x: axis(pan.x, box.x, box.width, viewport.width),
    y: axis(pan.y, box.y, box.height, viewport.height),
  };
}

export function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}

/**
 * The zoom and position that change the scale while keeping one point of the
 * screen over the same point of the graph -- the pointer for a wheel, the
 * middle of the canvas for − and +, the spot for a double tap. The app owner
 * saw every zoom drift towards the top-left: `@panzoom/panzoom`'s own
 * `zoomToPoint` assumes the element is transformed about its centre, and this
 * one is transformed about its top-left corner (the convention at the top of
 * this file), so its sums were a half-element out. **Nothing of the library's
 * zoom is used**; this is the one sum every zoom goes through.
 *
 * `point` is in screen pixels from the canvas's top-left corner.
 */
export function zoomAt(
  point: Point,
  scale: number,
  pan: Point,
  toScale: number,
): { scale: number; pan: Point } {
  const next = clampZoom(toScale);
  // The graph point under the screen point: s * (c + t) = p.
  const under = { x: point.x / scale - pan.x, y: point.y / scale - pan.y };
  return { scale: next, pan: { x: point.x / next - under.x, y: point.y / next - under.y } };
}

/** Where two fingers were when a pinch began. */
export type PinchStart = { middle: Point; distance: number; scale: number; pan: Point };

/**
 * A pinch, from where it began to where the two fingers are now: the zoom by
 * how far apart they have moved, and the graph point that was between them
 * kept between them -- so a pinch also pans, as it does in every map.
 */
export function pinchTo(
  start: PinchStart,
  now: { middle: Point; distance: number },
): { scale: number; pan: Point } {
  const scale = start.distance > 0 ? clampZoom(start.scale * (now.distance / start.distance)) : start.scale;
  const under = {
    x: start.middle.x / start.scale - start.pan.x,
    y: start.middle.y / start.scale - start.pan.y,
  };
  return { scale, pan: { x: now.middle.x / scale - under.x, y: now.middle.y / scale - under.y } };
}
