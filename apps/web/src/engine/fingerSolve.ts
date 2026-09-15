/**
 * Fingers that close on the thing the hand is holding.
 *
 * Until now a hand closed by ONE number: a morph target baked from a
 * clenched fist, dialled to whatever fraction matched the object's
 * radius. That can make a fist, and it can make a half fist, but it
 * cannot make a hand that is *around* a particular object — every finger
 * gets the same fraction of the same remembered curl, so a staff ends up
 * with fingertips a few millimetres inside it and a thumb lying wherever
 * the sculpt left it.
 *
 * The skeleton has had the fingers all along: five chains of three
 * joints, with measured rest offsets, skinned to the body mesh. This
 * drives them.
 *
 * THE CONSTRUCTION. A held object is a cylinder — an axis, a radius. A
 * finger joint has exactly one useful degree of freedom, flexion about
 * its own X, and the joints limit it to the direction a finger actually
 * bends. So for each joint in turn, going out from the knuckle, there is
 * one question: at what flexion does the NEXT joint land on the surface
 * the finger is closing onto? That is a one-dimensional solve with a
 * hard bracket, and it is answered by looking — twenty-four samples
 * across the joint's own limits, then a refinement. No inverse
 * kinematics, no iteration to convergence, no per-object angles.
 *
 * Because each joint is placed ON the surface, the chain wraps rather
 * than intersects, and it does so for any radius, any axis direction and
 * any hand — which is the point. A future deity's attribute declares a
 * grip type and a radius; nothing here needs to know what it is.
 */
import * as THREE from "three";
import {
  FINGER_IDS,
  FINGER_SEGMENTS,
  getJoint,
  type ArmSlot,
  type JointId,
} from "@devaform/character-schema";

/**
 * What kind of hold this is. The vocabulary is the presentation's own —
 * an attribute already declares `hand: "grip" | "pinch" | "hold"` — so
 * nothing new has to be authored on the asset side.
 */
export type GripShape = "grip" | "pinch" | "hold";

export interface GripRequest {
  /** A point on the object's axis, in world space. */
  origin: THREE.Vector3;
  /** The axis direction, in world space. */
  axis: THREE.Vector3;
  /** The object's radius where the hand closes, metres. */
  radius: number;
  shape: GripShape;
}

/**
 * How each finger behaves in each kind of hold.
 *
 * `wrap` means the finger closes onto the object itself. A number
 * instead is the fraction of that finger's own flexion range it takes —
 * a supporting curl, which is what the fingers not doing the holding do.
 */
const BEHAVIOUR: Record<GripShape, Record<string, "wrap" | number>> = {
  grip: { thumb: "wrap", index: "wrap", middle: "wrap", ring: "wrap", little: "wrap" },
  // Two points and three fingers folded out of the way, which is what a
  // pinch is: the object is held between the thumb and the index, and the
  // rest of the hand is doing nothing in particular.
  pinch: { thumb: "wrap", index: "wrap", middle: 0.45, ring: 0.5, little: 0.55 },
  // Cradled: the object rests in a hand that is barely closed.
  hold: { thumb: 0.35, index: 0.3, middle: 0.3, ring: 0.32, little: 0.35 },
};

/** Distance from a point to an infinite line. */
function distanceToAxis(
  point: THREE.Vector3,
  origin: THREE.Vector3,
  axis: THREE.Vector3,
  scratch: THREE.Vector3,
): number {
  scratch.copy(point).sub(origin);
  return scratch.addScaledVector(axis, -scratch.dot(axis)).length();
}

/**
 * How far a finger's tip is from the object's surface.
 *
 * Negative means the fingertip is inside the thing the hand is holding,
 * which is the defect this exists to remove.
 */
function tipClearance(
  tip: THREE.Object3D,
  request: GripRequest,
  surface: number,
  scratch: THREE.Vector3,
): number {
  return (
    distanceToAxis(tip.getWorldPosition(new THREE.Vector3()), request.origin, request.axis, scratch) -
    surface
  );
}

/**
 * How far the solver may bend any one joint away from the hand the body
 * already made.
 *
 * The bones can close a hand completely, and for a staff as thin as a
 * trishul's shaft the arithmetic says they should: a finger wrapping a
 * ten-millimetre cylinder turns nearly two hundred degrees over three
 * joints. The SKIN cannot. Weighted for a hand that bends, not for one
 * that folds into itself, it tears into ribbons well before that — which
 * is what driving the joints from scratch produced.
 *
 * So the coarse shape stays the body's own: a fist sculpted by whoever
 * made the mesh, dialled to the closure the object asks for. This only moves
 * the fingers the last few degrees onto the object, and that is a range
 * the deformation survives.
 */
const REFINE_LIMIT = 0.3;

/**
 * Which way this body's fingers bend.
 *
 * The canonical skeleton declares a flexion RANGE for a finger joint, and
 * a body's mesh may be rigged to either sign of it: the measured human
 * hands bend the opposite way to the stylised ones. So it is asked rather
 * than assumed — bend the index one way, then the other, and keep
 * whichever brings the finger toward the thing the hand is holding.
 */
