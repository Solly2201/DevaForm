/**
 * Procedural placeholder generators.
 *
 * These stand in for production GLB assets. Each generator builds simple
 * THREE geometry and returns either meshes distributed across joints (parts)
 * or a single object (attachments). Meshes use shared zone materials so
 * color changes never rebuild geometry.
 *
 * When a production asset replaces a placeholder, its manifest `source`
 * becomes { kind: "glb", path } and this file is simply no longer consulted
 * for that asset.
 */
import * as THREE from "three";
import { getJoint, type JointId, type Proportions } from "@devaform/character-schema";
import type { ZoneMaterials } from "./materials";

export interface GeneratorContext {
  params: Record<string, number | string>;
  materials: ZoneMaterials;
  proportions: Proportions;
}

/** A part places objects onto one or more joints so posing articulates it. */
export type JointedPart = ReadonlyArray<{ joint: JointId; object: THREE.Object3D }>;

export type PartGenerator = (ctx: GeneratorContext) => JointedPart;
export type AttachmentGenerator = (ctx: GeneratorContext) => THREE.Object3D;

const num = (ctx: GeneratorContext, key: string, fallback: number): number => {
  const value = ctx.params[key];
  return typeof value === "number" ? value : fallback;
};

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  transform?: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number] | number;
  },
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  m.receiveShadow = true;
  if (transform?.position) m.position.set(...transform.position);
  if (transform?.rotation) m.rotation.set(...transform.rotation);
  if (transform?.scale !== undefined) {
    if (typeof transform.scale === "number") m.scale.setScalar(transform.scale);
    else m.scale.set(...transform.scale);
  }
  return m;
}

/** Capsule from a joint toward its child joint (limbs). Points down -Y. */
function limbCapsule(
  material: THREE.Material,
  length: number,
  radius: number,
): THREE.Mesh {
  const geo = new THREE.CapsuleGeometry(radius, length, 6, 14);
  const m = mesh(geo, material, { position: [0, -length / 2, 0] });
  return m;
}

function jointDistance(child: JointId): number {
  const def = getJoint(child);
  const [x, y, z] = def.position;
  return Math.sqrt(x * x + y * y + z * z);
}

// ---------------------------------------------------------------------------
// PART GENERATORS
// ---------------------------------------------------------------------------

const ganeshaBody: PartGenerator = (ctx) => {
  const skin = ctx.materials.get("skin");
  const belly = num(ctx, "belly", 1);
  const bulk = ctx.proportions.bulk;

  const parts: Array<{ joint: JointId; object: THREE.Object3D }> = [];

  // Pelvis block
  parts.push({
    joint: "pelvis",
    object: mesh(new THREE.SphereGeometry(0.11, 24, 18), skin, {
      position: [0, 0.02, 0],
      scale: [1.15 * bulk, 0.85, 0.95 * bulk],
    }),
  });

  // Belly — the defining Ganesha volume, sits on the spine joint.
  parts.push({
    joint: "spine",
    object: mesh(new THREE.SphereGeometry(0.15, 28, 22), skin, {
      position: [0, 0.02, 0.02 * belly],
      scale: [(0.85 + 0.35 * belly) * bulk, 0.8 + 0.25 * belly, (0.8 + 0.4 * belly) * bulk],
    }),
  });

  // Chest
  parts.push({
    joint: "chest",
    object: mesh(new THREE.SphereGeometry(0.13, 24, 18), skin, {
      position: [0, 0.05, 0],
      scale: [1.25 * bulk, 0.85, 0.9 * bulk],
    }),
  });

  // Neck
  parts.push({
    joint: "neck",
    object: mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.09, 16), skin, {
      position: [0, 0.03, 0],
    }),
  });

  // Limbs on their joints so rotations articulate.
  const armRadius = 0.037 * bulk;
  for (const slot of ["frontLeft", "frontRight", "backLeft", "backRight"] as const) {
    parts.push({
      joint: `arm.${slot}.upper`,
      object: limbCapsule(skin, jointDistance(`arm.${slot}.forearm`), armRadius),
    });
    parts.push({
      joint: `arm.${slot}.forearm`,
      object: limbCapsule(skin, jointDistance(`arm.${slot}.hand`), armRadius * 0.85),
    });
    parts.push({
      joint: `arm.${slot}.hand`,
      object: mesh(new THREE.SphereGeometry(0.042, 16, 12), skin, {
        position: [0, -0.03, 0.005],
        scale: [1, 1.15, 0.75],
      }),
    });
  }

  for (const slot of ["left", "right"] as const) {
    parts.push({
      joint: `leg.${slot}.thigh`,
      object: limbCapsule(skin, jointDistance(`leg.${slot}.shin`), 0.06 * bulk),
    });
    parts.push({
      joint: `leg.${slot}.shin`,
      object: limbCapsule(skin, jointDistance(`leg.${slot}.foot`), 0.048 * bulk),
    });
    parts.push({
      joint: `leg.${slot}.foot`,
      object: mesh(new THREE.SphereGeometry(0.055, 16, 12), skin, {
        position: [0, -0.02, 0.03],
        scale: [0.9, 0.55, 1.5],
      }),
    });
  }

  return parts;
};

