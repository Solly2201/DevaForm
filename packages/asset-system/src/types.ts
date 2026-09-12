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
}

export interface PrintabilityMetadata {
  /** Whether a print-resolution source exists for this version. */
  printSourceAvailable: boolean;
  /** Minimum recommended statue height in mm for this component's detail. */
  minStatueHeightMm?: number;
  notes?: string;
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
   * Keep the attachment world-upright regardless of joint rotation —
   * classical iconography holds shafted attributes (axe, noose, goad,
   * lotus) vertical in any pose. Cradled items (modak) follow the palm.
   */
  keepUpright?: boolean;
  /**
   * Material zones this asset participates in. The engine colors the asset's
   * meshes from the configuration's zone materials via mesh naming
   * conventions (see docs/asset-specification.md).
   */
  materialZones: readonly MaterialZone[];
  /** Morph target names this asset's meshes expose (empty for rigid parts). */
  morphTargets?: readonly string[];
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
