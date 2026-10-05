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
import { ARM_SLOTS, type ArmSlot, type JointId } from "./skeleton";
import type { CharacterConfiguration, MudraId, Vec3 } from "./configuration";

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
 * The hands a pose ARRIVES with.
 *
 * A pose that raises a blessing arm is asserting that the hand blesses —
 * it is the whole identity of that pose — so choosing it puts that
 * gesture in the hand, and the arm and the palm agree from the first
 * frame. A hand already showing a gesture keeps the one it has: somebody
 * who chose varada and then chose the blessing pose gets their varada on
 * the raised arm, which is what they asked for twice.
 *
 * APPLIED WHEN THE POSE IS CHOSEN, and never again. It used to run on
 * every resolution, over the configuration, and that is a different
 * statement entirely: it meant the pose did not suggest a gesture, it
 * ENFORCED one, forever. On Ganesha — whose default pose is the blessing
 * — the front right hand offered six mudras in the panel and honoured
 * two. Choosing Open, Cradle, Stem Hold or Weapon Grip set the
 * configuration, lit the button, and changed nothing on the statue,
 * because the resolver put abhaya back before anything was built. Four
 * dead controls, indistinguishable from a bug in the hand solver.
 *
 * A default belongs at the moment of choosing. After that the
 * configuration is what the customer means, and the resolver's job is to
 * build it rather than to argue with it.
 */