const ganeshaHead: PartGenerator = (ctx) => {
  const skin = ctx.materials.get("skin");
  const dome = num(ctx, "dome", 1);
  const group = new THREE.Group();

  // Cranium
  group.add(
    mesh(new THREE.SphereGeometry(0.12, 28, 22), skin, {
      position: [0, 0.07, 0],
      scale: [1, 0.92 + 0.12 * dome, 0.98],
    }),
  );
  // Forehead/brow mass
  group.add(
    mesh(new THREE.SphereGeometry(0.085, 24, 18), skin, {
      position: [0, 0.055, 0.055],
      scale: [1.1, 0.8, 0.9],
    }),
  );
  // Cheeks/jaw
  group.add(
    mesh(new THREE.SphereGeometry(0.09, 24, 18), skin, {
      position: [0, -0.005, 0.03],
      scale: [1.05, 0.75, 0.95],
    }),
  );
  return [{ joint: "head", object: group }];
};

const ganeshaEars: PartGenerator = (ctx) => {
  const skin = ctx.materials.get("skin");
  const inner = ctx.materials.get("skinSecondary");
  const size = num(ctx, "size", 1);
  const group = new THREE.Group();

  for (const side of [1, -1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.115, 0.045, -0.01);
    ear.rotation.y = side * 0.5;
    ear.rotation.z = side * -0.15;
    ear.add(
      mesh(new THREE.SphereGeometry(0.085 * size, 20, 16), skin, {
        scale: [0.85, 1.15, 0.16],
      }),
    );
    ear.add(
      mesh(new THREE.SphereGeometry(0.062 * size, 18, 14), inner, {
        position: [side * 0.004, -0.004, 0.008],
        scale: [0.8, 1.1, 0.1],
      }),
    );
    group.add(ear);
  }
  return [{ joint: "head", object: group }];
};

const ganeshaTrunk: PartGenerator = (ctx) => {
  const skin = ctx.materials.get("skin");
  const curl = num(ctx, "curl", 1); // 1 = left curl, -1 = right curl

  const seg = (radiusTop: number, radiusBottom: number, length: number) =>
    mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 14), skin, {
      position: [0, -length / 2, 0],
    });

  const base = new THREE.Group();
  base.add(seg(0.052, 0.042, 0.09));

  const mid = new THREE.Group();
  mid.add(seg(0.04, 0.032, 0.085));
  // Built-in gentle sideways drift so the rest trunk already reads as curled.
  mid.rotation.set(0.35, 0, curl * 0.25);

  const tip = new THREE.Group();
  tip.add(seg(0.03, 0.022, 0.075));
  const tipEnd = mesh(new THREE.SphereGeometry(0.026, 14, 10), skin, {
    position: [0, -0.08, 0.01],
    scale: [1, 0.9, 1.15],
  });
  tip.add(tipEnd);
  tip.rotation.set(0.55, 0, curl * 0.55);

  return [
    { joint: "trunkBase", object: base },
    { joint: "trunkMid", object: mid },
    { joint: "trunkTip", object: tip },
  ];
};

