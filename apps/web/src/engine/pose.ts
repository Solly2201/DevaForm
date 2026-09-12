/**
 * Pose application — writes preset + override rotations onto rig joints,
 * clamped to each joint's limits. Pure in-place transform mutation; never
 * rebuilds geometry.
 */
import type * as THREE from "three";
import {
  SKELETON,
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

  for (const def of SKELETON) {
    const joint = joints.get(def.id);
    if (!joint) continue;

    const presetRotation = preset?.joints[def.id];
    const override = pose.jointOverrides[def.id];
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
