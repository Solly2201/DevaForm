/**
 * How an attribute presents itself.
 *
 * The engine already knew "this asset can be gripped". What it could not
 * say was "this asset should be presented THIS WAY in THIS pose" — so a
 * trishul had exactly one relationship to the figure, and a pose that
 * could not sustain it produced a second relationship invented inline in
 * the renderer, with its own clearance constant and its own side-picking
 * rule. That is one unnamed presentation per special case, forever.
 *
 * A presentation is therefore a first-class, declared, serializable thing:
 * a mode, an anchor, what the hand is doing, how the item orients, and how
 * much room it needs. An asset declares every presentation it supports and
 * the resolver picks one. The asset is never duplicated; only the
 * relationship changes.
 *
 * Trishul:  handheldShaft | grounded
 * Damaru:   pinchHeld     | gripHeld
 * Lotus:    pinchHeld
 *
 * Nothing here knows about a deity, a pose preset or a renderer.
 */
import type { MudraId, SocketId, Vec3 } from "@devaform/character-schema";

/** How an attribute participates in the figure. */
export type PresentationMode =
  /** A hand holds it. Needs a hand socket and a hand state. */
  | "handheld"
  /** It stands on the base. Needs no hand at all. */
  | "grounded"
  /** It lies along the body's surface (serpent, mala, sash). */
  | "wearable"
  /** It is seated rigidly on a joint (crown, earring, third eye). */
  | "bodyMounted"
  /** It hangs in space around the figure (aura, prabhavali). */
  | "floating";

/**
 * Hand states that can hold something.
 *
 * Deliberately a subset of MudraId rather than a parallel vocabulary: the
 * mudras ARE the hand-state language, and a second enum would mean two
 * places to keep in step. A gesture (abhaya, varada, open) is absent by
 * construction — a hand showing a palm to a devotee is holding nothing,
 * and that should be a fact about the type rather than a runtime check.
 */
export const HOLDING_MUDRAS = ["grip", "pinch", "hold"] as const;
export type HoldingMudra = (typeof HOLDING_MUDRAS)[number];

/** What the hand does in a presentation — including nothing. */
export type HandRelationship = "none" | HoldingMudra;

export function isHoldingMudra(mudra: MudraId): mudra is HoldingMudra {
  return (HOLDING_MUDRAS as readonly string[]).includes(mudra);
}

/**
 * Where the presentation attaches.
 *
 * `configured` means "wherever the configuration put it" — true of most
 * ornaments, which are simply seated where the customer chose.
 * `hand` narrows that to hand sockets only: the presentation is
 * hand-agnostic but it does need a hand. `socket` names one specific seat,
 * for an ornament that only makes sense in one place. `ground` means the
 * statue base beside the figure, which is independent of the pose
 * entirely.
 */
export type PresentationAnchor =
  | { kind: "configured" }
  | { kind: "hand" }
  | { kind: "socket"; socket: SocketId }
  | { kind: "ground" };

/**
 * How the item is turned once it is anchored.
 *
 * `anchor` follows the socket, which is what a cradled offering does.
 * `worldUpright` presents the item's own grip axis vertically whatever the
 * joint chain is doing, which is how classical iconography reads a shafted
 * attribute. Note that `worldUpright` is a statement about the ITEM's
 * required orientation, not an instruction to overwrite its world matrix:
 * the engine satisfies it by turning the HAND onto the item.
 */
export type PresentationOrientation = "anchor" | "worldUpright";

/**
 * Which way an upright item shows its face.
 *
 * A `worldUpright` axis constraint fixes two of the item's three degrees
 * of freedom and leaves the third — spin about the vertical channel —
 * wherever the arm solve happened to put it. For a shaft that is nothing;
 * for an item WITH a face (a discus, a conch's lip) it is the difference
 * between the attribute presenting itself and the attribute caught
 * side-on. `front` spends that free spin deliberately: after the hand is
 * turned onto the item, the item is rotated about its own channel until
 * its +Z looks out the statue's front — how a murti shows a wheel. The
 * grip is untouched: rotation about the channel is the one motion a
 * channel cannot feel.
 */
export type PresentationFacing = "free" | "front";

/**
 * Where the item's weight actually goes.
 *
 * `hand` — the hand carries it, so it travels with the wrist.
 * `ground` — its butt rests on the base and the hand only steadies it. A
 * planted staff does not rise when the arm does; the hand slides along the
 * shaft instead, which is the whole reason a grip is a range of points
 * rather than one.
 */
