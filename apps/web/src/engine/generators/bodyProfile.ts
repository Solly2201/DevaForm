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
import type { MeasuredBodyProfile, MeasuredBodySurfaces } from "@devaform/asset-system";

export interface BodyProfile {
  /** Raw drivers from the body asset's params. */
  belly: number;
  chest: number;
  bulk: number;
  /**
   * Neck column radius (widest point) — neck ornaments (malas, torques,
   * collars) wrap this surface plus their declared clearance instead of
   * assuming one deity's neck.
   */
  neckRadius: number;
  /**
   * Height (necklace-socket-local) where the neck column begins — collar
   * ornaments wrap their back half here so they circle the actual neck,
   * not the shoulders below it. 0 keeps the classic collar seat.
   */
  neckBaseOffsetY: number;
  /**
   * Wrap radius a full skirt/waist garment needs to clear the hips and
   * standing legs of THIS body. Waistbands worn over the garment wrap
   * this too.
   */
  dhotiRadius: number;
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
  /**
   * Measured surfaces shipped by a mesh body, with the morph influences
   * currently applied to it. When present they win: a measurement of the
   * mesh beats any formula guessing at it.
   */
  measured?: { profile: MeasuredBodyProfile; morphs: Readonly<Record<string, number>> },
): BodyProfile {
  if (measured) return deriveMeasuredProfile(measured.profile, measured.morphs);
  // The athletic (masculine human) body declares itself via its params —
  // pure data, so the engine never asks WHICH deity wears it.
  if (params.form === "athletic") return deriveAthleticProfile(params, proportions);
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
    // Mirrors body.ts neck cylinder (r 0.062 top / 0.082 bottom): widest
    // wrap point the collar ornaments actually sit on.
    neckRadius: 0.072,
    neckBaseOffsetY: 0,
    // Mirrors the classic dhoti sizing: wide enough that knee/shin masses
    // stay inside the skirt in standing poses.
    dhotiRadius: 0.165 * bulk,
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

/**
 * Measured profile — a mesh body's own surfaces, blended by the morph
 * influences currently applied to that mesh.
 *
 * The procedural profiles mirror the formulas their generator uses. A mesh
 * body has no such formulas, so its build script measures the geometry and
 * ships the numbers; here they are only blended, never invented.
 *
 * Note bulk is deliberately absent: it scales procedural primitives, and a
 * skinned mesh does not respond to it. Reporting a bulk-scaled surface for
 * a body that never changed would push ornaments off the skin. Girth on a
 * mesh body travels through its morph targets, which is exactly what the
 * deltas below describe.
 */
function deriveMeasuredProfile(
  measured: MeasuredBodyProfile,
  morphs: Readonly<Record<string, number>>,
): BodyProfile {
  const value = (key: keyof MeasuredBodySurfaces): number => {
    let total = measured.base[key];
    for (const [morph, influence] of Object.entries(morphs)) {
      if (!influence) continue;
      total += (measured.morphs?.[morph]?.[key] ?? 0) * influence;
    }
    return total;
  };

  const spineToChestY = value("spineToChestY");
  const bellyCenterY = value("bellyCenterY");
  const bellyCenterZ = value("bellyCenterZ");
  const bellyRadiusX = value("bellyRadiusX");
  const bellyRadiusY = value("bellyRadiusY");
  const bellyRadiusZ = value("bellyRadiusZ");
  const chestCenterY = value("chestCenterY");
  const chestCenterZ = value("chestCenterZ");
  const chestRadiusX = value("chestRadiusX");
  const chestRadiusY = value("chestRadiusY");
  const chestRadiusZ = value("chestRadiusZ");

  const bellyHalfWidthAt = (y: number): number => {
    const t = 1 - ((y - bellyCenterY) / bellyRadiusY) ** 2;
    return t <= 0 ? 0 : bellyRadiusX * Math.sqrt(t);
  };
  const bellySurfaceZAt = (x: number, y: number): number =>
    ellipseSliceZ(x, y, 0, bellyCenterY, bellyCenterZ, bellyRadiusX, bellyRadiusY, bellyRadiusZ);
  const chestSurfaceZAt = (x: number, y: number): number =>
    ellipseSliceZ(x, y, 0, chestCenterY, chestCenterZ, chestRadiusX, chestRadiusY, chestRadiusZ);
  // This body's own spine->chest gap, not the stylised rig's.
  const torsoSurfaceZAt = (x: number, y: number): number =>
    Math.max(chestSurfaceZAt(x, y), bellySurfaceZAt(x, y + spineToChestY));
  const torsoBackZAt = (x: number, y: number): number =>
    Math.min(
      2 * chestCenterZ - chestSurfaceZAt(x, y),
      2 * bellyCenterZ - bellySurfaceZAt(x, y + spineToChestY),
    );

  return {
    // Volume drivers belong to the procedural bodies; a measured body's
    // volume is the mesh itself, so consumers see the neutral values.
    belly: 1,
    chest: 1,
    bulk: 1,
    neckRadius: value("neckRadius"),
    neckBaseOffsetY: value("neckBaseOffsetY"),
    dhotiRadius: value("dhotiRadius"),
    bellyCenterY,
    bellyCenterZ,
    bellyRadiusX,
    bellyRadiusY,
    bellyRadiusZ,
    bellyFrontZ: bellyCenterZ + bellyRadiusZ,
    pelvisHalfWidth: value("pelvisHalfWidth"),
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

/**
 * Athletic/masculine human profile — mirrors bodyAthletic.ts exactly the
 * way the default profile mirrors body.ts:
 * - "belly" volume = the lower-torso loft (hips → waist), spine-local
 * - chest volume  = the upper-torso loft (ribcage/pec region), chest-local
 * - hips, neck column, collar seat and skirt clearance from the same
 *   params the lofts are built from.
 */
function deriveAthleticProfile(
  params: Record<string, number | string>,
  proportions: Proportions,
): BodyProfile {
  const chest = typeof params.chest === "number" ? params.chest : 1;
  const waist = typeof params.waist === "number" ? params.waist : 1;
  const shoulder = typeof params.shoulder === "number" ? params.shoulder : 1;
  const bulk = proportions.bulk;

  // Lower-torso loft approximation (spine-local): hip-dominant ellipsoid
  // spanning crotch to waist — mirrors the pelvis loft sections.
  const bellyCenterY = -0.02;
  const bellyCenterZ = 0.005;
  const bellyRadiusX = (0.107 * (0.6 + 0.4 * waist)) * bulk;
  const bellyRadiusY = 0.15;
  const bellyRadiusZ = 0.077 * bulk;

  // Upper-torso loft approximation (chest-local): ribcage/pec ellipsoid —
  // mirrors the chest loft sections (front reaches ≈0.097 at the pec line).
  const chestCenterY = 0.04;
  const chestCenterZ = 0.01;
  const chestRadiusX = 0.142 * shoulder * bulk;
  const chestRadiusY = 0.125 * (0.94 + 0.06 * chest);
  const chestRadiusZ = 0.088 * bulk;

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
  const torsoBackZAt = (x: number, y: number): number =>
    Math.min(
      2 * chestCenterZ - chestSurfaceZAt(x, y),
      2 * bellyCenterZ - bellySurfaceZAt(x, y + SPINE_TO_CHEST_Y),
    );

  const pelvisHalfWidth = 0.108 * bulk;

  return {
    belly: waist, // raw driver of the lower-torso volume
    chest,
    bulk,
    // Mirrors the bodyAthletic neck loft (base rx 0.052 → 0.037).
    neckRadius: 0.046 * bulk,
    // The neck loft begins above the shoulder loft: collars wrap there
    // (necklace-socket-local; socket sits at chest+0.12, neck joint +0.16).
    neckBaseOffsetY: 0.045,
    // Slimmer legs than the classic build -> tighter skirt wrap, but never
    // tighter than the hips.
    dhotiRadius: Math.max(0.15 * bulk, pelvisHalfWidth + 0.03),
    bellyCenterY,
    bellyCenterZ,
    bellyRadiusX,
    bellyRadiusY,
    bellyRadiusZ,
    bellyFrontZ: bellyCenterZ + bellyRadiusZ,
    // Mirrors the pelvis loft's hip sections (rx 0.108 * bulk).
    pelvisHalfWidth,
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
