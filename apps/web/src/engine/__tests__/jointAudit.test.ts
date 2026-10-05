/**
 * Every joint the editor hands a customer, exercised.
 *
 * The pose panel builds itself from the skeleton: a joint with a
 * `uiGroup` gets sliders, a joint without one is not posable. So the set
 * of controls a customer can actually drag is knowable, and this holds
 * every one of them to five things that a person dragging it would
 * notice immediately and that nothing else in the suite checks:
 *
 *   1. IT MOVES. A slider that writes a value nothing reads is a control
 *      that does nothing, and it looks identical to a working one.
 *   2. IT MOVES THE RIGHT WAY. A positive value turns the bone
 *      positively about that axis. A sign flipped somewhere between the
 *      store and the skeleton gives a limb that goes up when you drag
 *      down, which is worse than a dead control.
 *   3. ITS LIMITS ARE SANE, and the engine enforces them. A limit the UI
 *      shows and the engine ignores is a figure a customer can tear
 *      apart; a limit of ten radians is not a limit.
 *   4. ITS DEPENDENTS FOLLOW. Turning a shoulder has to carry the elbow,
 *      the wrist and whatever the hand is holding. A bone that moves
 *      alone is a bone that has come off the skeleton.
 *   5. REST RESTORES EXACTLY. Not approximately: a customer who adjusts
 *      an arm and presses reset must get the figure back, and a drift of
 *      a fraction of a degree per cycle accumulates into a pose nobody
 *      chose.
 */
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () =>
  import("./glbLoader").then((module) => module.diskLoader()),
);

import {
  SKELETON,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
  type ArmSlot,
  type JointId,
} from "@devaform/character-schema";
import { resolveCharacterPresentation, solvedArms } from "@devaform/asset-system";
import { buildRig, poseRig, settleOnSupport } from "../rig";
import { ZoneMaterials } from "../materials";

const AXES = ["x", "y", "z"] as const;
type Axis = (typeof AXES)[number];

async function build(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  let rig = buildRig(config, materials);
  for (let attempt = 0; attempt < 6 && rig.pending.length > 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    rig = buildRig(config, materials);
  }
  return { rig, materials };
}

/** Every bone's world position, which is what a customer sees move. */
function skeletonPose(rig: ReturnType<typeof buildRig>): Map<string, THREE.Vector3> {
  rig.root.updateWorldMatrix(true, true);
  const places = new Map<string, THREE.Vector3>();
  for (const [id, bone] of rig.joints) {
    places.set(id, bone.getWorldPosition(new THREE.Vector3()));
  }
  return places;
}

/**
 * Every bone's whole world TRANSFORM, which is what "did it follow"
 * actually asks about.
 *
 * Position alone is not enough and it is not a near miss. Rotating a bone
 * about its own length — the twist axis, which is `y` on every limb here
 * — turns a child that sits ON that axis without moving it a
 * micrometre. Asked for position, eight correct joints on every figure
 * reported that their children had come off the skeleton: a spine that
 * did not carry the chest, a shin that did not carry the foot.
 */
function skeletonTransforms(
  rig: ReturnType<typeof buildRig>,
): Map<string, THREE.Matrix4> {
  rig.root.updateWorldMatrix(true, true);
  const places = new Map<string, THREE.Matrix4>();
  for (const [id, bone] of rig.joints) places.set(id, bone.matrixWorld.clone());
  return places;
}

/** How far two world transforms differ, summed over their elements. */
function transformDelta(a: THREE.Matrix4, b: THREE.Matrix4): number {
  let total = 0;
  for (let i = 0; i < 16; i += 1) {
    total += Math.abs((a.elements[i] ?? 0) - (b.elements[i] ?? 0));
  }
  return total;
}

/** The joints the pose panel actually offers, which is what is audited. */
const EXPOSED = SKELETON.filter((joint) => joint.uiGroup !== undefined);

const FIGURES: ReadonlyArray<[string, () => CharacterConfiguration]> = [
  ["ganesha", createDefaultGaneshaConfiguration],
  ["shiva", createDefaultShivaConfiguration],
  ["vishnu", createDefaultVishnuConfiguration],
];

