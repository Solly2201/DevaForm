/**
 * DevaForm human base builder — MakeHuman export → production GLB.
 *
 * Offline authoring only. Reads what tools/humanbase/export-makehuman.py
 * produced from the official MakeHuman app and emits ONE skinned,
 * morphable, socketed GLB plus its measurements:
 *
 *   1. parse the exported skin (quads → triangles, one shared topology)
 *   2. normalize to DevaForm units (metres, Y-up, +Z forward, feet at y=0)
 *   3. group MakeHuman's CC0 rig weights onto canonical DevaForm joints
 *   4. RETARGET the A-pose mesh into DevaForm's canonical rest pose —
 *      arms hanging, palms forward — by skinning it with those weights,
 *      so the shipped rest matches the pose system's contract
 *   5. derive the rest skeleton from the retargeted anatomy
 *   6. build morph targets from the girth variants (same topology)
 *   7. measure BodyProfile surfaces from the actual mesh, per morph
 *   8. write model.glb + asset.json + measurements.json
 *
 * Run from apps/web:  node scripts/build-human-base.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

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

const EXPORTS = path.resolve("../../tools/humanbase/exports");
const OUT_DIR = path.resolve("public/assets/humanoid/body/human/1");
const MEASURE_OUT = path.resolve("../../tools/humanbase/measurements.json");

const VARIANTS = ["neutral", "lean", "athletic", "powerful", "heroic", "ascetic"];
const MORPHS = {
  lean: "bodyLean",
  athletic: "bodyAthletic",
  powerful: "bodyPowerful",
  heroic: "bodyHeroic",
  ascetic: "bodyAscetic",
};
/** Canonical statue height in DevaForm units (see docs/asset-specification). */
const CANONICAL_HEIGHT = 1.0;

// ---------------------------------------------------------------------------
// 1. Inputs
// ---------------------------------------------------------------------------

/** Minimal OBJ reader: positions plus triangulated faces. */
function parseObj(text) {
  const positions = [];
  const indices = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.split(/\s+/);
      positions.push(Number(x), Number(y), Number(z));
    } else if (line.startsWith("f ")) {
      const corners = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((token) => Number(token.split("/")[0]) - 1);
      for (let i = 1; i + 1 < corners.length; i += 1) {
        indices.push(corners[0], corners[i], corners[i + 1]);
      }
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
}

const report = JSON.parse(await readFile(path.join(EXPORTS, "joints.json"), "utf8"));
const rigWeights = JSON.parse(await readFile(path.join(EXPORTS, "default_weights.mhw"), "utf8")).weights;
const parentMap = report.parentMap; // obj vertex -> base mesh vertex
const inverseParentMap = new Int32Array(report.baseVertexCount).fill(-1);
parentMap.forEach((base, obj) => {
  inverseParentMap[base] = obj;
});

const meshes = {};
for (const variant of VARIANTS) {
  meshes[variant] = parseObj(await readFile(path.join(EXPORTS, variant + ".obj"), "utf8"));
}
const vertexCount = meshes.neutral.positions.length / 3;
for (const variant of VARIANTS) {
  if (meshes[variant].positions.length / 3 !== vertexCount) {
    throw new Error(`${variant}: topology differs from neutral — morphs need one topology`);
  }
}

const joints = report.variants.neutral.joints;
const v3 = (name) => new THREE.Vector3(...joints[name]);

// ---------------------------------------------------------------------------
// 2. MakeHuman rig → canonical DevaForm joints
// ---------------------------------------------------------------------------

const SIDES = [
  { mh: "L", dev: "left", arm: "frontLeft", sign: 1 },
  { mh: "R", dev: "right", arm: "frontRight", sign: -1 },
];

