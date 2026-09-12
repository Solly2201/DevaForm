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
  | "trunk.tip"
  | "chest.necklace"
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
}

const handSockets: SocketDefinition[] = ARM_SLOTS.flatMap((slot) => [
  {
    id: `arm.${slot}.hand.item` as SocketId,
    joint: `arm.${slot}.hand` as JointId,
    position: [0, -0.05, 0.02] as const,
    rotation: [0, 0, 0] as const,
    label: `${slot} hand item`,
  },
  {
    id: `arm.${slot}.wrist` as SocketId,
    joint: `arm.${slot}.hand` as JointId,
    position: [0, 0.01, 0] as const,
    rotation: [0, 0, 0] as const,
    label: `${slot} wrist`,
  },
]);

export const SOCKETS: readonly SocketDefinition[] = [
  { id: "head.crown", joint: "head", position: [0, 0.172, -0.005], rotation: [0, 0, 0], label: "Crown" },
  { id: "head.leftEar", joint: "head", position: [0.12, 0.03, 0], rotation: [0, 0, 0], label: "Left ear" },
  { id: "head.rightEar", joint: "head", position: [-0.12, 0.03, 0], rotation: [0, 0, 0], label: "Right ear" },
  { id: "head.forehead", joint: "head", position: [0, 0.07, 0.1], rotation: [0, 0, 0], label: "Forehead" },
  { id: "trunk.tip", joint: "trunkTip", position: [0, -0.04, 0.02], rotation: [0, 0, 0], label: "Trunk tip" },
  { id: "chest.necklace", joint: "chest", position: [0, 0.12, 0.01], rotation: [0, 0, 0], label: "Necklace" },
  { id: "waist.ornament", joint: "pelvis", position: [0, 0.04, 0.12], rotation: [0, 0, 0], label: "Waist" },
  ...handSockets,
  { id: "leg.left.anklet", joint: "leg.left.foot", position: [0, 0.04, 0], rotation: [0, 0, 0], label: "Left anklet" },
  { id: "leg.right.anklet", joint: "leg.right.foot", position: [0, 0.04, 0], rotation: [0, 0, 0], label: "Right anklet" },
  { id: "base.platform", joint: "root", position: [0, 0, 0], rotation: [0, 0, 0], label: "Base" },
] as const;

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
