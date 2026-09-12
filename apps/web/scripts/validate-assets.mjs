/**
 * DevaForm asset validation.
 *
 * Validates every GLB under public/assets against the asset contract and
 * cross-checks the deity manifests:
 * - GLB container integrity (magic, version, chunk layout, JSON parse)
 * - geometry present, POSITION accessors carry min/max bounds
 * - approximate bounds within the canonical scale envelope
 * - material naming (zone:* names must reference known zones)
 * - every `glb` source path referenced by a manifest exists on disk
 * - every GLB on disk is referenced by a manifest (orphan warning)
 *
 * Run: pnpm validate-assets   (exit code 1 on errors, 0 with warnings)
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const ASSET_DIR = path.join(ROOT, "public", "assets");
const MANIFEST_DIR = path.join(ROOT, "..", "..", "packages", "asset-system", "src", "manifests");

const KNOWN_ZONES = ["skin", "skinSecondary", "garment", "garmentAccent", "metal", "gem", "base"];
const MIN_SIZE_M = 0.01;
const MAX_SIZE_M = 2.0;

let errors = 0;
let warnings = 0;
const fail = (msg) => { console.error(`  ERROR   ${msg}`); errors += 1; };
const warn = (msg) => { console.warn(`  warning ${msg}`); warnings += 1; };
const ok = (msg) => console.log(`  ok      ${msg}`);

async function collectGlbs(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectGlbs(full)));
    else if (entry.name.endsWith(".glb")) files.push(full);
  }
  return files;
}

function parseGlb(buffer) {
  if (buffer.length < 20) throw new Error("file too small to be a GLB");
  if (buffer.toString("ascii", 0, 4) !== "glTF") throw new Error("bad magic (not a GLB)");
  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`unsupported glTF version ${version}`);
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.length) {
    throw new Error(`declared length ${declaredLength} != file size ${buffer.length}`);
  }
  const jsonChunkLength = buffer.readUInt32LE(12);
  const jsonChunkType = buffer.readUInt32LE(16);
  if (jsonChunkType !== 0x4e4f534a) throw new Error("first chunk is not JSON");
  const json = JSON.parse(buffer.toString("utf8", 20, 20 + jsonChunkLength));
  return json;
}

function validateGltfJson(json, name) {
  const meshes = json.meshes ?? [];
  if (meshes.length === 0) fail(`${name}: contains no meshes`);

  // Bounds from POSITION accessor min/max (required by the glTF spec).
  const accessors = json.accessors ?? [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let positionAccessors = 0;
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives ?? []) {
      const positionIndex = primitive.attributes?.POSITION;
      if (positionIndex === undefined) {
        fail(`${name}: primitive without POSITION attribute`);
        continue;
      }
      const accessor = accessors[positionIndex];
      if (!accessor?.min || !accessor?.max) {
        fail(`${name}: POSITION accessor missing min/max bounds`);
        continue;
      }
      positionAccessors += 1;
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], accessor.min[axis]);
        max[axis] = Math.max(max[axis], accessor.max[axis]);
      }
    }
  }
  if (positionAccessors > 0) {
    // Approximation: accessor bounds ignore node transforms; good enough to
    // catch wrong-unit exports (mm/cm instead of m).
    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    if (size < MIN_SIZE_M) fail(`${name}: bounds ${size.toFixed(4)} m — too small (wrong units?)`);
    else if (size > MAX_SIZE_M) fail(`${name}: bounds ${size.toFixed(2)} m — too large (wrong units?)`);
    else ok(`${name}: bounds ~${size.toFixed(3)} m, ${meshes.length} meshes`);
  }

  for (const material of json.materials ?? []) {
    const matName = material.name ?? "";
    if (matName.startsWith("zone:")) {
      const zone = matName.slice(5);
      if (!KNOWN_ZONES.includes(zone)) {
        fail(`${name}: material "${matName}" references unknown zone "${zone}"`);
      }
    }
  }
}

async function manifestGlbPaths() {
  const paths = new Set();
  if (!existsSync(MANIFEST_DIR)) return paths;
  for (const file of await readdir(MANIFEST_DIR)) {
    if (!file.endsWith(".ts")) continue;
    const source = await readFile(path.join(MANIFEST_DIR, file), "utf8");
    for (const match of source.matchAll(/kind:\s*"glb",\s*path:\s*"([^"]+)"/g)) {
      paths.add(match[1]);
    }
  }
  return paths;
}

console.log("DevaForm asset validation\n");

console.log("GLB files:");
const glbFiles = await collectGlbs(ASSET_DIR);
if (glbFiles.length === 0) warn("no GLB files found under public/assets");
for (const file of glbFiles) {
  const rel = "/" + path.relative(path.join(ROOT, "public"), file).replaceAll("\\", "/");
  try {
    const json = parseGlb(await readFile(file));
    validateGltfJson(json, rel);
  } catch (error) {
    fail(`${rel}: ${error.message}`);
  }
}

console.log("\nManifest cross-check:");
const referenced = await manifestGlbPaths();
for (const ref of referenced) {
  const file = path.join(ROOT, "public", ref.replace(/^\//, ""));
  if (existsSync(file)) ok(`manifest reference exists: ${ref}`);
  else fail(`manifest references missing file: ${ref}`);
}
for (const file of glbFiles) {
  const rel = "/" + path.relative(path.join(ROOT, "public"), file).replaceAll("\\", "/");
  if (!referenced.has(rel)) warn(`GLB on disk not referenced by any manifest: ${rel}`);
}

console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors > 0 ? 1 : 0);
