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
const OUT_DIR = path.resolve("public/assets/foundations/bodies/human/1");
const MEASURE_OUT = path.resolve("../../tools/humanbase/measurements.json");

const VARIANTS = ["neutral", "lean", "athletic", "powerful", "heroic", "divine", "ascetic"];
const MORPHS = {
  lean: "bodyLean",
  athletic: "bodyAthletic",
  powerful: "bodyPowerful",
  heroic: "bodyHeroic",
  divine: "faceDivine",
  ascetic: "bodyAscetic",
};
/** Canonical statue height in DevaForm units (see docs/asset-specification). */
const CANONICAL_HEIGHT = 1.0;

// ---------------------------------------------------------------------------
// 1. Inputs
// ---------------------------------------------------------------------------

/**
 * Minimal OBJ reader: positions, triangulated faces, and which object each
 * face belongs to. MakeHuman writes every mesh's vertices first and then
 * the faces grouped per object, so the body and the eye proxy arrive in one
 * file and are separated here.
 */
function parseObj(text) {
  const positions = [];
  const indices = [];
  /** group name -> the faces it owns, as [a,b,c] triangles. */
  const groups = new Map();
  let current = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.split(/\s+/);
      positions.push(Number(x), Number(y), Number(z));
    } else if (line.startsWith("g ")) {
      current = line.slice(2).trim();
      if (!groups.has(current)) groups.set(current, []);
    } else if (line.startsWith("f ")) {
      const corners = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((token) => Number(token.split("/")[0]) - 1);
      const faces = current === null ? indices : groups.get(current);
      for (let i = 1; i + 1 < corners.length; i += 1) {
        faces.push(corners[0], corners[i], corners[i + 1]);
      }
    }
  }
  return { positions: Float32Array.from(positions), indices, groups };
}

/** Split one parsed OBJ into the body and the eye proxy. */
function splitMesh(parsed, eyesGroup) {
  const bodyFaces = parsed.groups.get(BODY_GROUP) ?? parsed.indices;
  const eyeFaces = parsed.groups.get(eyesGroup);
  if (!eyeFaces?.length) throw new Error(`no "${eyesGroup}" faces in the export`);
  const eyeStart = Math.min(...eyeFaces);
  if (Math.max(...bodyFaces) >= eyeStart) {
    throw new Error("body faces reference eye vertices — the export layout changed");
  }
  return {
    positions: parsed.positions.slice(0, eyeStart * 3),
    indices: Uint32Array.from(bodyFaces),
    eyes: {
      positions: parsed.positions.slice(eyeStart * 3),
      // Rebased so the eye mesh is self-contained.
      indices: Uint32Array.from(eyeFaces, (index) => index - eyeStart),
    },
  };
}
const BODY_GROUP = "base.obj";

const report = JSON.parse(await readFile(path.join(EXPORTS, "joints.json"), "utf8"));
const rigWeights = JSON.parse(await readFile(path.join(EXPORTS, "default_weights.mhw"), "utf8")).weights;
const parentMap = report.parentMap; // obj vertex -> base mesh vertex
const inverseParentMap = new Int32Array(report.baseVertexCount).fill(-1);
parentMap.forEach((base, obj) => {
  inverseParentMap[base] = obj;
});

