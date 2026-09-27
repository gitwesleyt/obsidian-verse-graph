// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-glide-rules.ts) on 2026-09-27.
// Unchanged. Keep in step with the original rather than editing here.

/**
 * The glide after a finger lets go of the Graph screen (v3's item 8.2) -- the
 * app owner's ask on the preview: *"if they thumb around, the screen moves a
 * tiny bit more after their thumb stops touching the screen"*. Pure -- samples
 * in, a velocity out.
 *
 * `@panzoom/panzoom` has no momentum of its own: the graph stopped dead the
 * instant a thumb lifted, which on a phone feels like the page caught on
 * something. So the screen measures how fast the finger was moving over its
 * last moments, and keeps panning at that speed, slowing each frame, until it
 * is too slow to see. Only for a finger -- a mouse drag has never glided
 * anywhere on the web, and a pinch lets go with two fingers at once.
 */

/** One reading of where the finger was, in screen pixels, and when (ms). */
export type Sample = { t: number; x: number; y: number };

export type Velocity = { x: number; y: number };

/**
 * How far back the release looks, in ms. Long enough to smooth one jittery
 * reading, short enough that a finger which stopped and *then* lifted does not
 * glide off on the speed it had before it stopped.
 */
export const RELEASE_WINDOW_MS = 100;

/**
 * Each frame keeps this share of the speed it had (per 16ms, so the same on a
 * 120Hz phone as a 60Hz one). A glide therefore travels about
 * `speed × 16 / (1 − FRICTION)` pixels: at 0.9, an ordinary flick of 1px/ms
 * coasts about 160px -- a fifth of a phone screen -- and the hardest, capped
 * at `MAX_GLIDE_SPEED`, about 400px. The app owner asked for "a tiny bit
 * more", not a fling to the far end, and 0.95 had a hard flick coasting a
 * whole screen.
 */
export const FRICTION = 0.9;

/** Below this, in pixels per ms, the glide has stopped for any eye. */
export const STOP_SPEED = 0.02;

/** A finger this slow at the end was placing the graph, not flicking it. */
export const MIN_GLIDE_SPEED = 0.15;

/** The fastest a glide starts, in pixels per ms -- a hard flick, not a teleport. */
export const MAX_GLIDE_SPEED = 2.5;

/**
 * How fast the finger was moving as it lifted: the distance over the samples
 * inside the last `RELEASE_WINDOW_MS`, capped at `MAX_GLIDE_SPEED`, or none
 * at all if it was barely moving -- so a careful placement stays put.
 */
export function releaseVelocity(samples: readonly Sample[], now: number): Velocity | null {
  const recent = samples.filter((sample) => now - sample.t <= RELEASE_WINDOW_MS);
  if (recent.length < 2) return null;

  const first = recent[0];
  const last = recent[recent.length - 1];
  const elapsed = last.t - first.t;
  if (elapsed <= 0) return null;

  let x = (last.x - first.x) / elapsed;
  let y = (last.y - first.y) / elapsed;
  const speed = Math.hypot(x, y);
  if (speed < MIN_GLIDE_SPEED) return null;

  if (speed > MAX_GLIDE_SPEED) {
    x = (x / speed) * MAX_GLIDE_SPEED;
    y = (y / speed) * MAX_GLIDE_SPEED;
  }
  return { x, y };
}

/** The speed after `elapsedMs` more of friction. */
export function slowDown(velocity: Velocity, elapsedMs: number): Velocity {
  const keep = Math.pow(FRICTION, elapsedMs / 16);
  return { x: velocity.x * keep, y: velocity.y * keep };
}

export function hasStopped(velocity: Velocity): boolean {
  return Math.hypot(velocity.x, velocity.y) < STOP_SPEED;
}

/** Keeps the last `RELEASE_WINDOW_MS` of samples, so the list never grows. */
export function keepRecent(samples: Sample[], now: number): Sample[] {
  return samples.filter((sample) => now - sample.t <= RELEASE_WINDOW_MS);
}
