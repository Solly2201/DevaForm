/**
 * How well a worn thing FITS — measured, in millimetres.
 *
 * The references say it plainly and say it three times: the naga "fits
 * neck", the kamarbandh "fits waist", "no floating ornaments". Those are
 * three different claims about the same relationship and the repository
 * could state none of them. What it had was `worstTorsoPenetration`,
 * which answers only the first half — is any of this inside the body —
 * and a thing can clear that perfectly while hanging a hand's breadth off
 * the chest, which is what several ornaments were doing.
 *
 * So: one report, three numbers, all from the SAME signed clearance
 * `pushOutsideBody` is built on. Nothing here places anything. It reads
 * a placement somebody else made and says how it sits, which is the
 * boundary the spatial-occupancy experiment settled on and this stays
 * inside.
 *
 * WHY A REPORT RATHER THAN A VERDICT. A mala hangs: most of its length is
 * legitimately in the air below the sternum, and a rule that demanded
 * contact everywhere would forbid a necklace. A torque does not hang: it
 * is a ring on a neck, and every part of it should be against skin. The
 * same measurement serves both; what differs is what each is held to, and
 * that belongs with the asset rather than in here.
 */
import * as THREE from "three";
import type { BodyProfile } from "../generators/bodyProfile";
import { torsoClearanceAt } from "./bodyAdapter";

export interface WearableFit {
  /**
   * How far the deepest point reaches INSIDE the skin, metres. Zero when
   * nothing is buried. This is the one number that is never acceptable.
   */
  penetration: number;
  /**
   * How close the nearest point comes to the skin from outside, metres.
   * A worn thing touches the body somewhere; a large value here is an
   * ornament floating free of the figure entirely.
   */
  contact: number;
  /**
   * The MEDIAN standoff, metres — how far the ornament sits off the skin
   * typically rather than at its best point. A band that grips reads a
   * millimetre or two; a band hovering around the waist reads a
   * centimetre, while still touching at one lucky point and so passing
   * any check that only looks at `contact`.
   */
  median: number;
  /** How far the furthest point stands off, metres. */
  reach: number;
  /** Points that fell inside the band the torso model describes. */
  samples: number;
  /** Points ignored because the torso model says nothing about them. */
  skipped: number;
}

/**
 * The height band the torso surface actually describes, chest-local.
 *
 * `generatedSurfaceAt` is two ellipses with the neck's radius as a floor,
 * so ABOVE the chest and BELOW the belly it keeps answering — with a
 * neck-sized cylinder. Ask it about a crown and it reports a head
 * ornament buried seventy millimetres inside a body that is not there,
 * and ask it about a dhoti's hem and it says the same about the legs.
 *
 * Both of those were in the first run of this measurement. A validator
 * that reports confidently about geometry it cannot see is worse than no
 * validator, so it answers only between the shoulders and the hips and
 * says how much it declined to look at.
 */
export function torsoBand(body: BodyProfile): { top: number; bottom: number } {
  const SPINE_TO_CHEST_Y = 0.16;
  return {
    top: body.chestCenterY + body.chestRadiusY,
    bottom: body.bellyCenterY - body.bellyRadiusY - SPINE_TO_CHEST_Y,
  };
}

/**
 * Measure a point cloud, expressed in CHEST-JOINT-LOCAL metres, against
 * the body's own measured torso surface.
 *
 * Chest-local because that is the space `BodyProfile.surfaceAt` answers
 * in, and converting the profile instead of the points would be a second
 * convention for the same geometry.
 */
export function wearableFit(
  body: BodyProfile,
  chestLocalPoints: readonly THREE.Vector3[],
): WearableFit {
  const band = torsoBand(body);
  let penetration = 0;
  let contact = Infinity;
  let reach = 0;
  let skipped = 0;
  const outside: number[] = [];
  for (const point of chestLocalPoints) {
    if (point.y > band.top || point.y < band.bottom) {
      skipped += 1;
      continue;
    }
    const clearance = torsoClearanceAt(body, point);
    if (clearance < 0) {
      penetration = Math.max(penetration, -clearance);
      continue;
    }
    outside.push(clearance);
    if (clearance < contact) contact = clearance;
    if (clearance > reach) reach = clearance;
  }
  outside.sort((a, b) => a - b);
  const median = outside.length > 0 ? (outside[Math.floor(outside.length / 2)] as number) : 0;
  const samples = chestLocalPoints.length - skipped;
  if (samples === 0) {
    return { penetration: 0, contact: Infinity, median: Infinity, reach: 0, samples: 0, skipped };
  }
  return {
    penetration,
    contact: outside.length > 0 ? contact : 0,
    median,
    reach,
    samples,
    skipped,
  };
}

/**
 * Sample an object's own triangles, in chest-joint-local metres.
 *
 * The geometry that gets DRAWN, not a proxy for it: a bounding box round
 * a bead strand contains most of the chest, and a box is the one shape
 * the occupancy experiment proved wrong about worn things.
 */
export function wearableSurface(
  object: THREE.Object3D,
  chest: THREE.Object3D,
  /** At most this many points; a strand of beads has thousands. */
  budget = 2000,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  object.updateWorldMatrix(true, true);
  chest.updateWorldMatrix(true, false);
  const toChest = new THREE.Matrix4().copy(chest.matrixWorld).invert();

  let total = 0;
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    const position = mesh.geometry?.getAttribute("position");
    if (mesh.isMesh && position) total += position.count;
  });
  const stride = Math.max(1, Math.ceil(total / budget));

  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    const position = mesh.geometry?.getAttribute("position");
    if (!mesh.isMesh || !position) return;
    mesh.updateWorldMatrix(true, false);
    for (let vertex = 0; vertex < position.count; vertex += stride) {
      points.push(
        new THREE.Vector3()
          .fromBufferAttribute(position, vertex)
          .applyMatrix4(mesh.matrixWorld)
          .applyMatrix4(toChest),
      );
    }
  });
  return points;
}
