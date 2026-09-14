/**
 * Where an asset's files live on disk.
 *
 * Storage is organised by WHAT AN ASSET IS — a body, a head, a garment, a
 * held attribute — because that is what makes a tree legible to a human
 * opening it, and because it is what lets a second deity reuse the first
 * one's work instead of copying it.
 *
 *   assets/
 *     foundations/   bodies, heads, skeletons — what a character is built on
 *     features/      faces, hair, eyes, ears, hands — what varies on it
 *     clothing/
 *     ornaments/     worn: crowns, necklaces, bands, tilaks
 *     attributes/    held: weapons, instruments, offerings
 *     companions/
 *     characters/    COMPOSITIONS — which of the above a deity is made of
 *     environments/
 *     presentation/  cameras, lighting, intros, transitions
 *
 * Two rules keep this organisational rather than semantic:
 *
 * 1. The registry is the source of truth. A path is storage, never
 *    identity — nothing resolves an asset by walking this tree.
 * 2. A character COMPOSES; it does not own. characters/shiva describes
 *    which body, head, garment and attributes make Shiva. It does not
 *    contain a private copy of any of them, which is the whole reason a
 *    human body can be shared and a Ganesha head cannot be duplicated
 *    into two deities' folders and then drift apart.
 *
 * This file replaced deriving the path from the asset ID by splitting it
 * on dots. That made the filesystem a projection of identity: rename a
 * deity and every file moved; share a body between two deities and it had
 * nowhere to go.
 */

/** Part slots that are what a figure is built ON. */
const FOUNDATION_SLOTS = { body: "bodies", head: "heads" };

/** Part slots that are what varies on a figure. */
const FEATURE_SLOTS = new Set(["eyes", "ears", "hair", "hands", "trunk", "tusks"]);

const CLOTHING_SLOTS = new Set(["lowerGarment", "upperGarment"]);

const ORNAMENT_SLOTS = new Set(["earrings", "armlets", "bracelets", "anklets"]);

/**
 * The storage area for an asset, from its kind.
 *
 * `kind` is the manifest's own AssetKind: { type: "part", slot } or
 * { type: "attachment", sockets }. An attachment's area comes from the
 * SOCKET it mounts on, which is a real rig relationship — held in a hand,
 * standing on the base, worn on the body. The manifest `category` is a UI
 * grouping and cannot be trusted for this: the kalash is filed under
 * "attributes" and is a companion.
 */
export function storageArea(kind) {
  if (kind?.type === "part") {
    const slot = kind.slot;
    if (FOUNDATION_SLOTS[slot]) return `foundations/${FOUNDATION_SLOTS[slot]}`;
    if (FEATURE_SLOTS.has(slot)) return `features/${slot}`;
    if (CLOTHING_SLOTS.has(slot)) return "clothing";
    if (ORNAMENT_SLOTS.has(slot)) return "ornaments";
    return "features";
  }
  const sockets = (kind?.sockets ?? []).map(String);
  // Held in a hand is an attribute; standing on the base is a companion;
  // worn anywhere on the body is an ornament.
  if (sockets.some((socket) => socket.includes(".hand."))) return "attributes";
  if (sockets.some((socket) => socket.startsWith("base."))) return "companions";
  return "ornaments";
}

/**
 * The directory name for one asset within its area.
 *
 * Deity-specific work keeps its deity in the name — two deities' heads
 * live side by side under foundations/heads, and "classic-sculpt" alone
 * would not say whose. Shared work does not: a human body belongs to
 * nobody, which is the point of it.
 */
export function storageName(assetId, { shared = false } = {}) {
  const parts = String(assetId).split(".");
  const owner = parts[0];
  const leaf = parts.slice(2).join("-") || parts.slice(1).join("-");
  if (shared || owner === "humanoid" || owner === "shared") return leaf;
  return `${owner}-${leaf}`;
}

/** Full storage directory, relative to public/assets. */
export function storageDir(assetId, kind, version) {
  return `${storageArea(kind)}/${storageName(assetId)}/${version}`;
}

/** Public URL of a file in that directory. */
export function storagePath(assetId, kind, version, file = "model.glb") {
  return `/assets/${storageDir(assetId, kind, version)}/${file}`;
}