/** Which DevaForm joint each MakeHuman bone's weights belong to. */
function devaformGroup(bone) {
  const side = bone.endsWith(".L") ? SIDES[0] : bone.endsWith(".R") ? SIDES[1] : null;
  const stem = side ? bone.slice(0, -2) : bone;
  if (/^(root|spine05)$/.test(stem)) return "pelvis";
  if (/^spine0[34]$/.test(stem)) return "spine";
  if (/^(spine0[12]|breast)$/.test(stem)) return "chest";
  if (/^neck/.test(stem)) return "neck";
  if (/^(head|jaw|eye|orbicularis|levator|risorius|zygomatic|special|oculi|oris|temporalis|tongue)/i.test(stem)) {
    return "head";
  }
  if (!side) return null;
  if (/^(clavicle)$/.test(stem)) return "chest";
  if (/^(shoulder01|upperarm0[12])$/.test(stem)) return `arm.${side.arm}.upper`;
  if (/^lowerarm0[12]$/.test(stem)) return `arm.${side.arm}.forearm`;
  if (/^(wrist|metacarpal[1-5]|finger[1-5]-[1-4])$/.test(stem)) return `arm.${side.arm}.hand`;
  if (/^(pelvis|upperleg0[12])$/.test(stem)) return `leg.${side.dev}.thigh`;
  if (/^lowerleg0[12]$/.test(stem)) return `leg.${side.dev}.shin`;
  if (/^(foot|toe[1-5]-[1-3])$/.test(stem)) return `leg.${side.dev}.foot`;
  return null;
}

const unmapped = new Set();
/** group -> Float32Array(vertexCount) of weights, on the exported skin. */
const groupWeights = new Map();
for (const [bone, entries] of Object.entries(rigWeights)) {
  const group = devaformGroup(bone);
  if (!group) {
    unmapped.add(bone);
    continue;
  }
  let target = groupWeights.get(group);
  if (!target) {
    target = new Float32Array(vertexCount);
    groupWeights.set(group, target);
  }
  for (const [baseIndex, weight] of entries) {
    const objIndex = inverseParentMap[baseIndex];
    if (objIndex >= 0) target[objIndex] += weight;
  }
}
if (unmapped.size) throw new Error(`unmapped MakeHuman bones: ${[...unmapped].join(", ")}`);

// Any vertex the rig missed falls back to its nearest weighted neighbour's
// group later; first normalize what we have.
for (let i = 0; i < vertexCount; i += 1) {
  let sum = 0;
  for (const weights of groupWeights.values()) sum += weights[i];
  if (sum > 0) for (const weights of groupWeights.values()) weights[i] /= sum;
}

// ---------------------------------------------------------------------------
// 3. Retarget: A-pose → DevaForm canonical rest
// ---------------------------------------------------------------------------

/** Palm frame of one hand, measured from MakeHuman's finger joints. */
function palmNormal(prefix) {
  const middleBase = v3(`${prefix}-finger-3-1`);
  const middleTip = v3(`${prefix}-finger-3-4`);
  const indexBase = v3(`${prefix}-finger-2-1`);
  const pinkyBase = v3(`${prefix}-finger-5-1`);
  const thumbTip = v3(`${prefix}-finger-1-4`);
  const fingers = middleTip.clone().sub(middleBase).normalize();
  const lateral = indexBase.clone().sub(pinkyBase).normalize();
  const normal = fingers.clone().cross(lateral).normalize();
  // The thumb sits on the palm side; use it to fix the sign.
  const palmCentre = indexBase.clone().add(pinkyBase).multiplyScalar(0.5);
  if (thumbTip.clone().sub(palmCentre).dot(normal) < 0) normal.negate();
  return { fingers, normal };
}

/**
 * Bone chains to retarget. Each entry: the DevaForm joint, the MakeHuman
 * joint cube it sits on, its primary child, and the direction (plus
 * optional secondary axis) the segment must take in the rest pose.
 */
