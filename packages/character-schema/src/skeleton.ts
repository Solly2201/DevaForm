/**
 * Canonical skeleton definitions shared by the editor engine, pose system,
 * asset pipeline and (later) the print/bake pipeline.
 *
 * Joint ids are stable, dot-namespaced strings. Production GLB rigs must use
 * bone names that map 1:1 to these ids (see docs/asset-specification.md).
 *
 * Units: meters. Coordinate system: Y-up, character faces +Z.
 * The canonical character is ~1.0m tall (statues are scaled at print time).
 *
 * Skeletons are per-deity data: every deity references a SkeletonDefinition
 * (see skeletons.ts) built from the shared humanoid joint chain plus any
 * deity-specific extensions (Ganesha adds the trunk chain; iconography
 * with more than one pair of arms adds the back arms). The engine only
 * ever builds the joints of the active deity's skeleton — joint VALIDATION
 * accepts the union of all skeletons so a configuration schema stays
 * deity-agnostic.
 *
 * An extension is anatomy a body either HAS or does not. A skeleton that
 * does not declare the back arms has no back arm joints and no back hand
 * sockets, so nothing can be hung off a limb the body does not own. That
 * matters: before the back arms were an extension they were built for
 * every body, and a mesh body that had measured only its front pair kept
 * the stylised figure's offsets for the back one — seven centimetres out,
 * with no geometry on it and no warning raised.
 */

export type ArmSlot = "frontLeft" | "frontRight" | "backLeft" | "backRight";
export type LegSlot = "left" | "right";

/**
 * The five digits, named rather than numbered.
 *
 * A hand is chiral and anatomically structured, and until these existed
 * the rig said so only through an axis constant: fingers along -Y, palm
 * along +Z, thumb along ±X depending which hand it was. That is enough to
 * point a hand at something and not nearly enough to close it around
 * something — which is why a fist could only ever be one fixed shape,
 * and met a drum's flare as readily as a staff's shaft.
 */
export type FingerId = "thumb" | "index" | "middle" | "ring" | "little";
export type FingerSegment = "01" | "02" | "03";

export const FINGER_IDS: readonly FingerId[] = [
  "thumb",
  "index",
  "middle",
  "ring",
  "little",
] as const;

export const FINGER_SEGMENTS: readonly FingerSegment[] = ["01", "02", "03"] as const;

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
  | `arm.${ArmSlot}.hand.${FingerId}.${FingerSegment}`
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
  /**
   * How far this bone may rotate about its OWN length, in radians.
   *
   * Distinct from `limits`, which bounds the Euler components a pose may
   * write. Euler y is axial twist only when the other two components are
   * zero — for an arm raised and swung out it is not, and a solver that
   * treats it as twist moves the elbow instead of turning the arm. Twist
   * is therefore its own quantity, applied about the axis the child joint
   * actually lies along.
   *
   * Declared on the joints that really have it: the shoulder (internal
   * and external rotation) and the forearm (pronation and supination).
   */
  twist?: readonly [number, number];
  /** Human-readable label for pose UIs. */
  label: string;
  /**
   * Semantic body-part group for pose UIs ("Left Leg", "Front Right Arm",
   * "Head", …). Data-driven: future rigs declare their own grouping here
   * instead of the UI hardcoding a hierarchy. Omitted joints (the root)
   * are not user-posable.
   */
  uiGroup?: string;
}