describe("the joints the editor exposes", () => {
  it("there are some, and they are grouped for a human", () => {
    expect(EXPOSED.length, "the pose panel has joints to show").toBeGreaterThan(10);
    for (const joint of EXPOSED) {
      expect(joint.label, `${joint.id} has a label`).toBeTruthy();
      expect(joint.uiGroup, `${joint.id} has a group`).toBeTruthy();
    }
  });

  /**
   * LIMITS, read from the table rather than from any figure.
   *
   * A limit is a promise to the customer about how far a control goes,
   * and a promise of plus or minus ten radians is a joint that can be
   * wound round itself three times.
   */
  it("declares limits a body could actually take", () => {
    const complaints: string[] = [];
    for (const joint of EXPOSED) {
      for (const axis of AXES) {
        const limit = joint.limits?.[axis];
        if (!limit) continue;
        const [low, high] = limit;
        if (!(low < high)) complaints.push(`${joint.id}.${axis}: ${low} is not below ${high}`);
        // Two pi of travel on one axis of one joint is not a limit.
        if (high - low > Math.PI * 2) {
          complaints.push(
            `${joint.id}.${axis}: ${(((high - low) * 180) / Math.PI).toFixed(0)}deg of travel`,
          );
        }
        if (Math.abs(low) > Math.PI * 1.5 || Math.abs(high) > Math.PI * 1.5) {
          complaints.push(`${joint.id}.${axis}: [${low}, ${high}] leaves the plausible range`);
        }
      }
    }
    expect(complaints, complaints.join("; ")).toEqual([]);
  });
});

