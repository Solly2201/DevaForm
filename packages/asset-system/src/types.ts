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
  | "source" // raw sculpt/scan/AI output, not loadable by the web engine
  | "prototype" // placeholder or unoptimized, fine for development
  | "production" // cleaned, rigged, optimized, print-validated
  | "deprecated"; // kept only so old saved characters still resolve

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
  /** Path to a thumbnail image, if one has been rendered. */
  thumbnail?: string;
  printability: PrintabilityMetadata;
  tags?: readonly string[];
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
    | { type: "pose" }
    | { type: "materials" }
    | { type: "base" }
    | { type: "morphs" };
}
