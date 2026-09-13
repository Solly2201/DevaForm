/**
 * Body profile — measured torso surfaces for body-relative attachment fit.
 *
 * The four body variants (and the bulk proportion) intentionally produce
 * different torso volumes, so clothing and ornaments cannot use absolute
 * transforms tuned to one body. The profile derives the same ellipsoid
 * measurements the body generator builds from its manifest params, and
 * generators size/drape themselves against these surfaces plus a small
 * clearance.
 *
 * IMPORTANT: the belly/chest formulas mirror humanoidBody (body.ts). If the
 * body generator's volumes change, update the profile with them — the
 * rig regression tests cover the relationship.
 *
 * This is pure data derivation: profiles come from asset params, never
 * from asset ids, so future bodies (and future deities' bodies) fit the
 * same attachments without renderer special cases.
 */
import type { Proportions } from "@devaform/character-schema";

export interface BodyProfile {
  /** Raw drivers from the body asset's params. */
  belly: number;
  chest: number;
  bulk: number;
  /** Belly ellipsoid, spine-joint-local: center + radii. */
  bellyCenterY: number;
  bellyCenterZ: number;
  bellyRadiusX: number;
  bellyRadiusY: number;
  bellyRadiusZ: number;
  /** Max forward extent of the belly surface (spine-local z). */
  bellyFrontZ: number;
  /** Pelvis/hip half-width — waistbands and skirts wrap this. */
  pelvisHalfWidth: number;
  /** Chest ellipsoid, chest-joint-local: center + radii. */
  chestCenterY: number;
  chestCenterZ: number;
  chestRadiusX: number;
  chestRadiusY: number;
  chestRadiusZ: number;
  /** Belly half-width at a spine-local height (0 where the slice is empty). */
  bellyHalfWidthAt(spineLocalY: number): number;
  /** Belly surface z at a spine-local (x, y); falls back to center z. */
  bellySurfaceZAt(x: number, spineLocalY: number): number;
  /** Chest surface z at a chest-joint-local (x, y). */
  chestSurfaceZAt(x: number, chestLocalY: number): number;
  /**
   * Combined torso surface z in chest-joint-local coordinates (the belly
   * transformed up into chest space) — for cloth that crosses both.
   */
  torsoSurfaceZAt(x: number, chestLocalY: number): number;
  /** Rear counterpart of torsoSurfaceZAt (most negative z of the torso). */
  torsoBackZAt(x: number, chestLocalY: number): number;
}

/** spine joint sits this far below the chest joint (see skeleton.ts). */
const SPINE_TO_CHEST_Y = 0.16;

function ellipseSliceZ(
  x: number,
  y: number,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
): number {
  const t = 1 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2;
  if (t <= 0) return cz;
  return cz + rz * Math.sqrt(t);
}

export function deriveBodyProfile(
  params: Record<string, number | string>,
  proportions: Proportions,
): BodyProfile {
  const belly = typeof params.belly === "number" ? params.belly : 1;
  const chest = typeof params.chest === "number" ? params.chest : 1;
  const bulk = proportions.bulk;

  // Belly — mirrors body.ts: sphere r=0.16+0.035*belly at spine+[0,0.03,0.02*belly],
  // scaled [bulk, 0.98, 0.96*bulk].
  const bellyR = 0.16 + 0.035 * belly;
  const bellyCenterY = 0.03;
  const bellyCenterZ = 0.02 * belly;
  const bellyRadiusX = bellyR * bulk;
  const bellyRadiusY = bellyR * 0.98;
  const bellyRadiusZ = bellyR * 0.96 * bulk;

  // Chest — mirrors body.ts: sphere r=0.148 at chest+[0,0.045,-0.005],
  // scaled [1.28*bulk*(0.94+0.06*chest), 0.92*chest, 0.9*bulk].
  const chestCenterY = 0.045;
  const chestCenterZ = -0.005;
  const chestRadiusX = 0.148 * 1.28 * bulk * (0.94 + 0.06 * chest);
  const chestRadiusY = 0.148 * 0.92 * chest;
  const chestRadiusZ = 0.148 * 0.9 * bulk;

  const bellyHalfWidthAt = (y: number): number => {
    const t = 1 - ((y - bellyCenterY) / bellyRadiusY) ** 2;
    return t <= 0 ? 0 : bellyRadiusX * Math.sqrt(t);
  };
  const bellySurfaceZAt = (x: number, y: number): number =>
    ellipseSliceZ(x, y, 0, bellyCenterY, bellyCenterZ, bellyRadiusX, bellyRadiusY, bellyRadiusZ);
  const chestSurfaceZAt = (x: number, y: number): number =>
    ellipseSliceZ(x, y, 0, chestCenterY, chestCenterZ, chestRadiusX, chestRadiusY, chestRadiusZ);
  const torsoSurfaceZAt = (x: number, y: number): number =>
    Math.max(chestSurfaceZAt(x, y), bellySurfaceZAt(x, y + SPINE_TO_CHEST_Y));
  // Rear surfaces mirror the front ones through each volume's center z.
  const torsoBackZAt = (x: number, y: number): number =>
    Math.min(
      2 * chestCenterZ - chestSurfaceZAt(x, y),
      2 * bellyCenterZ - bellySurfaceZAt(x, y + SPINE_TO_CHEST_Y),
    );

  return {
    belly,
    chest,
    bulk,
    bellyCenterY,
    bellyCenterZ,
    bellyRadiusX,
    bellyRadiusY,
    bellyRadiusZ,
    bellyFrontZ: bellyCenterZ + bellyRadiusZ,
    // Mirrors body.ts pelvis mass: sphere r=0.125 scaled x by 1.22*bulk.
    pelvisHalfWidth: 0.125 * 1.22 * bulk,
    chestCenterY,
    chestCenterZ,
    chestRadiusX,
    chestRadiusY,
    chestRadiusZ,
    bellyHalfWidthAt,
    bellySurfaceZAt,
    chestSurfaceZAt,
    torsoSurfaceZAt,
    torsoBackZAt,
  };
}