describe.each(FIGURES)("%s's joints", (deity, make) => {
  const HAND_JOINT = /^arm\.(\w+)\.hand$/;

  /**
   * ONE RIG PER FIGURE, posed over and over.
   *
   * Building a rig costs a second or more and posing one costs
   * microseconds, so the first draft — which rebuilt for every joint,
   * every axis and every direction — ran several hundred builds and
   * killed the worker before it reported anything. `poseRig` restores
   * every bone from the skeleton before it applies anything (which is
   * what the last test in this file proves), so one rig answers for all
   * of them.
   */
  const posable = async (rig: ReturnType<typeof buildRig>) => {
    /**
     * The joints this figure HAS, minus the ones the product does not
     * offer as controls.
     *
     * A wrist whose hand is holding something, or performing a gesture,
     * is aimed by that — the grip and mudra solves run after the pose and
     * own the bone. The panel does not put sliders on those; it prints
     * "Aimed by what this hand is holding. Empty the hand to adjust the
     * wrist." They are not dead controls, and auditing them as if they
     * were is auditing something no customer can touch.
     *
     * Read from `solvedArms`, the same function the panel asks. If the
     * panel ever starts offering one of these, this starts auditing it on
     * the same commit.
     */
    const solved = solvedArms(resolveCharacterPresentation(make()));
    return EXPOSED.filter((joint) => {
      if (!rig.joints.has(joint.id)) return false;
      const slot = HAND_JOINT.exec(joint.id)?.[1];
      return !(slot && solved.has(slot as ArmSlot));
    });
  };

  const turnOf = (axis: Axis, limit: readonly [number, number]): number => {
    const [low, high] = limit;
    return Math.abs(high) >= Math.abs(low) ? Math.min(high, 0.3) : Math.max(low, -0.3);
  };

  const rotate = (axis: Axis, value: number): [number, number, number] => {
    const rotation: [number, number, number] = [0, 0, 0];
    rotation[AXES.indexOf(axis)] = value;
    return rotation;
  };

  it(
    "every exposed joint moves the figure, the right way, carrying its dependents",
    async () => {
      const { rig, materials } = await build(make());
      try {
        const present = await posable(rig);
        expect(present.length, `${deity} has posable joints`).toBeGreaterThan(5);

        const dead: string[] = [];
        const backwards: string[] = [];
        const orphaned: string[] = [];

        for (const joint of present) {
          for (const axis of AXES) {
            const limit = joint.limits?.[axis];
            if (!limit) continue;
            const turn = turnOf(axis, limit);
            if (Math.abs(turn) < 0.05) continue;

            poseRig(rig, { preset: null, jointOverrides: {} });
            settleOnSupport(rig);
            const rest = skeletonTransforms(rig);
            const restLocal = rig.joints.get(joint.id)!.rotation[axis];

            poseRig(rig, {
              preset: null,
              jointOverrides: { [joint.id as JointId]: rotate(axis, turn) },
            });
            settleOnSupport(rig);
            const moved = skeletonTransforms(rig);
            const turned = rig.joints.get(joint.id)!.rotation[axis] - restLocal;

            // 1. the bone itself turned
            if (Math.abs(turned) < 1e-6) {
              dead.push(`${joint.id}.${axis}`);
              continue;
            }
            // 2. and turned the way it was asked to
            if (Math.sign(turned) !== Math.sign(turn)) {
              backwards.push(
                `${joint.id}.${axis}: asked ${turn.toFixed(2)}, turned ${turned.toFixed(2)}`,
              );
            }
            // 3. and its dependents came with it
            /**
             * The children THIS FIGURE HAS. The skeleton describes a
             * trunk hanging off the head; Shiva and Vishnu do not bring
             * that bone, and asking whether a joint they do not have
             * followed their head is asking about the table.
             */
            const children = SKELETON.filter(
              (entry) => entry.parent === joint.id && rig.joints.has(entry.id),
            );
            const followers = children.filter((child) => {
              const before = rest.get(child.id);
              const after = moved.get(child.id);
              return (
                before !== undefined && after !== undefined && transformDelta(before, after) > 1e-5
              );
            });
            if (children.length > 0 && followers.length === 0) {
              orphaned.push(
                `${joint.id}.${axis}: ${children.map((c) => c.id).join(", ")} did not follow`,
              );
            }
          }
        }

        expect(dead, `controls that move nothing: ${dead.join(", ")}`).toEqual([]);
        expect(backwards, backwards.join("; ")).toEqual([]);
        expect(orphaned, orphaned.join("; ")).toEqual([]);
      } finally {
        materials.dispose();
      }
    },
    600_000,
  );

  it(
    "clamps what a customer is told is the limit",
    async () => {
      const { rig, materials } = await build(make());
      try {
        const present = await posable(rig);
        const escaped: string[] = [];

        for (const joint of present) {
          for (const axis of AXES) {
            const limit = joint.limits?.[axis];
            if (!limit) continue;
            const [low, high] = limit;
            /**
             * ASKED THE WAY THE PRODUCT PROMISES IT.
             *
             * Not "what rotation does the bone end up with" — the gesture
             * and grip solves run after the pose and write their own, so
             * reading the final rotation reported a forearm at 1.28 rad
             * against a declared limit of 0.3 and called the clamp broken
             * when the clamp had worked perfectly.
             *
             * The promise is about the CONTROL: a value past the end of
             * the slider does exactly what the end of the slider does. So
             * pose the figure twice and the two have to be one figure.
             */
            for (const [wild, pinned] of [
              [high + 2.5, high],
              [low - 2.5, low],
            ] as const) {
              poseRig(rig, {
                preset: null,
                jointOverrides: { [joint.id as JointId]: rotate(axis, wild) },
              });
              settleOnSupport(rig);
              const asWild = skeletonPose(rig);

              poseRig(rig, {
                preset: null,
                jointOverrides: { [joint.id as JointId]: rotate(axis, pinned) },
              });
              settleOnSupport(rig);
              const asPinned = skeletonPose(rig);

              let worst = 0;
              let where = "";
              for (const [id, place] of asWild) {
                const other = asPinned.get(id);
                if (!other) continue;
                const apart = place.distanceTo(other) * 1000;
                if (apart > worst) {
                  worst = apart;
                  where = id;
                }
              }
              if (worst > 0.01) {
                escaped.push(
                  `${joint.id}.${axis}: asking ${wild.toFixed(2)} is not the same as asking ` +
                    `${pinned.toFixed(2)} — ${where} differs by ${worst.toFixed(2)} mm`,
                );
              }
            }
          }
        }
        expect(escaped, escaped.join("; ")).toEqual([]);
      } finally {
        materials.dispose();
      }
    },
    600_000,
  );

  it(
    "returns to exactly where it started when the adjustments are cleared",
    async () => {
      const { rig, materials } = await build(make());
      try {
        const present = EXPOSED.filter((joint) => rig.joints.has(joint.id));
        poseRig(rig, { preset: null, jointOverrides: {} });
        settleOnSupport(rig);
        const rest = skeletonPose(rig);

        /**
         * Every exposed joint moved at once, then all of it cleared. One
         * joint at a time would not catch a reset that restores each bone
         * from the one before it rather than from the skeleton.
         */
        const overrides: Record<string, [number, number, number]> = {};
        for (const joint of present) {
          overrides[joint.id] = [
            joint.limits?.x ? 0.12 : 0,
            joint.limits?.y ? 0.12 : 0,
            joint.limits?.z ? 0.12 : 0,
          ];
        }
        for (let cycle = 0; cycle < 3; cycle += 1) {
          poseRig(rig, {
            preset: null,
            jointOverrides: overrides as Record<JointId, [number, number, number]>,
          });
          settleOnSupport(rig);
          poseRig(rig, { preset: null, jointOverrides: {} });
          settleOnSupport(rig);
        }
        const after = skeletonPose(rig);

        let worst = 0;
        let where = "";
        for (const [id, place] of rest) {
          const now = after.get(id);
          if (!now) continue;
          const drift = place.distanceTo(now) * 1000;
          if (drift > worst) {
            worst = drift;
            where = id;
          }
        }
        // Exactly, within floating point. Three cycles, so any per-cycle
        // drift is three times as visible as it would be in one.
        expect(
          worst,
          `${deity}: ${where} is ${worst.toFixed(4)} mm from where it started after three ` +
            `adjust-and-clear cycles`,
        ).toBeLessThan(0.01);
      } finally {
        materials.dispose();
      }
    },
    600_000,
  );
});
