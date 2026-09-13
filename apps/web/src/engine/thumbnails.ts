/**
 * Real 3D asset thumbnails.
 *
 * Renders each asset's actual geometry (procedural or GLB) with the default
 * palette into a small offscreen WebGL canvas and caches the data URL.
 * Part assets that span joints are assembled on a rest-pose skeleton so
 * sets (anklets, hands…) show their real layout.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SKELETON, getSocket, type JointId } from "@devaform/character-schema";
import { AVAILABLE_DEITIES, getAsset } from "@devaform/asset-system";

/** Default configuration used for thumbnail materials/context. */
function thumbnailBaseConfig() {
  const deity = AVAILABLE_DEITIES[0];
  if (!deity) throw new Error("No available deity registered");
  return deity.createDefaultConfiguration();
}
import {
  ATTACHMENT_GENERATORS,
  PART_GENERATORS,
  deriveBodyProfile,
  type GeneratorContext,
} from "./generators";
import { ZoneMaterials } from "./materials";

const SIZE = 160;

let shared: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  materials: ZoneMaterials;
} | null = null;

const cache = new Map<string, Promise<string | null>>();
const gltfLoader = new GLTFLoader();

function getShared() {
  if (shared) return shared;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(SIZE, SIZE);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#efe9e2", "#403830", 0.9));
  const key = new THREE.DirectionalLight("#fff0da", 2.2);
  key.position.set(2, 3, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#ffe4b0", 1.2);
  rim.position.set(-1, 2, -3);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.001, 20);
  const materials = new ZoneMaterials();
  materials.applyConfiguration(thumbnailBaseConfig().materials);
  shared = { renderer, scene, camera, materials };
  return shared;
}

function buildRestSkeleton(): Map<JointId, THREE.Object3D> {
  const joints = new Map<JointId, THREE.Object3D>();
  const root = new THREE.Object3D();
  for (const def of SKELETON) {
    const joint = new THREE.Object3D();
    joint.position.set(...def.position);
    joints.set(def.id, joint);
    (def.parent ? joints.get(def.parent) : root)?.add(joint);
  }
  return joints;
}

/**
 * Build a standalone renderable for one asset (procedural parts are
 * assembled on a rest-pose skeleton; GLBs are loaded fresh). Shared by the
 * thumbnail renderer and the /dev/assets inspector.
 */
export async function buildAssetObject(
  assetId: string,
  materials: ZoneMaterials,
): Promise<THREE.Object3D | null> {
  const asset = getAsset(assetId);
  if (!asset) return null;
  const config = thumbnailBaseConfig();
  const ctx: GeneratorContext = {
    params: asset.source.kind === "procedural" ? (asset.source.params ?? {}) : {},
    materials,
    proportions: config.proportions,
    morphs: {},
    hands: config.hands,
    arms: config.arms,
    seated: false,
    // Thumbnails render against the canonical classic body measurements.
    body: deriveBodyProfile({ belly: 1 }, config.proportions),
  };

  if (asset.source.kind === "glb") {
    const gltf = await gltfLoader.loadAsync(asset.source.path).catch(() => null);
    return gltf ? gltf.scene.clone(true) : null;
  }
  if (asset.kind.type === "part") {
    const generator = PART_GENERATORS[asset.source.generatorId];
    if (!generator) return null;
    const joints = buildRestSkeleton();
    const container = new THREE.Group();
    let rootJointHolder: THREE.Object3D | null = null;
    for (const entry of generator(ctx)) {
      // Socket-mounted entries render at the socket's schema-default spot
      // (thumbnails have no owner parts to refine against).
      const jointId = entry.socket !== undefined ? getSocket(entry.socket).joint : entry.joint;
      const holder = joints.get(jointId);
      if (entry.socket !== undefined && holder) {
        const socketProxy = new THREE.Object3D();
        socketProxy.position.set(...getSocket(entry.socket).position);
        holder.add(socketProxy);
        socketProxy.add(entry.object);
      } else {
        holder?.add(entry.object);
      }
      // Walk to the skeleton root once so the whole assembly is captured.
      if (!rootJointHolder) {
        let walker: THREE.Object3D | undefined = holder;
        while (walker?.parent) walker = walker.parent;
        rootJointHolder = walker ?? null;
      }
    }
    if (rootJointHolder) container.add(rootJointHolder);
    return container;
  }
  const generator = ATTACHMENT_GENERATORS[asset.source.generatorId];
  return generator ? generator(ctx) : null;
}

function frameAndRender(object: THREE.Object3D): string | null {
  const { renderer, scene, camera } = getShared();
  scene.add(object);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    scene.remove(object);
    return null;
  }
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const distance = (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.15;
  camera.position.set(
    center.x + distance * 0.45,
    center.y + distance * 0.35,
    center.z + distance * 0.82,
  );
  camera.lookAt(center);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(object);
  object.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
  return url;
}

export function getAssetThumbnail(assetId: string): Promise<string | null> {
  const existing = cache.get(assetId);
  if (existing) return existing;
  const promise = (async () => {
    if (typeof window === "undefined") return null;
    try {
      const object = await buildAssetObject(assetId, getShared().materials);
      if (!object) return null;
      return frameAndRender(object);
    } catch (error) {
      console.warn(`Thumbnail failed for ${assetId}:`, error);
      return null;
    }
  })();
  cache.set(assetId, promise);
  return promise;
}
