/**
 * Ornament generators: crowns (attachments) and jewellery sets (parts that
 * distribute rings/bands across limb joints so they follow every pose).
 */
import * as THREE from "three";
import { ARM_SLOTS, activeArmSlots, type JointId } from "@devaform/character-schema";
import { lathe, mesh, radialRing, taperedTube, type V3 } from "../geometry";
import { headFit } from "./bodyProfile";
import { type AttachmentGenerator, type GeneratorContext, type PartGenerator } from "./types";

function gemStud(ctx: GeneratorContext, r: number): THREE.Mesh {
  return mesh(new THREE.SphereGeometry(r, 12, 10), ctx.materials.get("gem"));
}

// ---------------------------------------------------------------------------
// CROWNS
// ---------------------------------------------------------------------------

export const crownKirita: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();

  // Base band with bead ring
  group.add(
    mesh(
      lathe([
        [0.088, 0],
        [0.094, 0.012],
        [0.09, 0.03],
        [0.082, 0.042],
      ]),
      metal,
    ),
  );
  const beads = radialRing(14, 0.091, () => mesh(new THREE.SphereGeometry(0.007, 10, 8), metal), false);
  beads.position.y = 0.018;
  group.add(beads);

  // Tapering tiered cone
  group.add(
    mesh(
      lathe([
        [0.08, 0.042],
        [0.072, 0.075],
        [0.078, 0.08],
        [0.058, 0.115],
        [0.064, 0.12],
        [0.042, 0.155],
        [0.047, 0.159],
        [0.026, 0.19],
        [0.012, 0.208],
      ]),
      metal,
    ),
  );
  // Finial
  group.add(mesh(new THREE.SphereGeometry(0.014, 14, 12), metal, { position: [0, 0.216, 0] }));
  group.add(
    mesh(new THREE.ConeGeometry(0.007, 0.024, 10), metal, { position: [0, 0.238, 0] }),
  );
  // Front medallion + gems
  group.add(
    mesh(new THREE.SphereGeometry(0.02, 16, 12), metal, {
      position: [0, 0.05, 0.085],
      scale: [1, 1.25, 0.4],
    }),
  );
  const medGem = gemStud(ctx, 0.0105);
  medGem.position.set(0, 0.052, 0.096);
  medGem.scale.z = 0.5;
  group.add(medGem);
  const bandGems = radialRing(8, 0.088, () => {
    const gem = gemStud(ctx, 0.0065);
    gem.scale.z = 0.55;
    return gem;
  });
  bandGems.position.y = 0.024;
  group.add(bandGems);

  return group;
};

export const crownKaranda: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  group.add(
    mesh(
      lathe([
        [0.085, 0],
        [0.09, 0.01],
        [0.086, 0.028],
        [0.062, 0.05],
        [0.072, 0.056],
        [0.052, 0.082],
        [0.06, 0.087],
        [0.04, 0.112],
        [0.047, 0.116],
        [0.028, 0.14],
        [0.033, 0.143],
        [0.014, 0.162],
        [0.006, 0.17],
      ]),
      metal,
    ),
  );
  group.add(mesh(new THREE.SphereGeometry(0.011, 12, 10), metal, { position: [0, 0.176, 0] }));
  const gems = radialRing(6, 0.082, () => {
    const gem = gemStud(ctx, 0.006);
    gem.scale.z = 0.55;
    return gem;
  });
  gems.position.y = 0.016;
  group.add(gems);
  return group;
};

/** Band crown with a radiating fan plate behind (prabhaval-style). */
export const crownFan: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  group.add(
    mesh(
      lathe([
        [0.088, 0],
        [0.093, 0.012],
        [0.088, 0.034],
        [0.08, 0.045],
      ]),
      metal,
    ),
  );
  // Fan plate
  const fan = mesh(new THREE.CircleGeometry(0.115, 32, Math.PI * 0.15, Math.PI * 0.7), metal, {
    position: [0, 0.045, -0.02],
  });
  fan.material = metal;
  const fanBack = mesh(new THREE.CircleGeometry(0.115, 32, Math.PI * 0.15, Math.PI * 0.7), metal, {
    position: [0, 0.045, -0.022],
    rotation: [0, Math.PI, 0],
  });
  group.add(fan, fanBack);
  // Fan ribs
  for (let i = 0; i < 7; i++) {
    const angle = Math.PI * 0.2 + (i / 6) * Math.PI * 0.6;
    group.add(
      mesh(new THREE.CapsuleGeometry(0.0035, 0.1, 4, 8), metal, {
        position: [Math.cos(angle) * 0.062, 0.045 + Math.sin(angle) * 0.062, -0.018],
        rotation: [0, 0, angle - Math.PI / 2],
      }),
    );
  }
  const crest = gemStud(ctx, 0.009);
  crest.position.set(0, 0.05, 0.085);
  crest.scale.z = 0.5;
  group.add(crest);
  return group;
};

