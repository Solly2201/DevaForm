import type * as THREE from "three";
import type {
  ArmSlot,
  ArmsConfiguration,
  HandsConfiguration,
  JointId,
  Proportions,
  SocketId,
} from "@devaform/character-schema";
import type { ZoneMaterials } from "../materials";
import type { BodyProfile } from "./bodyProfile";

/** What a hand is closing on, as the resolver decided it. */
export interface HeldItemSpec {
  /** The presentation chosen for it — diagnostics and generator hints. */
  presentationId: string;
  /** How thick the item is where the hand closes, metres. */
  radius?: number;
}

export interface GeneratorContext {
  /** Static parameters from the asset manifest entry. */
  params: Record<string, number | string>;
  materials: ZoneMaterials;
  proportions: Proportions;
  /** Live morph weights from the configuration (parametric morphs). */
  morphs: Record<string, number>;
  hands: HandsConfiguration;
  arms: ArmsConfiguration;
  /**
   * The arm chains that actually exist AND are rendered: the intersection
   * of the configured arm count with the skeleton's own arms. A generator
   * that builds per-arm geometry must read this rather than the arm count,
   * or it builds a hand for a limb this body does not have.
   */
  armSlots: readonly ArmSlot[];
  /**
   * What each hand is holding, decided before any geometry exists.
   *
   * A hand generator needs this: a fist that closes to a fixed diameter
   * whatever it holds is why fingers used to meet a drum head as readily
   * as a staff's shaft. The item declares the radius it presents; the hand
   * closes onto exactly that.
   */
  held: Readonly<Partial<Record<ArmSlot, HeldItemSpec>>>;
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
/**
 * A part's statement about a socket whose surface it owns.
 *
 * Position alone was not enough for a hand. A hand's item socket is not
 * merely a point: it is a point plus the direction a held shaft runs
 * through it — the axis of the tube a closed fist makes. The hand geometry
 * is the only thing that knows where that is, so the hand says so here,
 * and the whole grip chain hangs off the statement.
 *
 * Without it the socket kept the wrist joint's own orientation, whose +Y
 * runs down the FINGERS, so an asset authored shaft-up landed lying along
 * the fingers and had to be rotated back in world space afterwards — which
 * is exactly how a trishul came to pass across a hand instead of through it.
 */
export interface SocketRefinement {
  id: SocketId;
  /** New socket position, local to the socket's parent joint. */
  position: readonly [number, number, number];
  /**
   * The direction a held shaft runs, in the owning joint's frame. Becomes
   * the socket's +Y. Omit for a socket nothing is gripped at.
   */
  channel?: readonly [number, number, number];
  /**
   * Which way the palm faces, in the same frame. Becomes the socket's +Z,
   * which is what determines the roll once the channel is fixed.
   */
  palm?: readonly [number, number, number];
}

export type JointedPart = ReadonlyArray<
  {
    object: THREE.Object3D;
    socketRefinements?: ReadonlyArray<SocketRefinement>;
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
