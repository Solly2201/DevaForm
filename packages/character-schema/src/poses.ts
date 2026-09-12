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
      "leg.left.thigh": [0, 4 * D, 4 * D],
      "leg.right.thigh": [0, -4 * D, -4 * D],
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
      "leg.left.thigh": [0, 5 * D, 5 * D],
      "leg.right.thigh": [0, -5 * D, -5 * D],
      head: [4 * D, 0, 0],
      trunkMid: [20 * D, 8 * D, 0],
      trunkTip: [26 * D, 12 * D, 0],
    },
  },
  {
    id: "meditation",
    label: "Meditation",
    description: "Seated padmasana, front hands resting in dhyana.",
    rootOffset: [0, -0.36, 0],
    joints: {
      "leg.left.thigh": [-88 * D, 38 * D, 52 * D],
      "leg.left.shin": [128 * D, 0, 0],
      "leg.left.foot": [-24 * D, 12 * D, 0],
      "leg.right.thigh": [-88 * D, -38 * D, -52 * D],
      "leg.right.shin": [128 * D, 0, 0],
      "leg.right.foot": [-24 * D, -12 * D, 0],
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
    rootOffset: [0, -0.26, 0],
    joints: {
      "leg.left.thigh": [-84 * D, 30 * D, 42 * D],
      "leg.left.shin": [118 * D, 0, 0],
      "leg.left.foot": [-20 * D, 10 * D, 0],
      "leg.right.thigh": [-64 * D, -8 * D, -4 * D],
      "leg.right.shin": [56 * D, 0, 0],
      "leg.right.foot": [12 * D, 0, 0],
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
      trunkMid: [20 * D, -12 * D, 0],
      trunkTip: [28 * D, -18 * D, 0],
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
      "leg.left.thigh": [-48 * D, 18 * D, 28 * D],
      "leg.left.shin": [86 * D, 0, 0],
      "leg.left.foot": [30 * D, 0, 0],
      "leg.right.thigh": [0, 0, -6 * D],
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
      trunkMid: [14 * D, 26 * D, 0],
      trunkTip: [22 * D, 32 * D, 0],
    },
  },
] as const;

const presetMap = new Map(POSE_PRESETS.map((p) => [p.id, p]));

export function getPosePreset(id: string): PosePreset | undefined {
  return presetMap.get(id);
}

/** Poses that place the character on the ground (affects base/platform later). */
export const SEATED_POSE_IDS: readonly string[] = ["meditation", "royal"];
