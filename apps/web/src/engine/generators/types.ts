import type * as THREE from "three";
import type {
  ArmsConfiguration,
  HandsConfiguration,
  JointId,
  Proportions,
  SocketId,
} from "@devaform/character-schema";
import type { ZoneMaterials } from "../materials";
import type { BodyProfile } from "./bodyProfile";

export interface GeneratorContext {
  /** Static parameters from the asset manifest entry. */
  params: Record<string, number | string>;
  /**
   * For a planted attribute: how far its socket stands above the base,
   * so a staff can be built long enough to reach the ground. Absent
   * for everything that is not grounded.
   */
  reach?: number;
  materials: ZoneMaterials;
  proportions: Proportions;
  /** Live morph weights from the configuration (parametric morphs). */
  morphs: Record<string, number>;
  hands: HandsConfiguration;
  arms: ArmsConfiguration;
  /**
   * True when the active pose preset is seated. Clothing generators use
   * pose-compatible geometry (a draped lap instead of a full skirt).
   */
  seated: boolean;
  /**
   * Measured torso surfaces of the configured body — clothing and
   * ornaments fit themselves against these instead of absolute
   * one-body constants (see bodyProfile.ts).
   */
  body: BodyProfile;
}

/**
 * A part places objects onto one or more joints so posing articulates it.
 * A part that owns the geometry a socket terminates on (e.g. the trunk
 * owning trunk.tip) may refine that socket's joint-local position so
 * attachments land on the actual generated surface.
 *
 * A part entry may instead target a SOCKET: the object is mounted at the
 * (possibly refined) socket, so parts like earrings originate exactly at
 * the surface their owner part declared — ear jewellery hangs from the
 * ear the head/ears asset actually built, on every deity. Socket-mounted
 * entries are attached after all joint entries so owner refinements have
 * already landed.
 */
export type JointedPart = ReadonlyArray<
  {
    object: THREE.Object3D;
    socketRefinements?: ReadonlyArray<{
      id: SocketId;
      /** New socket position, local to the socket's parent joint. */
      position: readonly [number, number, number];
    }>;
  } & ({ joint: JointId; socket?: never } | { socket: SocketId; joint?: never })
>;

export type PartGenerator = (ctx: GeneratorContext) => JointedPart;
export type AttachmentGenerator = (ctx: GeneratorContext) => THREE.Object3D;

export const num = (ctx: GeneratorContext, key: string, fallback: number): number => {
  const value = ctx.params[key];
  return typeof value === "number" ? value : fallback;
};

export const morph = (ctx: GeneratorContext, key: string): number => {
  const value = ctx.morphs[key];
  return typeof value === "number" ? value : 0;
};