export type PresentationSupport = "hand" | "ground";

/**
 * How the asset meets the hand.
 *
 * origin: asset-local point that lands exactly on the grip socket.
 * axis:   asset-local direction that runs up the grip channel.
 * roll:   rotation about that channel after alignment, radians.
 * travel: how far the hand may slide along the channel from the origin
 *         before it reaches something no one grips. `up` is toward the
 *         item's head; `down` toward its butt.
 * radius: the asset's half-thickness AT the grip origin. This is what a
 *         hand closes around, and without it every fist closes to the same
 *         diameter — which is why a fist could meet a drum's head as
 *         readily as a staff's shaft.
 */
export interface GripFrame {
  origin?: Vec3;
  axis?: Vec3;
  roll?: number;
  travel?: { up?: number; down?: number };
  radius?: number;
  /**
   * WHICH hand state holds it.
   *
   * `wrap` — the default — is a hand closing round something, and the
   * radius above says how thick that something is. `poise` is a hand
   * that is not closing at all: three fingers and the thumb shut, the
   * index standing, and the attribute balanced on its tip.
   *
   * A discus needs the second and cannot be described by the first. Its
   * presentation used to declare a six-millimetre radius so the hand
   * would close on "a finger", which produced a fist shut on nothing
   * beside a floating wheel — the hand had no relationship to the thing
   * it was supposedly holding. Saying which state an attribute asks for
   * is one word, and the body already ships a seat and a channel for
   * each state it can bake.
   */
  closure?: HandClosure;
}

/**
 * The hand states a body can be asked for.
 *
 * Deliberately short. Each one has to be a real baked shape with its own
 * measured seat, so the vocabulary grows only when a body can honour it.
 */
export const HAND_CLOSURES = ["wrap", "poise"] as const;
export type HandClosure = (typeof HAND_CLOSURES)[number];

/** A grounded presentation stands beside the figure, clear of it. */
export interface GroundedStand {
  /**
   * Gap between the figure's widest measured silhouette and this item's
   * axis, in metres. The only authored number in the relationship: where
   * the item stands is derived from the body that is actually wearing the
   * configuration, and from the hand that was holding it.
   */
  clearanceM: number;
  /** Which side to stand on when no hand indicates one. */
  side?: "left" | "right";
}

export interface AttributePresentation {
  /** Stable within the asset; persisted in resolutions and diagnostics. */
  id: string;
  label: string;
  mode: PresentationMode;
  anchor: PresentationAnchor;
  hand: HandRelationship;
  orientation: PresentationOrientation;
  /**
   * How the free spin about the channel is spent. Defaults to `free`.
   * Only meaningful with `worldUpright`.
   */
  facing?: PresentationFacing;
  /** Where the weight goes. Defaults to `hand`. */
  support?: PresentationSupport;
  /** Required for `handheld`; meaningless otherwise. */
  grip?: GripFrame;
  /** Required for `grounded`. */
  stand?: GroundedStand;
  /**
   * Gap this presentation keeps from the body's surface, metres. Used by
   * clearance validation; a wearable that declares none is not checked.
   */
  clearanceM?: number;
  /**
   * May the resolver choose this on its own when the configured one cannot
   * be satisfied? A grounded trishul is a legitimate automatic answer to a
   * blessing pose; a presentation that would surprise the customer should
   * say so by leaving this false.
   */
  autoSelectable: boolean;
  /**
   * May this presentation move to a different hand when the configured one
   * is unavailable? Hand-agnostic by nature, but moving an attribute is a
   * visible decision, so it is opt-in per asset.
   */
  mobile?: boolean;
  /**
   * Presentations of the SAME asset that may be active simultaneously.
   * Nothing uses this yet; it exists so a future two-part attribute (a
   * sheathed sword and its scabbard) does not need a new mechanism.
   */
  coexistsWith?: readonly string[];
  notes?: string;
}

// ---------------------------------------------------------------------------
// Authoring helpers
//
// Manifests read better as statements than as object literals: "held in a
// fist, presented upright, gripped on the shaft" rather than eight fields.
// These add nothing the interface cannot express; they only make the
// common shapes short enough that nobody is tempted to skip one.
// ---------------------------------------------------------------------------

