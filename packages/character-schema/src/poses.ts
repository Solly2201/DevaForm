/**
 * Pose presets — named rest-relative joint rotations (euler XYZ, radians).
 * Presets only specify the joints they care about; everything else stays
 * at rest. User overrides in PoseConfiguration are applied on top.
 *
 * Gesture mudras (abhaya, varada) are NOT wrist rotations: they declare
 * where the palm and fingers must point in the world, and the engine
 * solves the wrist for whatever arm the pose provides. See
 * GESTURE_MUDRAS below.
 */
import type { ArmSlot, JointId } from "./skeleton";
import type { MudraId, Vec3 } from "./configuration";

/**
 * How the cloth is worn in a pose.
 *
 * A full-length dhoti is one draped mass around both legs, which is what
 * the iconography shows and what a wrapped garment actually is. That only
 * works while the legs stay under it: a pose that folds them up or throws
 * one out needs the cloth gathered or cut short, which is exactly what a
 * person does before sitting down or dancing.
 *
 * It is a property of the POSE because it is a fact about the pose, not
 * about the garment: the same dhoti is worn all three ways. Generators
 * read it and build accordingly, rather than the renderer discovering a
 * leg sticking through a skirt.
 */
export type GarmentFit =
  /** Legs down and together: cloth falls to the ankles. */
  | "full"
  /** Legs folded: cloth gathered over the lap. */
  | "gathered"
  /** A leg is lifted or swung: cloth ends above the knee. */
  | "short";

export interface PosePreset {
  id: string;
  label: string;
  description: string;
  joints: Partial<Record<JointId, Vec3>>;
  /**
   * How cloth is worn here. Defaults to "gathered" when seated and
   * "full" otherwise — see garmentFitOf, which is what consumers call.
   */
  garment?: GarmentFit;

  /**
   * Seated poses place the figure on the ground/base: clothing generators
   * swap to lap drapes and the base keeps its own anchoring. A property of
   * the pose itself, so every deity's presets carry their own truth.
   */
  seated?: boolean;
  /**
   * Hands this pose puts into a gesture, and which gesture.
   *
   * The preset already embeds the arm chain for them — see gestureArm —
   * but embedding it only moved the arm. The HAND went on doing whatever
   * the configuration last said, so "Blessing" raised an abhaya arm whose
   * hand was still set to grip, and the engine dutifully closed a fist
   * around a trident and carried it up to head height. A hand cannot bless
   * and grip at the same time, and naming the gesture here is what lets
   * the engine know which one this is.
   */
  gestures?: Partial<Record<ArmSlot, MudraId>>;
}

const D = Math.PI / 180;

// ---------------------------------------------------------------------------
// Gesture mudras — semantic hand orientation, not baked wrist angles
// ---------------------------------------------------------------------------

/**
 * Hand rig convention (all deities share the hand asset contract): the
 * fingers grow along the hand's local -Y and the palm faces its local +Z.
 * Gestures are expressed against these axes, so a gesture means the same
 * thing on any hand built to the contract.
 */
export const HAND_FINGER_AXIS: Vec3 = [0, -1, 0];
export const HAND_PALM_AXIS: Vec3 = [0, 0, 1];
/**
 * Hand-local direction toward the THUMB, for a right hand.
 *
 * This is the axis that makes the contract chiral, and it is the one the
 * hand contract was missing. Curl the fingers and the hole a fist leaves
 * runs across the knuckles from the little finger to the thumb — so the
 * thumb axis IS the grip channel, with a direction rather than merely a
 * line. Without that direction a solver can align a shaft with the
 * channel and still hand it to you upside down, which is exactly what
 * happened: geometrically valid, anatomically wrong.
 *
 * A left hand is a mirror of a right one through the body's plane, so its
 * thumb points the opposite way in the same local frame. Use
 * `handThumbAxis(slot)` rather than this constant directly.
 */
export const HAND_THUMB_AXIS: Vec3 = [-1, 0, 0];

/**
 * Where the thumb points on a given hand, in that hand's local frame.
 *
 * A single constant cannot serve both hands: the meshes are mirrored and
 * the rig is not, so hand-local +X reaches the thumb on one side and the
 * little finger on the other.
 */
