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
  type JointUiGroup,
} from "./skeleton";
import {
  HUMANOID_CORE_SOCKETS,
  SOCKETS,
  type SocketDefinition,
} from "./sockets";

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
