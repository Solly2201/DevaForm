/**
 * Asset system types.
 *
 * An asset is a versioned, registered 3D component. The UI consumes asset
 * metadata (never hardcoded lists); the engine resolves an AssetRef from a
 * CharacterConfiguration to a renderable source; the print pipeline will
 * later resolve the same ref to the print-resolution source.
 */
import type { DeityId, MaterialZone, PartSlot, SocketId } from "@devaform/character-schema";

/** Lifecycle stage of an asset version. */
export type AssetStage =
  | "concept" // reference/idea only, no loadable geometry yet
  | "source" // raw sculpt/scan/AI output, not loadable by the web engine
  | "prototype" // placeholder or unoptimized, fine for development
  | "experimental" // scripted/AI output under evaluation
  | "integration" // ingested and technically conformant, awaiting visual QA
  | "review" // in visual/cultural review for production promotion
  | "production" // artist-made or approved, cleaned, optimized
  | "deprecated"; // kept only so old saved characters still resolve

/** Stages whose assets may appear in the customer-facing picker. */
export const VISIBLE_STAGES: readonly AssetStage[] = [
  "prototype",
  "experimental",
  "integration",
  "review",
  "production",
];

/**
 * How an asset came to exist. Deliberately provider-agnostic: AI-generated,
 * artist-made, procedural and manually-cleaned assets are all just DevaForm
 * assets — provenance records the history without forking the pipeline.
 */
export interface AssetProvenance {
  type: "ai" | "artist" | "procedural" | "manual" | "imported";
  /** Service/provider for AI assets (e.g. "meshy", "tripo"). */
  provider?: string;
  /** Tool or script that produced/processed the asset. */
  tool?: string;
  /** Artist/creator credit for artist-made assets. */
  creator?: string;
  /** Reference images/boards the asset was produced against. */
  references?: readonly string[];
  notes?: string;
}

/** Measured geometry facts, captured at ingest/validation time. */
export interface GeometryMetadata {
  triangles?: number;
  vertices?: number;
  /** Axis-aligned bounds in metres [x, y, z]. */
  boundsM?: readonly [number, number, number];
}

/**
 * How the engine obtains renderable geometry for this asset.
 * - glb: load a GLB file from asset storage
 * - procedural: built in-engine by a registered generator (placeholders,
 *   parametric bases). Generators live in the engine, keyed by id, so the
 *   manifest stays pure data.
 */
export type AssetSource =
  | { kind: "glb"; path: string }
  | { kind: "procedural"; generatorId: string; params?: Record<string, number | string> };

/** What kind of component this asset is. Drives slot/socket handling. */
export type AssetKind =
  | { type: "part"; slot: PartSlot }
  | { type: "attachment"; sockets: readonly SocketId[] };

export interface AssetTransform {
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: number;
}

/**
 * How a hand holds this item. Attaching the item to a hand socket
 * auto-applies the mudra so the default grip always looks intentional.
 */
export interface GripMetadata {
  mudra: "hold" | "pinch" | "grip";
  /**
   * Grip frame — how the asset meets the hand's grip socket. Lets an
   * artist deliver a mesh in any local orientation and declare how it is
   * held; the engine aligns the frame to the socket relationally.
   *
   * origin: asset-local point that lands exactly on the grip socket
   *         (default: the asset origin — DevaForm's authoring convention).
   * axis:   asset-local direction that runs along the grip channel — up
   *         the shaft/stem (default [0, 1, 0]).
   * roll:   rotation around the grip channel after alignment, radians
   *         (default 0).
   *
   * Note: keepUpright items are re-verticalized in world space after
   * posing, which supersedes the frame's world orientation by design.
   */
  origin?: readonly [number, number, number];
  axis?: readonly [number, number, number];
  roll?: number;
}

export interface PrintabilityMetadata {
  /** Whether a print-resolution source exists for this version. */
  printSourceAvailable: boolean;
  /** Minimum recommended statue height in mm for this component's detail. */
  minStatueHeightMm?: number;
  notes?: string;
}

/**
 * Torso/limb surfaces measured off a body asset's actual mesh, in the
 * local spaces the engine's fitting code uses (belly relative to the spine
 * joint, chest relative to the chest joint, collar seat relative to the
 * necklace socket, all in canonical metres).
 *
 * Procedural bodies derive these from their params — the formulas mirror
 * the generator. A mesh body has no formulas to mirror, so it ships the
 * measurements instead, and ornaments fit the surface that actually
 * exists. Produced by the asset's build script; never hand-tuned.
 */