/** Held in a hand — whichever hand the configuration puts it on. */
export function handheld(spec: {
  id: string;
  label: string;
  hand: HoldingMudra;
  /** Default `worldUpright`: a shafted attribute reads vertical. */
  orientation?: PresentationOrientation;
  /** Default `free`: only an item with a face needs to spend the spin. */
  facing?: PresentationFacing;
  /** Default `hand`: the hand carries what it holds. */
  support?: PresentationSupport;
  grip?: GripFrame;
  mobile?: boolean;
  autoSelectable?: boolean;
  notes?: string;
}): AttributePresentation {
  return {
    id: spec.id,
    label: spec.label,
    mode: "handheld",
    anchor: { kind: "hand" },
    hand: spec.hand,
    orientation: spec.orientation ?? "worldUpright",
    facing: spec.facing,
    support: spec.support ?? "hand",
    grip: spec.grip,
    autoSelectable: spec.autoSelectable ?? true,
    mobile: spec.mobile,
    notes: spec.notes,
  };
}

/** Standing on the base beside the figure, independent of every hand. */
export function grounded(spec: {
  id: string;
  label: string;
  stand: GroundedStand;
  grip?: GripFrame;
  autoSelectable?: boolean;
  notes?: string;
}): AttributePresentation {
  return {
    id: spec.id,
    label: spec.label,
    mode: "grounded",
    anchor: { kind: "ground" },
    hand: "none",
    orientation: "worldUpright",
    support: "ground",
    grip: spec.grip,
    stand: spec.stand,
    autoSelectable: spec.autoSelectable ?? true,
    notes: spec.notes,
  };
}

/** Lying along the body's own surface, at a declared clearance. */
export function wearable(spec: {
  id: string;
  label: string;
  socket: SocketId;
  clearanceM: number;
  notes?: string;
}): AttributePresentation {
  return {
    id: spec.id,
    label: spec.label,
    mode: "wearable",
    anchor: { kind: "socket", socket: spec.socket },
    hand: "none",
    orientation: "anchor",
    clearanceM: spec.clearanceM,
    autoSelectable: true,
    notes: spec.notes,
  };
}

/**
 * The presentation an asset falls back to when it declares none.
 *
 * Most attachments are simply seated where they are put — a crown on the
 * crown socket, an earring on an ear. Saying so explicitly means the
 * resolver never has to ask whether an asset has presentations.
 */
export function defaultPresentationFor(
  kindSockets: readonly SocketId[],
): AttributePresentation {
  const handOnly =
    kindSockets.length > 0 && kindSockets.every((socket) => socket.endsWith(".hand.item"));
  return handOnly
    ? {
        id: "held",
        label: "Held",
        mode: "handheld",
        anchor: { kind: "hand" },
        hand: "hold",
        orientation: "anchor",
        autoSelectable: true,
      }
    : {
        id: "worn",
        label: "Worn",
        mode: "bodyMounted",
        anchor: { kind: "configured" },
        hand: "none",
        orientation: "anchor",
        autoSelectable: true,
      };
}

/** Does the item's weight rest on the ground rather than in a hand? */
export function standsOnGround(presentation: AttributePresentation): boolean {
  return (presentation.support ?? "hand") === "ground";
}

/** Does this presentation put the item in a hand? */
export function isHandheld(presentation: AttributePresentation): boolean {
  return presentation.mode === "handheld" && presentation.hand !== "none";
}

/**
 * The full grip frame of a presentation, with the authoring defaults
 * filled in: origin at the asset's own origin, shaft along +Y, no roll,
 * unbounded travel.
 */
export function resolveGripFrame(presentation: AttributePresentation): Required<
  Omit<GripFrame, "travel" | "radius" | "closure">
> & {
  travel: { up: number; down: number };
  radius: number | undefined;
  closure: HandClosure;
} {
  const grip = presentation.grip ?? {};
  return {
    origin: grip.origin ?? [0, 0, 0],
    axis: grip.axis ?? [0, 1, 0],
    roll: grip.roll ?? 0,
    closure: grip.closure ?? "wrap",
    travel: {
      up: grip.travel?.up ?? Number.POSITIVE_INFINITY,
      down: grip.travel?.down ?? Number.POSITIVE_INFINITY,
    },
    radius: grip.radius,
  };
}
