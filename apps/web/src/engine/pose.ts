/**
 * Pose application — writes preset + override rotations onto rig joints,
 * clamped to each joint's limits. Pure in-place transform mutation; never
 * rebuilds geometry.
 */
import type * as THREE from "three";
import {
  getJoint,
  getPosePreset,
  isJointId,
  type JointId,
  type PoseConfiguration,
  type Vec3,
} from "@devaform/character-schema";

const clamp = (value: number, range: readonly [number, number] | undefined): number =>
  range ? Math.min(range[1], Math.max(range[0], value)) : value;

export function applyPose(
  joints: ReadonlyMap<JointId, THREE.Object3D>,
  pose: PoseConfiguration,
): void {
  const preset = pose.preset ? getPosePreset(pose.preset) : undefined;

  // Seated presets translate the root so the figure rests on the base.
  const root = joints.get("root");
  if (root) {
    const offset = preset?.rootOffset ?? [0, 0, 0];
    root.position.set(offset[0], offset[1], offset[2]);
  }

  // Drive exactly the joints the rig was built with (the active deity's
  // skeleton); presets/overrides for joints this rig lacks are ignored.
  for (const [id, joint] of joints) {
    const def = getJoint(id);
    const presetRotation = preset?.joints[id];
    const override = pose.jointOverrides[id];
    const rotation: Vec3 = override ?? presetRotation ?? [0, 0, 0];

    joint.rotation.set(
      clamp(rotation[0], def.limits?.x),
      clamp(rotation[1], def.limits?.y),
      clamp(rotation[2], def.limits?.z),
    );
  }
}

/** Effective rotation of a joint under the current pose (for UI sliders). */
export function effectiveJointRotation(pose: PoseConfiguration, jointId: JointId): Vec3 {
  const override = pose.jointOverrides[jointId];
  if (override) return override;
  const preset = pose.preset ? getPosePreset(pose.preset) : undefined;
  return preset?.joints[jointId] ?? [0, 0, 0];
}

export function isKnownJoint(id: string): id is JointId {
  return isJointId(id);
}