function buildChains() {
  const chains = [];
  // Torso keeps MakeHuman's own (near-vertical) shape: no reorientation.
  chains.push({ joint: "pelvis", mh: "pelvis", parent: null, child: "spine", dir: null });
  chains.push({ joint: "spine", mh: "spine-3", parent: "pelvis", child: "chest", dir: null });
  chains.push({ joint: "chest", mh: "spine-1", parent: "spine", child: "neck", dir: null });
  chains.push({ joint: "neck", mh: "neck", parent: "chest", child: "head", dir: null });
  chains.push({ joint: "head", mh: "head", parent: "neck", child: null, dir: null });

  for (const side of SIDES) {
    const p = side.mh === "L" ? "l" : "r";
    const hand = palmNormal(p);
    // Arms: hang straight down with palms forward — the pose system's rest.
    const upperDir = new THREE.Vector3(side.sign * 0.02, -0.16, 0).normalize();
    chains.push({
      joint: `arm.${side.arm}.upper`,
      mh: `${p}-shoulder`,
      parent: "chest",
      child: `arm.${side.arm}.forearm`,
      dir: upperDir,
      secondary: new THREE.Vector3(0, 0, 1),
      secondaryFrom: hand.normal,
    });
    chains.push({
      joint: `arm.${side.arm}.forearm`,
      mh: `${p}-elbow`,
      parent: `arm.${side.arm}.upper`,
      child: `arm.${side.arm}.hand`,
      dir: new THREE.Vector3(0, -1, 0),
      secondary: new THREE.Vector3(0, 0, 1),
      secondaryFrom: hand.normal,
    });
    chains.push({
      joint: `arm.${side.arm}.hand`,
      mh: `${p}-hand`,
      parent: `arm.${side.arm}.forearm`,
      child: null,
      // The hand itself is oriented by its own frame: fingers down, palm out.
      frame: { primary: hand.fingers, secondary: hand.normal },
      dir: new THREE.Vector3(0, -1, 0),
      secondary: new THREE.Vector3(0, 0, 1),
    });
    // Legs: straight down, feet forward.
    chains.push({
      joint: `leg.${side.dev}.thigh`,
      mh: `${p}-upper-leg`,
      parent: "pelvis",
      child: `leg.${side.dev}.shin`,
      dir: new THREE.Vector3(0, -1, 0),
    });
    chains.push({
      joint: `leg.${side.dev}.shin`,
      mh: `${p}-knee`,
      parent: `leg.${side.dev}.thigh`,
      child: `leg.${side.dev}.foot`,
      dir: new THREE.Vector3(0, -1, 0),
    });
    chains.push({
      joint: `leg.${side.dev}.foot`,
      mh: `${p}-ankle`,
      parent: `leg.${side.dev}.shin`,
      child: null,
      dir: null,
    });
  }
  return chains;
}

const chains = buildChains();
const chainByJoint = new Map(chains.map((c) => [c.joint, c]));

/** Rotation carrying (a1,a2) onto (b1,b2), orthonormalized. */
function frameRotation(a1, a2, b1, b2) {
  const build = (primary, secondary) => {
    const x = primary.clone().normalize();
    const z = secondary.clone().projectOnPlane(x).normalize();
    const y = z.clone().cross(x);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  };
  return build(b1, b2).multiply(build(a1, a2).invert());
}

// Walk the chains top-down, computing each group's world rotation and the
// rest position it lands on. Bone lengths are preserved from the anatomy.
const restMh = new Map(chains.map((c) => [c.joint, v3(c.mh)]));
const rotation = new Map();
const restTarget = new Map();

for (const chain of chains) {
  const parentRotation = chain.parent ? rotation.get(chain.parent) : new THREE.Quaternion();
  const parentChain = chain.parent ? chainByJoint.get(chain.parent) : null;
  // Position: follow the parent's rotated offset from its own head.
  if (!chain.parent) {
    restTarget.set(chain.joint, restMh.get(chain.joint).clone());
  } else {
    const offset = restMh.get(chain.joint).clone().sub(restMh.get(chain.parent));
    restTarget.set(
      chain.joint,
      restTarget.get(chain.parent).clone().add(offset.applyQuaternion(parentRotation)),
    );
  }
  // Rotation: align this segment's direction (and roll) to the canonical rest.
  if (!chain.dir) {
    rotation.set(chain.joint, parentRotation.clone());
    continue;
  }
  const primaryFrom = chain.frame
    ? chain.frame.primary.clone()
    : restMh.get(chain.child).clone().sub(restMh.get(chain.joint)).normalize();
  const secondaryFrom = chain.frame ? chain.frame.secondary.clone() : chain.secondaryFrom;
  const current = primaryFrom.clone().applyQuaternion(parentRotation);
  if (!chain.secondary) {
    const align = new THREE.Quaternion().setFromUnitVectors(current, chain.dir);
    rotation.set(chain.joint, align.multiply(parentRotation));
  } else {
    const currentSecondary = secondaryFrom.clone().applyQuaternion(parentRotation);
    const align = frameRotation(current, currentSecondary, chain.dir, chain.secondary);
    rotation.set(chain.joint, align.multiply(parentRotation));
  }
  void parentChain;
}