const meshes = {};
for (const variant of VARIANTS) {
  const parsed = parseObj(await readFile(path.join(EXPORTS, variant + ".obj"), "utf8"));
  meshes[variant] = splitMesh(parsed, report.eyes.group);
}
const vertexCount = meshes.neutral.positions.length / 3;
const eyeVertexCount = meshes.neutral.eyes.positions.length / 3;
for (const variant of VARIANTS) {
  if (meshes[variant].positions.length / 3 !== vertexCount) {
    throw new Error(`${variant}: topology differs from neutral — morphs need one topology`);
  }
  if (meshes[variant].eyes.positions.length / 3 !== eyeVertexCount) {
    throw new Error(`${variant}: eye topology differs from neutral`);
  }
}
if (meshes.neutral.eyes.indices.length / 6 !== report.eyes.faces) {
  throw new Error("eye face count does not match the sampled colours");
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

/**
 * MakeHuman numbers its digits; DevaForm names them. finger1 is the thumb.
 */
const FINGER_NAMES = ["thumb", "index", "middle", "ring", "little"];

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
  if (/^(wrist|metacarpal[1-5])$/.test(stem)) return `arm.${side.arm}.hand`;
  // Digits are their own joints now. MakeHuman gives each finger four
  // cubes — three segments and a tip — and the tip's weights belong to
  // the segment it caps, because nothing is skinned to a point.
  const digit = stem.match(/^finger([1-5])-([1-4])$/);
  if (digit) {
    const finger = FINGER_NAMES[Number(digit[1]) - 1];
    const segment = Math.min(Number(digit[2]), 3);
    return `arm.${side.arm}.hand.${finger}.0${segment}`;
  }
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
    // Digits: no reorientation. A finger inherits the hand's rotation and
    // keeps the shape MakeHuman gave it, which is a relaxed open hand —
    // exactly the rest pose the mudra and grip solvers want to work from.
    for (const [index, finger] of FINGER_NAMES.entries()) {
      for (let segment = 1; segment <= 3; segment += 1) {
        chains.push({
          joint: `arm.${side.arm}.hand.${finger}.0${segment}`,
          mh: `${p}-finger-${index + 1}-${segment}`,
          parent:
            segment === 1
              ? `arm.${side.arm}.hand`
              : `arm.${side.arm}.hand.${finger}.0${segment - 1}`,
          child: null,
          dir: null,
        });
      }
    }
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

// ---------------------------------------------------------------------------
// 3b. Grip: a closed hand, built from the rig rather than exported as one
// ---------------------------------------------------------------------------

/**
 * MakeHuman's rig has every finger joint, but DevaForm's does not: a
 * statue rig with 15 bones per hand would make the pose UI unusable and
 * would not match the stylised rig the pose presets are written against.
 * So the fingers are articulated HERE, once, and shipped as a morph
 * target — the engine closes the hand by dialling it, and the mudra
 * system keeps deciding what the hand means.
 *
 * The curl is real forward kinematics on MakeHuman's own finger joints,
 * skinned with its own weights: the same machinery the A-pose retarget
 * uses, applied to three joints per finger instead of one per limb.
 */
const FINGER_CURL = {
  // The thumb does not fold in like a finger: it comes ACROSS the palm to
  // meet them, which is what closes the ring and makes a grip a grip.
  1: [0.62, 0.7, 0.5],
  2: [1, 1, 0.92],
  3: [1, 1, 0.97],
  4: [1, 1, 0.97],
  5: [0.96, 1, 0.92],
};
// Enough flexion for the fingertips to come round a shaft and meet the
// thumb — a hand laid over a staff is not holding it.
//
// NOTE: this is a fixed pose, not a closure that stops on contact. A hand
// closes to the same radius whatever it holds, which is why fingers still
// meet a drum head. Fixing that needs the item to declare the radius it
// presents and the body to report how wide its fist is at each end of
// this range — both measured in the SAME frame, which is where a first
// attempt went wrong. Left as a known defect rather than half-built.
const CURL_ANGLES = [0.78, 0.95, 0.62]; // radians at full grip, per segment

function curledHand(positions, prefix) {
  const { fingers, normal } = palmNormal(prefix);
  const lateral = v3(`${prefix}-finger-2-1`).sub(v3(`${prefix}-finger-5-1`)).normalize();
  const out = new Float32Array(positions);
  const side = prefix === "l" ? "L" : "R";
  const point = new THREE.Vector3();
  const moved = new THREE.Vector3();

  for (const finger of [1, 2, 3, 4, 5]) {
    // Forward kinematics down the finger: each segment's transform is its
    // own rotation about its (already moved) joint, after its parents'.
    let chain = new THREE.Matrix4();
    for (let segment = 1; segment <= 3; segment += 1) {
      const joint = v3(`${prefix}-finger-${finger}-${segment}`).applyMatrix4(chain);
      const angle = CURL_ANGLES[segment - 1] * FINGER_CURL[finger][segment - 1];
      // Fingers flex about the knuckle line; the thumb swings about the
      // line of the fingers, which carries it across the palm instead of
      // folding it flat against its own side.
      const axis = finger === 1 ? fingers : lateral;
      const tip = v3(`${prefix}-finger-${finger}-4`).applyMatrix4(chain);
      const pivot = (turn) =>
        new THREE.Matrix4()
          .makeTranslation(joint.x, joint.y, joint.z)
          .multiply(new THREE.Matrix4().makeRotationAxis(axis, turn))
          .multiply(new THREE.Matrix4().makeTranslation(-joint.x, -joint.y, -joint.z));
      // Whichever sign carries the tip toward the palm is the way a hand
      // closes; it differs between the left hand and the right.
      const toward = finger === 1 ? lateral.clone().multiplyScalar(-1) : normal;
      const trial = pivot(angle);
      chain = (tip.clone().applyMatrix4(trial).sub(tip).dot(toward) > 0
        ? trial
        : pivot(-angle)
      ).multiply(chain);


      const bone = rigWeights[`finger${finger}-${segment}.${side}`];
      if (!bone) throw new Error(`no rig weights for finger${finger}-${segment}.${side}`);
      for (const [baseIndex, weight] of bone) {
        const vertex = inverseParentMap[baseIndex];
        if (vertex < 0 || weight <= 0) continue;
        point.set(positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]);
        moved.copy(point).applyMatrix4(chain).sub(point).multiplyScalar(weight);
        out[vertex * 3] += moved.x;
        out[vertex * 3 + 1] += moved.y;
        out[vertex * 3 + 2] += moved.z;
      }
    }
  }
  return out;
}

/** morph target name -> the A-pose mesh with that hand closed. */
const GRIPS = {
  gripFrontLeft: curledHand(meshes.neutral.positions, "l"),
  gripFrontRight: curledHand(meshes.neutral.positions, "r"),
};

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
/**
 * Every variant is normalised to the canonical height, not just the
 * neutral one. A morph is a change of shape, not of size: a brow that
 * grows the skull would otherwise make the statue taller than the height
 * the customer ordered, and the deltas below would carry that error into
 * every blend.
 */
function normalizeHeight(positions) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 1; i < positions.length; i += 3) {
    min = Math.min(min, positions[i]);
    max = Math.max(max, positions[i]);
  }
  return CANONICAL_HEIGHT / (max - min);
}

const finalMesh = {};
const heightFix = {};
for (const variant of VARIANTS) {
  const placed = toDevaform(retargeted[variant]);
  heightFix[variant] = normalizeHeight(placed);
  for (let i = 0; i < placed.length; i += 1) placed[i] *= heightFix[variant];
  finalMesh[variant] = placed;
}

// The closed hands travel the same road as the variants: retargeted into
// the rest pose and normalised, so their deltas describe fingers only.
const finalGrips = {};
for (const [name, posed] of Object.entries(GRIPS)) {
  const placed = toDevaform(retarget(posed, restFor("neutral")));
  for (let i = 0; i < placed.length; i += 1) placed[i] *= heightFix.neutral;
  finalGrips[name] = placed;
}

// The eyes ride the head with full weight, so they need that one bone's
// retarget transform rather than the blended skinning the body gets.
const finalEyes = {};
for (const variant of VARIANTS) {
  const source = meshes[variant].eyes.positions;
  const from = restFor(variant).get("head");
  const turn = rotation.get("head");
  const to = restTarget.get("head");
  const moved = new Float32Array(source.length);
  const point = new THREE.Vector3();
  for (let i = 0; i < source.length; i += 3) {
    point.set(source[i], source[i + 1], source[i + 2]).sub(from).applyQuaternion(turn).add(to);
    moved[i] = point.x;
    moved[i + 1] = point.y;
    moved[i + 2] = point.z;
  }
  const placed = toDevaform(moved);
  // The eyes take the body's correction so they stay in their sockets.
  for (let i = 0; i < placed.length; i += 1) placed[i] *= heightFix[variant];
  finalEyes[variant] = placed;
}

const restFinal = new Map();
for (const [joint, position] of restTarget) {
  restFinal.set(
    joint,
    new THREE.Vector3(position.x * scale, (position.y - originY) * scale, position.z * scale),
  );
}

/**
 * Angle-weighted vertex normals.
 *
 * three's computeVertexNormals weights each face by its area. The exported
 * quads become two triangles of unequal area, so the shared diagonal gets
 * the larger share of the vote and the triangulation shows up as faint
 * creases across smooth skin. Weighting by the angle at the corner is
 * independent of how the quad was split.
 */