// ---------------------------------------------------------------------------
// NECKLACES / WAIST (attachments)
// ---------------------------------------------------------------------------

/**
 * Necklaces attach at the chest.necklace socket (chest joint + [0, 0.12,
 * 0.01]); the drape is fitted to the measured chest surface so beads lie
 * ON the torso rather than inside it, whatever the body variant.
 */
// Where that socket actually is comes from the body being worn — the
// stylised rig's numbers are its own, not every body's.

/** Torso surface z in necklace-socket-local coordinates, with clearance. */
export function chestZAtSocket(
  ctx: GeneratorContext,
  x: number,
  y: number,
  clearance: number,
): number {
  return (
    ctx.body.torsoSurfaceZAt(x, y + ctx.body.necklaceSocketY) -
    ctx.body.necklaceSocketZ +
    clearance
  );
}

export const necklaceHaram: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  // Relational surface drape: the collar band is a closed curve whose back
  // half hugs the neck and whose front half lies on the measured chest —
  // a rigid torus cannot do both without its sides sinking into the
  // pectorals, so the band is swept along the surface instead. The neck
  // half wraps the measured neck column, whatever body wears it.
  const neckR = ctx.body.neckRadius + 0.003;
  const collarY = ctx.body.neckBaseOffsetY;
  const bandPts: V3[] = [];
  const samples = 26;
  for (let i = 0; i <= samples; i++) {
    const angle = (i / samples) * Math.PI * 2;
    const frontness = Math.max(0, Math.sin(angle));
    const x = Math.cos(angle) * (neckR + frontness * 0.015);
    // Back half seats at the neck base; the front drops onto the chest.
    const y = collarY + 0.004 - frontness * (0.052 + collarY);
    const zNeck = Math.sin(angle) * neckR * 0.65;
    const z =
      frontness > 0.05
        ? Math.max(zNeck, chestZAtSocket(ctx, x, y, 0.005))
        : zNeck;
    bandPts.push([x, y, z]);
  }
  group.add(new THREE.Mesh(taperedTube(bandPts, [0.012, 0.012], 52, 12), metal));
  // Bead fringe along the front half, seated on the chest surface
  for (let i = 0; i < 9; i++) {
    const angle = Math.PI * (0.25 + (i / 8) * 0.5);
    const x = Math.cos(angle + Math.PI / 2) * 0.09;
    const frontness = Math.sin(angle + Math.PI / 2);
    if (frontness < 0.3) continue;
    const y = -0.062 * frontness - 0.012;
    group.add(
      mesh(new THREE.SphereGeometry(0.0075, 10, 8), metal, {
        position: [x, y, chestZAtSocket(ctx, x, y, 0.007)],
      }),
    );
  }
  const pendant = gemStud(ctx, 0.016);
  const pendantY = -0.098;
  pendant.position.set(0, pendantY, chestZAtSocket(ctx, 0, pendantY, 0.009));
  pendant.scale.set(0.8, 1.25, 0.6);
  group.add(pendant);
  return group;
};

export const necklaceMala: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const gem = ctx.materials.get("gem");
  const group = new THREE.Group();
  const neckR = ctx.body.neckRadius + 0.006;
  const collarY = ctx.body.neckBaseOffsetY;
  // Two strands: the back half hugs the neck base, the front half drapes
  // down and is lifted onto the measured chest surface.
  for (const [drop, spread, size] of [
    [0.05, 0.008, 0.0085],
    [0.085, 0.018, 0.0095],
  ] as const) {
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const frontness = Math.max(0, Math.sin(angle));
      const x = Math.cos(angle) * (neckR + frontness * spread);
      const y = collarY + 0.008 - frontness * (drop + collarY);
      const zNeck = Math.sin(angle) * neckR * 0.7;
      const z =
        frontness > 0.05
          ? Math.max(zNeck, chestZAtSocket(ctx, x, y, 0.007))
          : zNeck;
      group.add(
        mesh(new THREE.SphereGeometry(size, 10, 8), i % 5 === 0 ? gem : metal, {
          position: [x, y, z],
        }),
      );
    }
  }
  return group;
};

export const tikkaChandra: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  // Crescent above the tilak area
  group.add(
    mesh(new THREE.TorusGeometry(0.024, 0.0045, 10, 24, Math.PI), metal, {
      position: [0, 0.052, 0.022],
      rotation: [0.35, 0, 0],
    }),
  );
  // Hanging chain of small beads down the brow
  for (let i = 0; i < 3; i++) {
    group.add(
      mesh(new THREE.SphereGeometry(0.0038, 8, 6), metal, {
        position: [0, 0.042 - i * 0.011, 0.028 + i * 0.003],
      }),
    );
  }
  const drop = gemStud(ctx, 0.0075);
  drop.position.set(0, 0.006, 0.038);
  drop.scale.z = 0.6;
  group.add(drop);
  return group;
};

