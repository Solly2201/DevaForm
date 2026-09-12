/**
 * Body + hands generators.
 *
 * The torso is a set of large overlapping smooth volumes (pelvis, belly,
 * chest, shoulders) sized to classical seated-murti proportions — a full
 * belly, broad chest, and limbs as tapered tubes with joint masses.
 *
 * Hands are real geometry: palm, four fingers and a thumb, with per-hand
 * mudras (abhaya / varada / open / hold) driven by the configuration.
 */
import * as THREE from "three";
import {
  ARM_SLOTS,
  activeArmSlots,
  getJoint,
  type ArmSlot,
  type JointId,
  type MudraId,
} from "@devaform/character-schema";
import { mesh, taperedTube, type V3 } from "../geometry";
import { num, type GeneratorContext, type PartGenerator } from "./types";

function jointOffset(child: JointId): V3 {
  return getJoint(child).position;
}

function limbTube(
  material: THREE.Material,
  end: V3,
  r0: number,
  r1: number,
  bow = 0,
): THREE.Mesh {
  const midpoint: V3 = [end[0] / 2 + bow, end[1] / 2, end[2] / 2 + Math.abs(bow) * 0.4];
  return new THREE.Mesh(taperedTube([[0, 0, 0], midpoint, end], [r0, r1], 16, 14), material);
}

// ---------------------------------------------------------------------------
// BODY
// ---------------------------------------------------------------------------

export const ganeshaBody: PartGenerator = (ctx) => {
  const skin = ctx.materials.get("skin");
  const belly = num(ctx, "belly", 1);
  const chest = num(ctx, "chest", 1);
  const bulk = ctx.proportions.bulk;
  const armSlots = activeArmSlots(ctx.arms);

  const parts: Array<{ joint: JointId; object: THREE.Object3D }> = [];

  // Pelvis / seat mass
  parts.push({
    joint: "pelvis",
    object: mesh(new THREE.SphereGeometry(0.125, 32, 24), skin, {
      position: [0, 0.015, 0],
      scale: [1.22 * bulk, 0.88, 1.05 * bulk],
    }),
  });

  // Belly — the lambodara volume
  parts.push({
    joint: "spine",
    object: mesh(new THREE.SphereGeometry(0.16 + 0.035 * belly, 40, 30), skin, {
      position: [0, 0.03, 0.02 * belly],
      scale: [1.0 * bulk, 0.98, 0.96 * bulk],
    }),
  });
  // Navel — small darker sphere embedded flush in the belly surface
  parts.push({
    joint: "spine",
    object: mesh(new THREE.SphereGeometry(0.009, 12, 10), ctx.materials.get("skinSecondary"), {
      position: [0, 0.015, (0.16 + 0.035 * belly) * 0.96 * bulk + 0.0135 * belly],
      scale: [1.3, 1.1, 0.5],
    }),
  });

  // Chest
  parts.push({
    joint: "chest",
    object: mesh(new THREE.SphereGeometry(0.148, 36, 26), skin, {
      position: [0, 0.045, -0.005],
      scale: [1.28 * bulk * (0.94 + 0.06 * chest), 0.92 * chest, 0.9 * bulk],
    }),
  });
  if (chest > 1.05) {
    // Regal variant: defined pectorals
    for (const side of [1, -1]) {
      parts.push({
        joint: "chest",
        object: mesh(new THREE.SphereGeometry(0.062, 22, 16), skin, {
          position: [side * 0.07 * bulk, 0.06, 0.095 * bulk],
          scale: [1.15, 0.85, 0.55],
        }),
      });
    }
  }

  // Shoulder masses (span both arm rows)
  for (const side of [1, -1]) {
    parts.push({
      joint: "chest",
      object: mesh(new THREE.SphereGeometry(0.062, 24, 18), skin, {
        position: [side * 0.172 * bulk, 0.112, 0],
        scale: [1.05, 0.95, 1.45],
      }),
    });
  }

  // Neck
  parts.push({
    joint: "neck",
    object: mesh(new THREE.CylinderGeometry(0.062, 0.082, 0.1, 20), skin, {
      position: [0, 0.028, 0],
    }),
  });

  // Arms — tapered tubes with elbow/wrist masses
  for (const slot of ARM_SLOTS) {
    if (!armSlots.includes(slot)) continue;
    const upperEnd = jointOffset(`arm.${slot}.forearm`);
    const forearmEnd = jointOffset(`arm.${slot}.hand`);
    parts.push({
      joint: `arm.${slot}.upper`,
      object: limbTube(skin, upperEnd, 0.043 * bulk, 0.035 * bulk),
    });
    parts.push({
      joint: `arm.${slot}.forearm`,
      object: (() => {
        const g = new THREE.Group();
        g.add(mesh(new THREE.SphereGeometry(0.038 * bulk, 18, 14), skin)); // elbow
        g.add(limbTube(skin, forearmEnd, 0.034 * bulk, 0.026 * bulk));
        return g;
      })(),
    });
    parts.push({
      joint: `arm.${slot}.hand`,
      object: mesh(new THREE.SphereGeometry(0.027 * bulk, 16, 12), skin, {
        // wrist mass; the hand itself comes from the hands part
        position: [0, 0.002, 0],
      }),
    });
  }

  // Legs
  for (const slot of ["left", "right"] as const) {
    const thighEnd = jointOffset(`leg.${slot}.shin`);
    const shinEnd = jointOffset(`leg.${slot}.foot`);
    parts.push({
      joint: `leg.${slot}.thigh`,
      object: (() => {
        const g = new THREE.Group();
        g.add(mesh(new THREE.SphereGeometry(0.075 * bulk, 20, 16), skin, { scale: [1, 0.9, 1] }));
        g.add(limbTube(skin, thighEnd, 0.068 * bulk, 0.052 * bulk));
        return g;
      })(),
    });
    parts.push({
      joint: `leg.${slot}.shin`,
      object: (() => {
        const g = new THREE.Group();
        g.add(mesh(new THREE.SphereGeometry(0.054 * bulk, 18, 14), skin)); // knee
        g.add(limbTube(skin, shinEnd, 0.05 * bulk, 0.037 * bulk));
        return g;
      })(),
    });
    parts.push({ joint: `leg.${slot}.foot`, object: makeFoot(ctx) });
  }

  return parts;
};

