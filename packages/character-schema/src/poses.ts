/**
 * Pose presets — named rest-relative joint rotations (euler XYZ, radians).
 * Presets only specify the joints they care about; everything else stays
 * at rest. User overrides in PoseConfiguration are applied on top.
 *
 * Hand joints matter: the hand mesh grows fingers along -Y with the palm
 * facing +Z, so wrist rotations orient mudras (abhaya palm forward, varada
 * palm down, held items upright).
 */
import type { JointId } from "./skeleton";
import type { Vec3 } from "./configuration";

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
}

const D = Math.PI / 180;

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
      // Abhaya: raise the forearm, palm turned to face the devotee
      "arm.frontRight.upper": [-18 * D, 8 * D, -38 * D],
      "arm.frontRight.forearm": [-96 * D, 0, 0],
      "arm.frontRight.hand": [42 * D, 4 * D, -4 * D],
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
      "arm.frontRight.upper": [-20 * D, 8 * D, -34 * D],
      "arm.frontRight.forearm": [-92 * D, 0, 0],
      "arm.frontRight.hand": [40 * D, 4 * D, -4 * D],
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

const presetMap = new Map(POSE_PRESETS.map((p) => [p.id, p]));

export function getPosePreset(id: string): PosePreset | undefined {
  return presetMap.get(id);
}

/** Poses that place the character on the ground (affects base/platform later). */
export const SEATED_POSE_IDS: readonly string[] = ["meditation", "royal"];
