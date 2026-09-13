/**
 * Per-deity skeleton definitions: a named bundle of joints and sockets.
 *
 * A DeityDefinition references exactly one SkeletonDefinition; the engine
 * builds ONLY that skeleton's joints and sockets, and the pose UI derives
 * its joint groups from it. Validation, by contrast, accepts the union of
 * all skeletons (see skeleton.ts / sockets.ts) so the configuration schema
 * stays deity-agnostic.
 *
 * Skeletons are composed from shared chains, not copied: the humanoid core
 * is one set of joint definitions, and Ganesha's skeleton is that core plus
 * the trunk extension. A future deity that needs different chains (extra
 * heads, a tail) declares its own composition here — never a conditional in
 * engine code.
 */
import {
  HUMANOID_CORE_JOINTS,
  SKELETON,
  TRUNK_JOINTS,
  computeJointUiGroups,
  type JointDefinition,
  type JointId,
  type JointUiGroup,
} from "./skeleton";
import {
  HUMANOID_CORE_SOCKETS,
  SOCKETS,
  type SocketDefinition,
  type SocketId,
} from "./sockets";
import type { Vec3 } from "./configuration";

export interface SkeletonDefinition {
  /** Stable skeleton id (referenced by rigs/tooling, not persisted in configs). */
  id: string;
  /** Joints in build order — parents precede children. */
  joints: readonly JointDefinition[];
  /** Sockets available on this skeleton. */
  sockets: readonly SocketDefinition[];
  /** User-posable joints grouped by semantic body part (pose UI). */
  uiGroups: readonly JointUiGroup[];
}

function defineSkeleton(
  id: string,
  joints: readonly JointDefinition[],
  sockets: readonly SocketDefinition[],
): SkeletonDefinition {
  return { id, joints, sockets, uiGroups: computeJointUiGroups(joints) };
}

/** The shared humanoid rig: torso, head, four arm chains, two legs. */
export const HUMANOID_SKELETON: SkeletonDefinition = defineSkeleton(
  "humanoid",
  HUMANOID_CORE_JOINTS,
  HUMANOID_CORE_SOCKETS,
);

/** Humanoid core + Ganesha's trunk chain and trunk-tip socket. */
export const GANESHA_SKELETON: SkeletonDefinition = defineSkeleton(
  "ganesha",
  SKELETON, // core + trunk, in canonical build order
  SOCKETS,
);

// ---------------------------------------------------------------------------
// Human-proportioned skeleton
// ---------------------------------------------------------------------------

/**
 * Rest offsets measured from the human base mesh — see
 * apps/web/scripts/build-human-base.mjs and tools/humanbase/measurements.json.
 *
 * Same joint ids, same hierarchy, same rest ORIENTATION as the stylized
 * humanoid rig (limbs hanging, palms forward), so every pose preset and
 * gesture — which are rotations — applies unchanged. Only the proportions
 * differ: they come from real anatomy rather than the stylized deity
 * figure, because a joint that does not sit where the body's joint sits
 * deforms the mesh wrongly however good the mesh is.
 */
const HUMAN_JOINT_POSITIONS: Partial<Record<JointId, Vec3>> = {
  pelvis: [0, 0.54991, 0.00198],
  spine: [0, 0.08613, -0.01235],
  chest: [0, 0.11414, -0.01722],
  neck: [0, 0.11363, 0.03357],
  head: [0, 0.05303, 0.01774],
  "arm.frontLeft.upper": [0.10596, 0.05678, 0.03676],
  "arm.frontLeft.forearm": [0.01863, -0.14903, 0],
  "arm.frontLeft.hand": [0, -0.14644, 0],
  "arm.frontRight.upper": [-0.10596, 0.05678, 0.03676],
  "arm.frontRight.forearm": [-0.01863, -0.14903, 0],
  "arm.frontRight.hand": [0, -0.14644, 0],
  // The body mesh skins only the front pair; the back pair mirrors it
  // behind the shoulder line so a four-armed form stays expressible.
  "arm.backLeft.upper": [0.10596, 0.05678, -0.05324],
  "arm.backLeft.forearm": [0.01863, -0.14903, 0],
  "arm.backLeft.hand": [0, -0.14644, 0],
  "arm.backRight.upper": [-0.10596, 0.05678, -0.05324],
  "arm.backRight.forearm": [-0.01863, -0.14903, 0],
  "arm.backRight.hand": [0, -0.14644, 0],
  "leg.left.thigh": [0.06047, -0.00475, -0.0057],
  "leg.left.shin": [0, -0.26286, 0],
  "leg.left.foot": [0, -0.24158, 0],
  "leg.right.thigh": [-0.06047, -0.00475, -0.0057],
  "leg.right.shin": [0, -0.26286, 0],
  "leg.right.foot": [0, -0.24158, 0],
};

/** Socket seats measured on the same mesh (the GLB refines them further). */
const HUMAN_SOCKET_POSITIONS: Partial<Record<SocketId, Vec3>> = {
  "head.crown": [0, 0.07115, -0.01548],
  "head.forehead": [0, 0.085, 0.03091],
  "head.leftEar": [0.04287, 0.022, 0.00403],
  "head.rightEar": [-0.04287, 0.022, 0.00403],
  "head.moon": [0.04, 0.05315, -0.01373],
  "chest.necklace": [0, 0.10363, 0.03583],
  "waist.ornament": [0, 0.09, 0.05537],
  "leg.left.anklet": [0, 0.03, 0.005],
  "leg.right.anklet": [0, 0.03, 0.005],
};

const withPosition = <T extends { id: string; position: readonly [number, number, number] }>(
  items: readonly T[],
  overrides: Record<string, Vec3 | undefined>,
): T[] => items.map((item) => (overrides[item.id] ? { ...item, position: overrides[item.id]! } : item));

/**
 * Human-proportioned rig for continuous skinned bodies. Deities adopt it
 * by referencing it from their definition; nothing else changes.
 */
export const HUMAN_SKELETON: SkeletonDefinition = defineSkeleton(
  "human",
  withPosition(HUMANOID_CORE_JOINTS, HUMAN_JOINT_POSITIONS),
  withPosition(HUMANOID_CORE_SOCKETS, HUMAN_SOCKET_POSITIONS),
);