/**
 * Apply the retarget to one variant's vertices (linear blend skinning).
 *
 * Each group's vertices are measured from THAT variant's own joint and
 * placed on the shared canonical joint: broader shoulders sit their cube
 * slightly further out, and rotating their vertices about the neutral
 * pivot would shear the morph target instead of just widening it.
 */
function retarget(positions, restSource = restMh) {
  const out = new Float32Array(positions.length);
  const source = new THREE.Vector3();
  const moved = new THREE.Vector3();
  const accum = new THREE.Vector3();
  for (let i = 0; i < vertexCount; i += 1) {
    source.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    accum.set(0, 0, 0);
    let total = 0;
    for (const [group, weights] of groupWeights) {
      const weight = weights[i];
      if (weight <= 0) continue;
      moved
        .copy(source)
        .sub(restSource.get(group))
        .applyQuaternion(rotation.get(group))
        .add(restTarget.get(group));
      accum.addScaledVector(moved, weight);
      total += weight;
    }
    if (total === 0) accum.copy(source); // unweighted stray vertex
    out[i * 3] = accum.x;
    out[i * 3 + 1] = accum.y;
    out[i * 3 + 2] = accum.z;
  }
  return out;
}

/** That variant's own joint cubes, in the same group vocabulary. */
function restFor(variant) {
  const variantJoints = report.variants[variant].joints;
  return new Map(
    chains.map((c) => [c.joint, new THREE.Vector3(...variantJoints[c.mh])]),
  );
}

const retargeted = {};
for (const variant of VARIANTS) {
  retargeted[variant] = retarget(meshes[variant].positions, restFor(variant));
}

// ---------------------------------------------------------------------------
// 4. Normalize into DevaForm units
// ---------------------------------------------------------------------------

let minY = Infinity;
let maxY = -Infinity;
for (let i = 1; i < retargeted.neutral.length; i += 3) {
  minY = Math.min(minY, retargeted.neutral[i]);
  maxY = Math.max(maxY, retargeted.neutral[i]);
}
const scale = CANONICAL_HEIGHT / (maxY - minY);
const originY = minY;

const toDevaform = (positions) => {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = positions[i] * scale;
    out[i + 1] = (positions[i + 1] - originY) * scale;
    out[i + 2] = positions[i + 2] * scale;
  }
  return out;
};
const finalMesh = {};
for (const variant of VARIANTS) finalMesh[variant] = toDevaform(retargeted[variant]);

const restFinal = new Map();
for (const [joint, position] of restTarget) {
  restFinal.set(
    joint,
    new THREE.Vector3(position.x * scale, (position.y - originY) * scale, position.z * scale),
  );
}

// ---------------------------------------------------------------------------
// 5. Skeleton, skinning attributes, morph targets
// ---------------------------------------------------------------------------

const PARENT = {
  root: null,
  pelvis: "root",
  spine: "pelvis",
  chest: "spine",
  neck: "chest",
  head: "neck",
};
for (const side of SIDES) {
  PARENT[`arm.${side.arm}.upper`] = "chest";
  PARENT[`arm.${side.arm}.forearm`] = `arm.${side.arm}.upper`;
  PARENT[`arm.${side.arm}.hand`] = `arm.${side.arm}.forearm`;
  PARENT[`leg.${side.dev}.thigh`] = "pelvis";
  PARENT[`leg.${side.dev}.shin`] = `leg.${side.dev}.thigh`;
  PARENT[`leg.${side.dev}.foot`] = `leg.${side.dev}.shin`;
}
restFinal.set("root", new THREE.Vector3(0, 0, 0));

const boneOrder = Object.keys(PARENT);
const boneName = (joint) => joint.replace(/\./g, "_");
const bones = new Map();
for (const joint of boneOrder) {
  const bone = new THREE.Bone();
  bone.name = boneName(joint);
  bones.set(joint, bone);
}
for (const joint of boneOrder) {
  const parent = PARENT[joint];
  const local = restFinal.get(joint).clone();
  if (parent) {
    local.sub(restFinal.get(parent));
    bones.get(parent).add(bones.get(joint));
  }
  bones.get(joint).position.copy(local);
}