export function handThumbAxis(slot: ArmSlot): Vec3 {
  const [x, y, z] = HAND_THUMB_AXIS;
  return slot === "frontLeft" || slot === "backLeft" ? [-x, y, z] : [x, y, z];
}

/**
 * What each hand is actually DOING, once the pose and the configuration
 * are reconciled.
 *
 * The division is: the POSE decides whether a hand gestures at all, and
 * the CUSTOMER decides which gesture it is.
 *
 * A preset that raises an abhaya arm is asserting that the hand blesses —
 * it is the whole identity of that pose — so a configuration still saying
 * that hand grips loses, and rightly: nobody shows a palm to a devotee
 * with a trident in the same fist. But if the customer has chosen a
 * DIFFERENT gesture for that hand, they have already agreed the hand
 * blesses and are only saying how. Overriding that put a varada palm on
 * an arm the editor had just swung into abhaya, and the two disagreed by
 * thirty-six degrees.
 *
 * Resolve once, here, and every consumer agrees: the hand solver, the
 * hand generator, and the resolver deciding whether a hand can hold
 * anything.
 */
export function resolveHands<T extends Record<string, { mudra: MudraId }>>(
  hands: T,
  preset: PosePreset | undefined,
): T {
  if (!preset?.gestures) return hands;
  const resolved = { ...hands } as Record<string, { mudra: MudraId }>;
  for (const [slot, mudra] of Object.entries(preset.gestures)) {
    const current = resolved[slot];
    if (!mudra || !current) continue;
    if (isGestureMudra(current.mudra)) continue; // already a gesture: theirs
    resolved[slot] = { ...current, mudra };
  }
  return resolved as T;
}

/** True when this mudra is a gesture — a statement, not a grip. */
export function isGestureMudra(mudra: MudraId): boolean {
  return GESTURE_MUDRAS[mudra] !== undefined;
}

export interface MudraArmPose {
  upper: Vec3;
  forearm: Vec3;
}

export interface MudraGesture {
  /**
   * Arm chain that carries the gesture, authored for a RIGHT arm and
   * mirrored for left arms. Applied when the user chooses the mudra; a
   * pose preset may embed the same values so its arms agree.
   */
  arm: MudraArmPose;
  /** World direction the fingers must point (character faces +Z). */
  fingers: Vec3;
  /** World direction the palm must face — toward the devotee. */
  palm: Vec3;
}

/**
 * The two blessing gestures, defined by what the devotee must SEE.
 *
 * abhaya ("fear not"): hand raised to shoulder/head height, elbow tucked
 * and bent, fingers up, palm turned to the devotee. Reaching that palm
 * orientation with a bent elbow needs forearm pronation — the same joint a
 * real arm uses — so the arm carries it and the engine solves the wrist.
 *
 * varada ("boon"): the same palm shown lower — elbow bent and relaxed at
 * the deity's side, forearm angled down and forward so the hand is
 * OFFERED in front of the lower chest rather than dangling by the hip.
 *
 * Grip mudras (hold/pinch/grip) declare no gesture: their arms belong to
 * the pose and their wrists to the held item.
 */
export const GESTURE_MUDRAS: Partial<Record<MudraId, MudraGesture>> = {
  abhaya: {
    arm: { upper: [-70 * D, -30 * D, -40 * D], forearm: [-120 * D, 68 * D, 0] },
    fingers: [0, 0.985, -0.174],
    palm: [0, 0.174, 0.985],
  },
  varada: {
    // The shoulder carries the arm FORWARD, which is what makes this an
    // offering rather than a hand hanging by a hip. Re-measured when the
    // wrist stopped being a ball joint: the hand's height comes from the
    // arm now, and the solver supplies only the axial twist, so an arm
    // authored to sit right on a slack wrist sat 4 cm too low on a real
    // one. These place the arm; they are not its twist.
    arm: { upper: [-30 * D, 24 * D, -46 * D], forearm: [-44 * D, -45 * D, 0] },
    fingers: [0, -0.94, 0.342],
    palm: [0, -0.342, 0.94],
  },
};

