/**
 * DevaForm hero-asset generator: Classic Ganesha Head (sculpted).
 *
 * Technique: a signed-distance field composed with polynomial smooth
 * unions/subtractions (skull, twin cranial domes, brow, cheeks, muzzle,
 * jaw, neck, trunk-root boss, tusk bosses, supraorbital ridges; carved eye
 * sockets and mouth crease), polygonized with marching cubes, welded,
 * Taubin-smoothed and exported as a production-contract GLB
 * (JOINT_head group, zone:skin material, authored tilak material).
 *
 * This produces ONE continuous organic surface — no primitive seams —
 * which is the core visual failure of the prototype head. It is honestly
 * an "experimental" scripted sculpt, not an artist sculpt.
 *
 * Run from apps/web:  node scripts/generate-hero-head.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
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

const OUT_DIR = path.resolve("public/assets/foundations/heads/ganesha-sculpted/1");
// 120 keeps every sculpted feature (smallest: 5.5 mm mouth crease vs 3.2 mm
// cells) while staying browser-friendly; final decimation to the 20k artist
// budget belongs to the Blender pass (see docs/production-asset-pipeline.md).
const RESOLUTION = 120;
const MAX_POLYS = 900_000;

// Head-local domain (metres, origin = head joint, +Z forward, Y up)
const DOMAIN_MIN = new THREE.Vector3(-0.19, -0.16, -0.17);
const DOMAIN_MAX = new THREE.Vector3(0.19, 0.24, 0.21);

// ---------------------------------------------------------------------------
// SDF primitives
// ---------------------------------------------------------------------------

const sdEllipsoid = (px, py, pz, cx, cy, cz, rx, ry, rz) => {
  const x = (px - cx) / rx;
  const y = (py - cy) / ry;
  const z = (pz - cz) / rz;
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const k1 = Math.sqrt((x / rx) * (x / rx) + (y / ry) * (y / ry) + (z / rz) * (z / rz));
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
};

const sdCapsule = (px, py, pz, ax, ay, az, bx, by, bz, r) => {
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
};

const smin = (a, b, k) => {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
};
const ssub = (a, b, k) => -smin(-a, b, k); // subtract b from a, smoothly

// ---------------------------------------------------------------------------
// The head field
// ---------------------------------------------------------------------------

function headSdf(x, y, z) {
  // Primary mass — skull
  let d = sdEllipsoid(x, y, z, 0, 0.082, 0, 0.13, 0.114, 0.126);
  // Twin cranial domes, gently blended
  d = smin(d, sdEllipsoid(x, y, z, 0.044, 0.158, 0.028, 0.056, 0.05, 0.058), 0.05);
  d = smin(d, sdEllipsoid(x, y, z, -0.044, 0.158, 0.028, 0.056, 0.05, 0.058), 0.05);
  // Crown seat — keeps the upper skull broad enough that crown bands rest
  // on the dome instead of encircling a narrow peak
  d = smin(d, sdEllipsoid(x, y, z, 0, 0.142, 0.012, 0.106, 0.075, 0.102), 0.05);
  // Brow plate
  d = smin(d, sdEllipsoid(x, y, z, 0, 0.064, 0.05, 0.115, 0.075, 0.084), 0.05);
  // Cheeks
  d = smin(d, sdEllipsoid(x, y, z, 0.063, -0.004, 0.047, 0.068, 0.062, 0.06), 0.05);
  d = smin(d, sdEllipsoid(x, y, z, -0.063, -0.004, 0.047, 0.068, 0.062, 0.06), 0.05);
  // Muzzle + jaw
  d = smin(d, sdEllipsoid(x, y, z, 0, -0.022, 0.068, 0.084, 0.054, 0.06), 0.045);
  d = smin(d, sdEllipsoid(x, y, z, 0, -0.062, 0.038, 0.072, 0.04, 0.056), 0.05);
  // Trunk-root boss (all trunk variants emerge from here)
  d = smin(d, sdEllipsoid(x, y, z, 0, -0.006, 0.088, 0.051, 0.047, 0.042), 0.04);
  // Neck transition
  d = smin(d, sdCapsule(x, y, z, 0, -0.06, -0.005, 0, -0.13, -0.015, 0.056), 0.045);
  // Tusk-root bosses
  d = smin(d, sdEllipsoid(x, y, z, 0.053, -0.05, 0.06, 0.02, 0.018, 0.02), 0.022);
  d = smin(d, sdEllipsoid(x, y, z, -0.053, -0.05, 0.06, 0.02, 0.018, 0.02), 0.022);
  // Supraorbital ridges
  d = smin(d, sdEllipsoid(x, y, z, 0.049, 0.088, 0.098, 0.032, 0.013, 0.022), 0.028);
  d = smin(d, sdEllipsoid(x, y, z, -0.049, 0.088, 0.098, 0.032, 0.013, 0.022), 0.028);

  // Carved eye sockets — the eye assemblies seat inside these
  d = ssub(d, sdEllipsoid(x, y, z, 0.049, 0.062, 0.124, 0.023, 0.02, 0.02), 0.014);
  d = ssub(d, sdEllipsoid(x, y, z, -0.049, 0.062, 0.124, 0.023, 0.02, 0.02), 0.014);
  // Mouth crease under the muzzle
  d = ssub(d, sdCapsule(x, y, z, -0.046, -0.074, 0.064, 0.046, -0.074, 0.064, 0.0055), 0.012);

  return d;
}

// ---------------------------------------------------------------------------
// Marching cubes with coordinate calibration
// ---------------------------------------------------------------------------

function march(fillField) {
  const mc = new MarchingCubes(RESOLUTION, new THREE.MeshStandardMaterial(), false, false, MAX_POLYS);
  mc.isolation = 0;
  fillField(mc.field, RESOLUTION);
  mc.update();
  const drawCount = mc.geometry.drawRange.count;
  const positions = mc.geometry.getAttribute("position").array;
  const out = new Float32Array(drawCount * 3);
  out.set(positions.subarray(0, drawCount * 3));
  return out;
}

/**
 * MarchingCubes emits vertices in its own normalized space. Calibrate the
 * linear map (grid index → output units) with a known sphere, then reuse
 * it to bring the real surface back into grid space and on to metres.
 */