const PI = Math.PI;
const armJoints = (slot: ArmSlot, side: "left" | "right", row: "front" | "back"): JointDefinition[] => {
  const sideSign = side === "left" ? 1 : -1;
  const z = row === "front" ? 0.045 : -0.045;
  const label = `${row === "front" ? "Front" : "Back"} ${side === "left" ? "Left" : "Right"}`;
  const uiGroup = `${label} Arm`;
  return [
    {
      id: `arm.${slot}.upper`,
      parent: "chest",
      position: [sideSign * 0.175, 0.11, z],
      limits: { x: [-PI, PI * 0.6], y: [-PI * 0.5, PI * 0.5], z: [-PI * 0.7, PI * 0.7] },
      // Internal and external rotation of the whole arm about its length.
      // This is what brings a fist onto a vertical staff at the side; a
      // wrist cannot do it, and measuring showed a 46° miss without it.
      twist: [-PI * 0.5, PI * 0.5],
      label: `${label} Upper Arm`,
      uiGroup,
    },
    {
      id: `arm.${slot}.forearm`,
      parent: `arm.${slot}.upper`,
      position: [sideSign * 0.02, -0.16, 0],
      // y is pronation and supination, and a real forearm has a lot of
      // it — about 85° each way. It is the joint that brings a fist onto
      // a vertical staff, so under-declaring it forces the work onto a
      // wrist that cannot do it.
      limits: { x: [-PI * 0.85, 0.1], y: [-PI * 0.47, PI * 0.47], z: [-0.3, 0.3] },
      /** Pronation and supination — about 85° each way on a real arm. */
      twist: [-PI * 0.47, PI * 0.47],
      label: `${label} Forearm`,
      uiGroup,
    },
    {
      id: `arm.${slot}.hand`,
      parent: `arm.${slot}.forearm`,
      position: [0, -0.14, 0],
      // A wrist is not a ball joint, and declaring it as one is how a
      // solver ends up producing hands nobody has. Flexion and extension
      // are its strong axis (~72°); radial and ulnar deviation its weak
      // one (~45°, and real wrists manage rather less); axial rotation it
      // has essentially none of — that is the forearm's job.
      //
      // y is not zero only because these are Euler XYZ components rather
      // than anatomical axes, so a little of the forearm's rotation
      // decomposes into it. 35° is the slack that allows, not a claim
      // that a wrist twists that far.
      limits: { x: [-PI * 0.4, PI * 0.4], y: [-PI * 0.195, PI * 0.195], z: [-PI * 0.25, PI * 0.25] },
      label: `${label} Hand`,
      uiGroup,
    },
  ];
};

/**
 * One hand's digits, in the hand's own frame: fingers grow along -Y, the
 * palm faces +Z, the thumb lies toward the hand's ±X depending on side.
 * Rest lengths are a stylised adult hand; a mesh body that measured its
 * own replaces them, exactly as it does for every other joint.
 *
 * Three segments a finger, because that is what flexes. The fingertip is
 * the end of the last segment, not a joint of its own — nothing is skinned
 * to a point.
 */
const FINGER_ROOTS: Record<FingerId, { x: number; y: number; z: number }> = {
  thumb: { x: 0.026, y: -0.03, z: 0.008 },
  index: { x: 0.021, y: -0.058, z: 0.006 },
  middle: { x: 0.007, y: -0.062, z: 0.008 },
  ring: { x: -0.007, y: -0.062, z: 0.008 },
  little: { x: -0.021, y: -0.057, z: 0.006 },
};
/** Segment lengths, proximal to distal, as a fraction of the finger. */
const FINGER_LENGTHS: Record<FingerId, readonly [number, number, number]> = {
  thumb: [0.026, 0.02, 0.017],
  index: [0.031, 0.019, 0.013],
  middle: [0.034, 0.021, 0.014],
  ring: [0.031, 0.02, 0.013],
  little: [0.025, 0.015, 0.011],
};

const fingerJoints = (slot: ArmSlot): JointDefinition[] => {
  // The rig is not mirrored but the hands are, so the thumb reaches the
  // opposite way on each side. This is the same chirality the grip
  // contract states as an axis — here it is anatomy instead.
  const sideSign = slot === "frontLeft" || slot === "backLeft" ? 1 : -1;
  const joints: JointDefinition[] = [];
  for (const finger of FINGER_IDS) {
    const root = FINGER_ROOTS[finger];
    const lengths = FINGER_LENGTHS[finger];
    FINGER_SEGMENTS.forEach((segment, index) => {
      const first = index === 0;
      joints.push({
        id: `arm.${slot}.hand.${finger}.${segment}`,
        parent: first
          ? `arm.${slot}.hand`
          : `arm.${slot}.hand.${finger}.${FINGER_SEGMENTS[index - 1]!}`,
        position: first
          ? [sideSign * root.x, root.y, root.z]
          : [0, -(lengths[index - 1] ?? 0.02), 0],
        // A finger curls toward the palm and splays a little; it does not
        // bend backwards past a stop, and it does not twist.
        limits:
          finger === "thumb"
            ? { x: [-0.3, 1.2], y: [-0.6, 0.6], z: [-0.9, 0.9] }
            : { x: [-0.15, PI * 0.55], y: [-0.25, 0.25], z: [-0.2, 0.2] },
        label: `${finger} ${segment}`,
        // Deliberately no uiGroup: fifteen sliders a hand would drown the
        // pose UI. Mudras and grips drive these, the way a hand works.
      });
    });
  }
  return joints;
};