function computeSmoothNormals(geometry) {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const normals = new Float32Array(position.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const bc = new THREE.Vector3();
  const ca = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i);
    const ib = index.getX(i + 1);
    const ic = index.getX(i + 2);
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    ab.subVectors(b, a);
    bc.subVectors(c, b);
    ca.subVectors(a, c);
    faceNormal.crossVectors(ab, ca.clone().negate()).normalize();
    const angles = [
      ab.angleTo(ca.clone().negate()),
      bc.angleTo(ab.clone().negate()),
      ca.angleTo(bc.clone().negate()),
    ];
    [ia, ib, ic].forEach((vertex, corner) => {
      normals[vertex * 3] += faceNormal.x * angles[corner];
      normals[vertex * 3 + 1] += faceNormal.y * angles[corner];
      normals[vertex * 3 + 2] += faceNormal.z * angles[corner];
    });
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length;
    normals[i + 1] /= length;
    normals[i + 2] /= length;
  }
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
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
  for (const finger of FINGER_NAMES) {
    for (let segment = 1; segment <= 3; segment += 1) {
      PARENT[`arm.${side.arm}.hand.${finger}.0${segment}`] =
        segment === 1
          ? `arm.${side.arm}.hand`
          : `arm.${side.arm}.hand.${finger}.0${segment - 1}`;
    }
  }
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
  const influences = [];
  for (const [group, weights] of groupWeights) {
    if (weights[i] > 0) influences.push([boneIndex.get(group), weights[i]]);
  }
  influences.sort((a, b) => b[1] - a[1]);
  const top = influences.slice(0, 4);
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

/**
 * Neelkanth: the halahala under the skin of the throat.
 *
 * Shiva drank the poison of the churning and held it in his throat, and
 * every murti shows it — a bluish-violet under the pale skin, darkest at
 * the windpipe, gone before the jaw and before the collarbones. It is a
 * property of this BODY, not a decal laid on it, so it is painted into
 * the mesh as vertex colours and multiplies whatever skin colour the
 * customer chooses. Choose a darker skin and the throat stays a shade
 * deeper than the rest of it, which is what a discoloration does.
 *
 * Reference: ref4.png. Tasteful and soft — not a collar, not a neon ring.
 */
function halahala(positions, neckBaseY) {
  // The throat runs from the base of the neck up to the jaw. On this rig
  // the neck JOINT is at the shoulder line — the base measures a few
  // millimetres ABOVE it — so the span is taken from the measured base to
  // the head joint rather than from any joint pair that looks plausible.
  const jawY = restFinal.get("head").y;
  const colors = new Float32Array(positions.length);
  // The tint at its strongest: less green than red, and blue left alone,
  // which is a violet shadow rather than purple paint.
  const TINT = [0.85, 0.66, 1.0];
  // Centred a little below the neck joint — the joint is at the top of
  // the neck, where the head turns, and the poison is held at the throat.
  const centreY = neckBaseY + (jawY - neckBaseY) * 0.44;
  const spanY = (jawY - neckBaseY) * 1.15;
  for (let i = 0; i < vertexCount; i += 1) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    // Down the neck: strongest at the throat, gone by the jaw and by the
    // collarbones.
    const height = Math.max(0, 1 - Math.pow(Math.abs(y - centreY) / spanY, 1.7));
    // Round it: the front and the sides carry it, the nape barely.
    const bearing = Math.atan2(x, z - restFinal.get("neck").z);
    const front = Math.pow(Math.max(0, Math.cos(bearing * 0.62)), 1.4);
    // And it does not reach out onto the shoulders.
    const near = Math.max(0, 1 - Math.pow(Math.abs(x) / 0.075, 2.2));
    const strength = Math.min(1, height * front * near);
    for (let k = 0; k < 3; k += 1) {
      colors[i * 3 + k] = 1 + (TINT[k] - 1) * strength;
    }
  }
  return colors;
}

const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(finalMesh.neutral, 3));
geometry.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndices, 4));
geometry.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeights, 4));
geometry.setIndex(new THREE.BufferAttribute(meshes.neutral.indices, 1));
computeSmoothNormals(geometry);
geometry.morphTargetsRelative = true;
geometry.morphAttributes.position = [];
const morphTargetNames = [];
for (const [variant, morphName] of Object.entries(MORPHS)) {
  const delta = new Float32Array(finalMesh.neutral.length);
  for (let i = 0; i < delta.length; i += 1) delta[i] = finalMesh[variant][i] - finalMesh.neutral[i];
  geometry.morphAttributes.position.push(new THREE.BufferAttribute(delta, 3));
  morphTargetNames.push(morphName);
}

// Hand grips are morph targets too, and only the fingers move in them.
for (const [name, posed] of Object.entries(finalGrips)) {
  const delta = new Float32Array(finalMesh.neutral.length);
  for (let i = 0; i < delta.length; i += 1) delta[i] = posed[i] - finalMesh.neutral[i];
  geometry.morphAttributes.position.push(new THREE.BufferAttribute(delta, 3));
  morphTargetNames.push(name);
}

const material = new THREE.MeshStandardMaterial({ name: "zone:skin", roughness: 0.62 });
const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
skinnedMesh.name = "humanBody";

// ---------------------------------------------------------------------------
// 5b. Eyes
// ---------------------------------------------------------------------------

/**
 * The eye proxy is a painted surface: sclera, iris and pupil differ only by
 * texture, and the outermost layer is a transparent cornea shell that would
 * render as an opaque bubble here. Classify each face by the colour the
 * artist put on it — the layout stays theirs — into DevaForm's fixed eye
 * materials, and drop the cornea.
 */
const EYE_ZONES = ["fixed:eyeWhite", "fixed:iris", "fixed:eyeDark"];
function eyeZone([r, g, b]) {
  // The cornea is painted a flat pale blue; nothing else on the eye is.
  if (b > r + 30) return null;
  const luminance = (r + g + b) / 3;
  if (luminance < 8) return 2; // pupil
  if (luminance < 45) return 1; // iris
  return 0; // sclera
}

