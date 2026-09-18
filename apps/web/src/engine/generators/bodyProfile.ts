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
import type {
  MeasuredBodyProfile,
  MeasuredBodySurfaces,
  MeasuredLegEnvelope,
  MeasuredSkullEnvelope,
  MeasuredTorsoSurface,
} from "@devaform/asset-system";

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
  /** Pelvis-joint-local height of the natural waist — where a wrap ties. */
  waistSeatY: number;
  /** Chest ellipsoid, chest-joint-local: center + radii. */
  chestCenterY: number;
  chestCenterZ: number;
  chestRadiusX: number;
  chestRadiusY: number;
  chestRadiusZ: number;
  /**
   * Band ornaments (armlet, bangle, anklet): where they seat on the limb,
   * measured down from the owning joint, and the limb's radius there.
   * Procedural bodies restate the constants their generator was drawn
   * with; a mesh body reports what its limbs actually measure.
   */
  armBandOffsetY: number;
  armBandRadius: number;
  wristBandOffsetY: number;
  wristBandRadius: number;
  ankleBandOffsetY: number;
  ankleBandRadius: number;
  /**
   * Cranium the hair and crown geometry must fit, head-joint-local.
   * Measured on a mesh body; on a procedural one it is the skull that
   * body's own head generator draws.
   */
  headCenterY: number;
  /**
   * Where the cranium sits front to back, head-joint-local. Zero on a
   * body whose generator draws the skull around its own head joint; a
   * measured head reports where its skull actually is, because the joint
   * is at the base of it and behind it.
   */
  headCenterZ: number;
  headRadius: number;
  /**
   * The leg a wrapped garment has to follow: girths down its length,
   * the two segment lengths, and how far apart the hips set them.
   */
  thighTopRadius: number;
  thighMidRadius: number;
  kneeRadius: number;
  calfRadius: number;
  thighLength: number;
  shinLength: number;
  legSpreadX: number;
  /** Pelvis-local height of the hip joints — where the legs begin. */
  thighSeatY: number;
  /**
   * Where the necklace socket sits relative to the chest joint on THIS
   * body. Collars are drawn in socket space and fitted to the torso in
   * chest space; without this the two spaces are assumed to differ by
   * the stylised rig's offset, and a measured body's beads sink in.
   */
  necklaceSocketY: number;
  necklaceSocketZ: number;
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
  /**
   * A point on the torso's skin, chest-joint-local: `bearing` is measured
   * from the front and turns toward the figure's left, `y` is the height.
   *
   * This is what lets an ornament WRAP rather than merely rest: a path
   * can be authored in these two coordinates and evaluated onto whatever
   * body is wearing it. Measured bodies answer from their own surface;
   * others answer from the volume they were generated as.
   */
  surfaceAt(bearing: number, chestLocalY: number): { x: number; y: number; z: number };
  /**
   * How far the legs reach at a pelvis-local height: sideways, forward
   * and back. What a wrapped lower garment has to contain.
   *
   * A measured body reports its own; a generated one answers from the
   * limbs it was drawn with. Either way the garment asks rather than
   * assuming a limb is a cylinder around its joint — a calf is not, and a
   * dhoti lofted from a mean radius leaves both calves outside the cloth
   * from behind while looking perfectly fitted from the front.
   */
  legExtentAt(pelvisLocalY: number): { halfWidth: number; frontZ: number; backZ: number };
  /**
   * Head-joint-local heights of the landmarks headwear is placed by.
   * `crownSocketY/Z` is where the crown socket sits, so geometry authored
   * in socket space can convert; `browY` is where a band grips; and
   * `skullTopY` is where the head stops.
   */
  crownSocketY: number;
  crownSocketZ: number;
  browY: number;
  skullTopY: number;
  /**
   * The head's own silhouette at a height, head-joint-local: how wide it
   * is and how far the skin reaches front and back.
   *
   * What a crown has to go ROUND. A head is neither round nor centred on
   * its joint, and a band built at `headRadius` around the socket sits
   * through the forehead at the front while hanging in the air behind —
   * which is exactly what the kirita did.
   */
  skullAt(headLocalY: number): { halfWidth: number; frontZ: number; backZ: number };
}

