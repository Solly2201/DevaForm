/**
 * Asset system types.
 *
 * An asset is a versioned, registered 3D component. The UI consumes asset
 * metadata (never hardcoded lists); the engine resolves an AssetRef from a
 * CharacterConfiguration to a renderable source; the print pipeline will
 * later resolve the same ref to the print-resolution source.
 */
import type { DeityId, MaterialZone, PartSlot, SocketId } from "@devaform/character-schema";
import { defaultPresentationFor, type AttributePresentation } from "./presentation";

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
  /**
   * Where the cranium sits front to back, in the head joint's own space.
   * The joint is at the base of the skull and behind it, so hair and
   * crowns seated on a cranium assumed to be centred on the joint land
   * half a skull too far back.
   */
  headCenterZ: number;
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
 * The torso and neck measured all the way round, in the chest joint's
 * space: a stack of horizontal slices, each with its own centre, each
 * sampled on a ring of bearings.
 *
 * `centreZ[row]` is that slice's own centre — a neck does not sit above
 * the middle of a chest — and `radius[row * columns + col]` is how far the
 * skin lies from it on that bearing, measured from the front (+Z) turning
 * toward the figure's left.
 *
 * Ornaments do not merely rest on the front of a body, they wrap it: a
 * serpent goes round a neck, a thread crosses a shoulder, a sash passes
 * behind a waist. None of those can be placed against an ellipsoid fitted
 * to the torso — it under-reports the surface wherever the real body is
 * flatter or broader, and stops answering entirely beyond its own extent.
 */
export interface MeasuredTorsoSurface {
  minY: number;
  maxY: number;
  rows: number;
  columns: number;
  centreZ: readonly number[];
  radius: readonly number[];
}

/**
 * The legs' own extent, sampled top to bottom. `halfWidth[i]` is the
 * furthest either leg reaches sideways at that height; `frontZ`/`backZ`
 * are the furthest forward and back, relative to the pelvis joint.
 */
export interface MeasuredLegEnvelope {
  /** Pelvis-local heights of the first and last rows. */
  topY: number;
  bottomY: number;
  halfWidth: readonly number[];
  frontZ: readonly number[];
  backZ: readonly number[];
}

/** A body asset's measured surfaces, plus how each morph target moves them. */
export interface MeasuredBodyProfile {
  base: MeasuredBodySurfaces;
  /** morph target name -> per-field delta at influence 1. */
  morphs?: Readonly<Record<string, Partial<MeasuredBodySurfaces>>>;
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
  /**
   * Every relationship this attribute can have with the figure, in
   * preference order — see presentation.ts. The resolver picks exactly one
   * (resolveCharacterPresentation); the asset is never duplicated to
   * express a second way of being worn or held.
   *
   * Attachments that are simply seated where they are put may omit this.
   */
  presentations?: readonly AttributePresentation[];
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
  /**
   * Body-slot assets: which way the thumb points on each hand, in that
   * hand's own rest frame. A mesh body measures this rather than
   * assuming a convention — its hands are mirrored while the rig is
   * not, so no single constant reaches the thumb on both sides.
   */
  thumbAxes?: Readonly<Record<string, readonly [number, number, number]>>;
  /**
   * Body-slot assets: how wide a hole each hand leaves at each stage of
   * closing, measured off the mesh — `[influence, radius]` pairs, open to
   * shut.
   *
   * A hand modelled once and shipped as a curl morph can only be dialled,
   * and dialling it to a fixed amount gives every fist the same diameter.
   * That is why fingers met a drum head as readily as a staff's shaft. The
   * item declares the radius it presents at the grip; the engine reads
   * this curve and dials the influence that matches. Nothing is assumed
   * about a hand that has not measured itself.
   */
  gripApertures?: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  /** Body-slot assets: this mesh's torso and neck, measured all round. */
  torsoSurface?: MeasuredTorsoSurface;
  /**
   * Body-slot assets: how far the legs reach, at a stack of heights from
   * the hip to the ankle, in the pelvis joint's own space.
   *
   * What a wrapped lower garment has to contain. A mean limb radius is
   * not that: a calf bulges backward by half again its mean, and a dhoti
   * lofted from the mean leaves both calves standing outside the cloth
   * from behind while looking well fitted from the front.
   */
  legEnvelope?: MeasuredLegEnvelope;
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

/**
 * Every presentation this asset supports, in preference order.
 *
 * An attachment that declares none is simply seated where it is put, which
 * is true of most ornaments — so this always answers, and no caller has to
 * ask whether presentations exist.
 */
export function presentationsOf(asset: AssetDefinition): readonly AttributePresentation[] {
  if (asset.presentations?.length) return asset.presentations;
  const sockets = asset.kind.type === "attachment" ? asset.kind.sockets : [];
  return [defaultPresentationFor(sockets)];
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
