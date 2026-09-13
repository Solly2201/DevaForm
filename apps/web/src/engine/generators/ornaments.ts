/**
 * Ornament generators: crowns (attachments) and jewellery sets (parts that
 * distribute rings/bands across limb joints so they follow every pose).
 */
import * as THREE from "three";
import { ARM_SLOTS, activeArmSlots, type JointId } from "@devaform/character-schema";
import { lathe, mesh, radialRing } from "../geometry";
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
const NECKLACE_SOCKET_Y = 0.12;
const NECKLACE_SOCKET_Z = 0.01;

/** Torso surface z in necklace-socket-local coordinates, with clearance. */
function chestZAtSocket(
  ctx: GeneratorContext,
  x: number,
  y: number,
  clearance: number,
): number {
  return (
    ctx.body.torsoSurfaceZAt(x, y + NECKLACE_SOCKET_Y) - NECKLACE_SOCKET_Z + clearance
  );
}

export const necklaceHaram: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  // Collar torus tilted so its front rim rests on the measured chest.
  const collarR = 0.088;
  const tilt = 0.6;
  const frontRimY = -Math.sin(tilt) * collarR;
  const collarZ = chestZAtSocket(ctx, 0, frontRimY, 0.004) - Math.cos(tilt) * collarR;
  group.add(
    mesh(new THREE.TorusGeometry(collarR, 0.013, 12, 40), metal, {
      position: [0, 0, collarZ],
      rotation: [Math.PI / 2 + tilt, 0, 0],
    }),
  );
  // Bead fringe along the front half, seated on the chest surface
  for (let i = 0; i < 9; i++) {
    const angle = Math.PI * (0.25 + (i / 8) * 0.5);
    const x = Math.cos(angle + Math.PI / 2) * 0.09;
    const frontness = Math.sin(angle + Math.PI / 2);
    if (frontness < 0.3) continue;
    const y = -0.028 * frontness - 0.012 + frontRimY;
    group.add(
      mesh(new THREE.SphereGeometry(0.0075, 10, 8), metal, {
        position: [x, y, chestZAtSocket(ctx, x, y, 0.006)],
      }),
    );
  }
  const pendant = gemStud(ctx, 0.016);
  const pendantY = frontRimY - 0.052;
  pendant.position.set(0, pendantY, chestZAtSocket(ctx, 0, pendantY, 0.008));
  pendant.scale.set(0.8, 1.25, 0.6);
  group.add(pendant);
  return group;
};

export const necklaceMala: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const gem = ctx.materials.get("gem");
  const group = new THREE.Group();
  const neckR = 0.078;
  // Two strands: the back half hugs the neck, the front half drapes down
  // and is lifted onto the measured chest surface.
  for (const [drop, spread, size] of [
    [0.05, 0.008, 0.0085],
    [0.085, 0.018, 0.0095],
  ] as const) {
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const frontness = Math.max(0, Math.sin(angle));
      const x = Math.cos(angle) * (neckR + frontness * spread);
      const y = 0.008 - frontness * drop;
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
  // Belt ring sized to sit just outside the dhoti waist (which wraps the
  // hips); the belly may overhang its top in front — that is the classic
  // lambodara silhouette, and the belt stays visible at sides and front.
  // Socket sits at pelvis + [0, 0.04, 0.12]; work in socket-local space.
  const beltR = ctx.body.pelvisHalfWidth + 0.022;
  group.add(
    mesh(new THREE.TorusGeometry(beltR, 0.012, 10, 48), metal, {
      position: [0, 0.015, -0.12],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  // Hanging tassels on the front of the cloth, forward of both the skirt
  // and whatever the belly surface reaches at that height.
  for (const dx of [-0.045, 0, 0.045]) {
    const tasselY = -0.015; // socket-local; pelvis-local 0.025
    const bellyZ = ctx.body.bellySurfaceZAt(dx, tasselY + 0.04 - 0.1);
    const frontZ = Math.max(beltR + 0.004, bellyZ + 0.012) - 0.12;
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

function bandRing(ctx: GeneratorContext, radius: number, tube: number, withGem = false): THREE.Group {
  const g = new THREE.Group();
  g.add(
    mesh(new THREE.TorusGeometry(radius, tube, 10, 26), ctx.materials.get("metal"), {
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  if (withGem) {
    const gem = gemStud(ctx, tube * 1.5);
    gem.position.set(0, tube * 0.4, radius);
    g.add(gem);
  }
  return g;
}

export const earringsKundala: PartGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  for (const side of [1, -1]) {
    const ring = mesh(new THREE.TorusGeometry(0.02, 0.0055, 10, 22), metal, {
      position: [side * 0.128, -0.075, 0.012],
      rotation: [0, side * 0.45, 0],
    });
    group.add(ring);
    const drop = gemStud(ctx, 0.0075);
    drop.position.set(side * 0.128, -0.1, 0.012);
    group.add(drop);
  }
  return [{ joint: "head", object: group }];
};

export const armletsVanki: PartGenerator = (ctx) => {
  const bulk = ctx.proportions.bulk;
  const parts: Array<{ joint: JointId; object: THREE.Object3D }> = [];
  for (const slot of ARM_SLOTS) {
    if (!activeArmSlots(ctx.arms).includes(slot)) continue;
    const band = bandRing(ctx, 0.043 * bulk, 0.0065, true);
    band.position.y = -0.055;
    parts.push({ joint: `arm.${slot}.upper`, object: band });
  }
  return parts;
};

export const braceletsKada: PartGenerator = (ctx) => {
  const bulk = ctx.proportions.bulk;
  const parts: Array<{ joint: JointId; object: THREE.Object3D }> = [];
  for (const slot of ARM_SLOTS) {
    if (!activeArmSlots(ctx.arms).includes(slot)) continue;
    const band = bandRing(ctx, 0.03 * bulk, 0.0055);
    band.position.y = 0.012;
    parts.push({ joint: `arm.${slot}.hand`, object: band });
  }
  return parts;
};

export const ankletsPayal: PartGenerator = (ctx) => {
  const parts: Array<{ joint: JointId; object: THREE.Object3D }> = [];
  for (const slot of ["left", "right"] as const) {
    const band = bandRing(ctx, 0.043, 0.006);
    band.position.y = 0.018;
    // Tiny bells
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      band.add(
        mesh(new THREE.SphereGeometry(0.0045, 8, 6), ctx.materials.get("metal"), {
          position: [Math.cos(angle) * 0.045, -0.008, Math.sin(angle) * 0.045],
        }),
      );
    }
    parts.push({ joint: `leg.${slot}.foot`, object: band });
  }
  return parts;
};