const mirror = (v: Vec3): Vec3 => [v[0], -v[1], -v[2]];

/** The three joints of one arm chain, proximal to distal. */
export function armChainJoints(slot: ArmSlot): readonly JointId[] {
  return [`arm.${slot}.upper`, `arm.${slot}.forearm`, `arm.${slot}.hand`];
}

/**
 * Joint rotations a gesture mudra imposes on its arm chain (mirrored for
 * left arms), or null for mudras without arm semantics. The wrist is
 * absent by design — it is solved from the gesture's palm/finger
 * directions once the arm is posed.
 */
export function mudraArmRotations(
  mudra: MudraId,
  slot: ArmSlot,
): Partial<Record<JointId, Vec3>> | null {
  const gesture = GESTURE_MUDRAS[mudra];
  if (!gesture) return null;
  const left = slot.endsWith("Left");
  return {
    [`arm.${slot}.upper`]: left ? mirror(gesture.arm.upper) : gesture.arm.upper,
    [`arm.${slot}.forearm`]: left ? mirror(gesture.arm.forearm) : gesture.arm.forearm,
  };
}

/** Preset helper: pose an arm with a gesture's own arm chain. */
const gestureArm = (mudra: MudraId, slot: ArmSlot): Partial<Record<JointId, Vec3>> =>
  mudraArmRotations(mudra, slot) ?? {};