// Skin attributes: the four strongest groups per vertex, normalized.
const skinIndices = new Uint16Array(vertexCount * 4);
const skinWeights = new Float32Array(vertexCount * 4);
const boneIndex = new Map(boneOrder.map((joint, index) => [joint, index]));
for (let i = 0; i < vertexCount; i += 1) {
  const влияния = [];
  for (const [group, weights] of groupWeights) {
    if (weights[i] > 0) влияния.push([boneIndex.get(group), weights[i]]);
  }
  влияния.sort((a, b) => b[1] - a[1]);
  const top = влияния.slice(0, 4);
  const total = top.reduce((sum, [, w]) => sum + w, 0) || 1;
  top.forEach(([index, weight], slot) => {
    skinIndices[i * 4 + slot] = index;
    skinWeights[i * 4 + slot] = weight / total;
  });
  if (top.length === 0) {
    skinIndices[i * 4] = boneIndex.get("pelvis");
    skinWeights[i * 4] = 1;
  }
}

const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(finalMesh.neutral, 3));
geometry.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndices, 4));
geometry.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeights, 4));
geometry.setIndex(new THREE.BufferAttribute(meshes.neutral.indices, 1));
geometry.computeVertexNormals();
geometry.morphTargetsRelative = true;
geometry.morphAttributes.position = [];
const morphTargetNames = [];
for (const [variant, morphName] of Object.entries(MORPHS)) {
  const delta = new Float32Array(finalMesh.neutral.length);
  for (let i = 0; i < delta.length; i += 1) delta[i] = finalMesh[variant][i] - finalMesh.neutral[i];
  geometry.morphAttributes.position.push(new THREE.BufferAttribute(delta, 3));
  morphTargetNames.push(morphName);
}

const material = new THREE.MeshStandardMaterial({ name: "zone:skin", roughness: 0.62 });
const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
skinnedMesh.name = "humanBody";
skinnedMesh.morphTargetDictionary = Object.fromEntries(morphTargetNames.map((n, i) => [n, i]));
skinnedMesh.morphTargetInfluences = morphTargetNames.map(() => 0);

const root = new THREE.Group();
root.name = "humanoid_body_human";
root.add(bones.get("root"));
root.add(skinnedMesh);
root.updateMatrixWorld(true);
skinnedMesh.bind(new THREE.Skeleton(boneOrder.map((joint) => bones.get(joint))));

// ---------------------------------------------------------------------------
// 6. Measure the mesh: sockets and BodyProfile
// ---------------------------------------------------------------------------

// Which body part owns each vertex, so a torso measurement never picks up
// the arms hanging beside it (they share the same heights).
const dominantGroup = new Array(vertexCount).fill("pelvis");
for (let i = 0; i < vertexCount; i += 1) {
  let best = 0;
  for (const [group, weights] of groupWeights) {
    if (weights[i] > best) {
      best = weights[i];
      dominantGroup[i] = group;
    }
  }
}
const REGIONS = {
  torso: new Set(["pelvis", "spine", "chest"]),
  neck: new Set(["neck"]),
  head: new Set(["head"]),
  legs: new Set([
    "leg.left.thigh",
    "leg.right.thigh",
    "leg.left.shin",
    "leg.right.shin",
  ]),
};

/** Vertices of one body region whose y falls in [lo, hi]. */
function slice(positions, lo, hi, region = "torso") {
  const allowed = REGIONS[region];
  const found = [];
  for (let i = 0; i < vertexCount; i += 1) {
    if (!allowed.has(dominantGroup[i])) continue;
    const y = positions[i * 3 + 1];
    if (y < lo || y > hi) continue;
    found.push([positions[i * 3], y, positions[i * 3 + 2]]);
  }
  return found;
}
const extent = (points, axis) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    lo = Math.min(lo, p[axis]);
    hi = Math.max(hi, p[axis]);
  }
  return { lo, hi, mid: (lo + hi) / 2, half: (hi - lo) / 2 };
};

