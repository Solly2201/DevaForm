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
  handThumbAxis,
  getJoint,
  getPosePreset,
  isJointId,
  type ArmSlot,
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

// ---------------------------------------------------------------------------
// Holding things
// ---------------------------------------------------------------------------

/**
 * Frame built from a hand's thumb direction and its palm direction:
 * columns are (thumb, palm × thumb, palm), so the frame maps the thumb
 * axis onto its first column and the palm axis onto its third.
 *
 * Both a hand and its target are described this way, which is what makes
 * the solve unambiguous — there is no sign left to choose.
 */
function gripFrame(thumb: THREE.Vector3, palm: THREE.Vector3): THREE.Quaternion {
  const t = thumb.clone().normalize();
  const p = palm.clone().projectOnPlane(t).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(t, p.clone().cross(t), p),
  );
}

/** How far a rotation falls outside a joint's limit, in radians. */
const excess = (value: number, range: readonly [number, number] | undefined): number =>
  !range ? 0 : Math.max(0, range[0] - value, value - range[1]);

/** An item a hand is holding, and the world direction it runs along. */
export interface HeldItem {
  slot: ArmSlot;
  /** World axis of the item's shaft — for an upright item, straight up. */
  axis: Vec3;
  /**
   * Which way this hand's thumb points, in the hand's own frame. A body
   * that has measured its hands supplies it; otherwise the contract's
   * side-aware default stands.
   */
  thumb?: Vec3;
}

const gripQuaternion = new THREE.Quaternion();
const gripParent = new THREE.Quaternion();
const gripEuler = new THREE.Euler();
const gripPosition = new THREE.Vector3();

/**
 * Turn the hands that are holding something so the thing is actually IN
 * them, the right way up.
 *
 * A closed fist has a hole through it; that hole runs across the knuckles
 * from the little finger to the THUMB, which gives it a direction and not
 * merely a line. You grip a staff with your thumb toward its head — so
 * the solve is: put this hand's thumb along the item's presented axis,
 * and turn its palm toward the body, the way a hanging arm does. Two
 * directions, one frame, no sign left to guess at. An earlier version
 * tried both signs of the channel and kept whichever the arm could reach,
 * which is how the hand ended up holding the trishul upside down.
 *
 * It is not a wrist rotation: a real arm turns its FOREARM to bring the
 * fist onto a vertical staff and the wrist only trims the result, so the
 * solver searches the forearm's own twist for the value that lets the
 * wrist land inside its limits. If none does, the pose's own wrist is
 * left alone rather than snapping to something broken. Returns the joints
 * it moved.
 */
export function applyGripOrientations(
  joints: ReadonlyMap<JointId, THREE.Object3D>,
  held: readonly HeldItem[],
): JointId[] {
  const applied: JointId[] = [];
  let top: THREE.Object3D | undefined = joints.get("root");
  while (top?.parent) top = top.parent;
  top?.updateMatrixWorld(true);

  for (const { slot, axis, thumb } of held) {
    const handId: JointId = `arm.${slot}.hand`;
    const forearmId: JointId = `arm.${slot}.forearm`;
    const hand = joints.get(handId);
    const forearm = joints.get(forearmId);
    if (!hand || !forearm) continue;

    // This hand's own frame — chiral, so the left and the right are not
    // the same hand with a different name.
    const handFrame = gripFrame(
      new THREE.Vector3(...(thumb ?? handThumbAxis(slot))),
      new THREE.Vector3(...HAND_PALM_AXIS),
    ).invert();

    // The palm turns toward the body's midline, which is what a hanging
    // arm does with a staff, with a little forward so it is not flat on.
    hand.getWorldPosition(gripPosition);
    const inward = new THREE.Vector3(gripPosition.x > 0 ? -1 : 1, 0, 0.3).normalize();
    const shaft = new THREE.Vector3(...axis).normalize();
    const target = gripFrame(shaft, inward).multiply(handFrame);

    const twistLimit = getJoint(forearmId).limits?.y;
    const wristLimits = getJoint(handId).limits;
    const restTwist = forearm.rotation.y;
    let best: { twist: number; wrist: THREE.Quaternion; cost: number } | null = null;

    for (let step = 0; step <= 48; step += 1) {
      const twist = clamp(-Math.PI + (step / 48) * Math.PI * 2, twistLimit);
      forearm.rotation.y = twist;
      forearm.updateMatrixWorld(true);
      forearm.getWorldQuaternion(gripParent);
      gripParent.invert();

      gripQuaternion.copy(gripParent).multiply(target);
      gripEuler.setFromQuaternion(gripQuaternion, "XYZ");
      const outside =
        excess(gripEuler.x, wristLimits?.x) +
        excess(gripEuler.y, wristLimits?.y) +
        excess(gripEuler.z, wristLimits?.z);
      // Prefer a reachable pose, then the least wrist bend, then the
      // least twist away from what the pose asked for.
      const cost =
        outside * 100 +
        Math.abs(gripEuler.x) +
        Math.abs(gripEuler.y) +
        Math.abs(gripEuler.z) +
        Math.abs(twist - restTwist) * 0.35;
      if (!best || cost < best.cost) {
        best = { twist, wrist: gripQuaternion.clone(), cost };
      }
    }

    forearm.rotation.y = restTwist;
    forearm.updateMatrixWorld(true);
    if (!best || best.cost >= 100) continue; // unreachable: leave the pose alone

    forearm.rotation.y = best.twist;
    forearm.updateMatrixWorld(true);
    hand.quaternion.copy(best.wrist);
    hand.updateMatrixWorld(true);
    applied.push(forearmId, handId);
  }
  return applied;
}