export const POSE_PRESETS: readonly PosePreset[] = [
  {
    id: "standing",
    label: "Standing",
    description: "Samabhanga — even, frontal standing pose.",
    joints: {
      "arm.frontLeft.upper": [8 * D, 0, 58 * D],
      "arm.frontRight.upper": [8 * D, 0, -58 * D],
      "arm.frontLeft.forearm": [-28 * D, 0, 0],
      "arm.frontRight.forearm": [-28 * D, 0, 0],
      "arm.frontLeft.hand": [-12 * D, 0, 6 * D],
      "arm.frontRight.hand": [-12 * D, 0, -6 * D],
      "arm.backLeft.upper": [-18 * D, -10 * D, 48 * D],
      "arm.backRight.upper": [-18 * D, 10 * D, -48 * D],
      "arm.backLeft.forearm": [-52 * D, 0, 0],
      "arm.backRight.forearm": [-52 * D, 0, 0],
      "arm.backLeft.hand": [-20 * D, 0, 0],
      "arm.backRight.hand": [-20 * D, 0, 0],
      "leg.left.thigh": [0, 4 * D, 2 * D],
      "leg.right.thigh": [0, -4 * D, -2 * D],
    },
  },
  {
    id: "blessing",
    label: "Blessing",
    description: "Front right hand raised in abhaya, front left offering the modak.",
    joints: {
      spine: [0, 0, 2 * D],
      // Abhaya arm comes from the gesture itself, so the preset and the
      // mudra can never disagree; the engine solves the wrist.
      ...gestureArm("abhaya", "frontRight"),
      // (declared in `gestures` below — see PosePreset.gestures)
      // Offering: forearm forward, palm up under the modak
      "arm.frontLeft.upper": [18 * D, -6 * D, 42 * D],
      "arm.frontLeft.forearm": [-74 * D, 0, 0],
      "arm.frontLeft.hand": [-26 * D, 0, 8 * D],
      // Back arms raised holding attributes
      "arm.backLeft.upper": [-38 * D, -14 * D, 52 * D],
      "arm.backRight.upper": [-38 * D, 14 * D, -52 * D],
      "arm.backLeft.forearm": [-68 * D, 0, 0],
      "arm.backRight.forearm": [-68 * D, 0, 0],
      "arm.backLeft.hand": [-14 * D, 0, 0],
      "arm.backRight.hand": [-14 * D, 0, 0],
      "leg.left.thigh": [0, 5 * D, 2 * D],
      "leg.right.thigh": [0, -5 * D, -2 * D],
      head: [4 * D, 0, 0],
      // Gentle sideways sway only — positive X folds the trunk back into
      // the torso volume, so compensate the head's forward tilt.
      trunkMid: [-2 * D, 8 * D, 0],
      trunkTip: [-4 * D, 12 * D, 0],
    },
    gestures: { frontRight: "abhaya" },
  },
  {
    id: "meditation",
    label: "Meditation",
    description: "Levitating padmasana, front hands resting in dhyana.",
    // Levitation: legs fold into padmasana and the whole figure hovers
    // with clear daylight between the folded legs and the base.
    seated: true,
    joints: {
      // Padmasana solved by forward kinematics: knees swing wide and
      // forward, shins fold under, feet tuck inward with soles turned up.
      // Cross-legged, solved from the directions the limbs have to run in
      // rather than typed: the thighs carry the knees OUT to the sides and
      // a little below the hips, the shins cross back under the body, and
      // the knee stays the hinge it is. The figure then rests on whatever
      // of that is lowest — see settleOnSupport — which is the knees and
      // the ankles, with the seat just above them. Authored by eye, the
      // knees hung in the air with the shins crossing below them.
      "leg.left.thigh": [-126 * D, 36 * D, 63 * D],
      "leg.left.shin": [153 * D, 0, 0],
      "leg.left.foot": [30 * D, -12 * D, 0],
      "leg.right.thigh": [-126 * D, -36 * D, -66 * D],
      "leg.right.shin": [148 * D, 0, 0],
      "leg.right.foot": [30 * D, 12 * D, 0],
      "arm.frontLeft.upper": [24 * D, 0, 46 * D],
      "arm.frontLeft.forearm": [-84 * D, 26 * D, 0],
      "arm.frontLeft.hand": [-58 * D, 0, 0],
      "arm.frontRight.upper": [24 * D, 0, -46 * D],
      "arm.frontRight.forearm": [-84 * D, -26 * D, 0],
      "arm.frontRight.hand": [-58 * D, 0, 0],
      "arm.backLeft.upper": [-30 * D, -10 * D, 48 * D],
      "arm.backLeft.forearm": [-62 * D, 0, 0],
      "arm.backRight.upper": [-30 * D, 10 * D, -48 * D],
      "arm.backRight.forearm": [-62 * D, 0, 0],
      spine: [4 * D, 0, 0],
      head: [8 * D, 0, 0],
    },
  },
  {
    id: "royal",
    label: "Royal Ease",
    description: "Lalitasana — one leg folded, one pendant, easeful bearing.",
    seated: true,
    joints: {
      // Lalitasana: left leg folded flat, right leg pendant with a strong
      // knee bend so the hanging foot reaches down toward the base.
      "leg.left.thigh": [-126 * D, 53 * D, 67 * D],
      "leg.left.shin": [109 * D, 0, 0],
      "leg.left.foot": [54 * D, -17 * D, 0],
      "leg.right.thigh": [-55 * D, 11 * D, -10 * D],
      "leg.right.shin": [107 * D, 0, 0],
      "leg.right.foot": [-51 * D, 7 * D, 0],
      spine: [2 * D, 6 * D, 3 * D],
      head: [3 * D, -8 * D, -3 * D],
      "arm.frontLeft.upper": [14 * D, 0, 46 * D],
      "arm.frontLeft.forearm": [-48 * D, 0, 0],
      "arm.frontLeft.hand": [-20 * D, 0, 0],
      "arm.frontRight.upper": [-10 * D, 6 * D, -24 * D],
      "arm.frontRight.forearm": [-115 * D, 0, 0],
      "arm.frontRight.hand": [30 * D, 4 * D, -4 * D],
      "arm.backLeft.upper": [-30 * D, -12 * D, 48 * D],
      "arm.backLeft.forearm": [-58 * D, 0, 0],
      "arm.backRight.upper": [-30 * D, 12 * D, -48 * D],
      "arm.backRight.forearm": [-58 * D, 0, 0],
      trunkMid: [4 * D, -12 * D, 0],
      trunkTip: [6 * D, -18 * D, 0],
    },
  },
  {
    id: "dance",
    label: "Dancing",
    description: "Nritya Ganapati — weight on one leg, the other lifted.",
    // A lifted leg has to come out of its cloth; a dancer wears the wrap
    // short, which is what the iconography shows too.
    garment: "short",
    joints: {
      pelvis: [0, 12 * D, 7 * D],
      spine: [0, -9 * D, -5 * D],
      chest: [0, -4 * D, -2 * D],
      // Nritya: lifted left leg tucks its foot toward the standing leg,
      // right leg planted with a soft knee.
      "leg.left.thigh": [-82 * D, 27 * D, 19 * D],
      "leg.left.shin": [104 * D, 0, 0],
      "leg.left.foot": [-1 * D, -17 * D, 0],
      "leg.right.thigh": [-8 * D, -14 * D, -3 * D],
      "leg.right.shin": [15 * D, 0, 0],
      "leg.right.foot": [-11 * D, 15 * D, 0],
      "arm.frontLeft.upper": [-52 * D, -10 * D, 24 * D],
      "arm.frontLeft.forearm": [-88 * D, 0, 0],
      "arm.frontLeft.hand": [-20 * D, 0, 0],
      "arm.frontRight.upper": [12 * D, 0, -70 * D],
      "arm.frontRight.forearm": [-26 * D, 0, 0],
      "arm.frontRight.hand": [-10 * D, 0, -30 * D],
      "arm.backLeft.upper": [-46 * D, -12 * D, 62 * D],
      "arm.backLeft.forearm": [-64 * D, 0, 0],
      "arm.backRight.upper": [-46 * D, 12 * D, -62 * D],
      "arm.backRight.forearm": [-64 * D, 0, 0],
      head: [0, 10 * D, 5 * D],
      trunkMid: [4 * D, 26 * D, 0],
      trunkTip: [6 * D, 32 * D, 0],
    },
  },
] as const;