export interface MeasuredBodySurfaces {
  /** Distance from the spine joint up to the chest joint. */
  spineToChestY: number;
  neckRadius: number;
  neckBaseOffsetY: number;
  pelvisHalfWidth: number;
  /** Pelvis-joint-local height of the natural waist — where a wrap ties. */
  waistSeatY: number;
  dhotiRadius: number;
  bellyCenterY: number;
  bellyCenterZ: number;
  bellyRadiusX: number;
  bellyRadiusY: number;
  bellyRadiusZ: number;
  chestCenterY: number;
  chestCenterZ: number;
  chestRadiusX: number;
  chestRadiusY: number;
  chestRadiusZ: number;
  /**
   * Where a band ornament seats on each limb and how wide the limb is
   * there: armlet on the upper arm, bangle above the wrist, anklet above
   * the foot. Offsets are measured down from the owning joint.
   */
  armBandOffsetY: number;
  armBandRadius: number;
  wristBandOffsetY: number;
  wristBandRadius: number;
  ankleBandOffsetY: number;
  ankleBandRadius: number;
  /** Cranium the hair and crown must fit, head-joint-local. */
  headCenterY: number;
  headRadius: number;
  /** The leg a wrapped garment has to follow, joint to joint. */
  thighTopRadius: number;
  thighMidRadius: number;
  kneeRadius: number;
  calfRadius: number;
  thighLength: number;
  shinLength: number;
  legSpreadX: number;
  thighSeatY: number;
  /** Where the necklace socket sits on this body, chest-joint-local. */
  necklaceSocketY: number;
  necklaceSocketZ: number;
}

/**
 * The front of the torso, measured off the mesh as a height field in the
 * chest joint's space: `depth[row * columns + col]` is the frontmost z at
 * that grid point.
 *
 * An ellipsoid fitted to a torso is a fair description of its volume and a
 * poor description of its surface — it under-reports wherever the real
 * body is flatter or broader than the fit, and anything laid on that
 * answer sinks into the mesh. Bodies that can measure themselves ship this
 * instead, and everything that drapes on the chest asks it.
 */
export interface MeasuredTorsoFront {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  rows: number;
  columns: number;
  depth: readonly number[];
}

/** A body asset's measured surfaces, plus how each morph target moves them. */
export interface MeasuredBodyProfile {
  base: MeasuredBodySurfaces;
  /** morph target name -> per-field delta at influence 1. */
  morphs?: Readonly<Record<string, Partial<MeasuredBodySurfaces>>>;
}

/**
 * How an attribute presents itself once it is held.
 *
 * This is a different question from `grip`, which says how the hand meets
 * the item. Presentation says what the item does in the world: a trishul
 * stands vertically with its head up and its butt on the ground however
 * the wrist is posed, because that is how the icon is read — while a
 * modak simply follows the palm that cradles it. Keeping the two apart is
 * what lets the wrist be posed freely without the attribute going with it.
 */
export interface ItemPresentation {
  /** Hold the item world-upright, whatever the joint chain does. */
  upright?: boolean;
  /**
   * A staff is planted: it reaches from the ground to above the figure,
   * and the hand grips it somewhere along its length rather than at its
   * end. The engine tells the generator how far the socket holding it
   * stands above the base, and the generator builds a shaft that long.
   */
  grounded?: boolean;
}