/** Read a measured skull envelope at a height, linearly between rows. */
function sampleSkullEnvelope(
  envelope: MeasuredSkullEnvelope,
  y: number,
): { halfWidth: number; frontZ: number; backZ: number } {
  const rows = envelope.halfWidth.length;
  const at = Math.min(
    rows - 1,
    Math.max(0, (y - envelope.y0) / (envelope.step || 1)),
  );
  const low = Math.floor(at);
  const high = Math.min(rows - 1, low + 1);
  const t = at - low;
  const mix = (values: readonly number[]) =>
    (values[low] ?? 0) * (1 - t) + (values[high] ?? 0) * t;
  return {
    halfWidth: mix(envelope.halfWidth),
    frontZ: mix(envelope.frontZ),
    backZ: mix(envelope.backZ),
  };
}

/**
 * The skull of a body that did not measure one: the sphere its own head
 * generator drew, which is the honest answer for a procedural head.
 */
function generatedSkullAt(
  head: { headCenterY: number; headCenterZ: number; headRadius: number },
  y: number,
): { halfWidth: number; frontZ: number; backZ: number } {
  const offset = (y - head.headCenterY) / head.headRadius;
  const across = Math.sqrt(Math.max(0, 1 - offset * offset)) * head.headRadius;
  return {
    halfWidth: across,
    frontZ: head.headCenterZ + across,
    backZ: head.headCenterZ - across,
  };
}

/** Read a measured leg envelope at a height, linearly between rows. */
function sampleLegEnvelope(
  envelope: MeasuredLegEnvelope,
  y: number,
  /** The morph influences the mesh is currently blended by. */
  morphs: Readonly<Record<string, number>> = {},
): { halfWidth: number; frontZ: number; backZ: number } {
  const rows = envelope.halfWidth.length;
  const span = envelope.bottomY - envelope.topY;
  const at = Math.min(
    rows - 1,
    Math.max(0, (Math.abs(span) < 1e-9 ? 0 : (y - envelope.topY) / span) * (rows - 1)),
  );
  const low = Math.floor(at);
  const high = Math.min(rows - 1, low + 1);
  const t = at - low;
  // The neutral rows plus whatever the customer's morphs do to them, on
  // the same rows, by the same influences the mesh itself is blended by.
  // A garment cut to the neutral envelope alone showed a window of shin
  // through the cloth the moment a build widened the calves.
  //
  // OUTWARD contributions only. The envelope is a containment bound, and
  // three numbers per row cannot see bearings: a build that slims the
  // waist at the sides while leaving the hip's diagonal exactly where it
  // was would, applied in full, pull the cloth through that diagonal —
  // four vertices of Shiva's hips sat inside the wrap for precisely this.
  // A bound a morph pushes outward must follow it (the calf through the
  // dhoti); a bound a morph retreats from stays where the neutral body
  // put it, and the cloth hangs a couple of millimetres looser, which is
  // what cloth does.
  const mix = (
    values: readonly number[],
    outward: 1 | -1,
    deltas?: (name: string) => readonly number[] | undefined,
  ) => {
    const blend = (index: number) => {
      let value = values[index] ?? 0;
      if (deltas) {
        for (const [name, influence] of Object.entries(morphs)) {
          if (!influence) continue;
          const moved = (deltas(name)?.[index] ?? 0) * influence;
          if (moved * outward > 0) value += moved;
        }
      }
      return value;
    };
    return blend(low) * (1 - t) + blend(high) * t;
  };
  return {
    halfWidth: mix(envelope.halfWidth, 1, (name) => envelope.morphs?.[name]?.halfWidth),
    frontZ: mix(envelope.frontZ, 1, (name) => envelope.morphs?.[name]?.frontZ),
    // The back bound grows in the NEGATIVE direction.
    backZ: mix(envelope.backZ, -1, (name) => envelope.morphs?.[name]?.backZ),
  };
}

/**
 * The leg extent a body without a measured envelope reports: the limbs
 * its own generator drew, as cylinders about their joints. Honest for a
 * body that IS cylinders.
 */