const eyeFaceZones = report.eyes.faceColours.map(eyeZone);
// Triangles are grouped per material so the mesh can carry all three in one
// draw-call-friendly geometry.
const eyeIndicesByZone = EYE_ZONES.map(() => []);
const sourceEyeIndices = meshes.neutral.eyes.indices;
eyeFaceZones.forEach((zone, face) => {
  if (zone === null) return;
  // Each exported quad became two triangles, in order.
  for (let corner = face * 6; corner < face * 6 + 6; corner += 1) {
    eyeIndicesByZone[zone].push(sourceEyeIndices[corner]);
  }
});

const eyeGeometry = new THREE.BufferGeometry();
eyeGeometry.setAttribute("position", new THREE.BufferAttribute(finalEyes.neutral, 3));
const eyeSkinIndices = new Uint16Array(eyeVertexCount * 4);
const eyeSkinWeights = new Float32Array(eyeVertexCount * 4);
for (let i = 0; i < eyeVertexCount; i += 1) {
  eyeSkinIndices[i * 4] = boneIndex.get("head");
  eyeSkinWeights[i * 4] = 1;
}
eyeGeometry.setAttribute("skinIndex", new THREE.BufferAttribute(eyeSkinIndices, 4));
eyeGeometry.setAttribute("skinWeight", new THREE.BufferAttribute(eyeSkinWeights, 4));
eyeGeometry.setIndex(eyeIndicesByZone.flat());
let drawn = 0;
eyeIndicesByZone.forEach((zoneIndices, zone) => {
  eyeGeometry.addGroup(drawn, zoneIndices.length, zone);
  drawn += zoneIndices.length;
});
computeSmoothNormals(eyeGeometry);
eyeGeometry.morphTargetsRelative = true;
eyeGeometry.morphAttributes.position = [];
for (const variant of Object.keys(MORPHS)) {
  const delta = new Float32Array(finalEyes.neutral.length);
  for (let i = 0; i < delta.length; i += 1) delta[i] = finalEyes[variant][i] - finalEyes.neutral[i];
  eyeGeometry.morphAttributes.position.push(new THREE.BufferAttribute(delta, 3));
}

const eyeMesh = new THREE.SkinnedMesh(
  eyeGeometry,
  EYE_ZONES.map(
    (name) =>
      new THREE.MeshStandardMaterial({
        name,
        roughness: name === "fixed:eyeWhite" ? 0.3 : 0.2,
      }),
  ),
);
eyeMesh.name = "humanEyes";
// The eyes take the shape morphs (they must follow the face) but not
// the hand grips. Names travel with them so the engine can address
// each target by name rather than by index.
eyeMesh.morphTargetDictionary = Object.fromEntries(
  Object.values(MORPHS).map((name, index) => [name, index]),
);
eyeMesh.morphTargetInfluences = Object.values(MORPHS).map(() => 0);
skinnedMesh.morphTargetDictionary = Object.fromEntries(morphTargetNames.map((n, i) => [n, i]));
skinnedMesh.morphTargetInfluences = morphTargetNames.map(() => 0);

const root = new THREE.Group();
root.name = "humanoid_body_human";
root.add(bones.get("root"));
root.add(skinnedMesh);
root.add(eyeMesh);
root.updateMatrixWorld(true);
const skeleton = new THREE.Skeleton(boneOrder.map((joint) => bones.get(joint)));
skinnedMesh.bind(skeleton);
eyeMesh.bind(skeleton);

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

/**
 * The girth of one limb where a band ornament sits, measured as the mean
 * distance from the limb's axis. The axis is the segment between its two
 * joints, so this works whatever direction the limb hangs in.
 */
