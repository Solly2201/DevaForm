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
  /**
   * Digits on every hand. The contract is common — one naming, one
   * chirality, defined once in skeleton.ts — but it is instantiated only
   * for a body whose mesh has fingers to deform. A procedural hand that
   * is rebuilt per mudra would carry sixty joints it never uses.
   */
  fingers?: boolean;
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

/** Every joint a hand of this skeleton has, for the grip/mudra solvers. */
export function fingerJointIds(
  skeleton: SkeletonDefinition,
  slot: ArmSlot,
): readonly JointId[] {
  const prefix = `arm.${slot}.hand.`;
  return skeleton.joints
    .filter((joint) => joint.id.startsWith(prefix))
    .map((joint) => joint.id);
}

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
  // Left hand
  "arm.frontLeft.hand.thumb.01": [0.01751, -0.01993, -0.00572],
  "arm.frontLeft.hand.thumb.02": [0.01185, -0.01027, 0.00975],
  "arm.frontLeft.hand.thumb.03": [0.01306, -0.0171, 0.00478],
  "arm.frontLeft.hand.index.01": [0.02392, -0.05567, -0.02126],
  "arm.frontLeft.hand.index.02": [0.00405, -0.01499, -0.00203],
  "arm.frontLeft.hand.index.03": [0.00263, -0.01376, 0.001],
  "arm.frontLeft.hand.middle.01": [0.00856, -0.05586, -0.02501],
  "arm.frontLeft.hand.middle.02": [-0.00041, -0.02028, -0.00217],
  "arm.frontLeft.hand.middle.03": [0.00051, -0.01638, 0.0002],
  "arm.frontLeft.hand.ring.01": [-0.00352, -0.05365, -0.02501],
  "arm.frontLeft.hand.ring.02": [-0.00337, -0.01745, -0.00253],
  "arm.frontLeft.hand.ring.03": [-0.00169, -0.01484, -0.00025],
  "arm.frontLeft.hand.little.01": [-0.01551, -0.05085, -0.02126],
  "arm.frontLeft.hand.little.02": [-0.00376, -0.01231, -0.00074],
  "arm.frontLeft.hand.little.03": [-0.00225, -0.00901, 0.00097],
  // Right hand
  "arm.frontRight.hand.thumb.01": [-0.01751, -0.01993, -0.00572],
  "arm.frontRight.hand.thumb.02": [-0.01185, -0.01027, 0.00975],
  "arm.frontRight.hand.thumb.03": [-0.01306, -0.0171, 0.00478],
  "arm.frontRight.hand.index.01": [-0.02392, -0.05567, -0.02126],
  "arm.frontRight.hand.index.02": [-0.00405, -0.01499, -0.00203],
  "arm.frontRight.hand.index.03": [-0.00263, -0.01376, 0.001],
  "arm.frontRight.hand.middle.01": [-0.00856, -0.05586, -0.02501],
  "arm.frontRight.hand.middle.02": [0.00041, -0.02028, -0.00217],
  "arm.frontRight.hand.middle.03": [-0.00051, -0.01638, 0.0002],
  "arm.frontRight.hand.ring.01": [0.00352, -0.05365, -0.02501],
  "arm.frontRight.hand.ring.02": [0.00337, -0.01745, -0.00253],
  "arm.frontRight.hand.ring.03": [0.00169, -0.01484, -0.00025],
  "arm.frontRight.hand.little.01": [0.01551, -0.05085, -0.02126],
  "arm.frontRight.hand.little.02": [0.00376, -0.01231, -0.00074],
  "arm.frontRight.hand.little.03": [0.00225, -0.00901, 0.00097],
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
  { fingers: true },
  { joints: HUMAN_JOINT_POSITIONS, sockets: HUMAN_SOCKET_POSITIONS },
);

/**
 * The same measured human anatomy with a second pair of arms.
 *
 * Declared before any body claims it, and that is the point: a four-armed
 * deity is not a different engine, it is this skeleton plus a body asset
 * that has the geometry for it. Vishnu's iconography asks for four arms;
 * the mesh body in the repository has two, so `armOptionsFor` offers two
 * — and the day a four-armed body is modelled it names this skeleton and
 * the option appears, with the same sockets, the same grip channels and
 * the same resolver.
 *
 * The back pair's offsets are MEASURED, like the front pair's: the body
 * that claims this skeleton builds its second pair by moving the first
 * one, and these are where that move puts every joint. They are emitted
 * by apps/web/scripts/build-human-base.mjs and held to the built asset by
 * a test, because a joint the schema places anywhere other than where the
 * mesh put it is a hand in the wrong place for every pose ever written.
 */
