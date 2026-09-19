import type * as THREE from "three";
import type {
  ArmSlot,
  ArmsConfiguration,
  GarmentFit,
  HandsConfiguration,
  JointId,
  Proportions,
  SocketId,
} from "@devaform/character-schema";
import type { HandClosure } from "@devaform/asset-system";
import type { ZoneMaterials } from "../materials";
import type { BodyProfile } from "./bodyProfile";

/** What a hand is closing on, as the resolver decided it. */
export interface HeldItemSpec {
  /** The presentation chosen for it — diagnostics and generator hints. */
  presentationId: string;
  /** How thick the item is where the hand closes, metres. */
  radius?: number;
  /**
   * What kind of hold the presentation asks for. A staff is gripped, a
   * drum is pinched at its waist, a lotus is cradled — and a hand that
   * treats all three the same is a hand that holds none of them.
   */
  grip?: "grip" | "pinch" | "hold";
  /**
   * The hand STATE this attribute asks for — `wrap` (closing on the
   * radius above) or `poise` (index standing, the item on its tip). See
   * GripFrame.closure in the presentation vocabulary.
   */
  closure?: HandClosure;
  /**
   * How far the item stays that radius along its own axis, each way from
   * the grip, in metres.
   *
   * A staff is a cylinder for a quarter of a metre; a damaru is one for
   * fourteen millimetres and then flares into two drum heads. Anything
   * asking "is this finger inside what it holds" has to know where the
   * declared radius stops describing the object, or a finger resting
   * perfectly against a drum head reads as a finger buried in a shaft.
   * The presentation already says it — `grip.travel` is how far the hand
   * may slide — and this carries it through.
   */
  straight?: number;
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
   * How cloth is worn in this pose — full, gathered or short. Declared by
   * the pose itself (see PosePreset.garment) rather than inferred, so a
   * dancing figure's wrap is short because the pose says a leg is out,
   * not because the renderer noticed a leg through a skirt.
   */
  garment: GarmentFit;
  /**
   * Measured torso surfaces of the configured body — clothing and
   * ornaments fit themselves against these instead of absolute
   * one-body constants (see bodyProfile.ts).
   */
  body: BodyProfile;
  /**
   * Where a joint sits in its parent's frame, ON THIS BODY.
   *
   * Not the stylised table. A body brings its own skeleton — the
   * four-armed mesh's second pair is its first pair MOVED, and lands at
   * offsets the stylised rig's mirrored back arms do not share — so a
   * generator that asks the global table gets the right answer for the
   * front arms and a nine-degree error for the back ones. Which is
   * exactly what it got: the rear bangles sat two centimetres off the
   * arm's own line, out of square, half inside the flesh.
   */
  jointOffset(child: JointId): readonly [number, number, number];
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