const legJoints = (slot: LegSlot): JointDefinition[] => {
  const sideSign = slot === "left" ? 1 : -1;
  const label = slot === "left" ? "Left" : "Right";
  const uiGroup = `${label} Leg`;
  return [
    {
      id: `leg.${slot}.thigh`,
      parent: "pelvis",
      position: [sideSign * 0.09, -0.05, 0],
      limits: { x: [-PI * 0.7, PI * 0.7], y: [-PI * 0.3, PI * 0.3], z: [-PI * 0.5, PI * 0.5] },
      label: `${label} Thigh`,
      uiGroup,
    },
    {
      id: `leg.${slot}.shin`,
      parent: `leg.${slot}.thigh`,
      position: [0, -0.2, 0],
      limits: { x: [0, PI * 0.85], y: [-0.2, 0.2], z: [-0.2, 0.2] },
      label: `${label} Shin`,
      uiGroup,
    },
    {
      id: `leg.${slot}.foot`,
      parent: `leg.${slot}.shin`,
      position: [0, -0.19, 0],
      limits: { x: [-PI * 0.3, PI * 0.3], y: [-0.3, 0.3], z: [-0.2, 0.2] },
      label: `${label} Foot`,
      uiGroup,
    },
  ];
};

/** Torso and head — the spine every humanoid skeleton is built on. */
const TORSO_JOINTS: readonly JointDefinition[] = [
  { id: "root", parent: null, position: [0, 0, 0], label: "Root" },
  { id: "pelvis", parent: "root", position: [0, 0.52, 0], limits: { x: [-PI * 0.3, PI * 0.3], y: [-PI * 0.4, PI * 0.4], z: [-PI * 0.25, PI * 0.25] }, label: "Pelvis", uiGroup: "Torso" },
  { id: "spine", parent: "pelvis", position: [0, 0.1, 0], limits: { x: [-0.6, 0.6], y: [-0.8, 0.8], z: [-0.5, 0.5] }, label: "Spine", uiGroup: "Torso" },
  { id: "chest", parent: "spine", position: [0, 0.16, 0], limits: { x: [-0.5, 0.5], y: [-0.7, 0.7], z: [-0.4, 0.4] }, label: "Chest", uiGroup: "Torso" },
  { id: "neck", parent: "chest", position: [0, 0.16, 0], limits: { x: [-0.6, 0.6], y: [-1.0, 1.0], z: [-0.5, 0.5] }, label: "Neck", uiGroup: "Head" },
  // Head sits high enough that the chin clears the shoulder line — murti
  // composition needs daylight between chin and chest.
  { id: "head", parent: "neck", position: [0, 0.115, 0], limits: { x: [-0.7, 0.7], y: [-1.2, 1.2], z: [-0.6, 0.6] }, label: "Head", uiGroup: "Head" },
] as const;

/** The arms every humanoid has. */
const FRONT_ARM_JOINTS: readonly JointDefinition[] = [
  ...armJoints("frontLeft", "left", "front"),
  ...armJoints("frontRight", "right", "front"),
] as const;

/**
 * The second pair of arms, for iconography that shows them. An EXTENSION:
 * a skeleton that does not declare it has no back arm joints at all, which
 * is the only honest answer for a body with one pair of arms.
 */
export const BACK_ARM_JOINTS: readonly JointDefinition[] = [
  ...armJoints("backLeft", "left", "back"),
  ...armJoints("backRight", "right", "back"),
] as const;

/**
 * Digits for one hand. An EXTENSION, like the back arms: the contract is
 * common — one naming, one chirality, one set of limits, defined here and
 * nowhere else — but a skeleton instantiates it only for a body whose mesh
 * actually has fingers to drive. A procedural hand that is rebuilt per
 * mudra has no use for a joint it never deforms.
 */
export const fingerJointsFor = (slot: ArmSlot): readonly JointDefinition[] =>
  fingerJoints(slot);

/**
 * Ganesha's trunk extension. The chain sweeps forward (+z) as it descends
 * so the trunk drapes OVER the chin/shawl/belly front surfaces instead of
 * hanging inside the torso volume.
 */