export function applyPoseGestures<T extends Record<string, { mudra: MudraId }>>(
  hands: T,
  preset: PosePreset | undefined,
): T {
  if (!preset?.gestures) return hands;
  const arrived = { ...hands } as Record<string, { mudra: MudraId }>;
  for (const [slot, mudra] of Object.entries(preset.gestures)) {
    const current = arrived[slot];
    if (!mudra || !current) continue;
    if (isGestureMudra(current.mudra)) continue; // already gesturing: theirs
    arrived[slot] = { ...current, mudra };
  }
  return arrived as T;
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
 * abhaya ("fear not"): hand raised to shoulder height, palm turned to the
 * devotee, fingers up — and the ELBOW HANGING. That last part is the one
 * that was wrong. The upper arm used to be swung seventy degrees forward,
 * which puts the elbow out ahead of the chest and folds the forearm back
 * toward the shoulder: from the front the arm reads as bending the wrong
 * way, and the hand ends up at the chest rather than beside the face.
 * ref3's mudra panel is explicit — "elbow bent naturally" — and a natural
 * elbow is a hanging one.
 *
 * varada ("boon"): the same palm shown LOW. ref3: "hand lower than
 * abhaya, palm facing outward and downward, arm angled forward". It was
 * neither lower nor angled: forty-four degrees of elbow bend on an arm
 * already swung out left it nearly straight, with the hand twenty-three
 * centimetres in front of the shoulder — an arm held out stiffly to the
 * side, which is what the Studio showed on all three deities.
 *
 * MEASURED against the constraints correction.test already states, which
 * are rig-relative and therefore true of any body: abhaya's wrist above
 * the shoulder with the elbow hanging a hand's breadth below it and bent
 * between sixty and a hundred and forty-five degrees; varada's below the
 * shoulder but above the middle of the torso, carried forward and clear
 * of it. Both reach their required palm with ZERO residual, which is the
 * other half of the claim — an arm that needs an impossible wrist is an
 * arm the solver will revert, leaving a gesture that is not a gesture.
 *
 * Grip mudras (hold/pinch/grip) declare no gesture: their arms belong to
 * the pose and their wrists to the held item.
 */
export const GESTURE_MUDRAS: Partial<Record<MudraId, MudraGesture>> = {
  abhaya: {
    arm: { upper: [-40 * D, -10 * D, -38 * D], forearm: [-96 * D, 40 * D, 0] },
    fingers: [0, 0.985, -0.174],
    palm: [0, 0.174, 0.985],
  },
  varada: {
    // The shoulder carries the arm a little forward, which is what makes
    // this an offering rather than a hand hanging by a hip — but only a
    // little. The hand's height comes from the arm; the solver supplies
    // the axial twist and nothing else.
    arm: { upper: [-32 * D, 22 * D, -46 * D], forearm: [-36 * D, -34 * D, 0] },
    fingers: [0, -0.94, 0.342],
    palm: [0, -0.342, 0.94],
  },
};

/**
 * A configuration WEARING a pose — the whole of what choosing one does.
 *
 * Three things happen together and they have to keep happening together,
 * so they live here rather than in the editor: the preset is recorded,
 * its gestures arrive in the hands, and the hands that gesture seed the
 * arm rotations that carry them. Skip the last and a pose puts a blessing
 * palm somewhere no palm can be shown from; skip the middle and the pose
 * has no opinion at all.
 *
 * Joint overrides are CLEARED, because they were relative tweaks on the
 * pose being left and mean something else on the one arriving — except
 * the gesture arms, which are not tweaks but the gesture itself.
 *
 * Shared with the tests deliberately. A test that sets `pose.preset` by
 * hand is describing a configuration the product cannot produce, and the
 * three failures that appeared when the resolver stopped overriding hands
 * were all of exactly that kind.
 */
export function posedWith(
  config: CharacterConfiguration,
  presetId: string | null,
): CharacterConfiguration {
  const hands = applyPoseGestures(config.hands, presetId ? getPosePreset(presetId) : undefined);
  const jointOverrides: Partial<Record<JointId, Vec3>> = {};
  for (const slot of ARM_SLOTS) {
    Object.assign(jointOverrides, mudraArmRotations(hands[slot]?.mudra ?? "open", slot) ?? {});
  }
  return { ...config, hands, pose: { preset: presetId, jointOverrides } };
}

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
      // The lower arms hang. Fifty-eight degrees of abduction on an arm
      // whose elbow is barely bent is an arm held out sideways, which is
      // what the Studio showed: a standing Ganesha presenting an empty
      // upturned palm at the end of a straight arm. ref2's standing panel
      // has the lower pair close to the body with the hands at the hips.
      "arm.frontLeft.upper": [-6 * D, 0, 26 * D],
      "arm.frontRight.upper": [-6 * D, 0, -26 * D],
      "arm.frontLeft.forearm": [-46 * D, 0, 0],
      "arm.frontRight.forearm": [-46 * D, 0, 0],
      "arm.frontLeft.hand": [-12 * D, 0, 6 * D],
      "arm.frontRight.hand": [-12 * D, 0, -6 * D],
      // Raised, and bent, for the same reason the blessing's are: with the
      // lower arms brought in to the body the upper pair has to carry the
      // attributes clear of them rather than past them.
      "arm.backLeft.upper": [-34 * D, -14 * D, 48 * D],
      "arm.backRight.upper": [-34 * D, 14 * D, -48 * D],
      "arm.backLeft.forearm": [-72 * D, 0, 0],
      "arm.backRight.forearm": [-72 * D, 0, 0],
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
      /**
       * The back arms REACH OUT, and that is the whole of what stops the
       * parashu standing in the abhaya palm.
       *
       * They used to swing forward and inboard: the back-right hand came
       * to rest fifty millimetres from the front-right hand in the
       * horizontal plane, and a shaft presented upright out of one of
       * them has nowhere to go but through the other. Measured, the axe
       * cleared the blessing hand by 2.3 mm — which is to say it did not.
       * No grip frame, hand solver or item offset could have fixed that;
       * the two hands were in the same place, and the shaft was simply
       * telling the truth about where it was being held.
       *
       * Most of that was the BLESSING arm's doing, and it was fixed where
       * it belonged: abhaya used to swing the whole upper arm seventy
       * degrees forward, which put the hand in front of the chest and
       * squarely in the axe's line. With the elbow hanging where a real
       * one does (see GESTURE_MUDRAS) the two hands stopped competing for
       * the same place, and the upper pair needed only a small adjustment
       * — a touch less abduction and a deeper elbow, which lifts the axe
       * clear and brings the silhouette IN rather than out.
       *
       * An earlier attempt bought the same clearance by splaying both
       * back arms into a wingspan. It measured clear and looked wrong:
       * the axe at the end of an outstretched arm rather than raised
       * beside the shoulder. Clearance is necessary and not sufficient.
       */
      "arm.backLeft.upper": [-34 * D, -14 * D, 48 * D],
      "arm.backRight.upper": [-34 * D, 14 * D, -48 * D],
      "arm.backLeft.forearm": [-72 * D, 0, 0],
      "arm.backRight.forearm": [-72 * D, 0, 0],
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
      trunkMid: [-12 * D, 0, 0],
      trunkTip: [-19 * D, 0, 0],
      "arm.frontLeft.upper": [24 * D, 0, 46 * D],
      "arm.frontLeft.forearm": [-84 * D, 26 * D, 0],
      "arm.frontLeft.hand": [-58 * D, 0, 0],
      "arm.frontRight.upper": [24 * D, 0, -46 * D],
      "arm.frontRight.forearm": [-84 * D, -26 * D, 0],
      "arm.frontRight.hand": [-58 * D, 0, 0],
      // Out and clear, for the same reason as the blessing's: a seated
      // figure's front hands rest low and close, and the attributes above
      // them had a seven-millimetre margin. See the blessing preset.
      "arm.backLeft.upper": [-30 * D, -10 * D, 60 * D],
      "arm.backLeft.forearm": [-62 * D, 0, 0],
      "arm.backRight.upper": [-30 * D, 10 * D, -60 * D],
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
      trunkMid: [-4 * D, -12 * D, 0],
      trunkTip: [-6 * D, -18 * D, 0],
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
      // A dancer's upper arms are the widest of all four poses, and they
      // were the ones nearest to closing on the lotus stem.
      "arm.backLeft.upper": [-46 * D, 4 * D, 66 * D],
      "arm.backLeft.forearm": [-64 * D, 0, 0],
      "arm.backRight.upper": [-46 * D, -4 * D, -66 * D],
      "arm.backRight.forearm": [-64 * D, 0, 0],
      head: [0, 10 * D, 5 * D],
      trunkMid: [-4 * D, 26 * D, 0],
      trunkTip: [-6 * D, 32 * D, 0],
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
      // Out and clear, for the same reason as the blessing's: a seated
      // figure's front hands rest low and close, and the attributes above
      // them had a seven-millimetre margin. See the blessing preset.
      "arm.backLeft.upper": [-30 * D, -10 * D, 60 * D],
      "arm.backLeft.forearm": [-62 * D, 0, 0],
      "arm.backRight.upper": [-30 * D, 10 * D, -60 * D],
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
      /**
       * The back arms REACH OUT, and that is the whole of what stops the
       * parashu standing in the abhaya palm.
       *
       * They used to swing forward and inboard: the back-right hand came
       * to rest fifty millimetres from the front-right hand in the
       * horizontal plane, and a shaft presented upright out of one of
       * them has nowhere to go but through the other. Measured, the axe
       * cleared the blessing hand by 2.3 mm — which is to say it did not.
       * No grip frame, hand solver or item offset could have fixed that;
       * the two hands were in the same place, and the shaft was simply
       * telling the truth about where it was being held.
       *
       * Most of that was the BLESSING arm's doing, and it was fixed where
       * it belonged: abhaya used to swing the whole upper arm seventy
       * degrees forward, which put the hand in front of the chest and
       * squarely in the axe's line. With the elbow hanging where a real
       * one does (see GESTURE_MUDRAS) the two hands stopped competing for
       * the same place, and the upper pair needed only a small adjustment
       * — a touch less abduction and a deeper elbow, which lifts the axe
       * clear and brings the silhouette IN rather than out.
       *
       * An earlier attempt bought the same clearance by splaying both
       * back arms into a wingspan. It measured clear and looked wrong:
       * the axe at the end of an outstretched arm rather than raised
       * beside the shoulder. Clearance is necessary and not sufficient.
       */
      "arm.backLeft.upper": [-34 * D, -14 * D, 48 * D],
      "arm.backRight.upper": [-34 * D, 14 * D, -48 * D],
      "arm.backLeft.forearm": [-72 * D, 0, 0],
      "arm.backRight.forearm": [-72 * D, 0, 0],
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
      // Front pair: low and open, the mace hand at the hip.
      //
      // A little more abduction and a little more elbow than it had. The
      // arm was authored "nearly straight so the wrist can bring the
      // shaft fully vertical", and it did not: the mace stood thirteen
      // degrees off upright, which is past the solver's own tolerance, so
      // every customer who opened Vishnu got a rig warning about it.
      // Measured, these reach it exactly — nought point nought degrees —
      // and move the wrist by two centimetres doing it.
      "arm.frontRight.upper": [6 * D, 0, -16 * D],
      "arm.frontRight.forearm": [-26 * D, -8 * D, 0],
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
