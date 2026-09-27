// Copied from the Bible Journal web app (bible-journal-app/src/lib/graph-glide-rules.test.ts) on 2026-09-27.
// Unchanged. Keep in step with the original rather than editing here.

import { describe, expect, it } from "vitest";

import {
  MAX_GLIDE_SPEED,
  hasStopped,
  keepRecent,
  releaseVelocity,
  slowDown,
} from "./graph-glide-rules";

describe("releaseVelocity", () => {
  it("measures a flick over the last moments before the finger lifted", () => {
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 50, x: 50, y: 0 },
      { t: 100, x: 100, y: 0 },
    ];
    expect(releaseVelocity(samples, 100)).toEqual({ x: 1, y: 0 });
  });

  it("does not glide a finger that stopped and then lifted", () => {
    // The fast part is more than 100ms before the lift.
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 40, x: 200, y: 0 },
    ];
    expect(releaseVelocity(samples, 300)).toBeNull();
  });

  it("does not glide a slow, careful placement", () => {
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 5, y: 0 },
    ];
    expect(releaseVelocity(samples, 100)).toBeNull();
  });

  it("caps a violent flick", () => {
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 10, x: 0, y: 500 },
    ];
    const v = releaseVelocity(samples, 10)!;
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(MAX_GLIDE_SPEED);
    expect(v.x).toBe(0);
  });

  it("needs two readings", () => {
    expect(releaseVelocity([{ t: 0, x: 0, y: 0 }], 0)).toBeNull();
  });
});

describe("how far a glide goes", () => {
  function coast(speed: number) {
    let v = { x: speed, y: 0 };
    let px = 0;
    while (!hasStopped(v)) {
      px += v.x * 16;
      v = slowDown(v, 16);
    }
    return px;
  }

  it("carries an ordinary flick a little way, and the hardest under half a screen", () => {
    expect(coast(1)).toBeGreaterThan(100);
    expect(coast(1)).toBeLessThan(200);
    expect(coast(MAX_GLIDE_SPEED)).toBeLessThan(450);
  });
});

describe("slowDown and hasStopped", () => {
  it("slows the same over one 32ms frame as over two 16ms ones", () => {
    const once = slowDown({ x: 1, y: 0 }, 32);
    const twice = slowDown(slowDown({ x: 1, y: 0 }, 16), 16);
    expect(once.x).toBeCloseTo(twice.x);
  });

  it("comes to a stop within a second from the fastest start", () => {
    let v = { x: MAX_GLIDE_SPEED, y: 0 };
    let ms = 0;
    while (!hasStopped(v)) {
      v = slowDown(v, 16);
      ms += 16;
    }
    expect(ms).toBeLessThan(1000);
  });
});

describe("keepRecent", () => {
  it("drops readings older than the release window", () => {
    const kept = keepRecent(
      [
        { t: 0, x: 0, y: 0 },
        { t: 150, x: 1, y: 1 },
      ],
      200,
    );
    expect(kept).toEqual([{ t: 150, x: 1, y: 1 }]);
  });
});