export const TRUNK_JOINTS: readonly JointDefinition[] = [
  { id: "trunkBase", parent: "head", position: [0, -0.01, 0.095], limits: { x: [-0.8, 0.8], y: [-0.8, 0.8], z: [-0.8, 0.8] }, label: "Trunk Base", uiGroup: "Trunk" },
  { id: "trunkMid", parent: "trunkBase", position: [0, -0.09, 0.05], limits: { x: [-1.2, 1.2], y: [-1.0, 1.0], z: [-1.0, 1.0] }, label: "Trunk Middle", uiGroup: "Trunk" },
  { id: "trunkTip", parent: "trunkMid", position: [0, -0.085, 0.04], limits: { x: [-1.4, 1.4], y: [-1.2, 1.2], z: [-1.2, 1.2] }, label: "Trunk Tip", uiGroup: "Trunk" },
] as const;

const LEG_JOINTS: readonly JointDefinition[] = [
  ...legJoints("left"),
  ...legJoints("right"),
] as const;

/**
 * Compose a humanoid joint chain from the core plus whichever extensions
 * the anatomy actually has, in canonical build order (parents before
 * children, and the order the pose UI lists its groups in).
 */
export function humanoidJoints(extensions: {
  trunk?: boolean;
  backArms?: boolean;
  fingers?: boolean;
} = {}): readonly JointDefinition[] {
  const slots: ArmSlot[] = extensions.backArms
    ? ["frontLeft", "frontRight", "backLeft", "backRight"]
    : ["frontLeft", "frontRight"];
  return [
    ...TORSO_JOINTS,
    ...(extensions.trunk ? TRUNK_JOINTS : []),
    ...FRONT_ARM_JOINTS,
    ...(extensions.backArms ? BACK_ARM_JOINTS : []),
    // Digits come after every arm, so a hand exists before its fingers do.
    ...(extensions.fingers ? slots.flatMap(fingerJoints) : []),
    ...LEG_JOINTS,
  ];
}

/**
 * Shared humanoid core: torso, head, ONE pair of arms, two legs. Every
 * deity skeleton starts from these joints and adds what its anatomy needs.
 */
export const HUMANOID_CORE_JOINTS: readonly JointDefinition[] = humanoidJoints();

/**
 * Union of every joint across all skeletons — used for validation and as
 * the legacy `SKELETON` export. Future joints (fingers, facial controls,
 * spine chains) extend the definitions — unknown joints in an old config
 * are ignored; missing joints default to rest.
 */
export const SKELETON: readonly JointDefinition[] = humanoidJoints({
  trunk: true,
  backArms: true,
  fingers: true,
});

export const JOINT_IDS: readonly JointId[] = SKELETON.map((j) => j.id);

export interface JointUiGroup {
  label: string;
  joints: readonly JointDefinition[];
}

/**
 * User-posable joints organized by their declared semantic body part, in
 * skeleton order. Joints without a uiGroup (the root) are not exposed.
 * Data-driven: the grouping comes from the joints themselves, so each
 * deity's skeleton yields its own pose UI without hardcoded hierarchies.
 */
export function computeJointUiGroups(joints: readonly JointDefinition[]): readonly JointUiGroup[] {
  const order: string[] = [];
  const byGroup = new Map<string, JointDefinition[]>();
  for (const joint of joints) {
    if (!joint.uiGroup) continue;
    if (!byGroup.has(joint.uiGroup)) {
      byGroup.set(joint.uiGroup, []);
      order.push(joint.uiGroup);
    }
    byGroup.get(joint.uiGroup)?.push(joint);
  }
  return order.map((label) => ({ label, joints: byGroup.get(label) ?? [] }));
}

/** Legacy: UI groups of the union skeleton. Prefer the deity skeleton's groups. */
export const JOINT_UI_GROUPS: readonly JointUiGroup[] = computeJointUiGroups(SKELETON);

const jointMap = new Map<JointId, JointDefinition>(SKELETON.map((j) => [j.id, j]));

export function getJoint(id: JointId): JointDefinition {
  const joint = jointMap.get(id);
  if (!joint) throw new Error(`Unknown joint id: ${id}`);
  return joint;
}

export function isJointId(value: string): value is JointId {
  return jointMap.has(value as JointId);
}