function generatedLegExtent(
  profile: Pick<
    BodyProfile,
    "legSpreadX" | "thighTopRadius" | "thighMidRadius" | "kneeRadius" | "calfRadius" | "thighLength" | "shinLength" | "thighSeatY"
  >,
  y: number,
): { halfWidth: number; frontZ: number; backZ: number } {
  const below = profile.thighSeatY - y;
  const radius =
    below <= 0
      ? profile.thighTopRadius
      : below < profile.thighLength
        ? profile.thighTopRadius +
          (profile.kneeRadius - profile.thighTopRadius) * (below / profile.thighLength)
        : profile.kneeRadius +
          (profile.calfRadius - profile.kneeRadius) *
            Math.min(1, (below - profile.thighLength) / Math.max(1e-6, profile.shinLength));
  return {
    halfWidth: profile.legSpreadX + radius,
    frontZ: radius,
    backZ: -radius,
  };
}

/**
 * The skull the head-worn geometry (hair, crown, earrings, crescent) was
 * drawn against. Dividing a body's measured cranium by this gives the
 * factor those pieces need to sit on it.
 */
export const REFERENCE_SKULL = { radius: 0.067, centerY: 0.055, centerZ: -0.007 };

/**
 * The skull a procedural body's own head generator draws — stated once,
 * so the profile and the sphere the crown is fitted to cannot drift.
 */
const HEAD = { headCenterY: 0.063, headCenterZ: 0, headRadius: 0.067 };

/** How much bigger or smaller this body's skull is than the reference. */
export function headFit(body: Pick<BodyProfile, "headRadius">): number {
  return body.headRadius / REFERENCE_SKULL.radius;
}

/**
 * The wrist a held item was drawn around (the classic body's). Wrist
 * girth is what scales with hand size, and unlike finger reach it is
 * already measured on every body.
 */
export const REFERENCE_WRIST_RADIUS = 0.03;

/**
 * How much a held item gives to the hand holding it.
 *
 * Not the raw ratio: a drum is the size a drum is, and a smaller hand
 * holds the same drum rather than a miniature of it. So the item follows
 * the hand only part of the way — enough that a stylised fist's props do
 * not read as barrels in a human one, not so much that they become toys.
 */
export function handFit(body: Pick<BodyProfile, "wristBandRadius">): number {
  return 0.68 + 0.32 * (body.wristBandRadius / REFERENCE_WRIST_RADIUS);
}

/**
 * A point on a generated body's skin, by bearing and height. A body made
 * of ellipsoids has no measured surface, so it answers from the volume it
 * was built as — which for such a body is the truth.
 */
/**
 * The two ellipsoids a procedural torso is generated as, plus the neck it
 * runs up into. Enough to answer where the skin is at any bearing and
 * height without the caller doing the arithmetic — which is the point:
 * each caller used to pass ONE half-width for the whole body, so the
 * surface reported chest width at the throat and anything walked round
 * the neck stood a hand's breadth off it.
 */
interface GeneratedTorso {
  chestCenterY: number;
  chestCenterZ: number;
  chestRadiusX: number;
  chestRadiusY: number;
  chestRadiusZ: number;
  bellyCenterY: number;
  bellyCenterZ: number;
  bellyRadiusX: number;
  bellyRadiusY: number;
  bellyRadiusZ: number;
  spineToChestY: number;
  neckRadius: number;
}

function ellipseHalfWidth(y: number, centreY: number, rx: number, ry: number): number {
  const t = 1 - ((y - centreY) / ry) ** 2;
  return t <= 0 ? 0 : rx * Math.sqrt(t);
}

