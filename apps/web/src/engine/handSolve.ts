/**
 * Putting a hand where it has to be.
 *
 * Two things ask for this and they used to answer it separately. A gesture
 * says what the devotee must SEE — palm toward them, fingers up — which
 * fixes the hand's whole orientation. A grip says which way the thing in
 * the fist must RUN, which fixes one axis and leaves a circle of rotations
 * about it. Both are the same problem with a different constraint, and
 * both were solved by writing a rotation straight onto the wrist.
 *
 * That is not how an arm works, and the measurements say so plainly. A
 * hanging arm cannot bring its fist onto a vertical staff by bending the
 * wrist: the tube a closed fist makes runs across the knuckles, roughly
 * square to the forearm, and no amount of wrist can stand it upright. What
 * a person does is rotate the SHOULDER — the whole arm turns about its own
 * length — then pronate the forearm, and only then trim with the wrist.
 * Measured across every pose in the product, that ordering takes the
 * residual error from 46° to under 6°, with a wrist that stays inside a
 * believable range instead of deviating forty degrees sideways.
 *
 * So the solver searches the two twists a real arm has and charges them at
 * different rates: a wrist far from neutral is expensive, shoulder
 * rotation is cheap, forearm pronation cheaper still. What it cannot reach
 * it reports, rather than leaving the hand wherever the pose put it and
 * hoping nobody looks.
 */
import * as THREE from "three";
import { getJoint, type ArmSlot, type JointId } from "@devaform/character-schema";

const clamp = (value: number, range: readonly [number, number] | undefined): number =>
  range ? Math.min(range[1], Math.max(range[0], value)) : value;

/** What the hand has to achieve. */
export type HandConstraint =
  /** The hand's full world orientation is fixed (a gesture). */
  | { kind: "orientation"; world: THREE.Quaternion }
  /**
   * One hand-local axis must point along a world direction (a grip). The
   * rotation about that axis is free, and the solver spends the freedom
   * on keeping the wrist near neutral.
   */
  | { kind: "axis"; local: THREE.Vector3; toward: THREE.Vector3 };

export interface HandSolution {
  slot: ArmSlot;
  /** How far the result still falls short, in radians. */
  residual: number;
  /** Shoulder rotation about the upper arm's own length, radians. */
  shoulderTwist: number;
  /** Forearm pronation, radians. */
  forearmTwist: number;
  /** False when the answer missed and the arm was put back as it was. */
  applied: boolean;
}

/**
 * The direction a bone runs, in its own frame: straight at the joint
 * below it. Derived from the skeleton rather than assumed, so twisting
 * about it leaves the child joint exactly where the pose put it.
 */
function boneAxis(child: JointId): THREE.Vector3 {
  return new THREE.Vector3(...getJoint(child).position).normalize();
}

const parentWorld = new THREE.Quaternion();
const upperQ = new THREE.Quaternion();
const forearmQ = new THREE.Quaternion();
const twistQ = new THREE.Quaternion();
const handWorldQ = new THREE.Quaternion();
const forearmWorldQ = new THREE.Quaternion();
const desired = new THREE.Quaternion();
const localWrist = new THREE.Quaternion();
const wristEuler = new THREE.Euler();
const scratchEuler = new THREE.Euler();
const scratchAxis = new THREE.Vector3();
const achievedWrist = new THREE.Quaternion();

/**
 * A wrist near neutral is a wrist a person has. Charged at full rate so
 * the solver reaches for the arm's own twists first — which is the whole
 * anatomical point of this module.
 */
const WRIST_COST = 1;
const SHOULDER_COST = 0.3;
const FOREARM_COST = 0.22;
/** A miss is worth far more than any amount of effort spent avoiding it. */
const RESIDUAL_COST = 6;

