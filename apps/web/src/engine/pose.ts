/**
 * Pose application — writes preset + override rotations onto rig joints,
 * clamped to each joint's limits. Pure in-place transform mutation; never
 * rebuilds geometry.
 */
import * as THREE from "three";
import {
  ARM_SLOTS,
  GESTURE_MUDRAS,
  HAND_FINGER_AXIS,
  HAND_PALM_AXIS,
  getJoint,
  getPosePreset,
  isJointId,
  type HandsConfiguration,
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

// ---------------------------------------------------------------------------
// Gesture orientation
// ---------------------------------------------------------------------------

const within = (value: number, range: readonly [number, number] | undefined): boolean =>
  !range || (value >= range[0] - 1e-6 && value <= range[1] + 1e-6);

/**
 * Orthonormal frame built from a finger direction and a palm direction:
 * columns are (fingers × palm, fingers, palm), so the frame maps local Y
 * onto the fingers and local Z onto the palm.
 */
function handFrame(fingers: THREE.Vector3, palm: THREE.Vector3): THREE.Quaternion {
  const f = fingers.clone().normalize();
  const p = palm.clone().projectOnPlane(f).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(f.clone().cross(p), f, p),
  );
}

/** The hand rig's own frame, from the shared axis convention. */
const HAND_LOCAL_FRAME = handFrame(
  new THREE.Vector3(...HAND_FINGER_AXIS),
  new THREE.Vector3(...HAND_PALM_AXIS),
);

/**
 * World rotation that points the hand's finger axis along `fingers` and
 * its palm axis along `palm`: carry the hand's own frame onto the target
 * frame. Derived from the axis constants, so the convention lives in one
 * place and a differently-authored hand would need no code change here.
 */
function gestureWorldQuaternion(fingers: Vec3, palm: Vec3): THREE.Quaternion {
  const target = handFrame(new THREE.Vector3(...fingers), new THREE.Vector3(...palm));
  return target.multiply(HAND_LOCAL_FRAME.clone().invert());
}

const parentQuaternion = new THREE.Quaternion();
const solvedQuaternion = new THREE.Quaternion();
const solvedEuler = new THREE.Euler();

/**
 * Orient gesture hands by meaning rather than by baked wrist angles.
 *
 * A mudra like abhaya is a statement about what the devotee sees — palm
 * toward them, fingers up — so the wrist is SOLVED from the arm the pose
 * actually produced. Run after applyPose, before attachments are aligned.
 *
 * If the arm cannot present the gesture within the wrist's joint limits
 * (a hanging arm cannot show a raised palm), the pose's own wrist is left
 * untouched instead of snapping to a clamped, broken-looking angle.
 * Returns the slots whose gesture was applied.
 */
export function applyGestureOrientations(
  joints: ReadonlyMap<JointId, THREE.Object3D>,
  hands: HandsConfiguration,
): JointId[] {
  const applied: JointId[] = [];
  let top: THREE.Object3D | undefined = joints.get("root");
  while (top?.parent) top = top.parent;
  top?.updateMatrixWorld(true);

  for (const slot of ARM_SLOTS) {
    const gesture = GESTURE_MUDRAS[hands[slot]?.mudra];
    if (!gesture) continue;
    const handId: JointId = `arm.${slot}.hand`;
    const hand = joints.get(handId);
    const forearm = joints.get(`arm.${slot}.forearm`);
    if (!hand || !forearm) continue;

    forearm.getWorldQuaternion(parentQuaternion);
    solvedQuaternion
      .copy(parentQuaternion)
      .invert()
      .multiply(gestureWorldQuaternion(gesture.fingers, gesture.palm));
    solvedEuler.setFromQuaternion(solvedQuaternion, "XYZ");

    const limits = getJoint(handId).limits;
    const fits =
      within(solvedEuler.x, limits?.x) &&
      within(solvedEuler.y, limits?.y) &&
      within(solvedEuler.z, limits?.z);
    if (!fits) continue;

    hand.quaternion.copy(solvedQuaternion);
    hand.updateMatrixWorld(true);
    applied.push(handId);
  }
  return applied;
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