function flexionSign(
  joints: ReadonlyMap<JointId, THREE.Object3D>,
  slot: ArmSlot,
  request: GripRequest,
): number {
  const knuckle = joints.get(`arm.${slot}.hand.index.01` as JointId);
  const middle = joints.get(`arm.${slot}.hand.index.02` as JointId);
  if (!knuckle || !middle) return 1;
  const was = knuckle.rotation.x;
  const scratch = new THREE.Vector3();
  const reach = (angle: number): number => {
    knuckle.rotation.x = angle;
    knuckle.updateMatrixWorld(true);
    return distanceToAxis(
      middle.getWorldPosition(new THREE.Vector3()),
      request.origin,
      request.axis,
      scratch,
    );
  };
  const positive = reach(0.25);
  const negative = reach(-0.25);
  knuckle.rotation.x = was;
  knuckle.updateMatrixWorld(true);
  return negative < positive ? -1 : 1;
}

/**
 * Close one hand's fingers onto what it is holding.
 *
 * Each finger is adjusted by ONE angle, shared by its three joints and
 * bounded, found by walking it until the fingertip sits on the object's
 * surface: curl while the tip is short of it, open while the tip is
 * inside it. One number per finger, five numbers per hand, no iteration
 * to convergence and nothing per-object.
 *
 * Returns false when this rig cannot do it — a body whose hands are
 * geometry rather than bones keeps whatever its own generator built,
 * which is how the stylised hands have always worked.
 */
export function solveGrip(
  joints: ReadonlyMap<JointId, THREE.Object3D>,
  slot: ArmSlot,
  request: GripRequest,
  /** Which finger joints this body's mesh is actually skinned to. */
  driven: (id: JointId) => boolean,
): boolean {
  const hand = joints.get(`arm.${slot}.hand` as JointId);
  if (!hand) return false;
  const axis = request.axis.clone().normalize();
  const plan = { ...request, axis };
  const sign = flexionSign(joints, slot, plan);
  const scratch = new THREE.Vector3();
  let solved = false;

  for (const finger of FINGER_IDS) {
    const behaviour = BEHAVIOUR[plan.shape][finger] ?? "wrap";
    const chain = FINGER_SEGMENTS.map(
      (segment) => joints.get(`arm.${slot}.hand.${finger}.${segment}` as JointId),
    );
    if (chain.some((joint) => joint === undefined)) continue;
    if (!driven(`arm.${slot}.hand.${finger}.01` as JointId)) continue;
    solved = true;
    const bones = chain as THREE.Object3D[];
    const rest = bones.map((joint) => joint.rotation.x);

    // A finger not doing the holding takes a share of the refinement as a
    // supporting curl and stops there.
    if (behaviour !== "wrap") {
      bones.forEach((joint, index) => {
        joint.rotation.x = rest[index]! + sign * REFINE_LIMIT * behaviour;
        joint.updateMatrixWorld(true);
      });
      continue;
    }

    // The surface this fingertip should rest on: the object, plus the
    // flesh between the bone and the skin.
    const thickness = bones[2]!.position.length() * 0.45;
    const surface = plan.radius + thickness;
    // Evenly, across the three joints. Weighting the far joints more
    // curls the fingertips into the palm before the fingers have reached
    // round the object, which is a fist with nothing in it.
    const SHARE = [1, 1, 1];
    const apply = (delta: number) => {
      bones.forEach((joint, index) => {
        joint.rotation.x = rest[index]! + sign * delta * (SHARE[index] ?? 1);
        joint.updateMatrixWorld(true);
      });
    };
    // A thumb opposes by swinging ACROSS the palm before it closes.
    //
    // That is a different rotation from flexion, and it is the one that
    // makes a hand a grip rather than a hook: the thumb's base is four
    // centimetres from a staff and its whole chain is barely that long,
    // so no amount of bending will bring it round. The joint declares the
    // range for it; this finds how much of it to use, by the same measure
    // as everything else.
    if (finger === "thumb") {
      const carry = bones[0]!;
      const restZ = carry.rotation.z;
      const limitZ = getJoint(
        `arm.${slot}.hand.thumb.01` as JointId,
      ).limits?.z ?? [-0.9, 0.9];
      let best = restZ;
      let closest = Number.POSITIVE_INFINITY;
      const STEPS = 16;
      for (let step = 0; step <= STEPS; step += 1) {
        const angle = limitZ[0] + ((limitZ[1] - limitZ[0]) * step) / STEPS;
        carry.rotation.z = angle;
        carry.updateMatrixWorld(true);
        const reach = Math.abs(
          tipClearance(bones[2]!, plan, plan.radius + thickness, scratch),
        );
        if (reach < closest) {
          closest = reach;
          best = angle;
        }
      }
      carry.rotation.z = best;
      carry.updateMatrixWorld(true);
      rest[0] = bones[0]!.rotation.x;
    }

    // The thumb is given more room to flex than the fingers too: it
    // shares less of its skin with the palm, so it takes a larger
    // correction without the deformation giving out.
    const room = finger === "thumb" ? REFINE_LIMIT * 2.6 : REFINE_LIMIT;
    let low = -room;
    let high = room;
    apply(high);
    const closed = tipClearance(bones[2]!, plan, surface, scratch);
    apply(low);
    const open = tipClearance(bones[2]!, plan, surface, scratch);
    if (closed > 0) {
      // Even fully curled it cannot reach: take everything it has.
      apply(high);
    } else if (open < 0) {
      // Even opened it is inside: back off as far as allowed.
      apply(low);
    } else {
      for (let step = 0; step < 10; step += 1) {
        const middle = (low + high) / 2;
        apply(middle);
        if (tipClearance(bones[2]!, plan, surface, scratch) > 0) low = middle;
        else high = middle;
      }
      apply((low + high) / 2);
    }
  }
  return solved;
}
