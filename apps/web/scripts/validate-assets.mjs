/**
 * DevaForm production asset validator.
 *
 * Cross-checks the deity manifests against the GLB files on disk and
 * validates every GLB against the asset contract:
 *
 * CONTAINER  magic, version, chunk layout, JSON parse
 * GEOMETRY   meshes present, POSITION bounds, triangle counts
 * TRANSFORM  approximate bounds within the canonical scale envelope
 * MATERIALS  zone:* names must reference known zones
 * PARTS      part-kind GLBs must carry JOINT_<id> node groups
 * MANIFEST   every glb reference exists; orphan files are warnings
 *
 * Severity: problems on production-stage assets are ERRORS (exit 1);
 * the same problems on prototype/experimental assets may be warnings.
 * Semantic manifest validation (sockets, grips, exclusions, categories)
 * lives in the asset-system test suite, which runs in TypeScript.
 *
 * Run: pnpm validate-assets
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readManifestEntries, repoPaths } from "./lib/manifest.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { webRoot: ROOT, assetDir: ASSET_DIR, manifestDir: MANIFEST_DIR } = repoPaths(here);

const KNOWN_ZONES = ["skin", "skinSecondary", "garment", "garmentAccent", "metal", "gem", "base"];
const MIN_SIZE_M = 0.01;
const MAX_SIZE_M = 2.0;
const TRIANGLE_BUDGET = { production: 150_000, other: 300_000 };

let errors = 0;
let warnings = 0;
const error = (msg) => { console.error(`  ERROR   ${msg}`); errors += 1; };
const warn = (msg) => { console.warn(`  warning ${msg}`); warnings += 1; };
const pass = (msg) => console.log(`  PASS    ${msg}`);

// ---------------------------------------------------------------------------
// GLB parsing
// ---------------------------------------------------------------------------

function parseGlb(buffer) {
  if (buffer.length < 20) throw new Error("file too small to be a GLB");
  if (buffer.toString("ascii", 0, 4) !== "glTF") throw new Error("bad magic (not a GLB)");
  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`unsupported glTF version ${version}`);
  if (buffer.readUInt32LE(8) !== buffer.length) {
    throw new Error(`declared length != file size`);
  }
  const jsonChunkLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a) throw new Error("first chunk is not JSON");
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonChunkLength));
}

function glbStats(json) {
  const accessors = json.accessors ?? [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  let boundsMissing = false;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const positionAccessor = accessors[primitive.attributes?.POSITION ?? -1];
      if (!positionAccessor?.min || !positionAccessor?.max) {
        boundsMissing = true;
        continue;
      }
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], positionAccessor.min[axis]);
        max[axis] = Math.max(max[axis], positionAccessor.max[axis]);
      }
      const indexAccessor = accessors[primitive.indices ?? -1];
      triangles += Math.floor((indexAccessor?.count ?? positionAccessor.count) / 3);
    }
  }
  return {
    meshCount: (json.meshes ?? []).length,
    triangles,
    boundsMissing,
    size: Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]),
    materialNames: (json.materials ?? []).map((m) => m.name ?? ""),
    nodeNames: (json.nodes ?? []).map((n) => n.name ?? ""),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

async function collectGlbs(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectGlbs(full)));
    else if (entry.name.endsWith(".glb")) out.push(full);
  }
  return out;
}

console.log("DevaForm asset validation\n");
const entries = await readManifestEntries(MANIFEST_DIR);
const glbEntries = entries.filter((e) => e.glbPath);
console.log(`${entries.length} manifest entries (${glbEntries.length} GLB-sourced)\n`);

for (const entry of glbEntries) {
  const label = `${entry.id}@${entry.version} [${entry.stage}]`;
  const isProduction = entry.stage === "production";
  const report = isProduction ? error : warn;
  const file = path.join(ROOT, "public", entry.glbPath.replace(/^\//, ""));
  if (!existsSync(file)) {
    error(`${label}: referenced file missing: ${entry.glbPath}`);
    continue;
  }
  let stats;
  try {
    stats = glbStats(parseGlb(await readFile(file)));
  } catch (e) {
    error(`${label}: ${e.message}`);
    continue;
  }
  const problems = [];
  if (stats.meshCount === 0) problems.push("contains no meshes");
  if (stats.boundsMissing) problems.push("POSITION accessor missing min/max");
  if (stats.size < MIN_SIZE_M || stats.size > MAX_SIZE_M) {
    problems.push(`bounds ${stats.size.toFixed(3)} m outside ${MIN_SIZE_M}–${MAX_SIZE_M} m (wrong units?)`);
  }
  const budget = isProduction ? TRIANGLE_BUDGET.production : TRIANGLE_BUDGET.other;
  if (stats.triangles > budget) problems.push(`${stats.triangles.toLocaleString()} triangles exceeds ${budget.toLocaleString()} budget`);
  for (const name of stats.materialNames) {
    if (name.startsWith("zone:") && !KNOWN_ZONES.includes(name.slice(5))) {
      problems.push(`unknown material zone "${name}"`);
    }
  }
  if (entry.kindType === "part" && !stats.nodeNames.some((n) => n.startsWith("JOINT_"))) {
    problems.push("part GLB has no JOINT_<id> node groups (will not follow the skeleton)");
  }

  // Dataset sidecar: asset.json must exist next to the model and agree
  // on identity. Provenance is required for every dataset asset.
  const sidecarPath = path.join(path.dirname(file), "asset.json");
  if (!existsSync(sidecarPath)) {
    problems.push("missing asset.json sidecar in dataset directory");
  } else {
    try {
      const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
      if (sidecar.id !== entry.id) problems.push(`sidecar id "${sidecar.id}" != manifest id`);
      if (sidecar.version !== entry.version) {
        problems.push(`sidecar version ${sidecar.version} != manifest version ${entry.version}`);
      }
      if (!sidecar.provenance?.type) problems.push("sidecar has no provenance.type");
    } catch (e) {
      problems.push(`unreadable asset.json: ${e.message}`);
    }
  }
  if (entry.thumbnail && !existsSync(path.join(ROOT, "public", entry.thumbnail.replace(/^\//, "")))) {
    warn(`${label}: thumbnail not generated yet (${entry.thumbnail}) — run generate-thumbnails`);
  }

  if (problems.length === 0) {
    pass(`${label}: ${stats.triangles.toLocaleString()} tris, ~${stats.size.toFixed(3)} m, ${stats.meshCount} meshes`);
  } else {
    for (const problem of problems) report(`${label}: ${problem}`);
  }
}

console.log("\nOrphan check:");
const referenced = new Set(glbEntries.map((e) => e.glbPath));
for (const file of await collectGlbs(ASSET_DIR)) {
  const rel = "/" + path.relative(path.join(ROOT, "public"), file).replaceAll("\\", "/");
  if (!referenced.has(rel)) warn(`GLB on disk not referenced by any manifest: ${rel}`);
}

console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors > 0 ? 1 : 0);