function calibrate() {
  const R = 30;
  const c = RESOLUTION / 2;
  const raw = march((field, size) => {
    let i = 0;
    for (let z = 0; z < size; z++)
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++, i++) {
          const dx = x - c, dy = y - c, dz = z - c;
          field[i] = R - Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
  });
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < raw.length; i += 3) {
    min = Math.min(min, raw[i]);
    max = Math.max(max, raw[i]);
  }
  const a = (max - min) / (2 * R); // units per grid cell
  const b = (max + min) / 2 - a * c; // offset: raw = a*grid + b
  return { a, b };
}

function generateHead() {
  console.log("calibrating marching cubes space…");
  const { a, b } = calibrate();
  console.log(`  raw = ${a.toFixed(6)} * grid + ${b.toFixed(4)}`);

  console.log("sampling head SDF…");
  const size = RESOLUTION;
  const span = new THREE.Vector3().subVectors(DOMAIN_MAX, DOMAIN_MIN);
  const raw = march((field) => {
    let i = 0;
    for (let z = 0; z < size; z++) {
      const wz = DOMAIN_MIN.z + (z / (size - 1)) * span.z;
      for (let y = 0; y < size; y++) {
        const wy = DOMAIN_MIN.y + (y / (size - 1)) * span.y;
        for (let x = 0; x < size; x++, i++) {
          const wx = DOMAIN_MIN.x + (x / (size - 1)) * span.x;
          field[i] = -headSdf(wx, wy, wz); // inside-positive, isolation 0
        }
      }
    }
  });
  console.log(`  ${raw.length / 9} raw triangles`);

  // raw → grid → metres
  const toWorld = (v, axis) => {
    const grid = (v - b) / a;
    const t = grid / (size - 1);
    return axis === 0
      ? DOMAIN_MIN.x + t * span.x
      : axis === 1
        ? DOMAIN_MIN.y + t * span.y
        : DOMAIN_MIN.z + t * span.z;
  };

  // Weld vertices (grid-exact positions hash cleanly at 1e-5)
  console.log("welding…");
  const keyOf = (x, y, z) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
  const indexOf = new Map();
  const vertices = [];
  const indices = [];
  for (let i = 0; i < raw.length; i += 3) {
    const x = toWorld(raw[i], 0);
    const y = toWorld(raw[i + 1], 1);
    const z = toWorld(raw[i + 2], 2);
    const key = keyOf(x, y, z);
    let idx = indexOf.get(key);
    if (idx === undefined) {
      idx = vertices.length / 3;
      indexOf.set(key, idx);
      vertices.push(x, y, z);
    }
    indices.push(idx);
  }
  // Drop degenerate triangles produced by welding
  const cleanIndices = [];
  for (let i = 0; i < indices.length; i += 3) {
    const [i0, i1, i2] = [indices[i], indices[i + 1], indices[i + 2]];
    if (i0 !== i1 && i1 !== i2 && i0 !== i2) cleanIndices.push(i0, i1, i2);
  }
  console.log(`  ${vertices.length / 3} vertices, ${cleanIndices.length / 3} triangles`);

  // Taubin smoothing (λ/μ) over the welded mesh
  console.log("smoothing…");
  const vertexCount = vertices.length / 3;
  const neighbors = Array.from({ length: vertexCount }, () => new Set());
  for (let i = 0; i < cleanIndices.length; i += 3) {
    const [i0, i1, i2] = [cleanIndices[i], cleanIndices[i + 1], cleanIndices[i + 2]];
    neighbors[i0].add(i1).add(i2);
    neighbors[i1].add(i0).add(i2);
    neighbors[i2].add(i0).add(i1);
  }
  let pos = Float64Array.from(vertices);
  const smoothPass = (factor) => {
    const next = new Float64Array(pos.length);
    for (let v = 0; v < vertexCount; v++) {
      const ns = neighbors[v];
      let ax = 0, ay = 0, az = 0;
      for (const n of ns) {
        ax += pos[n * 3];
        ay += pos[n * 3 + 1];
        az += pos[n * 3 + 2];
      }
      const inv = ns.size > 0 ? 1 / ns.size : 0;
      next[v * 3] = pos[v * 3] + factor * (ax * inv - pos[v * 3]);
      next[v * 3 + 1] = pos[v * 3 + 1] + factor * (ay * inv - pos[v * 3 + 1]);
      next[v * 3 + 2] = pos[v * 3 + 2] + factor * (az * inv - pos[v * 3 + 2]);
    }
    pos = next;
  };
  for (let iter = 0; iter < 3; iter++) {
    smoothPass(0.5);
    smoothPass(-0.34);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(Float32Array.from(pos), 3));
  geometry.setIndex(cleanIndices);
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------
// Assemble + export
// ---------------------------------------------------------------------------

const headGeometry = generateHead();
headGeometry.computeBoundingBox();
const bb = headGeometry.boundingBox;
console.log(
  `bounds: x ${bb.min.x.toFixed(3)}..${bb.max.x.toFixed(3)}  y ${bb.min.y.toFixed(3)}..${bb.max.y.toFixed(3)}  z ${bb.min.z.toFixed(3)}..${bb.max.z.toFixed(3)}`,
);

const skin = new THREE.MeshStandardMaterial({ name: "zone:skin", color: "#d99a63", roughness: 0.55 });
const tilakMaterial = new THREE.MeshStandardMaterial({ name: "tilak", color: "#c22b21", roughness: 0.6 });

const root = new THREE.Group();
root.name = "ganesha_head_classic_sculpt";
const jointGroup = new THREE.Group();
jointGroup.name = "JOINT_head";
root.add(jointGroup);

const headMesh = new THREE.Mesh(headGeometry, skin);
headMesh.name = "head_classicSculpt";
jointGroup.add(headMesh);

// Tilak — vertical mark + dot on the forehead
const tilakBar = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.05, 6, 12), tilakMaterial);
tilakBar.name = "head_tilak_bar";
tilakBar.position.set(0, 0.1, 0.128);
tilakBar.rotation.x = 0.32;
tilakBar.scale.z = 0.35;
jointGroup.add(tilakBar);
const tilakDot = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 12, 10), tilakMaterial);
tilakDot.name = "head_tilak_dot";
tilakDot.position.set(0, 0.152, 0.117);
tilakDot.scale.z = 0.4;
jointGroup.add(tilakDot);

const exporter = new GLTFExporter();
const buffer = await new Promise((resolve, reject) => {
  exporter.parse(root, resolve, reject, { binary: true });
});
await mkdir(OUT_DIR, { recursive: true });
const file = path.join(OUT_DIR, "model.glb");
await writeFile(file, Buffer.from(buffer));
const triangles = headGeometry.getIndex().count / 3;
console.log(`wrote ${file}`);
console.log(`  ${buffer.byteLength.toLocaleString()} bytes, ${triangles.toLocaleString()} triangles`);
