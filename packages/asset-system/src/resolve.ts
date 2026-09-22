/**
 * The one authoritative resolution step.
 *
 * A CharacterConfiguration is what the customer asked for. It is not, by
 * itself, a coherent statement about a statue: a pose may raise a hand
 * that is still configured to grip, a body may have two arms where the
 * configuration asks for four, an attribute may be attached to a hand that
 * this pose needs for a blessing. Those are not errors — they are ordinary
 * consequences of editing one thing at a time — and something has to
 * reconcile them.
 *
 * Until now three separate places did: `resolveHands` in the schema, the
 * attachment loop in `buildRig`, and the wrist solvers in `pose.ts`. Each
 * knew a piece, none knew the whole, and the renderer sequenced them. So
 * "a blessing hand lets go of the trishul, which then stands on the base
 * beside the figure" was written inline in the rig, with its own clearance
 * constant, as a special case that no other attribute could ever reach.
 *
 * This module reconciles once, from data, with no THREE and no renderer.
 * It answers: what pose, what is each hand doing, where does every
 * attachment actually go, in which presentation, and what could not be
 * satisfied and why. The engine consumes the answer; it does not
 * re-decide any part of it.
 */
import {
  ARM_SLOTS,
  activeArmSlots,
  getPosePreset,
  garmentFitOf,
  getSkeleton,
  isGestureMudra,
  resolveHands,
  type ArmSlot,
  type CharacterConfiguration,
  type GarmentFit,
  type HandsConfiguration,
  type JointId,
  type MudraId,
  type PosePreset,
  type SkeletonDefinition,
  type SocketId,
  type Vec3,
} from "@devaform/character-schema";
import { deityRuntime } from "./deities";
import { resolveAssetRef } from "./registry";
import { isHandheld, type AttributePresentation } from "./presentation";
import { presentationsOf, type AssetDefinition, type AssetTransform } from "./types";

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** Why something is not as the configuration asked. */
export type ResolutionSeverity =
  /** Worth saying, nothing lost: a four-arm config on a two-arm body. */
  | "note"
  /** Something the customer chose could not be honoured as chosen. */
  | "conflict"
  /** Something the customer chose is not in the scene at all. */
  | "rejected";

export interface ResolutionIssue {
  severity: ResolutionSeverity;
  /** The asset this is about, when it is about one. */
  assetId?: string;
  /** The socket the configuration named, when it named one. */
  socket?: SocketId;
  /** Customer-facing sentence. The editor shows this verbatim. */
  message: string;
}

export interface ResolvedPose {
  presetId: string | null;
  preset: PosePreset | undefined;
  /** Joint rotations, preset then overrides. Unknown joints are dropped. */
  joints: Readonly<Partial<Record<JointId, Vec3>>>;
  seated: boolean;
  /** How cloth is worn in this pose — the pose's own statement. */
  garment: GarmentFit;
}

export interface ResolvedAttachment {
  /** The socket the configuration asked for. */
  requestedSocket: SocketId;
  /**
   * Where it actually goes. A grounded presentation resolves to the
   * statue base; a relocated one to a different hand.
   */
  socket: SocketId;
  asset: AssetDefinition;
  presentation: AttributePresentation;
  /** The hand holding it, when a hand is holding it. */
  handSlot?: ArmSlot;
  /** The customer's own offset, carried through untouched. */
  offset?: { position?: Vec3; rotation?: Vec3; scale?: number };
  /** The asset transform that applies at the resolved socket. */
  transform?: AssetTransform;
}

export interface ResolvedCharacter {
  deityId: string;
  /** The anatomy this configuration actually runs on. */
  skeleton: SkeletonDefinition;
  /** Arm chains that exist AND are rendered. */
  armSlots: readonly ArmSlot[];
  pose: ResolvedPose;
  /** What each hand is doing, pose and configuration reconciled. */
  hands: HandsConfiguration;
  attachments: readonly ResolvedAttachment[];
  /** Features physically embedded in a selected part's own mesh. */
  integratedFeatures: ReadonlySet<string>;
  issues: readonly ResolutionIssue[];
}