function limbBand(positions, group, fromJoint, toJoint, along) {
  const from = restFinal.get(fromJoint);
  const to = restFinal.get(toJoint);
  const axis = to.clone().sub(from);
  const length = axis.length();
  axis.normalize();
  const centre = from.clone().addScaledVector(axis, length * along);
  const band = length * 0.06;
  const point = new THREE.Vector3();
  let total = 0;
  let count = 0;
  for (let i = 0; i < vertexCount; i += 1) {
    if (dominantGroup[i] !== group) continue;
    point.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).sub(centre);
    const alongAxis = point.dot(axis);
    if (Math.abs(alongAxis) > band) continue;
    total += point.addScaledVector(axis, -alongAxis).length();
    count += 1;
  }
  if (!count) throw new Error(`no vertices for the ${group} band`);
  return { offsetY: centre.y - from.y, radius: total / count };
}

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
  const neckTopRadius = Math.max(neckX.half, neckZ.half);

  /**
   * Where the neck actually MEETS THE SHOULDERS.
   *
   * The neck joint is at the top of the neck, just under the skull — it
   * is where the head turns, not where a collar rests. Taking it as the
   * neck base put the necklace socket under the jaw, and every ornament
   * hung from it sat on the chin: a naga torque round the throat, a mala
   * across the windpipe. Nothing downstream could correct that, because
   * every generator that drapes in socket space trusts this number.
   *
   * So it is found rather than assumed: scan down from the neck joint and
   * stop where the column stops being a column — where the trapezius
   * flares the girth past half again the neck's own width.
   */
  const FLARE = 1.45;
  /**
   * A slab through the neck, front to back: above the shoulders it holds
   * only the neck, and the moment the trapezius arrives it widens. The
   * slab is what lets the scan cross the bone-group boundary — below the
   * neck joint the vertices belong to the chest, so a scan restricted to
   * the neck's own group stops at the first step and learns nothing.
   */
  const columnHalfWidth = (y) => {
    let half = 0;
    let found = 0;
    for (const region of ["neck", "torso"]) {
      for (const point of slice(positions, y - 0.004, y + 0.004, region)) {
        if (Math.abs(point[2] - neckZ.mid) > neckTopRadius * 1.3) continue;
        half = Math.max(half, Math.abs(point[0]));
        found += 1;
      }
    }
    return found >= 6 ? half : null;
  };
  // Scan DOWNWARD from well up the neck. The neck joint is not above the
  // shoulders on this rig — it sits at the line where the trapezius
  // arrives — so a scan that starts there has already left the column and
  // stops at once, which is how the base came out equal to the joint.
  let neckBaseY = neckY + 0.04;
  for (let step = 1; step <= 40; step += 1) {
    const y = neckY + 0.04 - step * 0.002;
    const half = columnHalfWidth(y);
    if (half === null || half > neckTopRadius * FLARE) break;
    neckBaseY = y;
  }
  // The column at its widest, which is what a torque wraps.
  const neckRadius = columnHalfWidth(neckBaseY) ?? neckTopRadius;
  const neckBaseZ = neckZ.mid;

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
  let hipY = pelvisY;
  for (let y = pelvisY - 0.06; y < pelvisY + 0.06; y += 0.005) {
    const band = slice(positions, y - 0.005, y + 0.005);
    if (band.length < 20) continue;
    const x = extent(band, 0);
    if (x.half > hips.half) {
      hips = x;
      hipY = y;
    }
  }
  // Skirt clearance: widest point from hips down to the knees.
  let legClearance = 0;
  for (let y = kneeY; y < pelvisY + 0.04; y += 0.01) {
    const band = slice(positions, y - 0.005, y + 0.005, "legs");
    if (!band.length) continue;
    legClearance = Math.max(legClearance, extent(band, 0).hi, -extent(band, 0).lo);
  }

  // Band seats: armlet high on the upper arm, bangle just above the
  // wrist, anklet just above the foot.
  // Cranium: the dome above the brow, which is what a hairpiece sits on.
  const craniumPoints = slice(positions, headY + 0.06, headY + 0.2, "head");
  const craniumX = extent(craniumPoints, 0);
  const craniumY = extent(craniumPoints, 1);
  const craniumZ = extent(craniumPoints, 2);
  const cranium = {
    centerY: (craniumY.lo + craniumY.hi) / 2 - headY,
    // Where the skull is, front to back, as well as how high it is. The
    // head joint sits at the BASE of the skull and behind it: anything
    // seated on a cranium centred at the joint ends up half a skull too
    // far back, which is where the hairline was — behind the crown, with
    // the whole forehead bare to the top of the head.
    centerZ: (craniumZ.lo + craniumZ.hi) / 2 - restFinal.get("head").z,
    radius: (craniumX.half + craniumZ.half) / 2,
  };

  const armBand = limbBand(positions, "arm.frontLeft.upper", "arm.frontLeft.upper", "arm.frontLeft.forearm", 0.34);
  const wristBand = limbBand(positions, "arm.frontLeft.forearm", "arm.frontLeft.forearm", "arm.frontLeft.hand", 0.86);
  const ankleBand = limbBand(positions, "leg.left.shin", "leg.left.shin", "leg.left.foot", 0.92);

  // The leg, as a garment has to wrap it: girth at the top of the thigh,
  // mid-thigh, knee and calf, plus the two segment lengths, so cloth can
  // be lofted down the leg instead of guessed at.
  const legBand = (group, from, to, along) => limbBand(positions, group, from, to, along).radius;
  const thighLength = restFinal.get("leg.left.thigh").distanceTo(restFinal.get("leg.left.shin"));
  const shinLength = restFinal.get("leg.left.shin").distanceTo(restFinal.get("leg.left.foot"));
  const leg = {
    thighTopRadius: legBand("leg.left.thigh", "leg.left.thigh", "leg.left.shin", 0.12),
    thighMidRadius: legBand("leg.left.thigh", "leg.left.thigh", "leg.left.shin", 0.5),
    kneeRadius: legBand("leg.left.thigh", "leg.left.thigh", "leg.left.shin", 0.93),
    calfRadius: legBand("leg.left.shin", "leg.left.shin", "leg.left.foot", 0.3),
    thighLength,
    shinLength,
    spreadX: Math.abs(restFinal.get("leg.left.thigh").x),
    seatY: restFinal.get("leg.left.thigh").y - restFinal.get("pelvis").y,
  };

  // Mean reach of the hand from its wrist joint.
  let handReach = 0;
  let handCount = 0;
  const wrist = restFinal.get("arm.frontLeft.hand");
  for (let i = 0; i < vertexCount; i += 1) {
    if (dominantGroup[i] !== "arm.frontLeft.hand") continue;
    handReach += Math.hypot(
      positions[i * 3] - wrist.x,
      positions[i * 3 + 1] - wrist.y,
      positions[i * 3 + 2] - wrist.z,
    );
    handCount += 1;
  }
  handReach /= handCount || 1;

  const torsoTop = chestY + 0.03;
  const torsoBottom = pelvisY - 0.02;
  // The torso splits at the measured waist: below is the hips volume,
  // above is the ribcage. Both reach as far as the surface a garment or a
  // necklace actually lies on — the upper one up to the base of the neck,
  // since that is where a collar hangs from, and an ellipsoid that stops
  // at the pectorals reports its own centre for everything above it.
  const splitY = waist.y;
  const lowerTorso = bandVolume(positions, torsoBottom, splitY);
  const upperTorso = bandVolume(positions, splitY, neckY);
  return {
    lowerTorso,
    upperTorso,
    handReach,
    armBand,
    wristBand,
    ankleBand,
    cranium,
    leg,
    neckRadius,
    neckCentreZ: neckBaseZ,
    neckBaseY,
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
    hipY,
    legClearance,
    torsoTop,
    torsoBottom,
    headY,
  };
}

const measurements = {};
for (const variant of VARIANTS) measurements[variant] = measure(finalMesh[variant]);