function makeFoot(ctx: GeneratorContext): THREE.Group {
  const skin = ctx.materials.get("skin");
  const g = new THREE.Group();
  // Ankle
  g.add(mesh(new THREE.SphereGeometry(0.04, 16, 12), skin, { position: [0, 0.01, 0] }));
  // Foot body
  g.add(
    mesh(new THREE.SphereGeometry(0.05, 22, 16), skin, {
      position: [0, -0.028, 0.035],
      scale: [1.02, 0.6, 1.65],
    }),
  );
  // Heel
  g.add(
    mesh(new THREE.SphereGeometry(0.035, 14, 12), skin, {
      position: [0, -0.028, -0.02],
      scale: [1, 0.8, 1],
    }),
  );
  // Toes
  const toeX = [-0.032, -0.011, 0.01, 0.03];
  const toeR = [0.0148, 0.0135, 0.012, 0.0105];
  for (let i = 0; i < toeX.length; i++) {
    g.add(
      mesh(new THREE.SphereGeometry(toeR[i] ?? 0.012, 12, 10), skin, {
        position: [toeX[i] ?? 0, -0.041, 0.111],
        scale: [1, 0.85, 1.35],
      }),
    );
  }
  return g;
}

// ---------------------------------------------------------------------------
// HANDS
// ---------------------------------------------------------------------------

interface FingerSpec {
  /** Root position on the palm edge (hand-local). */
  root: V3;
  lengthScale: number;
  radius: number;
}

/**
 * Build a finger as a chain of three phalanx segments, each bending by
 * `bend` radians toward the palm (+z), sampled into a smooth tube.
 */
function fingerPoints(root: V3, lengthScale: number, bend: number, splay: number): V3[] {
  const segLengths = [0.021, 0.017, 0.014].map((l) => l * lengthScale);
  const points: V3[] = [root];
  const dir = new THREE.Vector3(Math.sin(splay) * 0.35, -1, 0.08).normalize();
  const bendAxis = new THREE.Vector3(1, 0, 0);
  const p = new THREE.Vector3(...root);
  for (const len of segLengths) {
    dir.applyAxisAngle(bendAxis, bend);
    p.addScaledVector(dir, len);
    points.push([p.x, p.y, p.z]);
  }
  return points;
}

interface MudraShape {
  /** Per-phalanx bend for [index, middle, ring, pinky] (radians). */
  bends: readonly [number, number, number, number];
  splay: number;
  thumbCurl: number;
  /** Extra thumb pull toward the fingertips (pinch opposition). */
  thumbOppose: number;
  palmCup: number;
}

