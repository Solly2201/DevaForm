/**
 * Attachment socket definitions.
 *
 * A socket is a named, stable attachment point parented to a joint.
 * Assets declare which socket(s) they attach to plus a local offset
 * transform; when the parent joint moves the attachment follows.
 *
 * Socket ids are stable API surface — production rigs must export empty
 * transforms named `SOCKET_<id>` at these locations.
 */
import type { ArmSlot, JointId } from "./skeleton";
import { ARM_SLOTS } from "./skeleton";


export type SocketId =
  | "head.crown"
  | "head.leftEar"
  | "head.rightEar"
  | "head.forehead"
  | "head.moon"
  | "trunk.tip"
  | "chest.necklace"
  | "chest.mala"
  | "waist.ornament"
  | `arm.${ArmSlot}.hand.item`
  | `arm.${ArmSlot}.wrist`
  | `leg.left.anklet`
  | `leg.right.anklet`
  | "base.platform";

export interface SocketDefinition {
  id: SocketId;
  joint: JointId;
  /** Local offset from the joint, in meters. */
  position: readonly [number, number, number];
  /** Local rotation (euler XYZ, radians). */
  rotation: readonly [number, number, number];
  label: string;
  /**
   * Where the socket is anchored. "character" (default) parents it to its
   * joint, so it follows the pose. "statue" parents it to the statue root
   * at the base's top surface — companions and platform items must not
   * follow seated/levitating root offsets.
   */
  anchor?: "character" | "statue";
}

const ARM_SLOT_LABELS: Record<ArmSlot, string> = {
  frontLeft: "Front Left",
  frontRight: "Front Right",
  backLeft: "Back Left",
  backRight: "Back Right",
};

const handSockets = (slots: readonly ArmSlot[]): SocketDefinition[] =>
  slots.flatMap((slot) => [
    {
      id: `arm.${slot}.hand.item` as SocketId,
      joint: `arm.${slot}.hand` as JointId,
      position: [0, -0.05, 0.02] as const,
      rotation: [0, 0, 0] as const,
      label: `${ARM_SLOT_LABELS[slot]} Hand`,
    },
    {
      id: `arm.${slot}.wrist` as SocketId,
      joint: `arm.${slot}.hand` as JointId,
      position: [0, 0.01, 0] as const,
      rotation: [0, 0, 0] as const,
      label: `${ARM_SLOT_LABELS[slot]} Wrist`,
    },
  ]);

const FRONT_ARM_SLOTS = ["frontLeft", "frontRight"] as const;
const BACK_ARM_SLOTS = ["backLeft", "backRight"] as const;

/**
 * Sockets available on the shared humanoid core. The crescent-moon socket is
 * a hair ornament seat: assets that own the hair surface (a jata sculpt)
 * refine its position onto their generated geometry.
 *
 * Only the FRONT hands are here. A hand socket belongs to an arm, and the
 * back arms are an extension — so a body with one pair of arms offers no
 * back hand to hang anything from, rather than offering one that floats.
 */
export const HUMANOID_CORE_SOCKETS: readonly SocketDefinition[] = [
  { id: "head.crown", joint: "head", position: [0, 0.172, -0.005], rotation: [0, 0, 0], label: "Crown" },
  { id: "head.leftEar", joint: "head", position: [0.12, 0.03, 0], rotation: [0, 0, 0], label: "Left ear" },
  { id: "head.rightEar", joint: "head", position: [-0.12, 0.03, 0], rotation: [0, 0, 0], label: "Right ear" },
  { id: "head.forehead", joint: "head", position: [0, 0.07, 0.1], rotation: [0, 0, 0], label: "Forehead" },
  { id: "head.moon", joint: "head", position: [0.05, 0.15, 0.02], rotation: [0, 0, 0], label: "Crescent" },
  { id: "chest.necklace", joint: "chest", position: [0, 0.12, 0.01], rotation: [0, 0, 0], label: "Necklace" },
  // A torque at the throat and a mala hanging on the chest are worn
  // TOGETHER — references/ref3.png shows a naga at the collar with
  // rudraksha strands below it — and one socket holds one thing. So there
  // are two seats at the same joint-local point, and each ornament hangs
  // to its own depth from there. Sharing the point is deliberate: what
  // separates a collar from a mala is the drop of the ornament, not the
  // height of its anchor, and every generator that drapes in socket space
  // already works in that frame.
  { id: "chest.mala", joint: "chest", position: [0, 0.12, 0.01], rotation: [0, 0, 0], label: "Mala" },
  { id: "waist.ornament", joint: "pelvis", position: [0, 0.04, 0.12], rotation: [0, 0, 0], label: "Waist" },
  ...handSockets(FRONT_ARM_SLOTS),
  { id: "leg.left.anklet", joint: "leg.left.foot", position: [0, 0.04, 0], rotation: [0, 0, 0], label: "Left anklet" },
  { id: "leg.right.anklet", joint: "leg.right.foot", position: [0, 0.04, 0], rotation: [0, 0, 0], label: "Right anklet" },
  { id: "base.platform", joint: "root", position: [0, 0, 0], rotation: [0, 0, 0], label: "Base", anchor: "statue" },
] as const;

/** Sockets that require the back arm joint chains. */
export const BACK_ARM_SOCKETS: readonly SocketDefinition[] = handSockets(BACK_ARM_SLOTS);

/** Sockets that require Ganesha's trunk joint chain. */
export const TRUNK_SOCKETS: readonly SocketDefinition[] = [
  { id: "trunk.tip", joint: "trunkTip", position: [0, -0.04, 0.02], rotation: [0, 0, 0], label: "Trunk tip" },
] as const;

/** Union of every socket across all skeletons (validation + legacy export). */
export const SOCKETS: readonly SocketDefinition[] = [
  ...HUMANOID_CORE_SOCKETS,
  ...BACK_ARM_SOCKETS,
  ...TRUNK_SOCKETS,
] as const;

/**
 * Compose a humanoid socket set alongside `humanoidJoints` — the same
 * extensions, so joints and the sockets hung off them cannot disagree.
 */
export function humanoidSockets(extensions: {
  trunk?: boolean;
  backArms?: boolean;
} = {}): readonly SocketDefinition[] {
  return [
    ...HUMANOID_CORE_SOCKETS,
    ...(extensions.backArms ? BACK_ARM_SOCKETS : []),
    ...(extensions.trunk ? TRUNK_SOCKETS : []),
  ];
}

const socketMap = new Map<SocketId, SocketDefinition>(SOCKETS.map((s) => [s.id, s]));

export function getSocket(id: SocketId): SocketDefinition {
  const socket = socketMap.get(id);
  if (!socket) throw new Error(`Unknown socket id: ${id}`);
  return socket;
}

export function isSocketId(value: string): value is SocketId {
  return socketMap.has(value as SocketId);
}

export const HAND_ITEM_SOCKETS: readonly SocketId[] = ARM_SLOTS.map(
  (slot) => `arm.${slot}.hand.item` as SocketId,
);
