/**
 * EXPERIMENTAL — the body as an occupancy, by adaptation.
 *
 * Deliberately NOT a new representation. The measured BodyProfile is
 * already the authoritative statement of where this body's surface is —
 * morph-blended, baked from the real mesh, held to the manifest by test
 * — and a second spatial model of the same body would be a second thing
 * to keep true. This experiment's own failure conditions name that
 * exactly ("merely duplicates existing bodyProfile/surfaceWalk
 * functionality"), so the adapter delegates every answer to the
 * profile and adds only the SHAPE of the question: a signed clearance,
 * comparable with what signedDistance() says about any other occupancy.
 *
 * The radial construction mirrors pushOutsideBody (surfaceWalk.ts): the
 * bearing is taken about the slice's own centre, and the skin on that
 * bearing is the boundary. One convention, stated once there, reused
 * here.
 */
import type * as THREE from "three";
import type { BodyProfile } from "../generators/bodyProfile";

/**
 * How clear of the torso's skin a chest-local point stands, on its own
 * bearing — positive outside, negative buried. The same number
 * pushOutsideBody would move the point by, read instead of applied.
 */
export function torsoClearanceAt(body: BodyProfile, chestLocal: THREE.Vector3): number {
  const centreZ =
    (body.surfaceAt(0, chestLocal.y).z + body.surfaceAt(Math.PI, chestLocal.y).z) / 2;
  const bearing = Math.atan2(chestLocal.x, chestLocal.z - centreZ);
  const skin = body.surfaceAt(bearing, chestLocal.y);
  const here = Math.hypot(chestLocal.x, chestLocal.z - centreZ);
  const there = Math.hypot(skin.x, skin.z - centreZ);
  return here - there;
}

/**
 * The worst penetration of a point cloud into the torso: the most
 * negative clearance found, as a positive depth (0 = everything clear).
 * The generic form of the per-case loops the test-suite has grown one
 * at a time — the same measurement, made once, for any asset.
 */
export function worstTorsoPenetration(
  body: BodyProfile,
  chestLocalPoints: readonly THREE.Vector3[],
): number {
  let worst = 0;
  for (const point of chestLocalPoints) {
    worst = Math.max(worst, -torsoClearanceAt(body, point));
  }
  return worst;
}