function generatedSurfaceAt(
  bearing: number,
  y: number,
  torso: GeneratedTorso,
): { x: number; y: number; z: number } {
  const bellyY = y + torso.spineToChestY;
  // Width and depth are both measured AT THIS HEIGHT, from whichever of
  // the two volumes reaches further there, and never inside the neck.
  const halfWidth = Math.max(
    ellipseHalfWidth(y, torso.chestCenterY, torso.chestRadiusX, torso.chestRadiusY),
    ellipseHalfWidth(bellyY, torso.bellyCenterY, torso.bellyRadiusX, torso.bellyRadiusY),
    torso.neckRadius,
  );
  const frontZ = Math.max(
    ellipseSliceZ(0, y, 0, torso.chestCenterY, torso.chestCenterZ,
      torso.chestRadiusX, torso.chestRadiusY, torso.chestRadiusZ),
    ellipseSliceZ(0, bellyY, 0, torso.bellyCenterY, torso.bellyCenterZ,
      torso.bellyRadiusX, torso.bellyRadiusY, torso.bellyRadiusZ),
  );
  const centreZ = torso.chestCenterZ;
  const halfDepth = Math.max(frontZ - centreZ, torso.neckRadius);
  return {
    x: Math.sin(bearing) * halfWidth,
    y,
    z: centreZ + Math.cos(bearing) * halfDepth,
  };
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
  measured?: {
    profile: MeasuredBodyProfile;
    morphs: Readonly<Record<string, number>>;
    torsoSurface?: MeasuredTorsoSurface;
    legEnvelope?: MeasuredLegEnvelope;
    skullEnvelope?: MeasuredSkullEnvelope;
  },
): BodyProfile {
  if (measured) {
    return deriveMeasuredProfile(
      measured.profile,
      measured.morphs,
      measured.torsoSurface,
      measured.legEnvelope,
      measured.skullEnvelope,
    );
  }
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

  // Mirrors body.ts neck cylinder (r 0.062 top / 0.082 bottom): widest
  // wrap point the collar ornaments actually sit on.
  const neckRadius = 0.072;

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

  // The legs the classic body generator draws (see body.ts).
  const legs = {
    thighTopRadius: 0.062 * bulk,
    thighMidRadius: 0.056 * bulk,
    kneeRadius: 0.042 * bulk,
    calfRadius: 0.046 * bulk,
    thighLength: 0.2,
    shinLength: 0.19,
    legSpreadX: 0.075 * bulk,
    thighSeatY: -0.05,
  };

  return {
    belly,
    chest,
    bulk,
    neckRadius,
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
    // Where the classic wrap ties, and the bands it was drawn with.
    waistSeatY: 0.055,
    armBandOffsetY: -0.055,
    armBandRadius: 0.043 * bulk,
    wristBandOffsetY: -0.128,
    wristBandRadius: 0.03 * bulk,
    ankleBandOffsetY: 0.018,
    ankleBandRadius: 0.043,
    ...legs,
    // The socket the stylised skeleton declares (see sockets.ts).
    necklaceSocketY: 0.12,
    necklaceSocketZ: 0.01,
    headCenterY: HEAD.headCenterY,
    headCenterZ: HEAD.headCenterZ,
    headRadius: HEAD.headRadius,
    bellyHalfWidthAt,
    bellySurfaceZAt,
    chestSurfaceZAt,
    torsoSurfaceZAt,
    torsoBackZAt,
    surfaceAt: (bearing: number, y: number) =>
      generatedSurfaceAt(bearing, y, {
        chestCenterY,
        chestCenterZ,
        chestRadiusX,
        chestRadiusY,
        chestRadiusZ,
        bellyCenterY,
        bellyCenterZ,
        bellyRadiusX,
        bellyRadiusY,
        bellyRadiusZ,
        spineToChestY: SPINE_TO_CHEST_Y,
        neckRadius,
      }),
    legExtentAt: (y: number) => generatedLegExtent(legs, y),
    // The stylised skeleton's own head sockets (see sockets.ts), and the
    // sphere this body's head generator draws.
    crownSocketY: 0.172,
    crownSocketZ: -0.005,
    browY: 0.07,
    skullTopY: HEAD.headCenterY + HEAD.headRadius,
    skullAt: (y: number) => generatedSkullAt(HEAD, y),
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
/**
 * Read a measured torso surface on a bearing at a height, bilinearly.
 * Bearings wrap; heights hold the edge row, which is what a surface does
 * at its silhouette — it stops, it does not fall away to the centre line.
 */
function sampleSurface(
  map: MeasuredTorsoSurface,
  bearing: number,
  y: number,
  morphs: Readonly<Record<string, number>> = {},
): { x: number; z: number } {
  const rowAt = Math.min(
    map.rows - 1,
    Math.max(0, ((y - map.minY) / (map.maxY - map.minY)) * (map.rows - 1)),
  );
  const r0 = Math.floor(rowAt);
  const r1 = Math.min(map.rows - 1, r0 + 1);
  const fr = rowAt - r0;

  const turn = ((bearing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const colAt = (turn / (Math.PI * 2)) * map.columns;
  const c0 = Math.floor(colAt) % map.columns;
  const c1 = (c0 + 1) % map.columns;
  const fc = colAt - Math.floor(colAt);

  // The neutral surface plus whatever the customer's morphs do to it, on
  // the same grid and by the same influences the mesh is blended by.
  const radiusAt = (row: number, col: number) => {
    const index = row * map.columns + col;
    let value = map.radius[index] ?? 0;
    for (const [name, influence] of Object.entries(morphs)) {
      if (!influence) continue;
      value += (map.morphs?.[name]?.radius[index] ?? 0) * influence;
    }
    return value;
  };
  const radius =
    (radiusAt(r0, c0) * (1 - fc) + radiusAt(r0, c1) * fc) * (1 - fr) +
    (radiusAt(r1, c0) * (1 - fc) + radiusAt(r1, c1) * fc) * fr;
  const centreAt = (row: number) => {
    let value = map.centreZ[row] ?? 0;
    for (const [name, influence] of Object.entries(morphs)) {
      if (!influence) continue;
      value += (map.morphs?.[name]?.centreZ[row] ?? 0) * influence;
    }
    return value;
  };
  const centre = centreAt(r0) * (1 - fr) + centreAt(r1) * fr;
  return { x: Math.sin(turn) * radius, z: centre + Math.cos(turn) * radius };
}

function deriveMeasuredProfile(
  measured: MeasuredBodyProfile,
  morphs: Readonly<Record<string, number>>,
  torsoSurface?: MeasuredTorsoSurface,
  legEnvelope?: MeasuredLegEnvelope,
  skullEnvelope?: MeasuredSkullEnvelope,
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
  // A point on the skin, by bearing and height. This is the primitive;
  // everything else about the surface is asked through it.
  const surfaceAt = (bearing: number, y: number) => {
    if (torsoSurface) {
      const { x, z } = sampleSurface(torsoSurface, bearing, y, morphs);
      return { x, y, z };
    }
    // Without a measurement, the volume the body was generated as.
    return generatedSurfaceAt(bearing, y, {
      chestCenterY,
      chestCenterZ,
      chestRadiusX,
      chestRadiusY,
      chestRadiusZ,
      bellyCenterY,
      bellyCenterZ,
      bellyRadiusX,
      bellyRadiusY,
      bellyRadiusZ,
      spineToChestY,
      neckRadius: value("neckRadius"),
    });
  };

  // The measured surface wins where the body shipped one: an ellipsoid
  // describes a torso's volume well and its surface badly, and ornaments
  // lie on the surface. The front is just the bearing that reaches a
  // given x, found by walking in from the straight-ahead guess.
  const torsoSurfaceZAt = (x: number, y: number): number => {
    if (!torsoSurface) {
      return Math.max(chestSurfaceZAt(x, y), bellySurfaceZAt(x, y + spineToChestY));
    }
    // Walk the front half and take the bearing that reaches this x. The
    // surface is not a circle, so there is no closed form for it; a short
    // sweep is exact enough and costs nothing at build-a-rig frequency.
    const steps = 24;
    let previous = surfaceAt(-Math.PI / 2, y);
    for (let i = 1; i <= steps; i += 1) {
      const bearing = -Math.PI / 2 + (i / steps) * Math.PI;
      const point = surfaceAt(bearing, y);
      if ((previous.x - x) * (point.x - x) <= 0) {
        const span = point.x - previous.x;
        const t = Math.abs(span) < 1e-9 ? 0 : (x - previous.x) / span;
        return previous.z + (point.z - previous.z) * t;
      }
      previous = point;
    }
    return previous.z;
  };
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
    waistSeatY: value("waistSeatY"),
    // Measured off this body's own limbs.
    armBandOffsetY: value("armBandOffsetY"),
    armBandRadius: value("armBandRadius"),
    wristBandOffsetY: value("wristBandOffsetY"),
    wristBandRadius: value("wristBandRadius"),
    ankleBandOffsetY: value("ankleBandOffsetY"),
    ankleBandRadius: value("ankleBandRadius"),
    thighTopRadius: value("thighTopRadius"),
    thighMidRadius: value("thighMidRadius"),
    kneeRadius: value("kneeRadius"),
    calfRadius: value("calfRadius"),
    thighLength: value("thighLength"),
    shinLength: value("shinLength"),
    legSpreadX: value("legSpreadX"),
    thighSeatY: value("thighSeatY"),
    necklaceSocketY: value("necklaceSocketY"),
    necklaceSocketZ: value("necklaceSocketZ"),
    headCenterY: value("headCenterY"),
    headCenterZ: value("headCenterZ"),
    headRadius: value("headRadius"),
    bellyHalfWidthAt,
    bellySurfaceZAt,
    chestSurfaceZAt,
    torsoSurfaceZAt,
    torsoBackZAt,
    surfaceAt,
    crownSocketY: value("crownSocketY"),
    crownSocketZ: value("crownSocketZ"),
    browY: value("browY"),
    skullTopY: value("skullTopY"),
    skullAt: (y: number) =>
      skullEnvelope
        ? sampleSkullEnvelope(skullEnvelope, y)
        : generatedSkullAt(
            {
              headCenterY: value("headCenterY"),
              headCenterZ: value("headCenterZ"),
              headRadius: value("headRadius"),
            },
            y,
          ),
    legExtentAt: (y: number) =>
      legEnvelope
        ? sampleLegEnvelope(legEnvelope, y, morphs)
        : generatedLegExtent(
            {
              legSpreadX: value("legSpreadX"),
              thighTopRadius: value("thighTopRadius"),
              thighMidRadius: value("thighMidRadius"),
              kneeRadius: value("kneeRadius"),
              calfRadius: value("calfRadius"),
              thighLength: value("thighLength"),
              shinLength: value("shinLength"),
              thighSeatY: value("thighSeatY"),
            },
            y,
          ),
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
  // Mirrors the bodyAthletic neck loft (base rx 0.052 -> 0.037).
  const neckRadius = 0.046 * bulk;

  // The legs the classic body generator draws (see body.ts).
  const legs = {
    thighTopRadius: 0.062 * bulk,
    thighMidRadius: 0.056 * bulk,
    kneeRadius: 0.042 * bulk,
    calfRadius: 0.046 * bulk,
    thighLength: 0.2,
    shinLength: 0.19,
    legSpreadX: 0.075 * bulk,
    thighSeatY: -0.05,
  };

  return {
    belly: waist, // raw driver of the lower-torso volume
    chest,
    bulk,
    neckRadius,
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
    // Where the classic wrap ties, and the bands it was drawn with.
    waistSeatY: 0.055,
    armBandOffsetY: -0.055,
    armBandRadius: 0.043 * bulk,
    wristBandOffsetY: -0.128,
    wristBandRadius: 0.03 * bulk,
    ankleBandOffsetY: 0.018,
    ankleBandRadius: 0.043,
    ...legs,
    // The socket the stylised skeleton declares (see sockets.ts).
    necklaceSocketY: 0.12,
    necklaceSocketZ: 0.01,
    headCenterY: HEAD.headCenterY,
    headCenterZ: HEAD.headCenterZ,
    headRadius: HEAD.headRadius,
    bellyHalfWidthAt,
    bellySurfaceZAt,
    chestSurfaceZAt,
    torsoSurfaceZAt,
    torsoBackZAt,
    surfaceAt: (bearing: number, y: number) =>
      generatedSurfaceAt(bearing, y, {
        chestCenterY,
        chestCenterZ,
        chestRadiusX,
        chestRadiusY,
        chestRadiusZ,
        bellyCenterY,
        bellyCenterZ,
        bellyRadiusX,
        bellyRadiusY,
        bellyRadiusZ,
        spineToChestY: SPINE_TO_CHEST_Y,
        neckRadius,
      }),
    legExtentAt: (y: number) => generatedLegExtent(legs, y),
    // The stylised skeleton's own head sockets (see sockets.ts), and the
    // sphere this body's head generator draws.
    crownSocketY: 0.172,
    crownSocketZ: -0.005,
    browY: 0.07,
    skullTopY: HEAD.headCenterY + HEAD.headRadius,
    skullAt: (y: number) => generatedSkullAt(HEAD, y),
  };
}