const ganeshaTusks: PartGenerator = (ctx) => {
  const ivory = ctx.materials.fixed.ivory;
  const broken = num(ctx, "broken", 1);
  const group = new THREE.Group();

  for (const side of [1, -1]) {
    const isBroken = broken > 0.5 && side === -1;
    const length = isBroken ? 0.04 : 0.09;
    // Cone points +Y; flip to point down, tip angled slightly forward/outward.
    const tusk = mesh(new THREE.ConeGeometry(0.015, length, 12), ivory, {
      position: [side * 0.048, -0.045 - length / 3, 0.075],
      rotation: [Math.PI + 0.3, 0, side * 0.12],
    });
    group.add(tusk);
  }
  return [{ joint: "head", object: group }];
};

const ganeshaEyes: PartGenerator = (ctx) => {
  const openness = num(ctx, "openness", 0.7);
  const group = new THREE.Group();
  for (const side of [1, -1]) {
    group.add(
      mesh(new THREE.SphereGeometry(0.017, 14, 10), ctx.materials.fixed.eyeLight, {
        position: [side * 0.042, 0.065, 0.093],
        scale: [1, 0.55 + 0.45 * openness, 0.6],
      }),
    );
    group.add(
      mesh(new THREE.SphereGeometry(0.009, 12, 8), ctx.materials.fixed.eyeDark, {
        position: [side * 0.042, 0.064, 0.104],
        scale: [1, 0.6 + 0.4 * openness, 0.6],
      }),
    );
  }
  return [{ joint: "head", object: group }];
};

const ganeshaDhoti: PartGenerator = (ctx) => {
  const garment = ctx.materials.get("garment");
  const accent = ctx.materials.get("garmentAccent");
  const length = num(ctx, "length", 1);
  const bulk = ctx.proportions.bulk;
  const group = new THREE.Group();

  const skirtLength = 0.16 + 0.12 * length;
  group.add(
    mesh(new THREE.CylinderGeometry(0.135 * bulk, 0.105 * bulk, skirtLength, 22, 1, true), garment, {
      position: [0, -skirtLength / 2 + 0.05, 0],
    }),
  );
  // Waist trim
  group.add(
    mesh(new THREE.TorusGeometry(0.135 * bulk, 0.012, 10, 26), accent, {
      position: [0, 0.05, 0],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  // Center pleat
  group.add(
    mesh(new THREE.BoxGeometry(0.045, skirtLength * 0.95, 0.015), accent, {
      position: [0, -skirtLength / 2 + 0.05, 0.115 * bulk],
    }),
  );
  return [{ joint: "pelvis", object: group }];
};

const ganeshaShawl: PartGenerator = (ctx) => {
  const accent = ctx.materials.get("garmentAccent");
  const band = mesh(new THREE.TorusGeometry(0.16, 0.022, 12, 30), accent, {
    position: [0, 0.04, 0],
    rotation: [0.25, 0, 0.9],
  });
  return [{ joint: "chest", object: band }];
};

// ---------------------------------------------------------------------------
// ATTACHMENT GENERATORS
// ---------------------------------------------------------------------------

const crownKirita: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const gem = ctx.materials.get("gem");
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.05, 20), metal, { position: [0, 0.015, 0] }));
  group.add(mesh(new THREE.ConeGeometry(0.07, 0.13, 20), metal, { position: [0, 0.1, 0] }));
  group.add(mesh(new THREE.ConeGeometry(0.04, 0.07, 16), metal, { position: [0, 0.2, 0] }));
  group.add(mesh(new THREE.SphereGeometry(0.016, 12, 10), gem, { position: [0, 0.245, 0] }));
  group.add(mesh(new THREE.SphereGeometry(0.014, 12, 10), gem, { position: [0, 0.02, 0.09] }));
  return group;
};

