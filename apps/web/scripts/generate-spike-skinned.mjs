/**
 * Stage-0 engine spike fixture: a skinned, morphable test limb.
 *
 * Deterministic, tiny, and deliberately NOT a product asset — it lives in
 * public/spike/ (outside the asset tree) and is referenced only by the
 * /dev/skinned engine test page. Its job is to exercise the generic
 * contract end to end:
 *
 *   - one continuous mesh (no primitive assembly)
 *   - three bones named after canonical joint ids, written with "_" for
 *     "." because glTF/three strip dots from node names
 *   - bone rest transforms matching the canonical skeleton exactly
 *   - real skin weights blending across both joints
 *   - two visibly distinct morph targets ("spikeBulge", "spikeFlare")
 *   - a zone:skin material, so zone recoloring is proven for skinned meshes
 *
 * Run from apps/web:  node scripts/generate-spike-skinned.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// GLTFExporter's binary path reads Blobs via FileReader, which Node lacks.
if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      });
    }
  };
}

const OUT_DIR = path.resolve("public/spike");

// Canonical rest positions — MUST match packages/character-schema
// skeleton.ts (chest [0,0.78,0]; front-left arm chain hangs from it).
const UPPER_WORLD = new THREE.Vector3(0.175, 0.89, 0.045);
const FOREARM_LOCAL = new THREE.Vector3(0.02, -0.16, 0);
const HAND_LOCAL = new THREE.Vector3(0, -0.14, 0);

const FOREARM_WORLD = UPPER_WORLD.clone().add(FOREARM_LOCAL);
const HAND_WORLD = FOREARM_WORLD.clone().add(HAND_LOCAL);
// Run the tube a little past the wrist so the hand bone owns real weight.
const TIP_WORLD = HAND_WORLD.clone().add(new THREE.Vector3(0, -0.06, 0));

const RINGS = 25; // sample count along the limb
const SEGMENTS = 16; // vertices per ring

/** Point on the limb at chain parameter t: 0 upper, 1 forearm, 2 tip. */
function limbPoint(t) {
  if (t <= 1) return UPPER_WORLD.clone().lerp(FOREARM_WORLD, t);
  if (t <= 1.7) return FOREARM_WORLD.clone().lerp(HAND_WORLD, (t - 1) / 0.7);
  return HAND_WORLD.clone().lerp(TIP_WORLD, (t - 1.7) / 0.3);
}

const radiusAt = (t) => 0.05 - 0.02 * (t / 2);
const gaussian = (t, mean, sigma) => Math.exp(-(((t - mean) / sigma) ** 2));

