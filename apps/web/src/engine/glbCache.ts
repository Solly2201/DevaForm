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

export function subscribeGlbCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Current cache state for a path; kicks off the load on first request. */
export function getGlb(path: string): GlbEntry {
  const existing = cache.get(path);
  if (existing) return existing;

  const entry: GlbEntry = { status: "loading" };
  cache.set(path, entry);
  loader ??= new GLTFLoader();
  loader.load(
    path,
    (gltf) => {
      cache.set(path, { status: "loaded", scene: gltf.scene });
      notify();
    },
    undefined,
    (error) => {
      const message = error instanceof Error ? error.message : `Failed to load ${path}`;
      console.error(`GLB load failed: ${path}`, error);
      cache.set(path, { status: "error", message });
      notify();
    },
  );
  return entry;
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
    const remap = (material: THREE.Material): THREE.Material => {
      if (isZoneName(material.name)) {
        return materials.get(material.name.slice("zone:".length) as MaterialZone);
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