const MUDRA_SHAPES: Record<MudraId, MudraShape> = {
  abhaya: { bends: [0.08, 0.07, 0.08, 0.1], splay: 0.04, thumbCurl: 0.22, thumbOppose: 0, palmCup: 0.05 },
  varada: { bends: [0.3, 0.28, 0.3, 0.34], splay: 0.09, thumbCurl: 0.32, thumbOppose: 0, palmCup: 0.1 },
  open: { bends: [0.22, 0.2, 0.22, 0.26], splay: 0.15, thumbCurl: 0.3, thumbOppose: 0, palmCup: 0.08 },
  // Palm-up cradle: fingers gently curled to support an offering.
  hold: { bends: [0.55, 0.58, 0.6, 0.64], splay: 0.05, thumbCurl: 0.5, thumbOppose: 0.2, palmCup: 0.22 },
  // Stem pinch: index meets thumb, remaining fingers fold in.
  pinch: { bends: [0.62, 1.05, 1.15, 1.25], splay: 0.02, thumbCurl: 0.55, thumbOppose: 0.85, palmCup: 0.15 },
  // Closed fist around a shaft running across the palm (local X axis).
  grip: { bends: [1.12, 1.16, 1.18, 1.2], splay: 0, thumbCurl: 0.95, thumbOppose: 0.55, palmCup: 0.28 },
};

export function makeHand(
  ctx: GeneratorContext,
  mudra: MudraId,
  side: 1 | -1, // 1 = left hand, -1 = right hand
): THREE.Group {
  const skin = ctx.materials.get("skin");
  const shape = MUDRA_SHAPES[mudra];
  const g = new THREE.Group();

  // Palm — cupped slab with a knuckle ridge at the finger roots
  g.add(
    mesh(new THREE.SphereGeometry(0.032, 24, 18), skin, {
      position: [0, -0.033, 0.004],
      rotation: [shape.palmCup, 0, 0],
      scale: [1.05, 1.2, 0.52],
    }),
  );
  g.add(
    mesh(new THREE.SphereGeometry(0.026, 18, 14), skin, {
      position: [0, -0.055, 0.007],
      scale: [1.2, 0.5, 0.5],
    }),
  );
  // Wrist transition
  g.add(
    mesh(new THREE.CylinderGeometry(0.021, 0.026, 0.022, 14), skin, {
      position: [0, -0.006, 0.002],
    }),
  );

  // Four fingers along the palm's lower edge
  const fingers: FingerSpec[] = [
    { root: [-0.0225, -0.058, 0.006], lengthScale: 0.85, radius: 0.0075 },
    { root: [-0.0075, -0.062, 0.008], lengthScale: 1.0, radius: 0.008 },
    { root: [0.0075, -0.062, 0.008], lengthScale: 0.93, radius: 0.0076 },
    { root: [0.0215, -0.057, 0.006], lengthScale: 0.74, radius: 0.0066 },
  ];
  // Mirror finger order so the index finger is on the thumb's side.
  const indexFirst = side === 1 ? fingers : [...fingers].reverse();
  indexFirst.forEach((f, i) => {
    const splay = shape.splay * (f.root[0] / 0.0225);
    const bend = shape.bends[i] ?? 0.2;
    const pts = fingerPoints(f.root, f.lengthScale, bend, splay);
    g.add(new THREE.Mesh(taperedTube(pts, [f.radius, f.radius * 0.72], 14, 10), skin));
    g.add(mesh(new THREE.SphereGeometry(f.radius * 0.95, 10, 8), skin, { position: f.root }));
  });

  // Thumb — from the inner palm edge, opposing toward the fingertips when
  // pinching/gripping.
  const thumbRoot: V3 = [side * 0.027, -0.032, 0.008];
  const thumbPts: V3[] = [thumbRoot];
  const tDir = new THREE.Vector3(
    side * (0.75 - shape.thumbOppose * 0.55),
    -0.55 - shape.thumbOppose * 0.2,
    0.35 + shape.thumbOppose * 0.55,
  ).normalize();
  const tAxis = new THREE.Vector3(0.2, side * -0.8, 0).normalize();
  const tp = new THREE.Vector3(...thumbRoot);
  for (const len of [0.02, 0.017]) {
    tDir.applyAxisAngle(tAxis, shape.thumbCurl);
    tp.addScaledVector(tDir, len);
    thumbPts.push([tp.x, tp.y, tp.z]);
  }
  g.add(new THREE.Mesh(taperedTube(thumbPts, [0.0092, 0.0068], 12, 10), skin));

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

export const ganeshaHands: PartGenerator = (ctx) => {
  const parts: Array<{ joint: JointId; object: THREE.Object3D }> = [];
  const armSlots = activeArmSlots(ctx.arms);
  for (const slot of armSlots) {
    const mudra = ctx.hands[slot]?.mudra ?? "open";
    const side: 1 | -1 = slot.endsWith("Left") ? 1 : -1;
    const hand = makeHand(ctx, mudra, side);
    parts.push({ joint: `arm.${slot as ArmSlot}.hand`, object: hand });
  }
  return parts;
};
