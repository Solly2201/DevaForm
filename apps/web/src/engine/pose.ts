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
  isJointId,
  getPosePreset,
  type ArmSlot,
  type HandsConfiguration,
  type JointId,
  type PoseConfiguration,
  type Vec3,
} from "@devaform/character-schema";
import { solveHand, type HandSolution } from "./handSolve";

export type { HandSolution } from "./handSolve";

const clamp = (value: number, range: readonly [number, number] | undefined): number =>
  range ? Math.min(range[1], Math.max(range[0], value)) : value;

export function applyPose(
  joints: ReadonlyMap<JointId, THREE.Object3D>,
  pose: PoseConfiguration,
): void {
  const preset = pose.preset ? getPosePreset(pose.preset) : undefined;

  // The root starts where the skeleton puts it. Where the figure ends up
  // is settled afterwards, against the support it rests on — see
  // settleOnSupport. A pose does not carry a height of its own.
  joints.get("root")?.position.set(0, 0, 0);

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

/** How far out of true a solved hand may be before it is worth saying. */
export const HAND_TOLERANCE = 0.18; // radians, ~10°

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

/**
 * Orient gesture hands by meaning rather than by baked wrist angles.
 *
 * A mudra like abhaya is a statement about what the devotee sees — palm
 * toward them, fingers up — so the whole ARM is solved for it: shoulder
 * rotation, forearm pronation, then the wrist. Run after applyPose.
 *
 * It used to write the answer straight onto the wrist and give up when
 * that did not fit, which is why a blessing shown from an arm the pose had
 * not pre-rotated simply did not happen. Now the arm is asked first, and
 * what cannot be reached is reported rather than silently skipped.
 */
export function applyGestureOrientations(
  joints: ReadonlyMap<JointId, THREE.Object3D>,
  hands: HandsConfiguration,
): HandSolution[] {
  const solved: HandSolution[] = [];
  let top: THREE.Object3D | undefined = joints.get("root");
  while (top?.parent) top = top.parent;
  top?.updateMatrixWorld(true);

  for (const slot of ARM_SLOTS) {
    const gesture = GESTURE_MUDRAS[hands[slot]?.mudra];
    if (!gesture) continue;
    const solution = solveHand(
      joints,
      slot,
      { kind: "orientation", world: gestureWorldQuaternion(gesture.fingers, gesture.palm) },
      // An arm the pose never raised cannot show this palm. Leave it as
      // the pose has it and say so, rather than producing a hand that is
      // neither one thing nor the other.
      { revertBeyond: HAND_TOLERANCE },
    );
    if (solution) solved.push(solution);
  }
  return solved;
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

/** An item a hand is holding, and the world direction it runs along. */
export interface HeldItem {
  slot: ArmSlot;
  /**
   * World axis the item must be presented along — for an upright item,
   * straight up. Expressed in the SOCKET's frame, whose +Y the rig has
   * already aimed up the hand's own grip channel, so this is a statement
   * about the item and never about which hand is holding it.
   */
  axis: Vec3;
}

/**
 * Turn the hands that are holding something so the thing is actually IN
 * them, the right way up.
 *
 * A closed fist has a hole through it, and the item socket's +Y runs
 * straight down it — the hand geometry said so, either by measuring its
 * own thumb or by declaring the axis it was drawn around. The constraint
 * is therefore a single axis, and the arm is solved for it: shoulder,
 * then forearm, then wrist. See handSolve.ts for why that ordering is the
 * whole answer and a wrist rotation on its own is not.
 */
export function applyGripOrientations(
  joints: ReadonlyMap<JointId, THREE.Object3D>,
  held: readonly HeldItem[],
  /** The channel each hand's item socket was aimed along, hand-local. */
  channelOf: (slot: ArmSlot) => THREE.Vector3,
): HandSolution[] {
  const solved: HandSolution[] = [];
  let top: THREE.Object3D | undefined = joints.get("root");
  while (top?.parent) top = top.parent;
  top?.updateMatrixWorld(true);

  for (const { slot, axis } of held) {
    const solution = solveHand(joints, slot, {
      kind: "axis",
      local: channelOf(slot).clone().normalize(),
      toward: new THREE.Vector3(...axis).normalize(),
    });
    if (solution) solved.push(solution);
  }
  return solved;
}

/** Hands that could not reach what was asked of them. */
export function unreachableGrips(solutions: readonly HandSolution[]): HandSolution[] {
  return solutions.filter((solution) => solution.residual > HAND_TOLERANCE);
}
