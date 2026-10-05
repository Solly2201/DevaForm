/**
 * What a worn thing IS to the body, rather than where it was put.
 *
 * WHY THIS EXISTS. The presentation vocabulary is lopsided, and the
 * measurements say so. A HELD item declares real physics — `GripFrame`
 * carries the origin that lands on the socket, the axis up the channel,
 * the roll about it, how far the hand may travel along it, the RADIUS the
 * item presents where the fist closes, and which hand state it asks for.
 * A WORN item declares `socket` and `clearanceM`. That is the whole of
 * it: an anchor point and one scalar gap.
 *
 * So every physical fact about a worn object lives in generator code
 * instead of in the asset, and is reinvented per generator. Measured on
 * the shipped product:
 *
 *   • The kamarbandh sat SEVENTY-NINE millimetres inside both human
 *     torsos and correctly on Ganesha, because the only way to know where
 *     its socket was had been to read a table that describes one body.
 *   • The vaijayanti hung down Vishnu's BACK and inside his dhoti. Its
 *     entire physical story — over both shoulders, falling to the thigh,
 *     worn outside the collar and outside the lower garment — was a route
 *     in a generator, and nothing could contradict it.
 *   • `ornaments.ts` says, above the one line that gets limb bands right:
 *     "This is the fourth time the same sentence has had to be written
 *     down about this codebase: an ornament that goes round something is
 *     sized by what CONTAINS it." It is written in a local variable, so
 *     the fifth time will be written too.
 *
 * And `clearanceM`, the one physical number a wearable can state, is read
 * by NOTHING. Four assets declare it; no validator and no generator
 * consults it. A contract nobody reads is not a contract.
 *
 * WHAT THIS IS, AND IS NOT. It is a sentence about a relationship, read
 * by validation — exactly like `spatial`, which sits beside it on the
 * asset and is likewise consulted by no placement code. It does NOT place
 * anything, does not resolve anything, and introduces no second placement
 * system: generators keep building geometry the way they do, and this
 * says what the result has to be true of. An asset that declares none
 * behaves exactly as every asset always has.
 *
 * The vocabulary is deliberately short. Each kind exists because a real
 * class of object cannot be checked by the others' rule — a bangle's
 * question is whether the wrist is through its hole, a tilaka's is
 * whether it lies on the skin, and an earring's is that it passes through
 * an earlobe ON PURPOSE and must not be reported for it.
 */

/**
 * The parts of a body a worn thing can be in a relationship with.
 *
 * Named for anatomy rather than for sockets, because a socket is where
 * something was hung and this is what it is hung ON. They differ: the
 * waist socket and the waist are twenty millimetres and one body apart.
 */
export const BODY_REGIONS = [
  "head",
  "forehead",
  "earlobe",
  "neck",
  "chest",
  "waist",
  "hips",
  "upperArm",
  "forearm",
  "wrist",
  "ankle",
  "thigh",
] as const;

export type BodyRegion = (typeof BODY_REGIONS)[number];

export type WornFit =
  /**
   * A closed band. The region passes THROUGH its hole, and the hole is
   * the thing that has to be right — a ring built at a limb's measured
   * radius has half its own thickness inside the limb.
   */
  | { kind: "encircles"; region: BodyRegion; /** Air between hole and skin, metres. */ holdM?: number }
  /**
   * Sits on a surface and follows it: a crown on a skull, a collar on
   * the base of a neck. Touches somewhere and stands off nowhere by more
   * than it declares.
   */
  | { kind: "restsOn"; region: BodyRegion; clearanceM?: number }
  /**
   * Hangs. Leaves the body at one region, falls under gravity, and
   * reaches another — and is worn OUTSIDE whatever is named, which is the
   * layering a garland needs and a sash needs and nothing else expresses.
   */
  | {
      kind: "drapes";
      from: BodyRegion;
      reaches: BodyRegion;
      /** Asset ids this is worn over, outermost last. */
      over?: readonly string[];
    }
  /**
   * Painted or applied: on the skin, with no thickness worth clearing. A
   * tilaka that stands two millimetres off a forehead is a tile.
   */
  | { kind: "appliedTo"; region: BodyRegion }
  /**
   * Passes through the anatomy, on purpose. An earring's hook is inside
   * an earlobe and a containment check that reports it is reporting a
   * correctly made earring.
   */
  | { kind: "piercedThrough"; region: BodyRegion };

/** The region a fit is about, whichever kind it is. */
export function regionOf(fit: WornFit): BodyRegion {
  return fit.kind === "drapes" ? fit.from : fit.region;
}

/**
 * Sentences about a fit declaration that cannot be true.
 *
 * Shape only — whether the asset's own words contradict themselves. What
 * the GEOMETRY does about them is measured where the geometry is, in the
 * engine's validation layer, because that is the only place the body it
 * is worn on exists.
 */
export function validateWornFit(fit: WornFit): string[] {
  const problems: string[] = [];
  const known = (region: BodyRegion) =>
    (BODY_REGIONS as readonly string[]).includes(region) ? null : `unknown body region "${region}"`;
  const unknown = known(regionOf(fit));
  if (unknown) problems.push(unknown);
  if (fit.kind === "drapes") {
    const target = known(fit.reaches);
    if (target) problems.push(target);
    if (fit.from === fit.reaches) {
      problems.push(`drapes from ${fit.from} to itself, which is not a drape`);
    }
  }
  if (fit.kind === "encircles" && fit.holdM !== undefined && fit.holdM < 0) {
    problems.push(`encircles with a negative hold of ${fit.holdM} m`);
  }
  if (fit.kind === "restsOn" && fit.clearanceM !== undefined && fit.clearanceM < 0) {
    problems.push(`restsOn with a negative clearance of ${fit.clearanceM} m`);
  }
  return problems;
}
