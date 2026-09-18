/**
 * Turning a customer's scrolling into a position inside the temple.
 *
 * The entry is not something that plays at them: they move INTO the
 * sanctum, and how far in they are is a number they control. That number
 * is the whole model, and it lives here — away from React, away from the
 * DOM, so what "scrolling into a temple" means can be stated once and
 * tested without a browser.
 *
 * TWO POSITIONS, not one. `intent` is where the customer has asked to be
 * and moves the instant they touch anything; `shown` is where the scene
 * actually is and is drawn toward the intent every frame. A single
 * position gives a sequence that jerks a tenth of the way in on one
 * trackpad flick and stops dead, which reads as a slideshow. The gap
 * between the two is what makes it read as movement with weight.
 *
 * The catch-up is exponential and FRAME-RATE INDEPENDENT — `1 - e^(-k·dt)`
 * rather than a fixed fraction per frame — because a fixed fraction makes
 * the same gesture travel a different distance on a 60 Hz and a 120 Hz
 * display, and the second one feels twice as eager.
 */

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * How far one wheel event asks to travel, in CSS pixels.
 *
 * A wheel's delta is not always pixels: mice usually report LINES and
 * some report PAGES, and taking the raw number means a mouse moves a
 * sixteenth as far as a trackpad for the same physical gesture.
 */
export function wheelPixels(event: { deltaY: number; deltaMode?: number }): number {
  const LINE = 16;
  const PAGE = 800;
  switch (event.deltaMode) {
    case 1:
      return event.deltaY * LINE;
    case 2:
      return event.deltaY * PAGE;
    default:
      return event.deltaY;
  }
}

export interface Approach {
  /** Where the customer has asked to be, 0 at the doors, 1 in the sanctum. */
  intent: number;
  /** Where the scene actually is. */
  shown: number;
}

export function beginApproach(): Approach {
  return { intent: 0, shown: 0 };
}

/**
 * Ask to move `pixels` further in. Bounded at both ends: there is nothing
 * before the doors and nothing past the sanctum, and an unbounded
 * accumulator means a customer who overscrolls has to scroll all the way
 * back before anything moves.
 */
export function pushApproach(approach: Approach, pixels: number, travelPx: number): Approach {
  return { ...approach, intent: clamp01(approach.intent + pixels / Math.max(1, travelPx)) };
}

/** Jump the intent somewhere — a key, a button, a restored position. */
export function setApproach(approach: Approach, intent: number): Approach {
  return { ...approach, intent: clamp01(intent) };
}

/**
 * Advance the shown position toward the intent after `dt` seconds.
 *
 * `perSecond` is the rate of the exponential: at 6, roughly 95% of any
 * gap closes in half a second, which is slow enough to have weight and
 * fast enough that a fast scroll does not feel disconnected from the
 * hand doing it. Snapping when the gap is negligible stops the scene
 * from crawling the last thousandth for ever — and, at the end, lets the
 * sequence actually REACH one so the handover can happen.
 *
 * `reach` is as far as the scene can currently BE DRAWN: the hall is
 * still arriving over the network while the customer walks into it, and
 * a position past the last still that exists is a position with no
 * picture. Asking for one showed the temple's front steps while the
 * entry reported that the customer was standing in the sanctum. Their
 * INTENT is still theirs — they keep the ground they scrolled — the
 * scene simply catches up to it as the stills land.
 */
export function easeApproach(
  approach: Approach,
  dt: number,
  perSecond = 6,
  reach = 1,
): Approach {
  const toward = Math.min(approach.intent, Math.max(0, reach));
  const gap = toward - approach.shown;
  if (Math.abs(gap) < 0.0006) {
    return approach.shown === toward ? approach : { ...approach, shown: toward };
  }
  const k = 1 - Math.exp(-perSecond * Math.min(0.1, Math.max(0, dt)));
  return { ...approach, shown: approach.shown + gap * k };
}

/** Is the customer all the way in? */
export function hasArrived(approach: Approach): boolean {
  return approach.shown >= 0.999;
}

/**
 * Which two stills bracket a position, and how far between them it is.
 *
 * The strip is a SAMPLING of the approach, not a flip-book of it: the
 * entry cross-dissolves the pair, so a fortieth of the sequence never
 * arrives as a step.
 */
export function frameAt(
  progress: number,
  count: number,
): { from: number; to: number; blend: number } {
  if (count <= 1) return { from: 0, to: 0, blend: 0 };
  const at = clamp01(progress) * (count - 1);
  const from = Math.min(count - 1, Math.floor(at));
  return { from, to: Math.min(count - 1, from + 1), blend: at - from };
}

/**
 * How present a thing is over a stretch of the approach.
 *
 * Every overlay in the entry — the mark, the instruction, the rail —
 * appears and leaves at a stated point in the journey rather than on a
 * timer of its own, because the customer owns the clock now.
 */
export function presence(progress: number, from: number, to: number, fade = 0.04): number {
  if (progress <= from - fade || progress >= to + fade) return 0;
  if (progress < from) return (progress - (from - fade)) / fade;
  if (progress > to) return 1 - (progress - to) / fade;
  return 1;
}