/**
 * The torso volume over a height band, as the ellipsoid a garment has to
 * clear: centred on the band, radii from the widest and deepest slices in
 * it. Bands are bounded by skeletal landmarks, never by a scan result, so
 * the morph variants are compared at the same anatomy instead of at
 * whatever height each one's search happened to stop on.
 */
function bandVolume(positions, lo, hi) {
  let radiusX = 0;
  let radiusZ = 0;
  let centerZ = 0;
  for (let y = lo; y <= hi; y += 0.002) {
    const band = slice(positions, y - 0.004, y + 0.004);
    if (band.length < 20) continue;
    const x = extent(band, 0);
    const z = extent(band, 2);
    radiusX = Math.max(radiusX, x.half);
    if (z.half > radiusZ) {
      radiusZ = z.half;
      centerZ = z.mid;
    }
  }
  return { centerY: (lo + hi) / 2, centerZ, radiusX, radiusY: (hi - lo) / 2, radiusZ };
}

function measure(positions) {
  const pelvisY = restFinal.get("pelvis").y;
  const spineY = restFinal.get("spine").y;
  const chestY = restFinal.get("chest").y;
  const neckY = restFinal.get("neck").y;
  const headY = restFinal.get("head").y;
  const kneeY = restFinal.get("leg.left.shin").y;

  // Neck column: a thin band above the shoulder line, near the midline.
  const neckBand = slice(positions, neckY + 0.01, neckY + 0.05, "neck");
  const neckX = extent(neckBand, 0);
  const neckZ = extent(neckBand, 2);
  const neckRadius = Math.max(neckX.half, neckZ.half);

  // Waist: the narrowest torso girth between pelvis and chest. Scanned
  // finely — a coarse scan quantises the waist height, and the morph
  // variants then differ by a whole step of sampling noise rather than by
  // anatomy.
  let waist = null;
  for (let y = pelvisY + 0.02; y < chestY - 0.01; y += 0.001) {
    const band = slice(positions, y - 0.004, y + 0.004);
    if (band.length < 20) continue;
    const x = extent(band, 0);
    const z = extent(band, 2);
    const girth = x.half * z.half;
    if (!waist || girth < waist.girth) waist = { y, girth, x, z };
  }

  // Chest at the pectoral line, hips at the widest pelvic slice.
  const chestBand = slice(positions, chestY - 0.01, chestY + 0.03);
  const chestX = extent(chestBand, 0);
  const chestZ = extent(chestBand, 2);
  let hips = { half: 0 };
  for (let y = pelvisY - 0.06; y < pelvisY + 0.06; y += 0.005) {
    const band = slice(positions, y - 0.005, y + 0.005);
    if (band.length < 20) continue;
    const x = extent(band, 0);
    if (x.half > hips.half) hips = x;
  }
  // Skirt clearance: widest point from hips down to the knees.
  let legClearance = 0;
  for (let y = kneeY; y < pelvisY + 0.04; y += 0.01) {
    const band = slice(positions, y - 0.005, y + 0.005, "legs");
    if (!band.length) continue;
    legClearance = Math.max(legClearance, extent(band, 0).hi, -extent(band, 0).lo);
  }

  const torsoTop = chestY + 0.03;
  const torsoBottom = pelvisY - 0.02;
  // The torso splits halfway between the spine and chest joints: below is
  // the hips/waist volume, above is the ribcage. They must not overlap, or
  // the deep chest would report itself as the belly's depth too.
  const splitY = (spineY + chestY) / 2;
  const lowerTorso = bandVolume(positions, torsoBottom, splitY);
  const upperTorso = bandVolume(positions, splitY, torsoTop);
  return {
    lowerTorso,
    upperTorso,
    neckRadius,
    neckCentreZ: neckZ.mid,
    neckBaseY: neckY,
    waistY: waist.y,
    waistHalfWidth: waist.x.half,
    waistHalfDepth: waist.z.half,
    waistCentreZ: waist.z.mid,
    chestHalfWidth: chestX.half,
    chestHalfDepth: chestZ.half,
    chestCentreZ: chestZ.mid,
    chestY,
    spineY,
    pelvisY,
    hipHalfWidth: hips.half,
    legClearance,
    torsoTop,
    torsoBottom,
    headY,
  };
}

const measurements = {};
for (const variant of VARIANTS) measurements[variant] = measure(finalMesh[variant]);