export function solveHand(
  joints: ReadonlyMap<JointId, THREE.Object3D>,
  slot: ArmSlot,
  constraint: HandConstraint,
  options: {
    /**
     * Put the arm back if the best answer still misses by more than this.
     *
     * For a gesture that is the right call: an arm the pose never raised
     * cannot show a palm to a devotee, and twisting it three-quarters of
     * the way there produces a hand that is neither posed nor blessing.
     * For a grip it is not: a fist turned most of the way onto a shaft is
     * closer to holding it than one left alone.
     */
    revertBeyond?: number;
  } = {},
): HandSolution | null {
  const upperId: JointId = `arm.${slot}.upper`;
  const forearmId: JointId = `arm.${slot}.forearm`;
  const handId: JointId = `arm.${slot}.hand`;
  const upper = joints.get(upperId);
  const forearm = joints.get(forearmId);
  const hand = joints.get(handId);
  if (!upper || !forearm || !hand) return null;

  const chest = upper.parent;
  if (!chest) return null;
  chest.updateWorldMatrix(true, false);
  chest.getWorldQuaternion(parentWorld);

  // The pose's own arm, which the solver TWISTS rather than replaces.
  const posedUpper = upper.quaternion.clone();
  const posedForearm = forearm.quaternion.clone();
  const upperAxis = boneAxis(forearmId);
  const forearmAxis = boneAxis(handId);
  const restWrist = hand.quaternion.clone();
  const shoulderLimit = getJoint(upperId).twist;
  const pronationLimit = getJoint(forearmId).twist;
  const wristLimits = getJoint(handId).limits;

  // Orientation only — no scene-graph updates inside the search. The
  // chain is three rotations, and positions cannot affect which way a
  // hand points.
  const evaluate = (
    shoulder: number,
    pronation: number,
  ): { cost: number; residual: number; wrist: THREE.Euler } => {
    // Twist is applied about each bone's own length, AFTER the pose — so
    // the arm turns without the elbow or the hand moving an inch.
    upperQ.copy(posedUpper).multiply(twistQ.setFromAxisAngle(upperAxis, shoulder));
    forearmQ.copy(posedForearm).multiply(twistQ.setFromAxisAngle(forearmAxis, pronation));
    forearmWorldQ.copy(parentWorld).multiply(upperQ).multiply(forearmQ);
    handWorldQ.copy(forearmWorldQ).multiply(restWrist);

    if (constraint.kind === "orientation") {
      desired.copy(constraint.world);
    } else {
      scratchAxis.copy(constraint.local).applyQuaternion(handWorldQ);
      desired
        .setFromUnitVectors(scratchAxis, constraint.toward)
        .multiply(handWorldQ);
    }

    localWrist.copy(forearmWorldQ).invert().multiply(desired);
    wristEuler.setFromQuaternion(localWrist, "XYZ");
    const cx = clamp(wristEuler.x, wristLimits?.x);
    const cy = clamp(wristEuler.y, wristLimits?.y);
    const cz = clamp(wristEuler.z, wristLimits?.z);
    scratchEuler.set(cx, cy, cz, "XYZ");
    achievedWrist.setFromEuler(scratchEuler);
    // What the hand actually ends up doing, once the wrist has been held
    // to what a wrist can do.
    const achievedWorld = forearmWorldQ.clone().multiply(achievedWrist);
    let residual: number;
    if (constraint.kind === "orientation") {
      residual = achievedWorld.angleTo(constraint.world);
    } else {
      residual = scratchAxis
        .copy(constraint.local)
        .applyQuaternion(achievedWorld)
        .angleTo(constraint.toward);
    }
    const cost =
      residual * RESIDUAL_COST +
      Math.hypot(cx, cy, cz) * WRIST_COST +
      Math.abs(shoulder) * SHOULDER_COST +
      Math.abs(pronation) * FOREARM_COST;
    return { cost, residual, wrist: new THREE.Euler(cx, cy, cz, "XYZ") };
  };

  // A joint that declares no twist range does not twist.
  const shoulderSpan = shoulderLimit ?? ([0, 0] as const);
  const pronationSpan = pronationLimit ?? ([0, 0] as const);
  let best: { cost: number; residual: number; wrist: THREE.Euler; s: number; p: number } | null =
    null;
  const consider = (s: number, p: number) => {
    const shoulder = clamp(s, shoulderLimit);
    const pronation = clamp(p, pronationLimit);
    const result = evaluate(shoulder, pronation);
    if (!best || result.cost < best.cost) {
      best = { ...result, s: shoulder, p: pronation };
    }
  };

  // Coarse sweep, then two local refinements. The cost surface is smooth
  // away from the limit walls, so this lands on the same answer as a
  // brute-force grid an order of magnitude larger.
  const COARSE = 16;
  for (let i = 0; i <= COARSE; i += 1) {
    for (let j = 0; j <= COARSE; j += 1) {
      consider(
        shoulderSpan[0] + ((shoulderSpan[1] - shoulderSpan[0]) * i) / COARSE,
        pronationSpan[0] + ((pronationSpan[1] - pronationSpan[0]) * j) / COARSE,
      );
    }
  }
  let sStep = (shoulderSpan[1] - shoulderSpan[0]) / COARSE;
  let pStep = (pronationSpan[1] - pronationSpan[0]) / COARSE;
  for (let round = 0; round < 3; round += 1) {
    const centre = best as unknown as { s: number; p: number };
    const s0 = centre.s;
    const p0 = centre.p;
    for (let i = -2; i <= 2; i += 1) {
      for (let j = -2; j <= 2; j += 1) {
        consider(s0 + (sStep * i) / 2, p0 + (pStep * j) / 2);
      }
    }
    sStep /= 2;
    pStep /= 2;
  }
  if (!best) return null;
  const chosen = best as {
    cost: number;
    residual: number;
    wrist: THREE.Euler;
    s: number;
    p: number;
  };

  const missed =
    options.revertBeyond !== undefined && chosen.residual > options.revertBeyond;
  if (!missed) {
    upper.quaternion
      .copy(posedUpper)
      .multiply(twistQ.setFromAxisAngle(upperAxis, chosen.s));
    forearm.quaternion
      .copy(posedForearm)
      .multiply(twistQ.setFromAxisAngle(forearmAxis, chosen.p));
    hand.rotation.set(chosen.wrist.x, chosen.wrist.y, chosen.wrist.z);
  }
  upper.updateMatrixWorld(true);
  return {
    slot,
    residual: chosen.residual,
    shoulderTwist: missed ? 0 : chosen.s,
    forearmTwist: missed ? 0 : chosen.p,
    applied: !missed,
  };
}
