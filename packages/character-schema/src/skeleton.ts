/**
 * Canonical skeleton definition shared by the editor engine, pose system,
 * asset pipeline and (later) the print/bake pipeline.
 *
 * Joint ids are stable, dot-namespaced strings. Production GLB rigs must use
 * bone names that map 1:1 to these ids (see docs/asset-specification.md).
 *
 * Units: meters. Coordinate system: Y-up, character faces +Z.
 * The canonical character is ~1.0m tall (statues are scaled at print time).
 */

export type ArmSlot = "frontLeft" | "frontRight" | "backLeft" | "backRight";
export type LegSlot = "left" | "right";

export const ARM_SLOTS: readonly ArmSlot[] = [
  "frontLeft",
  "frontRight",
  "backLeft",
  "backRight",
] as const;

export const LEG_SLOTS: readonly LegSlot[] = ["left", "right"] as const;

export type JointId =
  | "root"
  | "pelvis"
  | "spine"
  | "chest"
  | "neck"
  | "head"
  | "trunkBase"
  | "trunkMid"
  | "trunkTip"
  | `arm.${ArmSlot}.upper`
  | `arm.${ArmSlot}.forearm`
  | `arm.${ArmSlot}.hand`
  | `leg.${LegSlot}.thigh`
  | `leg.${LegSlot}.shin`
  | `leg.${LegSlot}.foot`;

export interface JointDefinition {
  id: JointId;
  parent: JointId | null;
  /** Rest-pose position of the joint, local to its parent joint. */
  position: readonly [number, number, number];
  /**
   * Per-axis rotation limits in radians, [min, max] for x/y/z.
   * Enforced by the UI and validated by the schema; the engine clamps.
   */
  limits?: {
    x?: readonly [number, number];
    y?: readonly [number, number];
    z?: readonly [number, number];
  };
  /** Human-readable label for pose UIs. */
  label: string;
}

const PI = Math.PI;
const armJoints = (slot: ArmSlot, side: "left" | "right", row: "front" | "back"): JointDefinition[] => {
  const sideSign = side === "left" ? 1 : -1;
  const z = row === "front" ? 0.045 : -0.045;
  const label = `${row === "front" ? "Front" : "Back"} ${side === "left" ? "Left" : "Right"}`;
  return [
    {
      id: `arm.${slot}.upper`,
      parent: "chest",
      position: [sideSign * 0.175, 0.11, z],
      limits: { x: [-PI, PI * 0.6], y: [-PI * 0.5, PI * 0.5], z: [-PI * 0.7, PI * 0.7] },
      label: `${label} Upper Arm`,
    },
    {
      id: `arm.${slot}.forearm`,
      parent: `arm.${slot}.upper`,
      position: [sideSign * 0.02, -0.16, 0],
      limits: { x: [-PI * 0.85, 0.1], y: [-PI * 0.4, PI * 0.4], z: [-0.3, 0.3] },
      label: `${label} Forearm`,
    },
    {
      id: `arm.${slot}.hand`,
      parent: `arm.${slot}.forearm`,
      position: [0, -0.14, 0],
      limits: { x: [-PI * 0.4, PI * 0.4], y: [-PI * 0.5, PI * 0.5], z: [-PI * 0.4, PI * 0.4] },
      label: `${label} Hand`,
    },
  ];
};

const legJoints = (slot: LegSlot): JointDefinition[] => {
  const sideSign = slot === "left" ? 1 : -1;
  const label = slot === "left" ? "Left" : "Right";
  return [
    {
      id: `leg.${slot}.thigh`,
      parent: "pelvis",
      position: [sideSign * 0.09, -0.05, 0],
      limits: { x: [-PI * 0.7, PI * 0.7], y: [-PI * 0.3, PI * 0.3], z: [-PI * 0.5, PI * 0.5] },
      label: `${label} Thigh`,
    },
    {
      id: `leg.${slot}.shin`,
      parent: `leg.${slot}.thigh`,
      position: [0, -0.2, 0],
      limits: { x: [0, PI * 0.85], y: [-0.2, 0.2], z: [-0.2, 0.2] },
      label: `${label} Shin`,
    },
    {
      id: `leg.${slot}.foot`,
      parent: `leg.${slot}.shin`,
      position: [0, -0.19, 0],
      limits: { x: [-PI * 0.3, PI * 0.3], y: [-0.3, 0.3], z: [-0.2, 0.2] },
      label: `${label} Foot`,
    },
  ];
};

/**
 * Canonical Ganesha-class skeleton. Order matters: parents precede children.
 * Future joints (fingers, facial controls, spine chains) extend this list —
 * unknown joints in an old config are ignored; missing joints default to rest.
 */
export const SKELETON: readonly JointDefinition[] = [
  { id: "root", parent: null, position: [0, 0, 0], label: "Root" },
  { id: "pelvis", parent: "root", position: [0, 0.52, 0], limits: { x: [-PI * 0.3, PI * 0.3], y: [-PI * 0.4, PI * 0.4], z: [-PI * 0.25, PI * 0.25] }, label: "Pelvis" },
  { id: "spine", parent: "pelvis", position: [0, 0.1, 0], limits: { x: [-0.6, 0.6], y: [-0.8, 0.8], z: [-0.5, 0.5] }, label: "Spine" },
  { id: "chest", parent: "spine", position: [0, 0.16, 0], limits: { x: [-0.5, 0.5], y: [-0.7, 0.7], z: [-0.4, 0.4] }, label: "Chest" },
  { id: "neck", parent: "chest", position: [0, 0.16, 0], limits: { x: [-0.6, 0.6], y: [-1.0, 1.0], z: [-0.5, 0.5] }, label: "Neck" },
  // Head sits high enough that the chin clears the shoulder line — murti
  // composition needs daylight between muzzle and chest for the trunk.
  { id: "head", parent: "neck", position: [0, 0.115, 0], limits: { x: [-0.7, 0.7], y: [-1.2, 1.2], z: [-0.6, 0.6] }, label: "Head" },
  // Trunk chain sweeps forward (+z) as it descends so the trunk drapes
  // OVER the chin/shawl/belly front surfaces instead of hanging inside
  // the torso volume.
  { id: "trunkBase", parent: "head", position: [0, -0.01, 0.095], limits: { x: [-0.8, 0.8], y: [-0.8, 0.8], z: [-0.8, 0.8] }, label: "Trunk Base" },
  { id: "trunkMid", parent: "trunkBase", position: [0, -0.09, 0.05], limits: { x: [-1.2, 1.2], y: [-1.0, 1.0], z: [-1.0, 1.0] }, label: "Trunk Middle" },
  { id: "trunkTip", parent: "trunkMid", position: [0, -0.085, 0.04], limits: { x: [-1.4, 1.4], y: [-1.2, 1.2], z: [-1.2, 1.2] }, label: "Trunk Tip" },
  ...armJoints("frontLeft", "left", "front"),
  ...armJoints("frontRight", "right", "front"),
  ...armJoints("backLeft", "left", "back"),
  ...armJoints("backRight", "right", "back"),
  ...legJoints("left"),
  ...legJoints("right"),
] as const;

export const JOINT_IDS: readonly JointId[] = SKELETON.map((j) => j.id);

const jointMap = new Map<JointId, JointDefinition>(SKELETON.map((j) => [j.id, j]));

export function getJoint(id: JointId): JointDefinition {
  const joint = jointMap.get(id);
  if (!joint) throw new Error(`Unknown joint id: ${id}`);
  return joint;
}

export function isJointId(value: string): value is JointId {
  return jointMap.has(value as JointId);
}
