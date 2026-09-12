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
import {
  SKELETON,
  createDefaultGaneshaConfiguration,
  type JointId,
} from "@devaform/character-schema";
import { getAsset } from "@devaform/asset-system";
import { ATTACHMENT_GENERATORS, PART_GENERATORS, type GeneratorContext } from "./generators";
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
  materials.applyConfiguration(createDefaultGaneshaConfiguration().materials);
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

async function buildThumbnailObject(assetId: string): Promise<THREE.Object3D | null> {
  const asset = getAsset(assetId);
  if (!asset) return null;
  const { materials } = getShared();
  const config = createDefaultGaneshaConfiguration();
  const ctx: GeneratorContext = {
    params: asset.source.kind === "procedural" ? (asset.source.params ?? {}) : {},
    materials,
    proportions: config.proportions,
    morphs: {},
    hands: config.hands,
    arms: config.arms,
    seated: false,
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
    for (const { joint, object } of generator(ctx)) {
      joints.get(joint)?.add(object);
      // Walk to the skeleton root once so the whole assembly is captured.
      if (!rootJointHolder) {
        let walker: THREE.Object3D | undefined = joints.get(joint);
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
      const object = await buildThumbnailObject(assetId);
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
