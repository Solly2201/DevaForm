/**
 * Asset registry — the single lookup point for asset metadata.
 *
 * Today it is backed by in-repo manifests; later the same interface is
 * served from the database/asset service without changing consumers.
 */
import type { AssetRef, DeityId, PartSlot, SocketId } from "@devaform/character-schema";
import { DEITIES } from "./deities";
import { SHARED_ASSETS } from "./manifests/shared";
import type { AssetDefinition } from "./types";

// Deity manifests plus assets shared across deities (a human body is not
// anyone's private property). Compatibility still decides who is offered
// what — see listAssets/isAssetCompatible.
const ALL_ASSETS: readonly AssetDefinition[] = [
  ...DEITIES.flatMap((deity) =>
    deity.available ? deity.assets : (deity.preparing?.assets ?? []),
  ),
  ...SHARED_ASSETS,
];

const byId = new Map<string, AssetDefinition>();
for (const asset of ALL_ASSETS) {
  if (byId.has(asset.id)) {
    throw new Error(`Duplicate asset id in manifest: ${asset.id}`);
  }
  byId.set(asset.id, asset);
}

export function getAsset(id: string): AssetDefinition | undefined {
  return byId.get(id);
}

/**
 * Resolve an AssetRef from a configuration. Returns undefined for unknown
 * ids (a save referencing a removed asset) — callers must handle that
 * gracefully rather than crash the editor.
 */
export function resolveAssetRef(ref: AssetRef | null | undefined): AssetDefinition | undefined {
  if (!ref) return undefined;
  const asset = byId.get(ref.assetId);
  // Manifest holds the latest published version of each asset. An older
  // requested version still resolves (same id) — full multi-version storage
  // arrives with DB-backed assets.
  return asset;
}

export function listAssets(filter?: {
  deity?: DeityId;
  slot?: PartSlot;
  socket?: SocketId;
  category?: string;
  includeDeprecated?: boolean;
}): AssetDefinition[] {
  return ALL_ASSETS.filter((asset) => {
    if (!filter) return true;
    if (!filter.includeDeprecated && asset.stage === "deprecated") return false;
    if (
      filter.deity &&
      !asset.deityCompatibility.includes("any") &&
      !asset.deityCompatibility.includes(filter.deity)
    ) {
      return false;
    }
    if (filter.slot && !(asset.kind.type === "part" && asset.kind.slot === filter.slot)) return false;
    if (
      filter.socket &&
      !(asset.kind.type === "attachment" && asset.kind.sockets.includes(filter.socket))
    ) {
      return false;
    }
    if (filter.category && asset.category !== filter.category) return false;
    return true;
  });
}

/** True when `asset` may attach to `socket` for `deity`. */
export function isAssetCompatible(asset: AssetDefinition, deity: DeityId, socket?: SocketId): boolean {
  const deityOk =
    asset.deityCompatibility.includes("any") || asset.deityCompatibility.includes(deity);
  if (!deityOk) return false;
  if (socket) {
    return asset.kind.type === "attachment" && asset.kind.sockets.includes(socket);
  }
  return true;
}

/** Latest published ref for an asset id. */
export function latestRef(assetId: string): AssetRef {
  const asset = byId.get(assetId);
  if (!asset) throw new Error(`Unknown asset id: ${assetId}`);
  return { assetId: asset.id, version: asset.version };
}