function buildGeometry() {
  const positions = [];
  const normals = [];
  const skinIndices = [];
  const skinWeights = [];
  const bulge = [];
  const flare = [];
  const indices = [];

  for (let r = 0; r < RINGS; r += 1) {
    const t = (r / (RINGS - 1)) * 2;
    const center = limbPoint(t);
    const ahead = limbPoint(Math.min(2, t + 0.02));
    const behind = limbPoint(Math.max(0, t - 0.02));
    const axis = ahead.clone().sub(behind).normalize();
    // Stable frame: the limb runs mostly down -Y, so +Z is a safe seed.
    const side = new THREE.Vector3(0, 0, 1).cross(axis).normalize();
    const up = axis.clone().cross(side).normalize();

    // Weights: blend the two bones bracketing this ring.
    let indexA;
    let indexB;
    let weightB;
    if (t <= 1) {
      indexA = 0;
      indexB = 1;
      weightB = t;
    } else {
      indexA = 1;
      indexB = 2;
      weightB = Math.min(1, t - 1);
    }

    const bulgeAmount = 0.035 * gaussian(t, 1.0, 0.3);
    const flareAmount = 0.05 * gaussian(t, 2.0, 0.28);

    for (let s = 0; s < SEGMENTS; s += 1) {
      const angle = (s / SEGMENTS) * Math.PI * 2;
      const radial = side
        .clone()
        .multiplyScalar(Math.cos(angle))
        .add(up.clone().multiplyScalar(Math.sin(angle)))
        .normalize();
      const point = center.clone().add(radial.clone().multiplyScalar(radiusAt(t)));
      positions.push(point.x, point.y, point.z);
      normals.push(radial.x, radial.y, radial.z);
      skinIndices.push(indexA, indexB, 0, 0);
      skinWeights.push(1 - weightB, weightB, 0, 0);
      // Morph targets are stored as deltas (glTF semantics).
      bulge.push(radial.x * bulgeAmount, radial.y * bulgeAmount, radial.z * bulgeAmount);
      flare.push(radial.x * flareAmount, radial.y * flareAmount, radial.z * flareAmount);
    }
  }

  for (let r = 0; r < RINGS - 1; r += 1) {
    for (let s = 0; s < SEGMENTS; s += 1) {
      const next = (s + 1) % SEGMENTS;
      const a = r * SEGMENTS + s;
      const b = r * SEGMENTS + next;
      const c = (r + 1) * SEGMENTS + s;
      const d = (r + 1) * SEGMENTS + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  // End caps, so the fixture is a closed solid for STL export.
  const capCentre = (t, boneIndex, ringStart, flip) => {
    const centre = limbPoint(t);
    const index = positions.length / 3;
    positions.push(centre.x, centre.y, centre.z);
    const axis = t === 0 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, -1, 0);
    normals.push(axis.x, axis.y, axis.z);
    skinIndices.push(boneIndex, 0, 0, 0);
    skinWeights.push(1, 0, 0, 0);
    const flareAmount = t === 2 ? 0.05 : 0;
    bulge.push(0, 0, 0);
    flare.push(0, flareAmount * -1, 0);
    for (let s = 0; s < SEGMENTS; s += 1) {
      const next = (s + 1) % SEGMENTS;
      if (flip) indices.push(index, ringStart + next, ringStart + s);
      else indices.push(index, ringStart + s, ringStart + next);
    }
  };
  capCentre(0, 0, 0, false);
  capCentre(2, 2, (RINGS - 1) * SEGMENTS, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices);
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [
    new THREE.Float32BufferAttribute(bulge, 3),
    new THREE.Float32BufferAttribute(flare, 3),
  ];
  return geometry;
}

const root = new THREE.Group();
root.name = "spike_skinned_limb";

const upper = new THREE.Bone();
upper.name = "arm_frontLeft_upper";
upper.position.copy(UPPER_WORLD);
const forearm = new THREE.Bone();
forearm.name = "arm_frontLeft_forearm";
forearm.position.copy(FOREARM_LOCAL);
const hand = new THREE.Bone();
hand.name = "arm_frontLeft_hand";
hand.position.copy(HAND_LOCAL);
upper.add(forearm);
forearm.add(hand);
root.add(upper);

const material = new THREE.MeshStandardMaterial({ name: "zone:skin", roughness: 0.6 });
const mesh = new THREE.SkinnedMesh(buildGeometry(), material);
mesh.name = "spikeLimb";
mesh.morphTargetDictionary = { spikeBulge: 0, spikeFlare: 1 };
mesh.morphTargetInfluences = [0, 0];
root.add(mesh);

root.updateMatrixWorld(true);
mesh.bind(new THREE.Skeleton([upper, forearm, hand]));

const glb = await new Promise((resolve, reject) => {
  new GLTFExporter().parse(root, resolve, reject, { binary: true, onlyVisible: false });
});

await mkdir(OUT_DIR, { recursive: true });
const file = path.join(OUT_DIR, "skinned-limb.glb");
await writeFile(file, Buffer.from(glb));

const triangles = mesh.geometry.getIndex().count / 3;
console.log(`wrote ${file}`);
console.log(
  `  ${mesh.geometry.getAttribute("position").count} verts, ${triangles} tris, ` +
    `3 bones, morph targets: spikeBulge, spikeFlare`,
);
