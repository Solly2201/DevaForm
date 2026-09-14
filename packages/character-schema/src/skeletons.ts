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
  ARM_SLOTS,
  computeJointUiGroups,
  humanoidJoints,
  type ArmSlot,
  type JointDefinition,
  type JointId,
  type JointUiGroup,
} from "./skeleton";
import { humanoidSockets, type SocketDefinition, type SocketId } from "./sockets";
import type { Vec3 } from "./configuration";

const withPosition = <T extends { id: string; position: readonly [number, number, number] }>(
  items: readonly T[],
  overrides: Record<string, Vec3 | undefined>,
): T[] =>
  items.map((item) =>
    overrides[item.id] ? { ...item, position: overrides[item.id]! } : item,
  );

/**
 * Anatomy beyond the humanoid core that a skeleton declares it has.
 *
 * An extension is not decoration: the joints and the sockets hung off
 * them are built together or not at all, so nothing can be attached to a
 * limb the body does not own.
 */
export interface SkeletonExtensions {
  /** Ganesha's trunk chain and its tip socket. */
  trunk?: boolean;
  /** A second pair of arms, with their hand and wrist sockets. */
  backArms?: boolean;
}

export interface SkeletonDefinition {
  /** Stable skeleton id (referenced by rigs/tooling, not persisted in configs). */
  id: string;
  /** Joints in build order — parents precede children. */
  joints: readonly JointDefinition[];
  /** Sockets available on this skeleton. */
  sockets: readonly SocketDefinition[];
  /** User-posable joints grouped by semantic body part (pose UI). */
  uiGroups: readonly JointUiGroup[];
  /** Which optional anatomy this skeleton carries. */
  extensions: SkeletonExtensions;
  /** Arm chains this skeleton actually has — front pair, plus back if declared. */
  armSlots: readonly ArmSlot[];
}

function defineSkeleton(
  id: string,
  extensions: SkeletonExtensions,
  overrides: {
    joints?: Record<string, Vec3 | undefined>;
    sockets?: Record<string, Vec3 | undefined>;
  } = {},
): SkeletonDefinition {
  const joints = withPosition(humanoidJoints(extensions), overrides.joints ?? {});
  const sockets = withPosition(humanoidSockets(extensions), overrides.sockets ?? {});
  return {
    id,
    joints,
    sockets,
    uiGroups: computeJointUiGroups(joints),
    extensions,
    armSlots: ARM_SLOTS.filter(
      (slot) => extensions.backArms || !slot.startsWith("back"),
    ),
  };
}

/** The shared humanoid rig: torso, head, two pairs of arms, two legs. */
export const HUMANOID_SKELETON: SkeletonDefinition = defineSkeleton("humanoid", {
  backArms: true,
});

/** Humanoid core + Ganesha's trunk chain and trunk-tip socket. */
export const GANESHA_SKELETON: SkeletonDefinition = defineSkeleton("ganesha", {
  backArms: true,
  trunk: true,
});

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
  "pelvis": [0, 0.55199, 0.00246],
  "spine": [0, 0.08546, -0.01261],
  "chest": [0, 0.11374, -0.01815],
  "neck": [0, 0.11373, 0.03429],
  "head": [0, 0.05237, 0.01676],
  "arm.frontLeft.upper": [0.10538, 0.05691, 0.03693],
  "arm.frontLeft.forearm": [0.01852, -0.14816, 0],
  "arm.frontLeft.hand": [0, -0.14556, 0],
  "leg.left.thigh": [0.06121, -0.00683, -0.0057],
  "leg.left.shin": [0, -0.25867, 0],
  "leg.left.foot": [0, -0.246, 0],
  "arm.frontRight.upper": [-0.10538, 0.05691, 0.03693],
  "arm.frontRight.forearm": [-0.01852, -0.14816, 0],
  "arm.frontRight.hand": [0, -0.14556, 0],
  "leg.right.thigh": [-0.06121, -0.00683, -0.0057],
  "leg.right.shin": [0, -0.25867, 0],
  "leg.right.foot": [0, -0.246, 0],
};

/** Socket seats measured on the same mesh (the GLB refines them further). */
const HUMAN_SOCKET_POSITIONS: Partial<Record<SocketId, Vec3>> = {
  "head.crown": [0, 0.07071, -0.01501],
  "head.forehead": [0, 0.0294, 0.0615],
  "head.leftEar": [0.04203, 0.022, 0.00464],
  "head.rightEar": [-0.04203, 0.022, 0.00464],
  "head.moon": [0.04, 0.05271, -0.01274],
  "chest.necklace": [0, 0.10373, 0.03604],
  "waist.ornament": [0, 0.09, 0.0554],
  "arm.frontLeft.hand.item": [0.00337, -0.05942, -0.00601],
  "arm.frontRight.hand.item": [-0.00337, -0.05942, -0.00601],
  "leg.left.anklet": [0, 0.03, 0.005],
  "leg.right.anklet": [0, 0.03, 0.005],
};

/**
 * Human-proportioned rig for continuous skinned bodies. Deities adopt it
 * by referencing it from their definition; nothing else changes.
 *
 * ONE pair of arms, because the mesh has one pair of arms. It used to
 * carry four — the back pair keeping the stylised figure's offsets,
 * because there was no second pair on the body to measure — and a hand
 * socket seven centimetres from where any hand was still accepted items.
 */
export const HUMAN_SKELETON: SkeletonDefinition = defineSkeleton(
  "human",
  {},
  { joints: HUMAN_JOINT_POSITIONS, sockets: HUMAN_SOCKET_POSITIONS },
);

/**
 * Every skeleton the engine can build, by id. A body asset names the
 * anatomy it was authored for; the deity supplies the default for bodies
 * that are generated rather than measured.
 */
const SKELETONS: Record<string, SkeletonDefinition> = Object.fromEntries(
  [HUMANOID_SKELETON, GANESHA_SKELETON, HUMAN_SKELETON].map((skeleton) => [
    skeleton.id,
    skeleton,
  ]),
);

export function getSkeleton(id: string): SkeletonDefinition | undefined {
  return SKELETONS[id];
}