export interface AssetDefinition {
  /** Stable id, dot-namespaced: `<deity|shared>.<category>.<name>` */
  id: string;
  /** Monotonically increasing published version. */
  version: number;
  name: string;
  description?: string;
  kind: AssetKind;
  /** Deities this asset may be used with. */
  deityCompatibility: readonly (DeityId | "any")[];
  stage: AssetStage;
  source: AssetSource;
  /** Default transform applied when attached to its socket. */
  defaultTransform?: AssetTransform;
  /**
   * Per-socket transform overrides (matched by socket id, or by the suffix
   * after the last dot for arm sockets — e.g. "item" matches every
   * `arm.*.hand.item`). A lotus and an axe need different grips; a modak in
   * the trunk needs a different scale than in a palm.
   */
  socketTransforms?: Readonly<Record<string, AssetTransform>>;
  /** Hand-grip behavior for hand-held attachments. */
  grip?: GripMetadata;
  /**
   * Features whose geometry is PHYSICALLY EMBEDDED in this part's mesh
   * (complete sculpts, AI or artist). Entries are part slots ("eyes",
   * "trunk", "tusks", "ears") or attachment-socket suffixes ("crown").
   * The engine skips rendering the corresponding standalone
   * parts/attachments so a complete head doesn't double its ears or wear
   * a second crown.
   *
   * This is a truthful statement about the mesh, not a product-level
   * customization policy: a feature must only be listed here if it is
   * actually present, usable and intentionally authoritative in this
   * asset. Production heads should stay modular-friendly (few or no
   * integrated features). Pure data — no renderer special-casing per
   * asset.
   */
  integratedFeatures?: readonly string[];
  /**
   * Keep the attachment world-upright regardless of joint rotation —
   * classical iconography holds shafted attributes (axe, noose, goad,
   * lotus) vertical in any pose. Cradled items (modak) follow the palm.
   *
   * Shorthand for `presentation: { upright: true }`, which is the fuller
   * statement of the same idea.
   */
  keepUpright?: boolean;
  /** How this item presents itself once a hand holds it. */
  presentation?: ItemPresentation;
  /**
   * Material zones this asset participates in. The engine colors the asset's
   * meshes from the configuration's zone materials via mesh naming
   * conventions (see docs/asset-specification.md).
   */
  materialZones: readonly MaterialZone[];
  /**
   * Body-slot assets only: the skeleton this body's geometry was built
   * for, by id. A mesh body IS the anatomy — its bones sit where its
   * joints actually are — so the rig follows the body rather than the
   * deity's default. Omit for procedural bodies, which are generated to
   * whatever skeleton the deity brings.
   */
  skeleton?: string;
  /** Morph target names this asset's meshes expose (empty for rigid parts). */
  morphTargets?: readonly string[];
  /**
   * Body-slot assets only: measured attachment surfaces for this mesh.
   * Present when the geometry was built rather than generated, so the
   * engine can fit against real measurements instead of re-deriving them
   * from params it does not have.
   */
  bodyProfile?: MeasuredBodyProfile;
  /** Body-slot assets: the measured front of this mesh's torso. */
  torsoFront?: MeasuredTorsoFront;
  /** Asset ids this asset cannot combine with (e.g. two crowns). */
  excludes?: readonly string[];
  /** Categorization for the editor UI. */
  category: string;
  /** Path to a pre-rendered thumbnail image (public URL). */
  thumbnail?: string;
  /** How this asset version was produced. Procedural assets may omit it —
   *  see getProvenance(). */
  provenance?: AssetProvenance;
  /** Measured geometry facts (GLB assets; captured by ingest/validation). */
  geometry?: GeometryMetadata;
  /** Asset id this version supersedes/replaces (e.g. the prototype). */
  supersedes?: string;
  printability: PrintabilityMetadata;
  tags?: readonly string[];
}

/** Provenance with a sensible default for procedural sources. */
export function getProvenance(asset: AssetDefinition): AssetProvenance {
  if (asset.provenance) return asset.provenance;
  if (asset.source.kind === "procedural") {
    return { type: "procedural", tool: `generator:${asset.source.generatorId}` };
  }
  return { type: "imported" };
}

/** An editor category as shown in the sidebar. Pure data, UI consumes it. */
export interface EditorCategory {
  id: string;
  label: string;
  icon: string; // icon key resolved by the UI
  description: string;
  /**
   * What the category edits:
   * - parts: one or more part slots (asset grids per slot)
   * - sockets: attachment sockets (asset grid per socket, with "none")
   * - pose | materials | base | morphs: dedicated panels
   */
  content:
    | { type: "parts"; slots: readonly PartSlot[] }
    | { type: "sockets"; sockets: readonly SocketId[]; allowNone: boolean }
    | {
        type: "mixed";
        slots: readonly PartSlot[];
        sockets: readonly SocketId[];
        allowNone: boolean;
      }
    | { type: "hands" }
    | { type: "pose" }
    | { type: "materials" }
    | { type: "base" };
}
