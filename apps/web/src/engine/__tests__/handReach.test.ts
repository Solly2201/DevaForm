/**
 * Can the arm actually do what the pose asks of the hand?
 *
 * This is the machine-checkable half of the human-observer question "does
 * the wrist have a believable orientation". Two things are asserted for
 * every supported combination, and both are measured rather than eyeballed:
 *
 *   1. the hand REACHES what it was asked for — the fist's channel really
 *      does end up along the presented axis, the blessing palm really does
 *      face the devotee;
 *   2. it gets there with an arm a person has — the work is taken by the
 *      shoulder and the forearm, and what is left for the wrist stays
 *      inside a range a wrist has.
 *
 * Without (2), (1) is cheap and worthless: any orientation is reachable if
 * the wrist is allowed to deviate forty degrees sideways, and it will look
 * broken from every angle. Measured across the product, the shoulder-then-
 * forearm-then-wrist ordering takes the standing trishul grip from a 46°
 * miss to under 6°, and the wrist from 41° of sideways deviation to 25°.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(): void {
      /* never resolves in tests */
    }
  },
}));
import * as THREE from "three";
import {
  GESTURE_MUDRAS,
  POSE_PRESETS,
  SHIVA_POSE_PRESETS,
  armChainJoints,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  getJoint,
  mudraArmRotations,
  type ArmSlot,
  type CharacterConfiguration,
  type MudraId,
} from "@devaform/character-schema";
import { buildRig, handGripChannel, poseRig } from "../rig";
import { ZoneMaterials } from "../materials";
import { HAND_TOLERANCE } from "../pose";

/**
 * What a wrist may do, in radians, before it stops looking like a wrist.
 * The schema's own limits are held to these — declaring a wrist as a ball
 * joint is how a solver ends up producing hands nobody has.
 */
const WRIST_PLAUSIBLE = {
  /** Flexion and extension — the wrist's strong axis. */
  x: (75 * Math.PI) / 180,
  /** Rotation about the forearm's length: a wrist has almost none. */
  y: (40 * Math.PI) / 180,
  /** Radial and ulnar deviation — the wrist's weak axis. */
  z: (50 * Math.PI) / 180,
};

const DEG = 180 / Math.PI;

function posed(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  const rig = buildRig(config, materials);
  const solutions = poseRig(rig);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials, solutions };
}

function wristOf(rig: ReturnType<typeof buildRig>, slot: ArmSlot): THREE.Euler {
  return rig.joints.get(`arm.${slot}.hand`)!.rotation.clone();
}

const humanShiva = (): CharacterConfiguration => {
  const config = createDefaultShivaConfiguration();
  config.parts.body = { assetId: "humanoid.body.human", version: 1 };
  return config;
};

const CHARACTERS = [
  ["ganesha", createDefaultGaneshaConfiguration, POSE_PRESETS],
  ["shiva (procedural)", createDefaultShivaConfiguration, SHIVA_POSE_PRESETS],
  ["shiva (mesh body)", humanShiva, SHIVA_POSE_PRESETS],
] as const;

describe("the skeleton declares a wrist, not a ball joint", () => {
  it.each(["frontLeft", "frontRight", "backLeft", "backRight"] as const)(
    "%s wrist limits are anatomical",
    (slot) => {
      const limits = getJoint(`arm.${slot}.hand`).limits!;
      for (const axis of ["x", "y", "z"] as const) {
        const [min, max] = limits[axis]!;
        expect(Math.abs(min), `${slot}.${axis} min`).toBeLessThanOrEqual(WRIST_PLAUSIBLE[axis]);
        expect(Math.abs(max), `${slot}.${axis} max`).toBeLessThanOrEqual(WRIST_PLAUSIBLE[axis]);
      }
      // ...and the forearm really does pronate, because it is the joint
      // that has to do the work the wrist cannot.
      const pronation = getJoint(`arm.${slot}.forearm`).limits!.y!;
      expect(pronation[1]).toBeGreaterThan((80 * Math.PI) / 180);
    },
  );
});