// Painted here rather than at assembly: the throat is between the neck
// joint and the neck BASE, and where the base is, is a measurement. Taken
// from the chest joint instead — which is buried in the ribcage — the
// tint centred half a neck too low and faded to nothing by the windpipe.
geometry.setAttribute(
  "color",
  new THREE.BufferAttribute(
    halahala(finalMesh.neutral, measurements.neutral.neckBaseY),
    3,
  ),
);

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
  // Forehead: found from the eyes rather than from an offset off the head
  // joint. The joint sits at the base of the skull, so any fixed offset
  // lands wherever this particular head happens to be tall — the third eye
  // belongs above the eyes, which is a landmark, not a guess.
  let eyeY = 0;
  for (let i = 1; i < finalEyes.neutral.length; i += 3) eyeY += finalEyes.neutral[i];
  eyeY /= finalEyes.neutral.length / 3;
  // Just above the brow ridge, where a mark is worn — a third of the way
  // up the forehead puts it at the hairline instead.
  const browY = eyeY + (headTop - eyeY) * 0.13;
  const browBand = slice(positions, browY - 0.006, browY + 0.006, "head");
  const browZ = extent(
    browBand.filter((point) => Math.abs(point[0]) < 0.025),
    2,
  );
  return {
    "head.crown": localTo("head", new THREE.Vector3(0, headTop - 0.012, m.neckCentreZ)),
    // On the surface, not inside it: what mounts here is a few
    // millimetres of relief, and a socket sunk into the brow buries it.
    "head.forehead": localTo("head", new THREE.Vector3(0, browY, browZ.hi)),
    "head.leftEar": localTo("head", new THREE.Vector3(earX.hi - 0.006, earY, earZ.mid - 0.004)),
    "head.rightEar": localTo("head", new THREE.Vector3(earX.lo + 0.006, earY, earZ.mid - 0.004)),
    "head.moon": localTo("head", new THREE.Vector3(0.04, headTop - 0.03, 0.01)),
    // A collar rests ON the base of the neck, so the socket sits there —
    // not ten millimetres under the neck JOINT, which is at the top of
    // the neck and put every ornament on the chin.
    "chest.necklace": localTo("chest", new THREE.Vector3(0, m.neckBaseY, m.neckCentreZ)),
    // The mala seat shares the collar's point by design — what separates a
    // torque from a hanging strand is the drop of the ornament, not the
    // height of its anchor. It still has to be MEASURED: a socket the GLB
    // does not carry keeps the schema default, and on this body that put
    // the beads sixteen millimetres up and inside the chest.
    "chest.mala": localTo("chest", new THREE.Vector3(0, m.neckBaseY, m.neckCentreZ)),
    "waist.ornament": localTo(
      "pelvis",
      new THREE.Vector3(0, m.waistY, m.waistCentreZ + m.waistHalfDepth),
    ),
  };
}
const sockets = socketPositions(finalMesh.neutral, measurements.neutral);

/**
 * Where a held shaft passes through the fist.
 *
 * A hand socket placed on the wrist makes every weapon look welded to the
 * forearm. The grip is inside the closed hand: on the axis the curled
 * fingers wrap, which is found from the knuckles and the palm's own
 * normal rather than guessed at.
 */
function gripPoint(prefix) {
  const { fingers, normal } = palmNormal(prefix);
  const knuckles = new THREE.Vector3();
  let span = 0;
  for (const finger of [2, 3, 4, 5]) {
    knuckles.add(v3(`${prefix}-finger-${finger}-1`));
    span += v3(`${prefix}-finger-${finger}-1`).distanceTo(v3(`${prefix}-finger-${finger}-4`));
  }
  knuckles.multiplyScalar(0.25);
  span /= 4;
  // Into the palm by a little over a third of the fingers' reach, and a
  // touch along them: that is the middle of the tube a fist makes.
  return knuckles
    .addScaledVector(normal, span * 0.38)
    .addScaledVector(fingers, span * 0.12);
}

/**
 * Which way the thumb points, in the hand's own rest frame.
 *
 * The hand contract needs this and cannot assume it: the mesh's hands are
 * mirrored while the rig is not, so no single constant reaches the thumb
 * on both sides, and which local axis it lands on depends on how the
 * retarget turned the arm. So the body measures it and ships it, and the
 * solver is told rather than guessing.
 */
function thumbAxis(prefix, slot) {
  const { fingers } = palmNormal(prefix);
  const palmCentre = v3(`${prefix}-finger-2-1`).add(v3(`${prefix}-finger-5-1`)).multiplyScalar(0.5);
  const toThumb = v3(`${prefix}-finger-1-4`).sub(palmCentre);
  // In the rest pose the hand's local frame is the character's, so the
  // retarget rotation is all that stands between the two.
  const turn = rotation.get(`arm.${slot}.hand`);
  const rest = toThumb.applyQuaternion(turn).normalize();
  const restFingers = fingers.clone().applyQuaternion(turn).normalize();
  // Across the hand, not along it: the thumb reaches sideways from the
  // line the fingers run in.
  return rest.projectOnPlane(restFingers).normalize();
}

const thumbAxes = {};
for (const side of SIDES) {
  const prefix = side.mh === "L" ? "l" : "r";
  const axis = thumbAxis(prefix, side.arm);
  thumbAxes[side.arm] = [axis.x, axis.y, axis.z].map((v) => Number(v.toFixed(5)));
}

for (const side of SIDES) {
  const point = gripPoint(side.mh === "L" ? "l" : "r")
    .sub(restFor("neutral").get(`arm.${side.arm}.hand`))
    .applyQuaternion(rotation.get(`arm.${side.arm}.hand`));
  point.multiplyScalar(scale * heightFix.neutral);
  sockets[`arm.${side.arm}.hand.item`] = point;
}

/**
 * How wide a hole this hand leaves at each stage of closing.
 *
 * A hand closes until it meets what it is holding and then stops. The
 * curl shipped as a morph target is a FIXED pose, so without this the
 * engine could only dial it to a fixed amount and every fist came out the
 * same diameter — which is why fingers met a drum head as readily as a
 * staff's shaft, and why the build script used to carry that as a known
 * defect.
 *
 * So the aperture is measured: the morph is applied at a series of
 * influences, and at each one the narrowest the fist gets around its own
 * grip axis is recorded. The engine then dials the influence that matches
 * the radius the held item declares — no per-item fudging, and nothing
 * assumed about a hand it has not measured.
 *
 * The axis is the one the grip chain already uses (the thumb axis through
 * the grip point) and the window along it is the width of a palm, so the
 * measurement is of the tube a fist makes rather than of a fingertip that
 * happens to stray near the line.
 */
/**
 * Where a held object rests in this hand, and how wide it can be.
 *
 * A hand holding a staff has the staff AGAINST THE PALM. The grip point
 * the body measures is the middle of the tube a fist makes — better than
 * a third of a finger's length off the knuckles — and an object centred
 * there is held in the fingertips with a clear centimetre of daylight
 * behind it, whatever its size. Every note written about the trishul has
 * said the same thing: the hand is not actually holding it.
 *
 * So the body ships the SEAT instead: the skin over the knuckles, and the
 * direction the fingers close from. An object of radius r rests at
 * seat + normal × r, which is the same sentence for a staff and for a
 * drum, and the fist closes onto whatever is there.
 *
 * Both come from the landmarks the grip point already uses, in the hand's
 * own frame.
 */
