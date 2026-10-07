/**
 * GLB asset cache.
 *
 * Loads GLB files once via GLTFLoader, caches the parsed scene, and hands
 * out clones for rig assembly. Materials named `zone:<zone>` inside a GLB
 * are remapped to the live user-controlled zone materials (per the Asset
 * Specification); all other materials are kept as authored.
 *
 * Loading is async while rig assembly is sync: a rig built before a GLB
 * arrives simply omits it, and cache subscribers (CharacterRoot) trigger a
 * rebuild when the load completes.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { MATERIAL_ZONES, type MaterialZone } from "@devaform/character-schema";
import { collectSkinnedMeshes } from "./skinning";
import { isFixedMaterialKey, type FixedMaterialKey, type ZoneMaterials } from "./materials";

export type GlbEntry =
  | { status: "loading" }
  | { status: "loaded"; scene: THREE.Group }
  | { status: "error"; message: string };

const cache = new Map<string, GlbEntry>();
const listeners = new Set<() => void>();
let loader: GLTFLoader | null = null;
/** One in-flight load per path, so two askers never fetch the same file. */
const inFlight = new Map<string, Promise<THREE.Group>>();

export function subscribeGlbCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Fetch and parse a path once, however many callers ask for it.
 *
 * The rig asks synchronously and rebuilds when the notification comes;
 * the thumbnail renderer awaits. Both now arrive here, so a GLB that is
 * both worn by the figure and pictured on a card is one download.
 */
function loadOnce(path: string): Promise<THREE.Group> {
  const started = inFlight.get(path);
  if (started) return started;
  loader ??= new GLTFLoader();
  /**
   * `load`, not `loadAsync`.
   *
   * The two are the same request, but `loadAsync` is a convenience the
   * base Loader adds and the tests' disk-backed stub does not have — it
   * implements the one method this module has always called. Depending on
   * the other would have made 197 engine tests fail on a change that is
   * about how many times a file is fetched.
   */
  const loading = new Promise<THREE.Group>((resolve, reject) => {
    loader!.load(
      path,
      (gltf) => {
        cache.set(path, { status: "loaded", scene: gltf.scene });
        notify();
        resolve(gltf.scene);
      },
      undefined,
      (error) => {
        const message = error instanceof Error ? error.message : `Failed to load ${path}`;
        console.error(`GLB load failed: ${path}`, error);
        cache.set(path, { status: "error", message });
        // A failed load is not remembered as in flight: a customer who
        // comes back to an asset after a dropped connection should get
        // another attempt rather than the same rejection for ever.
        inFlight.delete(path);
        notify();
        reject(error instanceof Error ? error : new Error(message));
      },
    );
  });
  inFlight.set(path, loading);
  return loading;
}

/** Current cache state for a path; kicks off the load on first request. */
export function getGlb(path: string): GlbEntry {
  const existing = cache.get(path);
  if (existing) return existing;

  const entry: GlbEntry = { status: "loading" };
  cache.set(path, entry);
  // The rig is built synchronously and rebuilt on notify, so the promise
  // is not the rig's business; the rejection is already reported above.
  void loadOnce(path).catch(() => undefined);
  return entry;
}

/**
 * The same file, awaited.
 *
 * For callers that are already asynchronous — the thumbnail renderer —
 * and which would otherwise keep a loader of their own. It did, and so
 * the Studio's first load downloaded the Ganesha head twice: once to
 * stand the figure up and once more to draw a hundred-and-sixty-pixel
 * picture of it on the card beside it. Measured at 1271 kB each.
 */
export function loadGlbScene(path: string): Promise<THREE.Group> {
  const existing = cache.get(path);
  if (existing?.status === "loaded") return Promise.resolve(existing.scene);
  if (!existing) cache.set(path, { status: "loading" });
  return loadOnce(path);
}

function isZoneName(name: string): name is `zone:${MaterialZone}` {
  return (
    name.startsWith("zone:") &&
    (MATERIAL_ZONES as readonly string[]).includes(name.slice("zone:".length))
  );
}

/**
 * `fixed:<key>` names the engine's non-configurable materials — eye white,
 * iris, ivory and the rest. A mesh asset uses them for the parts of itself
 * that are not the customer's to recolour: eyes are eyes.
 */
function fixedMaterialKey(name: string): FixedMaterialKey | null {
  if (!name.startsWith("fixed:")) return null;
  const key = name.slice("fixed:".length);
  return isFixedMaterialKey(key) ? key : null;
}

/**
 * Deep-clone a loaded GLB scene for insertion into the rig. Zone-named
 * materials are swapped for the live shared zone materials; authored
 * materials are cloned per instance so disposal stays per-rig.
 *
 * Skinned scenes need SkeletonUtils: THREE.SkinnedMesh.copy() assigns the
 * SOURCE skeleton by reference, so a plain clone would leave every
 * instance sharing one set of bones — posing one would pose them all.
 */
export function instantiateGlb(scene: THREE.Group, materials: ZoneMaterials): THREE.Object3D {
  const clone =
    collectSkinnedMeshes(scene).length > 0 ? cloneSkinned(scene) : scene.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    // Geometry is shared with the cached source scene — rig disposal must
    // not free it (see disposeRig).
    object.userData.glbShared = true;
    object.castShadow = true;
    object.receiveShadow = true;
    // A mesh that ships vertex colours gets the variant that renders them.
    //
    // This is how a body says something about itself that the customer's
    // colour choice must survive: Shiva's throat carries the halahala as
    // a tint painted into the mesh, and it has to darken whatever skin
    // colour is chosen rather than replace it. A mesh with no colours
    // takes the plain zone material exactly as before.
    const patterned = object.geometry.getAttribute("color") !== undefined;
    const remap = (material: THREE.Material): THREE.Material => {
      if (isZoneName(material.name)) {
        const zone = material.name.slice("zone:".length) as MaterialZone;
        return patterned ? materials.getPatterned(zone) : materials.get(zone);
      }
      const fixed = fixedMaterialKey(material.name);
      if (fixed) return materials.fixed[fixed];
      return material;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(remap)
      : remap(object.material);
  });
  return clone;
}