const crownKaranda: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const gem = ctx.materials.get("gem");
  const group = new THREE.Group();
  const tiers: Array<[number, number]> = [
    [0.085, 0.0],
    [0.065, 0.055],
    [0.048, 0.1],
    [0.032, 0.135],
  ];
  for (const [radius, y] of tiers) {
    group.add(
      mesh(new THREE.SphereGeometry(radius, 18, 14), metal, {
        position: [0, y + 0.01, 0],
        scale: [1, 0.62, 1],
      }),
    );
  }
  group.add(mesh(new THREE.SphereGeometry(0.015, 12, 10), gem, { position: [0, 0.175, 0] }));
  return group;
};

const necklace: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const gem = ctx.materials.get("gem");
  const group = new THREE.Group();
  // Collar draped around the neck, tilted so the front hangs onto the chest.
  group.add(
    mesh(new THREE.TorusGeometry(0.088, 0.013, 12, 32), metal, {
      rotation: [Math.PI / 2 + 0.35, 0, 0],
    }),
  );
  group.add(mesh(new THREE.SphereGeometry(0.02, 14, 10), gem, { position: [0, -0.045, 0.088] }));
  return group;
};

const waistband: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  return mesh(new THREE.TorusGeometry(0.14, 0.013, 10, 28), metal, {
    position: [0, 0, -0.1],
    rotation: [Math.PI / 2, 0, 0],
  });
};

const itemModak: AttachmentGenerator = (ctx) => {
  const accent = ctx.materials.get("garmentAccent");
  const group = new THREE.Group();
  group.add(mesh(new THREE.SphereGeometry(0.032, 14, 12), accent, { scale: [1, 0.85, 1] }));
  group.add(mesh(new THREE.ConeGeometry(0.02, 0.035, 12), accent, { position: [0, 0.035, 0] }));
  return group;
};

const itemLotus: AttachmentGenerator = (ctx) => {
  const gem = ctx.materials.get("gem");
  const accent = ctx.materials.get("garmentAccent");
  const group = new THREE.Group();
  group.add(mesh(new THREE.SphereGeometry(0.02, 12, 10), accent, { position: [0, 0.02, 0] }));
  const petals = 8;
  for (let i = 0; i < petals; i++) {
    const angle = (i / petals) * Math.PI * 2;
    const petal = mesh(new THREE.ConeGeometry(0.012, 0.045, 8), gem, {
      position: [Math.cos(angle) * 0.025, 0.025, Math.sin(angle) * 0.025],
      rotation: [Math.sin(angle) * 0.7, 0, -Math.cos(angle) * 0.7],
    });
    group.add(petal);
  }
  // Stem
  group.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.08, 8), accent, { position: [0, -0.035, 0] }));
  return group;
};

const itemAxe: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.19, 10), metal, { position: [0, 0.04, 0] }));
  const head = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 18, 1, false, 0, Math.PI), metal, {
    position: [0.028, 0.12, 0],
    rotation: [0, 0, Math.PI / 2],
  });
  group.add(head);
  return group;
};

const itemNoose: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  group.add(mesh(new THREE.TorusGeometry(0.04, 0.007, 10, 24), metal, { position: [0, 0.02, 0] }));
  group.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8), metal, { position: [0, -0.035, 0] }));
  return group;
};

// ---------------------------------------------------------------------------
// REGISTRIES
// ---------------------------------------------------------------------------

export const PART_GENERATORS: Record<string, PartGenerator> = {
  "ganesha.body": ganeshaBody,
  "ganesha.head": ganeshaHead,
  "ganesha.ears": ganeshaEars,
  "ganesha.trunk": ganeshaTrunk,
  "ganesha.tusks": ganeshaTusks,
  "ganesha.eyes": ganeshaEyes,
  "ganesha.dhoti": ganeshaDhoti,
  "ganesha.shawl": ganeshaShawl,
};

export const ATTACHMENT_GENERATORS: Record<string, AttachmentGenerator> = {
  "crown.kirita": crownKirita,
  "crown.karanda": crownKaranda,
  "ornament.necklace": necklace,
  "ornament.waistband": waistband,
  "item.modak": itemModak,
  "item.lotus": itemLotus,
  "item.axe": itemAxe,
  "item.noose": itemNoose,
};
