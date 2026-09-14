/**
 * The canonical skeleton contract.
 *
 * DevaForm has ONE anatomical coordinate system. Meshes conform to it;
 * deities extend it; nothing reconciles two of them. These tests are the
 * statement of that contract, so a future body asset cannot quietly
 * introduce a second skeleton and leave the engine to reconcile the two.
 */
import { describe, expect, it } from "vitest";
import {
  ARM_SLOTS,
  GANESHA_SKELETON,
  HUMANOID_SKELETON,
  HUMAN_SKELETON,
  JOINT_IDS,
  SKELETON,
  SOCKETS,
  getSkeleton,
  isJointId,
  isSocketId,
  type SkeletonDefinition,
} from "../index";

const ALL: readonly SkeletonDefinition[] = [
  HUMANOID_SKELETON,
  GANESHA_SKELETON,
  HUMAN_SKELETON,
];

describe("canonical skeleton", () => {
  it("every skeleton is buildable: parents precede children", () => {
    for (const skeleton of ALL) {
      const built = new Set<string>();
      for (const joint of skeleton.joints) {
        if (joint.parent !== null) {
          expect(built.has(joint.parent), `${skeleton.id}: ${joint.id} before ${joint.parent}`).toBe(
            true,
          );
        }
        expect(built.has(joint.id), `${skeleton.id}: duplicate ${joint.id}`).toBe(false);
        built.add(joint.id);
      }
    }
  });

  it("every socket names a joint its own skeleton has", () => {
    for (const skeleton of ALL) {
      const joints = new Set(skeleton.joints.map((j) => j.id));
      for (const socket of skeleton.sockets) {
        if (socket.anchor === "statue") continue;
        expect(joints.has(socket.joint), `${skeleton.id}: ${socket.id} -> ${socket.joint}`).toBe(
          true,
        );
      }
    }
  });

  it("every skeleton is a subset of the validation union", () => {
    // Configurations are validated against the union, so a skeleton that
    // introduced a joint outside it would build joints no save could name.
    for (const skeleton of ALL) {
      for (const joint of skeleton.joints) {
        expect(isJointId(joint.id), `${skeleton.id}: ${joint.id}`).toBe(true);
      }
      for (const socket of skeleton.sockets) {
        expect(isSocketId(socket.id), `${skeleton.id}: ${socket.id}`).toBe(true);
      }
    }
    expect(JOINT_IDS.length).toBe(SKELETON.length);
  });

  it("shares one anatomy: a joint means the same thing on every skeleton", () => {
    // Same id, same parent, everywhere. Proportions may differ — that is
    // what a body asset is for — but the hierarchy may not, or a pose
    // preset would mean something different on each deity.
    const parents = new Map(SKELETON.map((j) => [j.id, j.parent]));
    for (const skeleton of ALL) {
      for (const joint of skeleton.joints) {
        expect(joint.parent, `${skeleton.id}: ${joint.id}`).toBe(parents.get(joint.id));
      }
    }
  });
});

describe("skeleton extensions", () => {
  it("are declared, and joints and sockets agree about them", () => {
    for (const skeleton of ALL) {
      const hasBackArmJoint = skeleton.joints.some((j) => j.id.startsWith("arm.back"));
      const hasBackArmSocket = skeleton.sockets.some((s) => s.id.startsWith("arm.back"));
      expect(hasBackArmJoint, `${skeleton.id} back arm joints`).toBe(
        skeleton.extensions.backArms === true,
      );
      // A socket may not exist without the limb it hangs from.
      expect(hasBackArmSocket, `${skeleton.id} back arm sockets`).toBe(hasBackArmJoint);

      const hasTrunkJoint = skeleton.joints.some((j) => j.id.startsWith("trunk"));
      const hasTrunkSocket = skeleton.sockets.some((s) => s.id.startsWith("trunk"));
      expect(hasTrunkJoint, `${skeleton.id} trunk joints`).toBe(
        skeleton.extensions.trunk === true,
      );
      expect(hasTrunkSocket, `${skeleton.id} trunk socket`).toBe(hasTrunkJoint);
    }
  });

  it("armSlots reports the arms a skeleton actually has", () => {
    for (const skeleton of ALL) {
      const fromJoints = ARM_SLOTS.filter((slot) =>
        skeleton.joints.some((j) => j.id === `arm.${slot}.hand`),
      );
      expect(skeleton.armSlots, skeleton.id).toEqual(fromJoints);
    }
    expect(GANESHA_SKELETON.armSlots).toHaveLength(4);
    expect(HUMAN_SKELETON.armSlots).toHaveLength(2);
  });

  it("Ganesha is the humanoid core plus its own anatomy, not a rig of its own", () => {
    const humanoid = new Set(HUMANOID_SKELETON.joints.map((j) => j.id));
    const extra = GANESHA_SKELETON.joints.filter((j) => !humanoid.has(j.id));
    // The trunk, and nothing else.
    expect(extra.map((j) => j.id)).toEqual(["trunkBase", "trunkMid", "trunkTip"]);
    for (const joint of HUMANOID_SKELETON.joints) {
      const mine = GANESHA_SKELETON.joints.find((j) => j.id === joint.id);
      expect(mine, `Ganesha is missing ${joint.id}`).toBeDefined();
      expect(mine!.position, joint.id).toEqual(joint.position);
    }
  });

  it("the union carries every extension, so old saves keep validating", () => {
    // Narrowing a skeleton must never narrow the union: a save made when
    // a body had four arms still names arm.backRight.* and must parse.
    expect(isJointId("arm.backRight.hand")).toBe(true);
    expect(isSocketId("arm.backRight.hand.item")).toBe(true);
    expect(isJointId("trunkTip")).toBe(true);
    expect(isSocketId("trunk.tip")).toBe(true);
    const unionSockets = new Set(SOCKETS.map((s) => s.id));
    for (const skeleton of ALL) {
      for (const socket of skeleton.sockets) expect(unionSockets.has(socket.id)).toBe(true);
    }
  });
});

describe("skeleton registry", () => {
  it("resolves every skeleton a body asset may name", () => {
    for (const skeleton of ALL) {
      expect(getSkeleton(skeleton.id), skeleton.id).toBe(skeleton);
    }
  });

  it("does not invent a skeleton for an unknown id", () => {
    expect(getSkeleton("not-a-skeleton")).toBeUndefined();
  });
});