/**
 * Shiva pose presets. Ids are namespaced ("shiva.*") because preset ids are
 * persisted in configurations and resolved through one global registry —
 * two deities may both have a "standing" concept but each owns its values.
 * No trunk joints: these presets are authored for the humanoid skeleton.
 */
export const SHIVA_POSE_PRESETS: readonly PosePreset[] = [
  {
    id: "shiva.standing",
    label: "Standing",
    description: "Samabhanga — even, frontal standing pose.",
    joints: {
      // Arms nearer the body than Ganesha's broad stance — the athletic
      // silhouette reads statuesque, not spread.
      "arm.frontLeft.upper": [8 * D, 0, 30 * D],
      "arm.frontRight.upper": [8 * D, 0, -30 * D],
      "arm.frontLeft.forearm": [-24 * D, 0, 0],
      "arm.frontRight.forearm": [-24 * D, 0, 0],
      "arm.frontLeft.hand": [-12 * D, 0, 6 * D],
      "arm.frontRight.hand": [-12 * D, 0, -6 * D],
      "arm.backLeft.upper": [-18 * D, -10 * D, 38 * D],
      "arm.backRight.upper": [-18 * D, 10 * D, -38 * D],
      "arm.backLeft.forearm": [-52 * D, 0, 0],
      "arm.backRight.forearm": [-52 * D, 0, 0],
      "arm.backLeft.hand": [-20 * D, 0, 0],
      "arm.backRight.hand": [-20 * D, 0, 0],
      "leg.left.thigh": [0, 4 * D, 2 * D],
      "leg.right.thigh": [0, -4 * D, -2 * D],
    },
  },
  {
    id: "shiva.standingStaff",
    label: "Standing with Staff",
    description:
      "Samabhanga, planting the trishul. The staff arm rests rather than reaches: the shoulder barely leaves the side, the elbow keeps a soft bend, and the staff stands just clear of the hip because the garment ends above the knee — not because the arm was thrown out to make room for it.",
    joints: {
      "arm.frontLeft.upper": [8 * D, 0, 30 * D],
      // A held staff does not need the arm extended. A little forward at
      // the shoulder and a little out is all it takes for the shaft to
      // pass beside the hip; the elbow keeps the bend a resting arm has,
      // so the silhouette reads as a figure standing rather than posing.
      "arm.frontRight.upper": [-11 * D, 0, -21 * D],
      "arm.frontLeft.forearm": [-24 * D, 0, 0],
      "arm.frontRight.forearm": [-27 * D, 0, 0],
      "arm.frontLeft.hand": [-12 * D, 0, 6 * D],
      "arm.frontRight.hand": [-8 * D, 0, -5 * D],
      "arm.backLeft.upper": [-18 * D, -10 * D, 38 * D],
      "arm.backRight.upper": [-18 * D, 10 * D, -38 * D],
      "arm.backLeft.forearm": [-52 * D, 0, 0],
      "arm.backRight.forearm": [-52 * D, 0, 0],
      "arm.backLeft.hand": [-20 * D, 0, 0],
      "arm.backRight.hand": [-20 * D, 0, 0],
      "leg.left.thigh": [0, 4 * D, 2 * D],
      "leg.right.thigh": [0, -4 * D, -2 * D],
    },
  },
  {
    id: "shiva.meditation",
    label: "Meditation",
    description: "The great yogi in padmasana, front hands in dhyana.",
    seated: true,
    joints: {
      // Cross-legged, solved from the directions the limbs have to run in
      // rather than typed: the thighs carry the knees OUT to the sides and
      // a little below the hips, the shins cross back under the body, and
      // the knee stays the hinge it is. The figure then rests on whatever
      // of that is lowest — see settleOnSupport — which is the knees and
      // the ankles, with the seat just above them. Authored by eye, the
      // knees hung in the air with the shins crossing below them.
      "leg.left.thigh": [-126 * D, 36 * D, 63 * D],
      "leg.left.shin": [153 * D, 0, 0],
      "leg.left.foot": [30 * D, -12 * D, 0],
      "leg.right.thigh": [-126 * D, -36 * D, -66 * D],
      "leg.right.shin": [148 * D, 0, 0],
      "leg.right.foot": [30 * D, 12 * D, 0],
      "arm.frontLeft.upper": [24 * D, 0, 46 * D],
      "arm.frontLeft.forearm": [-84 * D, 26 * D, 0],
      "arm.frontLeft.hand": [-58 * D, 0, 0],
      "arm.frontRight.upper": [24 * D, 0, -46 * D],
      "arm.frontRight.forearm": [-84 * D, -26 * D, 0],
      "arm.frontRight.hand": [-58 * D, 0, 0],
      "arm.backLeft.upper": [-30 * D, -10 * D, 48 * D],
      "arm.backLeft.forearm": [-62 * D, 0, 0],
      "arm.backRight.upper": [-30 * D, 10 * D, -48 * D],
      "arm.backRight.forearm": [-62 * D, 0, 0],
      spine: [4 * D, 0, 0],
      head: [8 * D, 0, 0],
    },
  },
  {
    id: "shiva.blessing",
    label: "Blessing",
    description: "Front right hand raised in abhaya, front left lowered in varada.",
    joints: {
      spine: [0, 0, 2 * D],
      // Both gesture arms come from the gestures themselves.
      ...gestureArm("abhaya", "frontRight"),
      ...gestureArm("varada", "frontLeft"),
      // Back arms raised holding attributes
      "arm.backLeft.upper": [-38 * D, -14 * D, 52 * D],
      "arm.backRight.upper": [-38 * D, 14 * D, -52 * D],
      "arm.backLeft.forearm": [-68 * D, 0, 0],
      "arm.backRight.forearm": [-68 * D, 0, 0],
      "arm.backLeft.hand": [-14 * D, 0, 0],
      "arm.backRight.hand": [-14 * D, 0, 0],
      "leg.left.thigh": [0, 5 * D, 2 * D],
      "leg.right.thigh": [0, -5 * D, -2 * D],
      head: [3 * D, 0, 0],
    },
    gestures: { frontRight: "abhaya", frontLeft: "varada" },
  },
  {
    id: "shiva.tandava",
    label: "Dancing",
    garment: "short",
    description:
      "Nataraja-inspired tandava direction — lifted left leg, abhaya and gajahasta. A coherent supported pose, not a full production Nataraja.",
    joints: {
      pelvis: [0, 14 * D, 8 * D],
      spine: [0, -10 * D, -6 * D],
      chest: [0, -5 * D, -3 * D],
      // Lifted left leg sweeps across the body (bhujangatrasita direction).
      "leg.left.thigh": [-85 * D, 30 * D, 20 * D],
      "leg.left.shin": [100 * D, 0, 0],
      "leg.left.foot": [-5 * D, -15 * D, 0],
      // Standing right leg planted with a strong demi-plié bend.
      "leg.right.thigh": [-12 * D, -12 * D, -4 * D],
      "leg.right.shin": [22 * D, 0, 0],
      "leg.right.foot": [-14 * D, 14 * D, 0],
      // Front right: abhaya raised toward the devotee.
      "arm.frontRight.upper": [-10 * D, 6 * D, -24 * D],
      "arm.frontRight.forearm": [-116 * D, 0, 0],
      "arm.frontRight.hand": [30 * D, 4 * D, -4 * D],
      // Front left: gajahasta — arm swept across the chest toward the
      // lifted foot.
      "arm.frontLeft.upper": [32 * D, -22 * D, 12 * D],
      "arm.frontLeft.forearm": [-38 * D, 0, 0],
      "arm.frontLeft.hand": [-18 * D, 0, 0],
      // Back arms raised wide (damaru / attribute hands).
      "arm.backLeft.upper": [-58 * D, -18 * D, 66 * D],
      "arm.backRight.upper": [-58 * D, 18 * D, -66 * D],
      "arm.backLeft.forearm": [-50 * D, 0, 0],
      "arm.backRight.forearm": [-50 * D, 0, 0],
      "arm.backLeft.hand": [-15 * D, 0, 0],
      "arm.backRight.hand": [-15 * D, 0, 0],
      head: [0, 8 * D, 4 * D],
    },
  },
] as const;

