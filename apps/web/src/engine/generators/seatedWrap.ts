/**
 * WHERE CLOTH GOES ON A FIGURE THAT HAS FOLDED ITS LEGS.
 *
 * A standing garment is a column: there is a leg inside it the whole way
 * down, so a hem at ankle height is cloth resting on something. Fold the
 * legs and that stops being true. The legs go out and forward from the
 * hips, everything below the crossed shins is empty air, and a garment
 * that still believes in the column draws cloth into that air — which is
 * exactly what the two generators were doing. The dhoti produced two
 * cream blobs the size of the lap, one per thigh; the hide produced a
 * panel hanging in front of nothing.
 *
 * Both were solving the same problem separately, and both were solving it
 * from authored numbers. This is the one answer: the lap is as wide as
 * the legs the figure ACTUALLY has, read off the body at the height the
 * cloth crosses them, and the cloth stops a little below that. The
 * generators still build their own fabric — pleated cream is not a marked
 * skin — but they stop disagreeing about where the figure is.
 *
 * `legExtentAt` is the body's own statement, so a folded pose on a mesh
 * body and a folded pose on a stylised one each get their own lap rather
 * than a number that was right for one of them.
 */
import type { BodyProfile } from "./bodyProfile";

/**
 * Where a seated pose actually puts the legs.
 *
 * Measured off the posed skeleton, in the pelvis's own frame — see
 * `measureFoldedLegs` in rig.ts. A garment is built in rest pose and worn
 * on the pelvis, so nothing in the geometry it is built from knows that
 * the knees have gone out sideways; without this the wrap was sized from
 * `legExtentAt`, which answers for legs hanging down, and a lap wrap cut
 * for standing legs is a pair of shorts on a folded figure.
 */
export interface SeatedLegs {
  /**
   * The outer surface of the thighs HALFWAY ALONG — where cloth gathered
   * at the waist actually lies. Not the knees: a wrap carried out to the
   * kneecaps is a disc as wide as the figure's own shoulders, which is
   * what measuring to them produced.
   */
  thighHalfWidth: number;
  thighFrontZ: number;
  /** Pelvis-local height of the knees, and of the lowest folded part. */
  kneeY: number;
  floorY: number;
}

export interface SeatedWrap {
  /** Where the cloth is held: the waist it leaves from. */
  waistY: number;
  /** The waist's own radius, before the cloth flares. */
  waistRadius: number;
  /** How far out the cloth reaches, across the figure and through it. */
  lapRadiusX: number;
  lapRadiusZ: number;
  /** Where the cloth ends. Below this is air. */
  hemY: number;
}

/**
 * @param legs the posed lap, when the caller could measure one. Without
 *   it the body's own standing leg extent is used, which is the honest
 *   fallback for a figure whose pose nobody has measured — a thumbnail,
 *   or a seated preset with no leg rotations at all.
 * @param clearance how far the cloth stands off the legs it covers.
 */
export function seatedLapWrap(
  body: BodyProfile,
  legs: SeatedLegs | null,
  clearance = 0.018,
): SeatedWrap {
  const waistY = body.waistSeatY;
  const waistRadius = Math.max(body.pelvisHalfWidth, body.bellyRadiusZ);
  // The waist is the one place a seated figure is still the shape it
  // stands in, so the cloth can never come in tighter than the hips it
  // leaves from, however the legs are folded.
  const floor = waistRadius * 1.05;
  const standing = body.legExtentAt(waistY - 0.1);
  const lapRadiusX = Math.max(legs ? legs.thighHalfWidth : standing.halfWidth, floor) + clearance;
  const lapRadiusZ = Math.max(legs ? legs.thighFrontZ : standing.frontZ, floor) + clearance;
  /**
   * THE HEM GOES BETWEEN THE KNEE AND THE GROUND.
   *
   * Cloth over a crossed lap ends around the crossed shins: carried
   * lower it hangs in the air in front of them, and stopped at the knee
   * it is a pair of shorts. Halfway between the knees and the lowest the
   * legs get is that line, and both ends of it are measured.
   *
   * The fallback is the drop that measured right on this body back when
   * nobody could say where its knees were.
   */
  const hemY = legs ? (legs.kneeY + legs.floorY) / 2 : waistY - 0.17;
  return { waistY, waistRadius, lapRadiusX, lapRadiusZ, hemY };
}