export const waistKamarband: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  // Relational fit: the belt encircles whatever the torso actually is at
  // the belt's own height — the wider of the hips and the belly overhang —
  // with a small clearance. Front depth follows the belly surface, so the
  // ring is elliptical on deep-bellied bodies instead of cutting through
  // them. Socket sits at pelvis + [0, 0.04, 0.12]; work socket-local.
  const beltY = 0.015; // socket-local; pelvis + 0.055
  const spineY = beltY + 0.04 - 0.1; // same height in spine-local space
  // The kamarband is worn over the dressed waist: it must clear the hips,
  // the belly overhang AND the skirt's wrap radius (a slim body in a full
  // dhoti still wears the belt outside the cloth, never inside it).
  const halfWidth = Math.max(
    ctx.body.pelvisHalfWidth + 0.014,
    ctx.body.bellyHalfWidthAt(spineY) + 0.008,
    ctx.body.dhotiRadius + 0.012,
  );
  const frontDepth = Math.max(halfWidth, ctx.body.bellySurfaceZAt(0, spineY) + 0.008);
  const belt = mesh(new THREE.TorusGeometry(halfWidth, 0.012, 10, 48), metal, {
    position: [0, beltY, -0.12],
    rotation: [Math.PI / 2, 0, 0],
  });
  belt.scale.z = 1; // torus lies in xz after rotation; depth scales via y
  belt.scale.y = frontDepth / halfWidth;
  group.add(belt);
  // Hanging tassels on the front, forward of both skirt and belly.
  for (const dx of [-0.045, 0, 0.045]) {
    const tasselY = -0.015; // socket-local; pelvis-local 0.025
    const bellyZ = ctx.body.bellySurfaceZAt(dx, tasselY + 0.04 - 0.1);
    const frontZ = Math.max(frontDepth + 0.004, bellyZ + 0.012) - 0.12;
    group.add(
      mesh(new THREE.CapsuleGeometry(0.005, 0.03, 4, 8), metal, {
        position: [dx, tasselY, frontZ],
      }),
    );
    const drop = gemStud(ctx, 0.007);
    drop.position.set(dx, tasselY - 0.028, frontZ);
    group.add(drop);
  }
  return group;
};

// ---------------------------------------------------------------------------
// JEWELLERY SETS (parts — follow their joints)
// ---------------------------------------------------------------------------

/** Air between a band and the skin it is worn on, metres. */
const BAND_CLEARANCE = 0.0015;

/**
 * A band worn round a limb of a measured radius.
 *
 * SIZED FROM THE INSIDE. A torus's major radius is the centre line of
 * its own tube, so a ring built AT the limb's radius has half its
 * thickness inside the limb — five and a half millimetres of gold buried
 * in a wrist, on every band ornament in this product, on every deity.
 * The measurement says where the skin is; the ring is placed so its
 * inner surface clears it.
 *
 * This is the fourth time the same sentence has had to be written down
 * about this codebase: an ornament that goes round something is sized by
 * what CONTAINS it. A radius that contains the limb still has to contain
 * the ornament's own body.
 */
function bandRing(ctx: GeneratorContext, limbRadius: number, width: number, withGem = false): THREE.Group {
  const g = new THREE.Group();
  const inner = limbRadius + BAND_CLEARANCE;
  // A vanki is a BAND: wide across the limb and thin off it. Built as a
  // torus it was a doughnut — as thick as it was wide — so on a
  // thirty-four millimetre arm it stood a centimetre proud all round and
  // read as a hoop hung on the shoulder rather than an armlet worn on it.
  const thickness = Math.max(0.0022, width * 0.42);
  const half = width;
  g.add(
    mesh(
      lathe([
        [inner, -half],
        [inner + thickness, -half * 0.72],
        [inner + thickness, half * 0.72],
        [inner, half],
      ], 30),
      ctx.materials.get("metal"),
      {},
    ),
  );
  if (withGem) {
    const gem = gemStud(ctx, thickness * 1.9);
    gem.position.set(0, 0, inner + thickness * 0.6);
    g.add(gem);
  }
  return g;
}

/**
 * Where a band sits on a limb, and which way that limb actually runs.
 *
 * A limb is not a plumb line: a forearm leaves its joint at four degrees
 * off vertical and a thigh at more. A ring laid flat at a measured
 * HEIGHT therefore sits beside the bone rather than round it, and tilts
 * across the limb instead of square to it — which is a millimetre and a
 * half of error on a wrist, all of it spent on the side the clearance
 * was meant for.
 *
 * The body measures the height; the skeleton knows the direction; this
 * puts the two together. Nothing is authored.
 */