/**
 * Global preset registry: every deity's presets, keyed by their persisted
 * id. Duplicate ids across sets are a data error caught at module load.
 */
/**
 * Vishnu — the preserver, standing.
 *
 * `references/ref_vishnu.png` is unambiguous about the arrangement, and
 * it is an arrangement rather than a pose: the FRONT pair works at hip
 * height — a mace resting on the ground under one hand, a lotus held out
 * in the other — while the BACK pair is raised beside the head with the
 * discus and the conch. Every preset here keeps that hierarchy, because
 * it is what makes four arms read as four arms rather than as two pairs
 * of the same arm.
 *
 * Which hand holds what is not decided here. The pose says where the
 * hands are; the resolver decides what each one can hold, from the
 * presentations the attributes declare — so a blessing hand gives up its
 * attribute the same way Shiva's does.
 */
export const VISHNU_POSE_PRESETS: readonly PosePreset[] = [
  {
    id: "vishnu.regal",
    label: "Regal",
    description: "Upright and symmetrical, all four attributes presented.",
    joints: {
      // Front pair: low and open, the mace hand at the hip. The right
      // arm hangs nearly straight so the wrist can bring the shaft fully
      // vertical — bent further, the upright solve ran out of joint.
      "arm.frontRight.upper": [6 * D, 0, -9 * D],
      "arm.frontRight.forearm": [-16 * D, -8 * D, 0],
      "arm.frontRight.hand": [-6 * D, 0, 0],
      "arm.frontLeft.upper": [4 * D, 0, 6 * D],
      "arm.frontLeft.forearm": [-26 * D, 14 * D, 0],
      "arm.frontLeft.hand": [-8 * D, 0, 0],
      // Back pair: raised BESIDE the head, hands at ear height and out
      // to the sides — the reference's silhouette. Elbows carried wide;
      // a first version bent them forward and the conch and discus ended
      // up floating in front of the chest.
      "arm.backRight.upper": [-14 * D, 10 * D, -74 * D],
      "arm.backRight.forearm": [-96 * D, -18 * D, 0],
      "arm.backRight.hand": [-10 * D, 0, 8 * D],
      "arm.backLeft.upper": [-14 * D, -10 * D, 74 * D],
      "arm.backLeft.forearm": [-96 * D, 18 * D, 0],
      "arm.backLeft.hand": [-10 * D, 0, -8 * D],
      // Feet together, as the reference stands. Thigh z-rotation splays
      // the shins sideways out of a dhoti cut to the resting legs — two
      // degrees is nineteen millimetres at the calf — so the stance
      // turns the feet with y alone.
      "leg.left.thigh": [0, 5 * D, 0],
      "leg.right.thigh": [0, -5 * D, 0],
    },
  },
  {
    id: "vishnu.blessing",
    label: "Blessing",
    description: "The front right hand raised in abhaya; the rest present their attributes.",
    joints: {
      spine: [0, 0, 2 * D],
      ...gestureArm("abhaya", "frontRight"),
      "arm.frontLeft.upper": [4 * D, 0, 8 * D],
      "arm.frontLeft.forearm": [-30 * D, 16 * D, 0],
      "arm.frontLeft.hand": [-8 * D, 0, 0],
      "arm.backRight.upper": [-14 * D, 10 * D, -72 * D],
      "arm.backRight.forearm": [-94 * D, -18 * D, 0],
      "arm.backRight.hand": [-10 * D, 0, 8 * D],
      "arm.backLeft.upper": [-14 * D, -10 * D, 72 * D],
      "arm.backLeft.forearm": [-94 * D, 18 * D, 0],
      "arm.backLeft.hand": [-10 * D, 0, -8 * D],
      "leg.left.thigh": [0, 5 * D, 0],
      "leg.right.thigh": [0, -5 * D, 0],
      head: [3 * D, 0, 0],
    },
  },
  {
    id: "vishnu.serene",
    label: "Serene",
    description: "Weight on one foot, the shoulders soft — the same attributes, at rest.",
    joints: {
      pelvis: [0, 0, -3 * D],
      spine: [0, 3 * D, 4 * D],
      chest: [0, -2 * D, 2 * D],
      "arm.frontRight.upper": [6 * D, 0, -10 * D],
      "arm.frontRight.forearm": [-18 * D, -12 * D, 0],
      "arm.frontRight.hand": [-6 * D, 0, 0],
      "arm.frontLeft.upper": [2 * D, 0, 10 * D],
      "arm.frontLeft.forearm": [-34 * D, 18 * D, 0],
      "arm.frontLeft.hand": [-10 * D, 0, 0],
      "arm.backRight.upper": [-12 * D, 12 * D, -70 * D],
      "arm.backRight.forearm": [-92 * D, -16 * D, 0],
      "arm.backRight.hand": [-8 * D, 0, 8 * D],
      "arm.backLeft.upper": [-16 * D, -10 * D, 76 * D],
      "arm.backLeft.forearm": [-98 * D, 20 * D, 0],
      "arm.backLeft.hand": [-12 * D, 0, -8 * D],
      "leg.left.thigh": [0, 6 * D, 1 * D],
      "leg.right.thigh": [-4 * D, -3 * D, 0],
      "leg.right.shin": [10 * D, 0, 0],
      head: [0, -4 * D, -2 * D],
    },
  },
] as const;

const ALL_POSE_PRESETS: readonly PosePreset[] = [
  ...POSE_PRESETS,
  ...SHIVA_POSE_PRESETS,
  ...VISHNU_POSE_PRESETS,
];

const presetMap = new Map<string, PosePreset>();
for (const preset of ALL_POSE_PRESETS) {
  if (presetMap.has(preset.id)) throw new Error(`Duplicate pose preset id: ${preset.id}`);
  presetMap.set(preset.id, preset);
}

export function getPosePreset(id: string): PosePreset | undefined {
  return presetMap.get(id);
}

/** How cloth is worn in this pose, with the default the pose implies. */
export function garmentFitOf(preset: PosePreset | undefined): GarmentFit {
  if (!preset) return "full";
  return preset.garment ?? (preset.seated ? "gathered" : "full");
}

/** Poses that place the character on the ground — derived from preset data. */
export const SEATED_POSE_IDS: readonly string[] = ALL_POSE_PRESETS.filter((p) => p.seated).map(
  (p) => p.id,
);