describe("every hand can do what its pose asks", () => {
  for (const [name, makeConfig, presets] of CHARACTERS) {
    for (const preset of presets) {
      it(`${name} · ${preset.id}: grips reach their item`, () => {
        const config = { ...makeConfig(), pose: { preset: preset.id, jointOverrides: {} } };
        const { rig, materials } = posed(config as CharacterConfiguration);
        const up = new THREE.Vector3(0, 1, 0);
        for (const { slot } of rig.held) {
          const hand = rig.joints.get(`arm.${slot}.hand`)!;
          const channel = handGripChannel(rig, slot).applyQuaternion(
            hand.getWorldQuaternion(new THREE.Quaternion()),
          );
          const off = channel.angleTo(up);
          expect(
            off,
            `${name}/${preset.id}/${slot}: item ${(off * DEG).toFixed(0)}° off vertical`,
          ).toBeLessThan(HAND_TOLERANCE);
        }
        materials.dispose();
      });

      it(`${name} · ${preset.id}: no wrist is bent past a wrist`, () => {
        const config = { ...makeConfig(), pose: { preset: preset.id, jointOverrides: {} } };
        const { rig, materials } = posed(config as CharacterConfiguration);
        const limits = getJoint("arm.frontRight.hand").limits!;
        for (const slot of rig.resolved.armSlots) {
          const wrist = wristOf(rig, slot);
          const where = `${name}/${preset.id}/${slot}`;
          // Nothing may write a wrist without clamping it. The solvers do;
          // this catches the next path that forgets.
          for (const [axis, value] of [
            ["x", wrist.x],
            ["y", wrist.y],
            ["z", wrist.z],
          ] as const) {
            const [min, max] = limits[axis]!;
            expect(
              value,
              `${where} ${axis} ${(value * DEG).toFixed(0)}° outside [${(min * DEG).toFixed(0)}, ${(max * DEG).toFixed(0)}]`,
            ).toBeGreaterThanOrEqual(min - 1e-6);
            expect(value).toBeLessThanOrEqual(max + 1e-6);
          }
        }
        materials.dispose();
      });
    }
  }
});

describe("a gesture chosen from the panel is actually shown", () => {
  // Choosing a mudra articulates that arm's whole chain — the editor
  // writes the gesture's own arm rotations as joint overrides. So the
  // test does what the product does, rather than forcing a blessing onto
  // an arm the product would never leave hanging.
  const gestures = Object.keys(GESTURE_MUDRAS) as MudraId[];

  for (const [name, makeConfig, presets] of CHARACTERS) {
    it(`${name}: every gesture reaches its palm from every pose`, () => {
      for (const preset of presets) {
        for (const slot of ["frontLeft", "frontRight"] as const) {
          for (const mudra of gestures) {
            const base = makeConfig();
            const config = {
              ...base,
              hands: { ...base.hands, [slot]: { mudra } },
              // Nothing in a hand that is about to bless.
              attachments: base.attachments.filter(
                (a) => a.socket !== `arm.${slot}.hand.item`,
              ),
              pose: {
                preset: preset.id,
                jointOverrides: { ...(mudraArmRotations(mudra, slot) ?? {}) },
              },
            } as CharacterConfiguration;
            const { rig, materials, solutions } = posed(config);
            const where = `${name}/${preset.id}/${slot}/${mudra}`;
            // The pose decides whether the hand gestures; the customer
            // decides which gesture. Both have chosen one here, so the
            // customer's is what must be shown.
            expect(rig.hands[slot].mudra, `${where}: resolved mudra`).toBe(mudra);
            const solution = solutions.find((s) => s.slot === slot);
            expect(solution, `${where}: no solution attempted`).toBeDefined();
            expect(
              solution!.residual,
              `${where}: ${(solution!.residual * DEG).toFixed(0)}° off`,
            ).toBeLessThan(HAND_TOLERANCE);
            expect(solution!.applied, `${where}: solved but not applied`).toBe(true);
            // And the arm chain the gesture asked for is the arm that
            // showed it — the solver refines the twists, it does not
            // relocate the arm.
            expect(armChainJoints(slot).length).toBe(3);
            materials.dispose();
          }
        }
      }
    });
  }
});