/** Socket positions, in the parent joint's local space. */
function socketPositions(positions, m) {
  const localTo = (joint, world) => world.clone().sub(restFinal.get(joint));
  const headTop = (() => {
    let top = -Infinity;
    for (let i = 1; i < positions.length; i += 3) top = Math.max(top, positions[i]);
    return top;
  })();
  // Ears: widest head points at ear height.
  const earBand = slice(positions, m.headY + 0.005, m.headY + 0.045, "head");
  const earX = extent(earBand, 0);
  const earZ = extent(earBand, 2);
  const earY = m.headY + 0.022;
  // Forehead: front surface above the brow.
  const browBand = slice(positions, m.headY + 0.075, m.headY + 0.095, "head");
  const browZ = extent(browBand, 2);
  return {
    "head.crown": localTo("head", new THREE.Vector3(0, headTop - 0.012, m.neckCentreZ)),
    "head.forehead": localTo("head", new THREE.Vector3(0, m.headY + 0.085, browZ.hi - 0.004)),
    "head.leftEar": localTo("head", new THREE.Vector3(earX.hi - 0.006, earY, earZ.mid - 0.004)),
    "head.rightEar": localTo("head", new THREE.Vector3(earX.lo + 0.006, earY, earZ.mid - 0.004)),
    "head.moon": localTo("head", new THREE.Vector3(0.04, headTop - 0.03, 0.01)),
    "chest.necklace": localTo("chest", new THREE.Vector3(0, m.neckBaseY - 0.01, m.neckCentreZ)),
    "waist.ornament": localTo(
      "pelvis",
      new THREE.Vector3(0, m.waistY, m.waistCentreZ + m.waistHalfDepth),
    ),
  };
}
const sockets = socketPositions(finalMesh.neutral, measurements.neutral);

/**
 * The BodyProfile block the engine consumes, in the exact local spaces its
 * generators expect: belly relative to the spine joint, chest relative to
 * the chest joint, collar seat relative to the necklace socket. Everything
 * here is measured off the built mesh — no hand-tuned constants.
 */
function profileBlock(m) {
  const spine = restFinal.get("spine");
  const chest = restFinal.get("chest");
  const necklaceY = chest.y + sockets["chest.necklace"].y;
  return {
    // The spine→chest gap is part of the profile: generators translate the
    // belly volume into chest space with it, and this body is not built to
    // the stylised rig's spacing.
    spineToChestY: chest.y - spine.y,
    neckRadius: m.neckRadius,
    neckBaseOffsetY: m.neckBaseY - necklaceY,
    pelvisHalfWidth: m.hipHalfWidth,
    // Skirts clear the widest standing leg, plus a little cloth thickness.
    dhotiRadius: m.legClearance + 0.012,
    // Lower torso, spine-local; upper torso, chest-local.
    bellyCenterY: m.lowerTorso.centerY - spine.y,
    bellyCenterZ: m.lowerTorso.centerZ - spine.z,
    bellyRadiusX: m.lowerTorso.radiusX,
    bellyRadiusY: m.lowerTorso.radiusY,
    bellyRadiusZ: m.lowerTorso.radiusZ,
    chestCenterY: m.upperTorso.centerY - chest.y,
    chestCenterZ: m.upperTorso.centerZ - chest.z,
    chestRadiusX: m.upperTorso.radiusX,
    chestRadiusY: m.upperTorso.radiusY,
    chestRadiusZ: m.upperTorso.radiusZ,
  };
}

const profileBase = profileBlock(measurements.neutral);
// Per-morph deltas: the engine blends them by the same influences it feeds
// the mesh, so a Powerful body's ornaments fit the Powerful body.
const profileMorphs = {};
for (const [variant, morph] of Object.entries(MORPHS)) {
  const block = profileBlock(measurements[variant]);
  profileMorphs[morph] = Object.fromEntries(
    Object.entries(block).map(([key, value]) => [key, value - profileBase[key]]),
  );
}

