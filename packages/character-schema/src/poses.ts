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

export interface PosePreset {
  id: string;
  label: string;
  description: string;
  joints: Partial<Record<JointId, Vec3>>;
  /**
   * Root translation applied with the pose — seated poses lower the
   * character onto the base instead of folding the legs in mid-air.
   */
  rootOffset?: Vec3;
  /**
   * Seated poses place the figure on the ground/base: clothing generators
   * swap to lap drapes and the base keeps its own anchoring. A property of
   * the pose itself, so every deity's presets carry their own truth.
   */
  seated?: boolean;
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
    arm: { upper: [-6 * D, 24 * D, -46 * D], forearm: [-44 * D, -45 * D, 0] },
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
  },
  {
    id: "meditation",
    label: "Meditation",
    description: "Levitating padmasana, front hands resting in dhyana.",
    // Levitation: legs fold into padmasana and the whole figure hovers
    // with clear daylight between the folded legs and the base.
    rootOffset: [0, -0.2, 0],
    seated: true,
    joints: {
      // Padmasana solved by forward kinematics: knees swing wide and
      // forward, shins fold under, feet tuck inward with soles turned up.
      "leg.left.thigh": [-126 * D, 54 * D, 64 * D],
      "leg.left.shin": [106 * D, 0, 0],
      "leg.left.foot": [54 * D, -17 * D, 0],
      "leg.right.thigh": [-126 * D, -54 * D, -69 * D],
      "leg.right.shin": [110 * D, 0, 0],
      "leg.right.foot": [54 * D, 17 * D, 0],
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
    rootOffset: [0, -0.18, 0],
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
    id: "shiva.meditation",
    label: "Meditation",
    description: "The great yogi in padmasana, front hands in dhyana.",
    rootOffset: [0, -0.2, 0],
    seated: true,
    joints: {
      "leg.left.thigh": [-126 * D, 54 * D, 64 * D],
      "leg.left.shin": [106 * D, 0, 0],
      "leg.left.foot": [54 * D, -17 * D, 0],
      "leg.right.thigh": [-126 * D, -54 * D, -69 * D],
      "leg.right.shin": [110 * D, 0, 0],
      "leg.right.foot": [54 * D, 17 * D, 0],
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
  },
  {
    id: "shiva.tandava",
    label: "Dancing",
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
const ALL_POSE_PRESETS: readonly PosePreset[] = [...POSE_PRESETS, ...SHIVA_POSE_PRESETS];

const presetMap = new Map<string, PosePreset>();
for (const preset of ALL_POSE_PRESETS) {
  if (presetMap.has(preset.id)) throw new Error(`Duplicate pose preset id: ${preset.id}`);
  presetMap.set(preset.id, preset);
}

export function getPosePreset(id: string): PosePreset | undefined {
  return presetMap.get(id);
}

/** Poses that place the character on the ground — derived from preset data. */
export const SEATED_POSE_IDS: readonly string[] = ALL_POSE_PRESETS.filter((p) => p.seated).map(
  (p) => p.id,
);