/**
 * Arms whose hand the engine turns onto something, and therefore whose
 * wrist is not the customer's to set.
 *
 * A hand holding a chakra is aimed down the item's own axis, and a hand
 * showing abhaya is aimed at the devotee — see applyGripOrientations and
 * applyGestureOrientations. Both solve the arm AFTER the pose is applied,
 * so a rotation written onto such a wrist is overwritten before the frame
 * is drawn. That is correct behaviour and a terrible thing to do silently:
 * the slider moved, the statue did not, and nothing said why.
 *
 * So it is derived here, once, from the resolution both the engine and
 * the editor already consume, rather than inferred separately in each.
 */
export function solvedArms(resolved: ResolvedCharacter): ReadonlySet<ArmSlot> {
  const solved = new Set<ArmSlot>();
  for (const attachment of resolved.attachments) {
    if (attachment.handSlot) solved.add(attachment.handSlot);
  }
  for (const slot of resolved.armSlots) {
    if (isGestureMudra(resolved.hands[slot]?.mudra ?? "open")) solved.add(slot);
  }
  return solved;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

const handSlotOf = (socket: string): ArmSlot | undefined => {
  const match = /^arm\.([A-Za-z]+)\.hand\.item$/.exec(socket);
  const slot = match?.[1];
  return slot && (ARM_SLOTS as readonly string[]).includes(slot)
    ? (slot as ArmSlot)
    : undefined;
};

/** Where a grounded presentation lives: on the statue, not on the figure. */
export const GROUND_SOCKET: SocketId = "base.platform";

/**
 * Can this hand take hold of something?
 *
 * A gesture is a statement to the devotee, and a hand making one is not
 * also carrying a trident. Everything else is available: attaching an item
 * sets the hand's mudra, so a hand configured to `open` with nothing in it
 * is free to close around whatever is put in it.
 */
function handIsFree(
  hands: HandsConfiguration,
  slot: ArmSlot,
  occupied: ReadonlySet<ArmSlot>,
  gestured: ReadonlySet<ArmSlot>,
): boolean {
  if (occupied.has(slot)) return false;
  // A gesture the POSE declared is part of that pose's identity and wins.
  if (gestured.has(slot)) return false;
  // A gesture the CUSTOMER chose for a hand also means that hand gestures.
  return !isGestureMudra(hands[slot]?.mudra ?? "open");
}

/** Does this presentation accept being anchored at this socket? */
function anchorAccepts(
  presentation: AttributePresentation,
  socket: SocketId,
  skeleton: SkeletonDefinition,
): boolean {
  switch (presentation.anchor.kind) {
    case "configured":
      return skeleton.sockets.some((s) => s.id === socket);
    case "hand":
      return handSlotOf(socket) !== undefined;
    case "socket":
      return presentation.anchor.socket === socket;
    case "ground":
      return skeleton.sockets.some((s) => s.id === GROUND_SOCKET);
  }
}

/** The socket a presentation resolves to, given the requested one. */
function anchorSocket(
  presentation: AttributePresentation,
  requested: SocketId,
): SocketId {
  if (presentation.anchor.kind === "socket") return presentation.anchor.socket;
  if (presentation.anchor.kind === "ground") return GROUND_SOCKET;
  return requested;
}

/**
 * Per-socket calibration, matched by full socket id or by the suffix after
 * the last dot (so one entry can speak for every `arm.*.hand.item`).
 */
function transformFor(asset: AssetDefinition, socket: SocketId): AssetTransform | undefined {
  const suffix = socket.split(".").pop() ?? socket;
  return asset.socketTransforms?.[socket] ?? asset.socketTransforms?.[suffix] ?? asset.defaultTransform;
}

export function resolveCharacterPresentation(
  config: CharacterConfiguration,
): ResolvedCharacter {
  // Offered or merely prepared: resolution needs a skeleton and a set of
  // assets, and both kinds of deity have them. Whether a customer may
  // CHOOSE this deity is the editor's question, not this one's.
  const deity = deityRuntime(config.deity);
  if (!deity) throw new Error(`No deity definition for "${config.deity}"`);

  const issues: ResolutionIssue[] = [];
  const note = (severity: ResolutionSeverity, message: string, about?: { assetId?: string; socket?: SocketId }) =>
    issues.push({ severity, message, ...about });

  // --- anatomy ------------------------------------------------------------
  // The body IS the anatomy: a mesh body's bones sit where its own joints
  // are, so it names the skeleton it was built for and everything follows
  // that. A procedural body is generated to whatever the deity brings.
  const bodyAsset = resolveAssetRef(config.parts.body);
  const bodySkeleton = bodyAsset?.skeleton ? getSkeleton(bodyAsset.skeleton) : undefined;
  if (bodyAsset?.skeleton && !bodySkeleton) {
    note("conflict", `Body "${bodyAsset.name}" names an unknown skeleton "${bodyAsset.skeleton}".`, {
      assetId: bodyAsset.id,
    });
  }
  const skeleton = bodySkeleton ?? deity.skeleton;

  const requestedArms = activeArmSlots(config.arms);
  const armSlots = requestedArms.filter((slot) => skeleton.armSlots.includes(slot));
  if (armSlots.length < requestedArms.length) {
    note(
      "note",
      `This body has ${skeleton.armSlots.length} arms; the extra pair is not rendered.`,
      { assetId: bodyAsset?.id },
    );
  }

  // --- pose and hands -----------------------------------------------------
  const preset = config.pose.preset ? getPosePreset(config.pose.preset) : undefined;
  if (config.pose.preset && !preset) {
    note("conflict", `Unknown pose preset "${config.pose.preset}"; the figure stays at rest.`);
  }
  const joints: Partial<Record<JointId, Vec3>> = { ...(preset?.joints ?? {}) };
  for (const [id, rotation] of Object.entries(config.pose.jointOverrides)) {
    joints[id as JointId] = rotation;
  }
  const pose: ResolvedPose = {
    presetId: config.pose.preset,
    preset,
    joints,
    seated: preset?.seated === true,
    garment: garmentFitOf(preset),
  };

  // A preset that raises a blessing arm is asserting that the hand
  // blesses, whatever the configuration still says it grips. Resolve once,
  // here, and every consumer agrees.
  const hands = resolveHands(config.hands, preset) as HandsConfiguration;
  const gestured = new Set<ArmSlot>(
    Object.entries(preset?.gestures ?? {})
      .filter(([, mudra]) => mudra !== undefined)
      .map(([slot]) => slot as ArmSlot),
  );

  // --- parts that absorb other parts --------------------------------------
  const integratedFeatures = new Set<string>();
  for (const ref of Object.values(config.parts)) {
    const asset = resolveAssetRef(ref);
    for (const feature of asset?.integratedFeatures ?? []) integratedFeatures.add(feature);
  }

  // --- attachments --------------------------------------------------------
  const socketIds = new Set<string>(skeleton.sockets.map((s) => s.id));
  const occupied = new Set<ArmSlot>();
  const attachments: ResolvedAttachment[] = [];

  for (const attachment of config.attachments) {
    const requested = attachment.socket as SocketId;
    const asset = resolveAssetRef(attachment.asset);
    if (!asset) {
      note("rejected", `Unknown attachment asset "${attachment.asset.assetId}".`, {
        socket: requested,
      });
      continue;
    }
    const about = { assetId: asset.id, socket: requested };

    // A part whose mesh already contains this feature suppresses it.
    const suffix = requested.split(".").pop() ?? requested;
    if (integratedFeatures.has(requested) || integratedFeatures.has(suffix)) continue;

    const requestedHand = handSlotOf(requested);
    if (requestedHand && !skeleton.armSlots.includes(requestedHand)) {
      note(
        "rejected",
        `${asset.name} is on a ${requestedHand} hand, which this body does not have.`,
        about,
      );
      continue;
    }
    // Asked for two arms while the item sits on a back hand: ordinary, and
    // silent — the customer can see the arms are gone.
    if (requestedHand && !armSlots.includes(requestedHand)) continue;
    if (!requestedHand && !socketIds.has(requested)) {
      note("rejected", `${asset.name} needs a ${requested} socket, which this body has no such seat for.`, about);
      continue;
    }

    const presentations = presentationsOf(asset);

    // 1. The presentation the customer's own socket implies, if it works.
    let chosen = presentations.find(
      (p) =>
        anchorAccepts(p, requested, skeleton) &&
        (!isHandheld(p) || (requestedHand !== undefined && handIsFree(hands, requestedHand, occupied, gestured))),
    );
    let socket = chosen ? anchorSocket(chosen, requested) : requested;
    let handSlot = chosen && isHandheld(chosen) ? requestedHand : undefined;

    // 2. Another declared presentation that needs no hand — a trishul
    //    would rather stand than be handed to someone else.
    if (!chosen) {
      const independent = presentations.find(
        (p) => p.autoSelectable && !isHandheld(p) && anchorAccepts(p, anchorSocket(p, requested), skeleton),
      );
      if (independent) {
        chosen = independent;
        socket = anchorSocket(independent, requested);
        handSlot = undefined;
        note(
          "conflict",
          `${asset.name} cannot be held in this pose — it is ${independent.label.toLowerCase()} instead.`,
          about,
        );
      }
    }

    // 3. A hand-agnostic attribute may move to a hand that is free.
    if (!chosen) {
      const movable = presentations.find((p) => p.autoSelectable && p.mobile && isHandheld(p));
      const free = movable
        ? armSlots.find((slot) => handIsFree(hands, slot, occupied, gestured))
        : undefined;
      if (movable && free) {
        chosen = movable;
        socket = `arm.${free}.hand.item` as SocketId;
        handSlot = free;
        note("conflict", `${asset.name} moved to the ${free} hand; the one it was in is gesturing.`, about);
      }
    }

    // 4. Nothing fits. Say which hand and why, rather than vanishing.
    if (!chosen) {
      const mudra = requestedHand ? hands[requestedHand]?.mudra : undefined;
      note(
        "rejected",
        requestedHand
          ? `${asset.name} was let go: the ${requestedHand} hand is performing ${mudra ?? "a gesture"} and cannot hold it.`
          : `${asset.name} has no presentation compatible with this configuration.`,
        about,
      );
      continue;
    }

    if (handSlot) occupied.add(handSlot);
    attachments.push({
      requestedSocket: requested,
      socket,
      asset,
      presentation: chosen,
      handSlot,
      offset: attachment.offset,
      transform: transformFor(asset, socket),
    });
  }

  // --- hand states the resolved attachments imply -------------------------
  // A hand holding something adopts the grip its presentation declares —
  // unless the POSE has already declared what that hand is doing, in which
  // case nothing is in it and there is nothing to adopt.
  const resolvedHands = { ...hands } as Record<ArmSlot, { mudra: MudraId }>;
  for (const attachment of attachments) {
    const slot = attachment.handSlot;
    if (!slot || gestured.has(slot)) continue;
    if (attachment.presentation.hand === "none") continue;
    resolvedHands[slot] = { mudra: attachment.presentation.hand };
  }

  return {
    deityId: deity.id,
    skeleton,
    armSlots,
    pose,
    hands: resolvedHands as HandsConfiguration,
    attachments,
    integratedFeatures,
    issues,
  };
}

/**
 * Part slots and sockets this configuration's own parts already provide.
 *
 * A body that is one continuous mesh brings its head, face, eyes and
 * hands with it. Offering the customer a Head picker in front of a figure
 * whose head is not swappable is not a customisation — it is an empty
 * grid — so the editor asks this and leaves the slot out, saying why.
 */
export function coveredFeatures(config: CharacterConfiguration): {
  features: ReadonlySet<string>;
  /** Which selected part provides them, for the explanation. */
  provider: AssetDefinition | undefined;
} {
  const features = new Set<string>();
  let provider: AssetDefinition | undefined;
  for (const ref of Object.values(config.parts)) {
    const asset = resolveAssetRef(ref);
    if (!asset?.integratedFeatures?.length) continue;
    provider ??= asset;
    for (const feature of asset.integratedFeatures) features.add(feature);
  }
  return { features, provider };
}

/** Issues the editor should show the customer. */
export function customerFacingIssues(
  resolved: ResolvedCharacter,
): readonly ResolutionIssue[] {
  return resolved.issues.filter((issue) => issue.severity !== "note");
}