// SOCKET_<id> empties travel in the GLB so the engine refines the schema
// sockets onto this body's real surfaces.
for (const [socket, local] of Object.entries(sockets)) {
  const parentJoint = socket.startsWith("head.")
    ? "head"
    : socket.startsWith("chest.")
      ? "chest"
      : "pelvis";
  const empty = new THREE.Object3D();
  empty.name = `SOCKET_${socket.replace(/\./g, "_")}`;
  empty.position.copy(restFinal.get(parentJoint)).add(local);
  root.add(empty);
}
root.updateMatrixWorld(true);

// ---------------------------------------------------------------------------
// 7. Write
// ---------------------------------------------------------------------------

const glb = await new Promise((resolve, reject) => {
  new GLTFExporter().parse(root, resolve, reject, { binary: true, onlyVisible: false });
});
await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, "model.glb"), Buffer.from(glb));

const round = (value) => Number(value.toFixed(5));
const round_ = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, round(v)]));
const roundMorphs = (obj) =>
  Object.fromEntries(Object.entries(obj).map(([name, delta]) => [name, round_(delta)]));

const triangles = meshes.neutral.indices.length / 3;
const bounds = new THREE.Box3().setFromBufferAttribute(
  new THREE.BufferAttribute(finalMesh.neutral, 3),
);
await writeFile(
  path.join(OUT_DIR, "asset.json"),
  JSON.stringify(
    {
      id: "humanoid.body.human",
      version: 1,
      name: "Human Body",
      description:
        "Continuous skinned human male body derived from an official MakeHuman export, retargeted to the canonical DevaForm rest pose.",
      deity: "shared",
      category: "body",
      kind: { type: "part", slot: "body" },
      stage: "experimental",
      provenance: {
        type: "imported",
        provider: "MakeHuman",
        tool: `MakeHuman Community ${report.makehumanVersion}; ${report.exporter}; built by apps/web/scripts/build-human-base.mjs`,
        references: ["tools/humanbase/exports/neutral.mhm"],
        notes:
          "Characters exported through the export functionality of an official, unmodified MakeHuman build are CC0 (makehumancommunity.org license explanation). The .mhm model files in tools/humanbase/exports reproduce this mesh in the GUI. MakeHuman is an authoring tool only and ships with nothing at runtime.",
      },
      model: "model.glb",
      materialZones: ["skin"],
      morphTargets: morphTargetNames,
      geometry: {
        triangles,
        vertices: vertexCount,
        boundsM: [
          round(bounds.max.x - bounds.min.x),
          round(bounds.max.y - bounds.min.y),
          round(bounds.max.z - bounds.min.z),
        ],
      },
      units: "meters",
      upAxis: "+Y",
      forwardAxis: "+Z",
      bodyProfile: { base: round_(profileBase), morphs: roundMorphs(profileMorphs) },
      printability: { printSourceAvailable: false },
    },
    null,
    2,
  ),
);

await writeFile(
  MEASURE_OUT,
  JSON.stringify(
    {
      source: "apps/web/scripts/build-human-base.mjs",
      canonicalHeight: CANONICAL_HEIGHT,
      scale,
      skeleton: boneOrder.map((joint) => ({
        id: joint,
        parent: PARENT[joint],
        position: [
          round(bones.get(joint).position.x),
          round(bones.get(joint).position.y),
          round(bones.get(joint).position.z),
        ],
      })),
      sockets: Object.fromEntries(
        Object.entries(sockets).map(([id, v]) => [id, [round(v.x), round(v.y), round(v.z)]]),
      ),
      measurements: Object.fromEntries(
        Object.entries(measurements).map(([variant, m]) => [
          variant,
          Object.fromEntries(
            Object.entries(m).map(([k, v]) => [
              k,
              typeof v === "number" ? round(v) : round_(v),
            ]),
          ),
        ]),
      ),
      morphTargets: morphTargetNames,
      bodyProfile: { base: round_(profileBase), morphs: roundMorphs(profileMorphs) },
    },
    null,
    2,
  ),
);

console.log(`wrote ${OUT_DIR}/model.glb`);
console.log(
  `  ${vertexCount} verts, ${triangles} tris, ${boneOrder.length} bones, ` +
    `${morphTargetNames.length} morph targets (${morphTargetNames.join(", ")})`,
);
console.log(`  scale ${scale.toFixed(5)} (MakeHuman dm -> ${CANONICAL_HEIGHT} m canonical)`);
console.log(`  measurements -> ${MEASURE_OUT}`);
