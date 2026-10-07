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
  type SocketId,
} from "@devaform/character-schema";
import { mesh, taperedTube, type V3 } from "../geometry";
import { GRIP_CHANNEL_AXIS, PALM_AXIS, gripPoint, makeHand } from "./hand";
import { num, type GeneratorContext, type PartGenerator, type SocketRefinement } from "./types";

/**
 * The STYLISED table's joint offset — and a body may not agree with it.
 *
 * Kept because `bodyAthletic` builds the stylised body itself, which IS
 * the body this table describes, so asking it is correct there. It is not
 * correct anywhere a measured body might be wearing the result:
 * `GeneratorContext.jointOffset` exists for that, and its own notes
 * record what asking the global table cost — rear bangles two centimetres
 * off the arm's line and nine degrees out of square.
 */
export function jointOffset(child: JointId): V3 {
  return getJoint(child).position;
}

export function limbTube(
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

export const humanoidBody: PartGenerator = (ctx) => {
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
    /**
     * THE REGAL CHEST, as a plane rather than as two balls.
     *
     * It was two sixty-two-millimetre spheres parked ninety-five
     * millimetres proud of the chest and nearly round in plan, so they
     * sat ON the torso instead of emerging from it: from the front the
     * build read as inflated and toy-like rather than as the substantial,
     * dignified figure the variant is for.
     *
     * A pectoral is broad, flat and low. Wider than it is tall, much
     * shallower than it is wide, and set back far enough that its own
     * curve is the last part of the chest rather than a thing stuck to
     * it. The gap at the sternum stays, because that groove is what says
     * there are two of them.
     */
    for (const side of [1, -1]) {
      parts.push({
        joint: "chest",
        object: mesh(new THREE.SphereGeometry(0.074, 24, 18), skin, {
          position: [side * 0.058 * bulk, 0.054, 0.055 * bulk],
          scale: [1.4, 0.72, 0.4],
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

  // Neck — tall enough to bridge the chest top to the raised head's jaw
  parts.push({
    joint: "neck",
    object: mesh(new THREE.CylinderGeometry(0.062, 0.082, 0.16, 20), skin, {
      position: [0, 0.055, 0],
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
        /**
         * THE FOREARM ARRIVES AT THE HAND'S OWN SIZE — IN THE LAST
         * CENTIMETRE.
         *
         * It used to end at 26 mm where the palm begins at 17, and a
         * 27 mm ball was parked at the joint to cover the step. That ball
         * is the "spherical hand" a close-up shows, and the step is why
         * it was there.
         *
         * Narrowing the whole bone to meet the hand was the obvious fix
         * and the wrong one: the KADA is seated on this limb twelve
         * millimetres above the joint, at a radius the body profile
         * states, and a forearm that tapers to fifteen leaves the bangle
         * hanging thirteen millimetres off the arm. The band's fit and
         * the hand's fit are two claims about the same bone.
         *
         * So the bone keeps its girth to within a centimetre of the
         * joint, where the bangle already is, and the wrist is that last
         * centimetre: 26.5 mm down to 19, which the hand then covers.
         */
        const reach = Math.hypot(...forearmEnd) || 1;
        const wristStart = Math.max(0, 1 - 0.01 / reach);
        const cuff: V3 = [
          forearmEnd[0] * wristStart,
          forearmEnd[1] * wristStart,
          forearmEnd[2] * wristStart,
        ];
        g.add(limbTube(skin, cuff, 0.034 * bulk, 0.0265 * bulk));
        g.add(new THREE.Mesh(taperedTube([cuff, forearmEnd], [0.0265 * bulk, 0.019], 6, 14), skin));
        return g;
      })(),
    });
    // No wrist piece here. A wrist is where a hand begins, and a joint
    // owned by two generators is a joint they can disagree about: the
    // hand carries it (see hand.ts), so there is one surface from the
    // forearm's end to the knuckles.
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
        /**
         * A KNEE IS WIDER THAN IT IS DEEP, and flatter in front.
         *
         * A sphere here is a ball bearing, and on a seated figure it is
         * the one part of the leg that is never under cloth — Royal Ease
         * shows both of them against the dhoti's edge. A knee is a cap on
         * the end of a bone: broader across than through, slightly
         * flattened down its front, and no taller than it is broad.
         *
         * Sized from the profile rather than from a literal, which is now
         * the same number the profile reports — see `kneeRadius`.
         */
        g.add(
          mesh(new THREE.SphereGeometry(ctx.body.kneeRadius, 20, 16), skin, {
            scale: [1.06, 0.94, 0.88],
          }),
        );
        g.add(limbTube(skin, shinEnd, 0.05 * bulk, 0.037 * bulk));
        return g;
      })(),
    });
    parts.push({ joint: `leg.${slot}.foot`, object: makeFoot(ctx) });
  }

  return parts;
};

export function makeFoot(ctx: GeneratorContext): THREE.Group {
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
//
// The hand lives in hand.ts. It was rebuilt — palm, finger roots, webs,
// thumb and fingertips — and it is a big enough piece of anatomy, with
// enough of its own vocabulary, that keeping it inside the body generator
// made both harder to read. The semantic contract did not move with it:
// fingers along local -Y, palm facing +Z, the same mudra shapes and the
// same grip point.

export const humanoidHands: PartGenerator = (ctx) => {
  const parts: Array<{
    joint: JointId;
    object: THREE.Object3D;
    socketRefinements?: SocketRefinement[];
  }> = [];
  for (const slot of ctx.armSlots) {
    const mudra = ctx.hands[slot]?.mudra ?? "open";
    const side: 1 | -1 = slot.endsWith("Left") ? 1 : -1;
    const held = ctx.held[slot];
    const hand = makeHand(ctx, mudra, side, held?.radius);
    parts.push({
      joint: `arm.${slot as ArmSlot}.hand`,
      object: hand,
      socketRefinements: [
        {
          id: `arm.${slot as ArmSlot}.hand.item` as SocketId,
          position: gripPoint(mudra, side),
          // The hand owns its grip surface, so it also owns the DIRECTION
          // a shaft runs through it. A cradle has no such direction —
          // nothing passes through an open palm — so only the closing
          // mudras state one, and an offering goes on following the palm
          // exactly as it always did.
          ...(mudra === "grip" || mudra === "pinch"
            ? {
                channel: [side * GRIP_CHANNEL_AXIS[0], GRIP_CHANNEL_AXIS[1], GRIP_CHANNEL_AXIS[2]] as V3,
                palm: PALM_AXIS,
              }
            : {}),
        },
      ],
    });
  }
  return parts;
};
