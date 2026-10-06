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
import * as THREE from "three";
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
/** How many bearings the lap is measured at. Ten degrees apart. */
export const LAP_BEARINGS = 36;

export interface SeatedLegs {
  /**
   * THE LAP, BEARING BY BEARING.
   *
   * A seated figure is not a solid of revolution and a garment built as
   * one is a drum: measured on Ganesha's Royal Ease, the wrap came out a
   * 236 mm cone with a level hem, the knees stuck out of its sides as
   * bare nubs, and the asymmetry the pose was authored for — one leg
   * folded flat, the other drawn up — was invisible under it.
   *
   * So the lap is described the way a body is described: how far it
   * reaches at a bearing, and how low it goes there. Behind the figure
   * there are no legs, so the cloth comes in to the hips and the hem
   * rises; across the front and sides it goes out over the thighs and
   * the hem drops past the knees. Both numbers are measured off the
   * posed skeleton (see rig.ts), never authored.
   *
   * Indexed from the figure's front, turning toward its left, which is
   * the same convention `surfaceAt` uses.
   */
  reach: readonly number[];
  floor: readonly number[];
  /**
   * And how HIGH the leg flesh gets there.
   *
   * Without it the shaping could only put the hem in the right place:
   * cloth carried down to the floor at the knee's own bearing still ran
   * inboard of the knee on the way, so the knees came through it as bare
   * nubs. A garment has to CONTAIN a limb, not merely end below it.
   */
  top: readonly number[];
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

/**
 * ONE LENGTH OF ARM, as a tapered capsule, in the CHEST's frame.
 *
 * A drape worn over the shoulder is built on the chest and the arms are
 * not: the pose swings them and the cloth stays where it was put, so a
 * garment routed on the torso's own surface has a limb hanging through
 * it. Measured on Shiva, the uttariya reached nineteen millimetres into
 * an arm in three of his five poses.
 *
 * The torso cannot answer this — `BodyProfile` describes a figure, not a
 * pose — so the rig measures it off the posed skeleton and hands it over,
 * the same way it hands over a seated figure's lap.
 */
export interface ArmSegment {
  from: readonly [number, number, number];
  to: readonly [number, number, number];
  fromRadius: number;
  toRadius: number;
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
/**
 * The lap at one bearing: how far out it reaches, and how low it hangs.
 *
 * Interpolated between the measured bins, so cloth shaped against it has
 * no steps in it.
 */
export function lapAt(
  legs: SeatedLegs,
  bearing: number,
): { reach: number; floor: number; top: number } {
  const turn = Math.PI * 2;
  const span = ((bearing % turn) + turn) % turn;
  const exact = (span / turn) * LAP_BEARINGS;
  const first = Math.floor(exact) % LAP_BEARINGS;
  const second = (first + 1) % LAP_BEARINGS;
  const t = exact - Math.floor(exact);
  const blend = (values: readonly number[]) =>
    (values[first] ?? 0) + ((values[second] ?? 0) - (values[first] ?? 0)) * t;
  return { reach: blend(legs.reach), floor: blend(legs.floor), top: blend(legs.top) };
}

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

/**
 * Lay a seated garment ON the lap instead of around it.
 *
 * The cloth is built as a cone — the waist at the top, the lap's widest
 * reach at the bottom — because that is the only shape a surface of
 * revolution can be. A seated figure is not one. Built and left alone,
 * Ganesha's Royal Ease wore a 236 mm drum with a level hem: the knees
 * stuck out of its sides as bare nubs and the asymmetry the pose was
 * authored for, one leg folded flat and the other drawn up, was
 * invisible under it.
 *
 * So the cone is then SHAPED against the lap the pose actually makes.
 * Every vertex is carried from the waist, where it stays where it was,
 * toward the lap's own surface at its own bearing, and its hem lands on
 * the lap's own floor there. Behind the figure that pulls the cloth in
 * to the hips and lifts the hem to the seat; across the front it carries
 * it out over the thighs and drops it past the knees.
 *
 * The pleating survives because the move is a SCALE: a vertex standing
 * proud of its ring stays proud of it.
 *
 * `geometry` must already be in the pelvis's frame — bake the position
 * in before calling, or the heights mean nothing.
 */
export function shapeToLap(
  geometry: THREE.BufferGeometry,
  legs: SeatedLegs,
  options: { waistY: number; clearance: number; hemLift?: number },
): void {
  const position = geometry.getAttribute("position");
  if (!position) return;
  const { waistY, clearance } = options;
  const hemLift = options.hemLift ?? 0;
  /**
   * Where the cloth starts caring about the hem.
   *
   * Above this the garment keeps the height it was cut at; below it the
   * remaining length is stretched or gathered onto the lap's own floor.
   * Clamping every vertex instead — `max(y, hem)` — piles a hundred
   * millimetres of cone onto one plane at the back, where there are no
   * legs, and the surplus comes out as a row of spikes along the hem.
   */
  const SKIRT = 0.6;
  let lowest = waistY;
  for (let i = 0; i < position.count; i += 1) lowest = Math.min(lowest, position.getY(i));
  const drop = Math.max(1e-4, waistY - lowest);
  const skirtTop = waistY - drop * SKIRT;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const radius = Math.hypot(x, z);
    if (radius < 1e-6) continue;
    const { reach, floor, top } = lapAt(legs, Math.atan2(x, z));

    /**
     * OUTSIDE THE LEG, wherever there is one low enough to be in the
     * cloth.
     *
     * A drawn-up knee reaches almost to the waist — on Royal Ease the
     * raised one tops out twenty millimetres under it — and a garment
     * told to contain THAT becomes a cylinder as wide as the knees for
     * its whole height, with the waist ornament riding out on it as a
     * flat gold plate. Which is what happened. A raised knee is meant to
     * come through the cloth; that is what the pose is. So the enclosure
     * stops a hand's width below the waist: the folded leg is wrapped,
     * the drawn-up one emerges.
     */
    const ceiling = Math.min(top, waistY - 0.05);
    const want = reach + clearance;
    /**
     * Eased in, not switched on.
     *
     * A hard `max` at the ceiling gives the cloth a flat side and a
     * corner wherever a knee's reach meets its neighbour's — a slab, not
     * a garment. The limb's presence fades over the last three
     * centimetres below the line, which is about how far cloth takes to
     * leave a shape it has been lying on.
     */
    const under = ceiling + clearance - y;
    const grip = Math.min(1, Math.max(0, under / 0.03));
    const ease = grip * grip * (3 - 2 * grip);
    const out = Math.max(radius, radius + (want - radius) * ease);

    /**
     * AND THE HEM RESTS ON THE LAP rather than hanging past it.
     *
     * Clamped, not remapped. A first version carried every vertex down
     * proportionally so the cone's bottom landed on the lap's floor, and
     * that compresses the whole skirt into the lap's own depth: the cloth
     * beside a knee ended up BELOW it, and the knees came through anyway.
     * Cloth keeps the height it was cut at; what changes is where it
     * stops.
     */
    const hem = floor + clearance * 0.5 + hemLift;
    const fall = Math.min(1, Math.max(0, (skirtTop - y) / Math.max(1e-4, drop * (1 - SKIRT))));
    const height = y >= skirtTop ? y : skirtTop - (skirtTop - hem) * fall;
    const spread = out / radius;
    position.setXYZ(i, x * spread, height, z * spread);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}