function bandFrame(
  ctx: GeneratorContext,
  child: JointId,
  offsetY: number,
): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  // THIS body's skeleton, not the stylised table: the four-armed mesh's
  // second pair is its first pair moved, and its joints do not agree
  // with the stylised rig's mirrored back arms. Asking the global table
  // put every rear band two centimetres off the arm's own line and nine
  // degrees out of square — which is a bangle through a wrist.
  const axis = new THREE.Vector3(...ctx.jointOffset(child)).normalize();
  const along = Math.abs(axis.y) > 1e-6 ? offsetY / axis.y : offsetY;
  return {
    position: axis.clone().multiplyScalar(along),
    // The ring's own up is the limb's own direction.
    quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis),
  };
}

/** Seat a band on the limb its joint leads to. */
function seatBand(
  ctx: GeneratorContext,
  band: THREE.Group,
  child: JointId,
  offsetY: number,
): THREE.Group {
  const frame = bandFrame(ctx, child, offsetY);
  band.position.copy(frame.position);
  band.quaternion.copy(frame.quaternion);
  return band;
}

/**
 * Kundala earrings — mounted ON the ear sockets, which the ear-owning
 * part (Ganesha's ears, Shiva's head) refines onto its actual earlobes.
 * The rings therefore originate at the ear of whichever head wears them;
 * no per-deity placement exists here.
 */
export const earringsKundala: PartGenerator = (ctx) => {
  // Hoops are drawn against the reference skull; a smaller head wears
  // smaller kundala rather than the same rings sticking out sideways.
  const fit = headFit(ctx.body);
  const earring = (side: 1 | -1): THREE.Object3D => {
    const g = new THREE.Group();
    g.scale.setScalar(fit);
    g.add(
      mesh(new THREE.TorusGeometry(0.018, 0.005, 10, 22), ctx.materials.get("metal"), {
        position: [0, -0.014, 0.002],
        rotation: [0, side * 0.45, 0],
      }),
    );
    const drop = gemStud(ctx, 0.007);
    drop.position.set(0, -0.037, 0.002);
    g.add(drop);
    return g;
  };
  return [
    { socket: "head.leftEar", object: earring(1) },
    { socket: "head.rightEar", object: earring(-1) },
  ];
};

export const armletsVanki: PartGenerator = (ctx) => {
  const parts: Array<{ joint: JointId; object: THREE.Object3D }> = [];
  for (const slot of ARM_SLOTS) {
    if (!activeArmSlots(ctx.arms).includes(slot)) continue;
    // Seat and girth come from the body being worn, not from this
    // generator: the same vanki fits a heavy build and a lean human.
    const band = bandRing(ctx, ctx.body.armBandRadius, 0.0065, true);
    seatBand(ctx, band, `arm.${slot}.forearm`, ctx.body.armBandOffsetY);
    parts.push({ joint: `arm.${slot}.upper`, object: band });
  }
  return parts;
};

export const braceletsKada: PartGenerator = (ctx) => {
  const parts: Array<{ joint: JointId; object: THREE.Object3D }> = [];
  for (const slot of ARM_SLOTS) {
    if (!activeArmSlots(ctx.arms).includes(slot)) continue;
    // A bangle sits on the distal FOREARM: it must not rotate with the
    // wrist, or strong hand poses (dance gestures) drive it through the
    // palm. The forearm→hand joint offset is 0.14, so the band rests just
    // above the wrist line.
    const band = bandRing(ctx, ctx.body.wristBandRadius, 0.0055);
    seatBand(ctx, band, `arm.${slot}.hand`, ctx.body.wristBandOffsetY);
    parts.push({ joint: `arm.${slot}.forearm`, object: band });
  }
  return parts;
};

export const ankletsPayal: PartGenerator = (ctx) => {
  const parts: Array<{ joint: JointId; object: THREE.Object3D }> = [];
  for (const slot of ["left", "right"] as const) {
    const band = bandRing(ctx, ctx.body.ankleBandRadius, 0.006);
    band.position.y = ctx.body.ankleBandOffsetY;
    // The foot's own joint has no child to aim at; an anklet sits square
    // on the ankle, which the foot joint already is.
    // Tiny bells, hung off the band's own outside rather than the
    // limb's — they belong to the anklet, not to the leg.
    const hang = ctx.body.ankleBandRadius + BAND_CLEARANCE + 0.006;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      band.add(
        mesh(new THREE.SphereGeometry(0.0045, 8, 6), ctx.materials.get("metal"), {
          position: [Math.cos(angle) * hang, -0.008, Math.sin(angle) * hang],
        }),
      );
    }
    parts.push({ joint: `leg.${slot}.foot`, object: band });
  }
  return parts;
};