const HUMAN_BACK_ARM_POSITIONS: Record<string, Vec3> = {
    "arm.backLeft.upper": [0.11738, 0.00491, -0.02507],
    "arm.backLeft.forearm": [-0.01128, -0.14889, 0],
    "arm.backLeft.hand": [-0.02892, -0.14266, 0],
    "arm.backLeft.hand.thumb.01": [0.0132, -0.02301, -0.00572],
    "arm.backLeft.hand.thumb.02": [0.00958, -0.01242, 0.00975],
    "arm.backLeft.hand.thumb.03": [0.0094, -0.01935, 0.00478],
    "arm.backLeft.hand.index.01": [0.01239, -0.05932, -0.02126],
    "arm.backLeft.hand.index.02": [0.00099, -0.01549, -0.00203],
    "arm.backLeft.hand.index.03": [-0.00016, -0.01401, 0.001],
    "arm.backLeft.hand.middle.01": [-0.00271, -0.05645, -0.02501],
    "arm.backLeft.hand.middle.02": [-0.00443, -0.01979, -0.00217],
    "arm.backLeft.hand.middle.03": [-0.00276, -0.01616, 0.0002],
    "arm.backLeft.hand.ring.01": [-0.01411, -0.05189, -0.02501],
    "arm.backLeft.hand.ring.02": [-0.00677, -0.01643, -0.00253],
    "arm.backLeft.hand.ring.03": [-0.0046, -0.01421, -0.00025],
    "arm.backLeft.hand.little.01": [-0.0253, -0.04675, -0.02126],
    "arm.backLeft.hand.little.02": [-0.00613, -0.01132, -0.00074],
    "arm.backLeft.hand.little.03": [-0.00399, -0.00839, 0.00097],
    "arm.backRight.upper": [-0.11738, 0.00491, -0.02507],
    "arm.backRight.forearm": [0.01128, -0.14889, 0],
    "arm.backRight.hand": [0.02892, -0.14266, 0],
    "arm.backRight.hand.thumb.01": [-0.0132, -0.02301, -0.00572],
    "arm.backRight.hand.thumb.02": [-0.00958, -0.01242, 0.00975],
    "arm.backRight.hand.thumb.03": [-0.0094, -0.01935, 0.00478],
    "arm.backRight.hand.index.01": [-0.01239, -0.05932, -0.02126],
    "arm.backRight.hand.index.02": [-0.00099, -0.01549, -0.00203],
    "arm.backRight.hand.index.03": [0.00016, -0.01401, 0.001],
    "arm.backRight.hand.middle.01": [0.00271, -0.05645, -0.02501],
    "arm.backRight.hand.middle.02": [0.00443, -0.01979, -0.00217],
    "arm.backRight.hand.middle.03": [0.00276, -0.01616, 0.0002],
    "arm.backRight.hand.ring.01": [0.01411, -0.05189, -0.02501],
    "arm.backRight.hand.ring.02": [0.00677, -0.01643, -0.00253],
    "arm.backRight.hand.ring.03": [0.0046, -0.01421, -0.00025],
    "arm.backRight.hand.little.01": [0.0253, -0.04675, -0.02126],
    "arm.backRight.hand.little.02": [0.00613, -0.01132, -0.00074],
    "arm.backRight.hand.little.03": [0.00399, -0.00839, 0.00097],
};

export const HUMAN_FOUR_ARM_SKELETON: SkeletonDefinition = defineSkeleton(
  "human4",
  { fingers: true, backArms: true },
  {
    joints: { ...HUMAN_JOINT_POSITIONS, ...HUMAN_BACK_ARM_POSITIONS },
    sockets: HUMAN_SOCKET_POSITIONS,
  },
);

/**
 * Every skeleton the engine can build, by id. A body asset names the
 * anatomy it was authored for; the deity supplies the default for bodies
 * that are generated rather than measured.
 */
const SKELETONS: Record<string, SkeletonDefinition> = Object.fromEntries(
  [HUMANOID_SKELETON, GANESHA_SKELETON, HUMAN_SKELETON, HUMAN_FOUR_ARM_SKELETON].map(
    (skeleton) => [
      skeleton.id,
      skeleton,
    ],
  ),
);

export function getSkeleton(id: string): SkeletonDefinition | undefined {
  return SKELETONS[id];
}