function gripSeat(prefix, slot, curled) {
  const to5 = (value) => Number(value.toFixed(5));
  const neutral = finalMesh.neutral;
  const { fingers: fingerDirection, normal: palmUp } = palmNormal(prefix);

  // The knuckle line, and how long the fingers are that close over it.
  const knuckles = new THREE.Vector3();
  let span = 0;
  for (const finger of [2, 3, 4, 5]) {
    knuckles.add(v3(`${prefix}-finger-${finger}-1`));
    span += v3(`${prefix}-finger-${finger}-1`).distanceTo(v3(`${prefix}-finger-${finger}-4`));
  }
  knuckles.multiplyScalar(0.25);
  span /= 4;
  // The flesh over the knuckles — a tenth of the fingers' reach — and a
  // touch along them, where the tube actually runs.
  const seatMH = knuckles
    .clone()
    .addScaledVector(palmUp, span * 0.1)
    .addScaledVector(fingerDirection, span * 0.12);

  // Into the canonical frame, the way every other measured point goes.
  const turn = rotation.get(`arm.${slot}.hand`);
  const handRest = restFinal.get(`arm.${slot}.hand`);
  const handTurn = turn.clone().invert();
  const toFinal = (point) =>
    handRest
      .clone()
      .add(
        point
          .clone()
          .sub(restFor("neutral").get(`arm.${slot}.hand`))
          .applyQuaternion(turn)
          .multiplyScalar(scale * heightFix.neutral)
          .applyQuaternion(handTurn),
      );
  const seat = toFinal(seatMH);
  const normal = palmUp.clone().applyQuaternion(turn).applyQuaternion(handTurn).normalize();
  const axis = new THREE.Vector3(...thumbAxes[slot])
    .applyQuaternion(handTurn)
    .normalize();
  const across = (vector) => vector.addScaledVector(axis, -vector.dot(axis));

  // The fingers that close over it.
  const side = prefix === "l" ? "L" : "R";
  const flesh = new Set();
  for (const finger of [1, 2, 3, 4, 5]) {
    for (const segment of [1, 2, 3]) {
      for (const [baseIndex, weight] of rigWeights[`finger${finger}-${segment}.${side}`] ?? []) {
        if (weight <= 0.25) continue;
        const vertex = inverseParentMap[baseIndex];
        if (vertex >= 0) flesh.add(vertex);
      }
    }
  }
  /** Half the length of the tube the object passes through. */
  const WINDOW = 0.028;
  const posed = (influence) => {
    const out = [];
    for (const vertex of flesh) {
      const i = vertex * 3;
      const point = new THREE.Vector3(
        neutral[i] + (curled[i] - neutral[i]) * influence,
        neutral[i + 1] + (curled[i + 1] - neutral[i + 1]) * influence,
        neutral[i + 2] + (curled[i + 2] - neutral[i + 2]) * influence,
      );
      if (Math.abs(point.clone().sub(seat).dot(axis)) > WINDOW) continue;
      out.push(point);
    }
    return out;
  };

  // How wide an object resting on that seat can be, at each closure: grow
  // it off the palm until a finger is inside it.
  const curve = [];
  for (let step = 0; step <= 8; step += 1) {
    const influence = step / 8;
    const closing = posed(influence);
    let best = 0.002;
    for (let radius = 0.0025; radius <= 0.03; radius += 0.0005) {
      const centre = seat.clone().addScaledVector(normal, radius);
      let fits = true;
      for (const point of closing) {
        if (across(point.clone().sub(centre)).length() < radius - 0.001) {
          fits = false;
          break;
        }
      }
      if (!fits) break;
      best = radius;
    }
    curve.push([to5(influence), to5(best)]);
  }

  const local = seat.clone().sub(handRest).applyQuaternion(turn);
  const localNormal = normal.clone().applyQuaternion(turn).normalize();
  return {
    curve,
    seat: [to5(local.x), to5(local.y), to5(local.z)],
    normal: [to5(localNormal.x), to5(localNormal.y), to5(localNormal.z)],
  };
}

const gripApertures = {};
const gripSeats = {};
for (const side of SIDES) {
  const prefix = side.mh === "L" ? "l" : "r";
  const name = `grip${side.arm[0].toUpperCase()}${side.arm.slice(1)}`;
  if (!finalGrips[name]) continue;
  const measured = gripSeat(prefix, side.arm, finalGrips[name]);
  gripApertures[side.arm] = measured.curve;
  gripSeats[side.arm] = { point: measured.seat, normal: measured.normal };
}

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
    // The necklace socket now sits exactly at the neck base, so this is
    // zero — kept as a measurement rather than a constant because a body
    // that seats its collar elsewhere still has to say where its neck
    // begins.
    neckBaseOffsetY: m.neckBaseY - necklaceY,
    pelvisHalfWidth: m.hipHalfWidth,
    // Where a dhoti ties: on the hips, below the natural waist, which is
    // where a wrapped garment can actually hold itself up.
    waistSeatY: m.hipY + (m.waistY - m.hipY) * 0.45 - restFinal.get("pelvis").y,
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
    // Band ornaments, relative to the joint each one hangs from. The
    // anklet's is measured on the shin but worn on the foot joint.
    armBandOffsetY: m.armBand.offsetY,
    armBandRadius: m.armBand.radius,
    wristBandOffsetY: m.wristBand.offsetY,
    wristBandRadius: m.wristBand.radius,
    ankleBandOffsetY:
      m.ankleBand.offsetY + (restFinal.get("leg.left.shin").y - restFinal.get("leg.left.foot").y),
    ankleBandRadius: m.ankleBand.radius,
    headCenterY: m.cranium.centerY,
    headCenterZ: m.cranium.centerZ,
    headRadius: m.cranium.radius,
    // The leg a wrapped garment has to follow.
    thighTopRadius: m.leg.thighTopRadius,
    thighMidRadius: m.leg.thighMidRadius,
    kneeRadius: m.leg.kneeRadius,
    calfRadius: m.leg.calfRadius,
    thighLength: m.leg.thighLength,
    shinLength: m.leg.shinLength,
    legSpreadX: m.leg.spreadX,
    thighSeatY: m.leg.seatY,
    // The collar socket in the space the fitting code works in.
    necklaceSocketY: sockets["chest.necklace"].y,
    necklaceSocketZ: sockets["chest.necklace"].z,
  };
}

