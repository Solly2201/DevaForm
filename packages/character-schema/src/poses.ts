/**
 * Pose presets — named rest-relative joint rotations (euler XYZ, radians).
 * Presets only specify the joints they care about; everything else stays
 * at rest. User overrides in PoseConfiguration are applied on top.
 */
import type { JointId } from "./skeleton";
import type { Vec3 } from "./configuration";

export interface PosePreset {
  id: string;
  label: string;
  description: string;
  joints: Partial<Record<JointId, Vec3>>;
}

const D = Math.PI / 180;

export const POSE_PRESETS: readonly PosePreset[] = [
  {
    id: "standing",
    label: "Standing",
    description: "Neutral standing pose, arms relaxed.",
    joints: {
      "arm.frontLeft.upper": [10 * D, 0, 65 * D],
      "arm.frontRight.upper": [10 * D, 0, -65 * D],
      "arm.backLeft.upper": [-15 * D, 0, 50 * D],
      "arm.backRight.upper": [-15 * D, 0, -50 * D],
      "arm.frontLeft.forearm": [-20 * D, 0, 0],
      "arm.frontRight.forearm": [-20 * D, 0, 0],
      "arm.backLeft.forearm": [-30 * D, 0, 0],
      "arm.backRight.forearm": [-30 * D, 0, 0],
    },
  },
  {
    id: "blessing",
    label: "Blessing",
    description: "Front right hand raised in abhaya mudra, front left offering.",
    joints: {
      "arm.frontRight.upper": [-30 * D, 0, -30 * D],
      "arm.frontRight.forearm": [-100 * D, 0, 0],
      "arm.frontRight.hand": [0, 0, 10 * D],
      "arm.frontLeft.upper": [25 * D, 0, 40 * D],
      "arm.frontLeft.forearm": [-70 * D, 0, 0],
      "arm.frontLeft.hand": [-30 * D, 0, 0],
      "arm.backLeft.upper": [-20 * D, 0, 55 * D],
      "arm.backRight.upper": [-20 * D, 0, -55 * D],
      "arm.backLeft.forearm": [-45 * D, 0, 0],
      "arm.backRight.forearm": [-45 * D, 0, 0],
      trunkMid: [25 * D, 20 * D, 0],
      trunkTip: [35 * D, 25 * D, 0],
    },
  },
  {
    id: "meditation",
    label: "Meditation",
    description: "Seated cross-legged, front hands resting in dhyana.",
    joints: {
      pelvis: [0, 0, 0],
      "leg.left.thigh": [-85 * D, 35 * D, 55 * D],
      "leg.left.shin": [120 * D, 0, 0],
      "leg.right.thigh": [-85 * D, -35 * D, -55 * D],
      "leg.right.shin": [120 * D, 0, 0],
      "arm.frontLeft.upper": [20 * D, 0, 55 * D],
      "arm.frontLeft.forearm": [-80 * D, 30 * D, 0],
      "arm.frontRight.upper": [20 * D, 0, -55 * D],
      "arm.frontRight.forearm": [-80 * D, -30 * D, 0],
      "arm.backLeft.upper": [-25 * D, 0, 45 * D],
      "arm.backLeft.forearm": [-60 * D, 0, 0],
      "arm.backRight.upper": [-25 * D, 0, -45 * D],
      "arm.backRight.forearm": [-60 * D, 0, 0],
      head: [8 * D, 0, 0],
    },
  },
  {
    id: "royal",
    label: "Royal Ease",
    description: "Lalitasana-inspired seat, one leg pendant, confident bearing.",
    joints: {
      "leg.left.thigh": [-80 * D, 25 * D, 40 * D],
      "leg.left.shin": [110 * D, 0, 0],
      "leg.right.thigh": [-70 * D, -10 * D, 0],
      "leg.right.shin": [60 * D, 0, 0],
      spine: [0, 8 * D, 3 * D],
      head: [0, -10 * D, -4 * D],
      "arm.frontLeft.upper": [15 * D, 0, 50 * D],
      "arm.frontLeft.forearm": [-50 * D, 0, 0],
      "arm.frontRight.upper": [-25 * D, 0, -35 * D],
      "arm.frontRight.forearm": [-95 * D, 0, 0],
      "arm.backLeft.upper": [-20 * D, 0, 50 * D],
      "arm.backLeft.forearm": [-50 * D, 0, 0],
      "arm.backRight.upper": [-20 * D, 0, -50 * D],
      "arm.backRight.forearm": [-50 * D, 0, 0],
      trunkMid: [20 * D, -15 * D, 0],
      trunkTip: [30 * D, -20 * D, 0],
    },
  },
  {
    id: "dance",
    label: "Dancing",
    description: "Nritya Ganapati inspired dance pose.",
    joints: {
      pelvis: [0, 15 * D, 8 * D],
      spine: [0, -10 * D, -5 * D],
      "leg.left.thigh": [-45 * D, 20 * D, 30 * D],
      "leg.left.shin": [80 * D, 0, 0],
      "leg.right.thigh": [0, 0, -5 * D],
      "arm.frontLeft.upper": [-60 * D, 0, 20 * D],
      "arm.frontLeft.forearm": [-90 * D, 0, 0],
      "arm.frontRight.upper": [15 * D, 0, -75 * D],
      "arm.frontRight.forearm": [-30 * D, 0, 0],
      "arm.backLeft.upper": [-40 * D, 0, 70 * D],
      "arm.backLeft.forearm": [-70 * D, 0, 0],
      "arm.backRight.upper": [-40 * D, 0, -70 * D],
      "arm.backRight.forearm": [-70 * D, 0, 0],
      head: [0, 12 * D, 6 * D],
      trunkMid: [15 * D, 30 * D, 0],
      trunkTip: [25 * D, 35 * D, 0],
    },
  },
] as const;

const presetMap = new Map(POSE_PRESETS.map((p) => [p.id, p]));

export function getPosePreset(id: string): PosePreset | undefined {
  return presetMap.get(id);
}

/** Poses that place the character on the ground (affects base/platform later). */
export const SEATED_POSE_IDS: readonly string[] = ["meditation", "royal"];
