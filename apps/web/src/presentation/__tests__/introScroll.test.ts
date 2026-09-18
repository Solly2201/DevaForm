/**
 * What "scrolling into a temple" has to mean.
 *
 * The entry cannot be judged from a unit test — it is a thing you do, and
 * scripts/qa-entry.mjs does it in a browser. What CAN be pinned here is
 * the model underneath: that a gesture means the same distance whatever
 * device sent it, that the journey has two ends, that going back works,
 * that the same flick travels the same way on a 60 Hz and a 120 Hz
 * display, and that the sequence can actually REACH the sanctum so the
 * handover has something to fire on.
 */
import { describe, expect, it } from "vitest";
import {
  beginApproach,
  easeApproach,
  frameAt,
  hasArrived,
  presence,
  pushApproach,
  setApproach,
  wheelPixels,
} from "../introScroll";

describe("a gesture means the same distance whatever sent it", () => {
  it("reads a wheel's own units", () => {
    expect(wheelPixels({ deltaY: 100, deltaMode: 0 })).toBe(100);
    // A mouse reporting LINES moved as far as a trackpad reporting the
    // same number of pixels would otherwise crawl.
    expect(wheelPixels({ deltaY: 3, deltaMode: 1 })).toBe(48);
    expect(wheelPixels({ deltaY: 1, deltaMode: 2 })).toBe(800);
    expect(wheelPixels({ deltaY: 40 })).toBe(40);
  });
});

describe("the approach has two ends", () => {
  it("starts at the doors and cannot go back further", () => {
    const start = beginApproach();
    expect(start.intent).toBe(0);
    expect(pushApproach(start, -5000, 1800).intent).toBe(0);
  });

  it("stops at the sanctum however hard it is scrolled", () => {
    const far = pushApproach(beginApproach(), 99_999, 1800);
    expect(far.intent).toBe(1);
    // And an overscroll does not have to be undone before anything moves:
    // an unbounded accumulator would need ninety-nine thousand pixels of
    // backward scrolling to leave the sanctum.
    expect(pushApproach(far, -900, 1800).intent).toBeCloseTo(0.5, 5);
  });

  it("goes back out the way it came", () => {
    const halfway = pushApproach(beginApproach(), 900, 1800);
    expect(halfway.intent).toBeCloseTo(0.5, 5);
    expect(pushApproach(halfway, -450, 1800).intent).toBeCloseTo(0.25, 5);
  });
});

describe("the scene follows with weight", () => {
  it("lags the intent, then catches it", () => {
    let approach = setApproach(beginApproach(), 1);
    expect(approach.shown).toBe(0);
    approach = easeApproach(approach, 1 / 60);
    expect(approach.shown).toBeGreaterThan(0);
    expect(approach.shown).toBeLessThan(0.2);
    for (let i = 0; i < 120; i += 1) approach = easeApproach(approach, 1 / 60);
    expect(hasArrived(approach)).toBe(true);
  });

  it("travels the same distance per second at any frame rate", () => {
    const run = (hz: number) => {
      let approach = setApproach(beginApproach(), 1);
      for (let i = 0; i < hz / 2; i += 1) approach = easeApproach(approach, 1 / hz);
      return approach.shown;
    };
    // Half a second of catching up, sampled three ways. A fixed fraction
    // per frame would make the 120 Hz display twice as eager.
    expect(run(120)).toBeCloseTo(run(60), 3);
    expect(run(60)).toBeCloseTo(run(30), 2);
  });

  it("reaches the sanctum exactly, so arriving can be detected", () => {
    // An exponential never quite arrives; the handover needs it to.
    let approach = setApproach(beginApproach(), 1);
    for (let i = 0; i < 600; i += 1) approach = easeApproach(approach, 1 / 60);
    expect(approach.shown).toBe(1);
    expect(hasArrived(approach)).toBe(true);
  });

  it("waits at the edge of what has arrived, and keeps the ground scrolled", () => {
    // A customer can outrun the download — pressing Enter asks for the
    // sanctum at once. Their intent is theirs; the scene follows only as
    // far as there is a picture. Without this the entry reported that
    // they were standing in the sanctum while showing the front steps.
    let approach = setApproach(beginApproach(), 1);
    for (let i = 0; i < 300; i += 1) approach = easeApproach(approach, 1 / 60, 6, 0.4);
    expect(approach.intent).toBe(1);
    expect(approach.shown).toBeCloseTo(0.4, 5);
    expect(hasArrived(approach)).toBe(false);
    // …and carries on the moment the rest lands, with nothing to redo.
    for (let i = 0; i < 300; i += 1) approach = easeApproach(approach, 1 / 60, 6, 1);
    expect(hasArrived(approach)).toBe(true);
  });

  it("survives a stalled tab handing it a huge time step", () => {
    let approach = setApproach(beginApproach(), 1);
    approach = easeApproach(approach, 8);
    expect(approach.shown).toBeGreaterThan(0);
    expect(approach.shown).toBeLessThanOrEqual(1);
  });
});

describe("the strip is a sampling, not a flip-book", () => {
  it("names the two stills a position falls between", () => {
    expect(frameAt(0, 40)).toEqual({ from: 0, to: 1, blend: 0 });
    expect(frameAt(1, 40)).toEqual({ from: 39, to: 39, blend: 0 });
    const middle = frameAt(0.5, 41);
    expect(middle.from).toBe(20);
    expect(middle.blend).toBeCloseTo(0, 6);
  });

  it("blends across every position rather than stepping", () => {
    const a = frameAt(0.51, 40);
    const b = frameAt(0.52, 40);
    // Either the pair moved on or the blend did; a position that changes
    // and shows the identical picture is a flip-book.
    expect(a.from !== b.from || a.blend !== b.blend).toBe(true);
  });
});

describe("overlays belong to the journey, not to a clock", () => {
  it("is fully present inside its stretch and gone outside it", () => {
    expect(presence(0, 0, 0.1)).toBe(1);
    expect(presence(0.05, 0, 0.1)).toBe(1);
    expect(presence(0.5, 0, 0.1)).toBe(0);
    expect(presence(0.12, 0, 0.1, 0.04)).toBeCloseTo(0.5, 5);
  });
});