/**
 * The torso and neck as a radial surface map, in the chest joint's space.
 *
 * Ornaments do not merely rest on the front of a body — they wrap it. A
 * serpent goes round the neck, a sacred thread crosses a shoulder, a sash
 * passes behind a waist, and none of them can be placed against a
 * front-facing height field or an ellipsoid: the first has no back and the
 * second has no truth. So the body measures itself all the way round.
 *
 * Each row is a horizontal slice at a height; the slice's own centre is
 * recorded with it, because a neck does not sit above the middle of a
 * chest. Each column is a bearing from that centre, measured from the
 * front and turning toward the figure's left. The value is how far the
 * skin is from the centre on that bearing.
 */
function torsoSurfaceMap(positions) {
  const chest = restFinal.get("chest");
  const rows = 20;
  const columns = 32;
  const minY = -0.26;
  const maxY = 0.2;
  const region = new Set(["chest", "spine", "pelvis", "neck", "head"]);
  const stepY = (maxY - minY) / (rows - 1);

  const centreZ = new Float64Array(rows);
  const radius = new Float64Array(rows * columns);
  for (let row = 0; row < rows; row += 1) {
    const y = minY + row * stepY;
    // Everything within half a row of this height belongs to the slice.
    const slice = [];
    for (let i = 0; i < vertexCount; i += 1) {
      if (!region.has(dominantGroup[i])) continue;
      const vy = positions[i * 3 + 1] - chest.y;
      if (Math.abs(vy - y) > stepY * 0.7) continue;
      slice.push([positions[i * 3] - chest.x, positions[i * 3 + 2] - chest.z]);
    }
    if (!slice.length) {
      centreZ[row] = row > 0 ? centreZ[row - 1] : 0;
      for (let col = 0; col < columns; col += 1) {
        radius[row * columns + col] =
          row > 0 ? radius[(row - 1) * columns + col] : 0.05;
      }
      continue;
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const [, z] of slice) {
      lo = Math.min(lo, z);
      hi = Math.max(hi, z);
    }
    centreZ[row] = (lo + hi) / 2;
    for (let col = 0; col < columns; col += 1) {
      const bearing = (col / columns) * Math.PI * 2;
      const dirX = Math.sin(bearing);
      const dirZ = Math.cos(bearing);
      let reach = 0;
      for (const [x, z] of slice) {
        const dz = z - centreZ[row];
        const along = x * dirX + dz * dirZ;
        if (along <= 0) continue;
        // Only points near this bearing speak for it.
        const across = Math.abs(x * dirZ - dz * dirX);
        if (across > along * 0.35) continue;
        reach = Math.max(reach, along);
      }
      radius[row * columns + col] = reach;
    }
    // A bearing that saw nothing takes the nearest one that did, so the
    // map is closed all the way round.
    for (let col = 0; col < columns; col += 1) {
      if (radius[row * columns + col] > 0) continue;
      for (let step = 1; step < columns; step += 1) {
        const left = radius[row * columns + ((col - step + columns) % columns)];
        const right = radius[row * columns + ((col + step) % columns)];
        if (left > 0 || right > 0) {
          radius[row * columns + col] = Math.max(left, right);
          break;
        }
      }
    }
  }
  return {
    minY,
    maxY,
    rows,
    columns,
    centreZ: Array.from(centreZ, (value) => round(value)),
    radius: Array.from(radius, (value) => round(value)),
  };
}

/**
 * The envelope a wrapped lower garment has to contain: how far the legs
 * reach, at a stack of heights from the hip to the ankle.
 *
 * A mean limb radius about the joint axis is not enough, and a garment
 * built from one is not a fit — it is a guess that happens to be right at
 * the front. A calf bulges backward by half again its mean, and both of
 * this figure's calves stood outside a dhoti that looked perfectly well
 * fitted from every angle but the back.
 *
 * So the garment gets a measurement, in the pelvis joint's own space, the
 * way the torso already has one. Nothing here knows what will be worn
 * over it.
 */
function legEnvelope(positions) {
  const pelvis = restFinal.get("pelvis");
  const hipY = restFinal.get("leg.left.thigh").y;
  const ankleY = restFinal.get("leg.left.foot").y;
  const ROWS = 14;
  const halfWidth = [];
  const frontZ = [];
  const backZ = [];
  for (let row = 0; row < ROWS; row += 1) {
    const y = hipY + ((ankleY - hipY) * row) / (ROWS - 1);
    const band = slice(positions, y - 0.012, y + 0.012, "legs");
    if (band.length < 8) {
      halfWidth.push(halfWidth[row - 1] ?? 0.05);
      frontZ.push(frontZ[row - 1] ?? 0.05);
      backZ.push(backZ[row - 1] ?? -0.05);
      continue;
    }
    const x = extent(band, 0);
    const z = extent(band, 2);
    halfWidth.push(Math.max(Math.abs(x.lo), Math.abs(x.hi)));
    frontZ.push(z.hi - pelvis.z);
    backZ.push(z.lo - pelvis.z);
  }
  return {
    topY: round(hipY - pelvis.y),
    bottomY: round(ankleY - pelvis.y),
    halfWidth: halfWidth.map(round),
    frontZ: frontZ.map(round),
    backZ: backZ.map(round),
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
      : socket.startsWith("arm.")
        ? socket.split(".").slice(0, 3).join(".")
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

// The shipped asset is the body plus the eyes it looks out of.
const triangles = (meshes.neutral.indices.length + eyeGeometry.getIndex().count) / 3;
const vertices = vertexCount + eyeVertexCount;
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
        vertices,
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
      thumbAxes,
      gripApertures,
      gripSeats,
      legEnvelope: legEnvelope(finalMesh.neutral),
      torsoSurface: torsoSurfaceMap(finalMesh.neutral),
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
      thumbAxes,
      gripApertures,
      gripSeats,
      legEnvelope: legEnvelope(finalMesh.neutral),
      torsoSurface: torsoSurfaceMap(finalMesh.neutral),
    },
    null,
    2,
  ),
);

console.log(`wrote ${OUT_DIR}/model.glb`);
console.log(
  `  ${vertices} verts (${eyeVertexCount} of them eyes), ${triangles} tris, ` +
    `${boneOrder.length} bones, ` +
    `${morphTargetNames.length} morph targets (${morphTargetNames.join(", ")})`,
);
console.log(`  scale ${scale.toFixed(5)} (MakeHuman dm -> ${CANONICAL_HEIGHT} m canonical)`);
console.log(`  measurements -> ${MEASURE_OUT}`);
