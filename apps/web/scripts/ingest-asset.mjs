/**
 * DevaForm asset ingestion.
 *
 * Takes an incoming 3D file (GLB / self-contained GLTF / OBJ), normalizes
 * it to the DevaForm contract, writes it into the versioned dataset layout
 * and emits the sidecar + a ready-to-commit manifest entry:
 *
 *   public/assets/<deity>/<category>/<name>/<version>/
 *     model.glb  asset.json  manifest-entry.ts.txt
 *
 * Normalization (baked into geometry, transforms reset):
 *   --z-up            rotate a Z-up asset to Y-up
 *   --recenter base   center XZ, rest lowest point at y=0 (default for
 *                     attachments)  |  origin | none
 *   --target-height N uniform-scale so bounds height is N metres
 *   --zone-map        "MaterialName=skin,Gold=metal" renames materials to
 *                     zone:<zone>;  --zone <z> maps everything unmapped
 *   --joint <id>      (parts) wrap content in a JOINT_<id> group
 *
 * Registration stays human-gated: the tool prints the manifest entry; a
 * developer reviews it, commits it, and runs `pnpm validate-assets`.
 * AI/experimental assets therefore can never silently ship.
 *
 * Textured GLBs cannot be decoded in Node (no DOM image decoding) — use
 * --copy-only to place a conformant file into the dataset unchanged.
 */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { glbStats, parseGlbJson } from "./lib/glb.mjs";

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

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const flag = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && !argv[index + 1]?.startsWith("--") ? argv[index + 1] : undefined;
};
const has = (name) => argv.includes(`--${name}`);

const usage = `
Usage: node scripts/ingest-asset.mjs <input.(glb|gltf|obj)> --id <deity.category.name> [options]

Required:
  --id            e.g. ganesha.head.classic
  --name          display name
  (--joint <jointId> for parts | --sockets a,b,c for attachments)
  --slot <slot>   part slot (with --joint)

Options:
  --version N          (default 1)
  --stage <stage>      (default integration)
  --source <type>      ai|artist|procedural|manual|imported (default imported)
  --provider/--tool/--creator/--notes
  --zone <zone>        default zone for unmapped materials
  --zone-map "A=skin,B=metal"
  --target-height N    metres
  --recenter base|origin|none   (default: base for attachments, none for parts)
  --z-up               input is Z-up
  --copy-only          skip processing, copy the file as-is
`;

const inputPath = positional[0];
const id = flag("id");
const name = flag("name");
if (!inputPath || !id || !name) {
  console.error(usage);
  process.exit(1);
}
const [deity, category, ...rest] = id.split(".");
const assetName = rest.join("-");
if (!deity || !category || !assetName) {
  console.error(`--id must be <deity>.<category>.<name>, got "${id}"`);
  process.exit(1);
}
const version = Number(flag("version") ?? 1);
const stage = flag("stage") ?? "integration";
const joint = flag("joint");
const slot = flag("slot");
const sockets = flag("sockets")?.split(",").map((s) => s.trim()).filter(Boolean);
const isPart = Boolean(joint || slot);
if (isPart && (!joint || !slot)) {
  console.error("Parts require both --joint and --slot");
  process.exit(1);
}
if (!isPart && !sockets?.length) {
  console.error("Provide --joint/--slot (part) or --sockets (attachment)");
  process.exit(1);
}
const defaultZone = flag("zone");
const zoneMap = Object.fromEntries(
  (flag("zone-map") ?? "")
    .split(",")
    .map((pair) => pair.split("=").map((s) => s.trim()))
    .filter((pair) => pair.length === 2 && pair[0] && pair[1]),
);
const targetHeight = flag("target-height") ? Number(flag("target-height")) : undefined;
const recenter = flag("recenter") ?? (isPart ? "none" : "base");
const sourceType = flag("source") ?? "imported";

const outDir = path.resolve("public", "assets", deity, category, assetName, String(version));
const modelOut = path.join(outDir, "model.glb");
const publicPath = `/assets/${deity}/${category}/${assetName}/${version}/model.glb`;

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

async function loadInput(file) {
  const ext = path.extname(file).toLowerCase();
  const buffer = await readFile(file);
  if (ext === ".obj") {
    const object = new OBJLoader().parse(buffer.toString("utf8"));
    return object;
  }
  if (ext === ".glb" || ext === ".gltf") {
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => {
      loader.parse(
        ext === ".glb" ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer.toString("utf8"),
        "",
        resolve,
        reject,
      );
    });
    return gltf.scene;
  }
  throw new Error(`Unsupported input format "${ext}" (supported: glb, gltf, obj)`);
}

// ---------------------------------------------------------------------------
// Normalize
// ---------------------------------------------------------------------------

function bakeTransforms(root) {
  root.updateWorldMatrix(true, true);
  const meshes = [];
  root.traverse((node) => {
    if (node.isMesh) meshes.push(node);
  });
  const baked = new THREE.Group();
  for (const mesh of meshes) {
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    const cloned = new THREE.Mesh(geometry, mesh.material);
    cloned.name = mesh.name;
    baked.add(cloned);
  }
  return baked;
}

function stats(root) {
  let triangles = 0;
  let vertices = 0;
  const box = new THREE.Box3();
  root.traverse((node) => {
    if (!node.isMesh) return;
    const geometry = node.geometry;
    const index = geometry.getIndex();
    const positionCount = geometry.getAttribute("position")?.count ?? 0;
    triangles += Math.floor((index ? index.count : positionCount) / 3);
    vertices += positionCount;
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox);
  });
  const size = box.getSize(new THREE.Vector3());
  return { triangles, vertices, box, size };
}

function normalize(root) {
  let work = root;
  const report = [];

  if (has("z-up")) {
    work.rotation.x = -Math.PI / 2;
    report.push("rotated Z-up → Y-up");
  }
  work = bakeTransforms(work);

  let { box, size } = stats(work);
  if (targetHeight && size.y > 1e-6) {
    const scale = targetHeight / size.y;
    work.scale.setScalar(scale);
    work = bakeTransforms(work);
    ({ box, size } = stats(work));
    report.push(`scaled ×${scale.toFixed(4)} to ${targetHeight} m height`);
  }
  if (recenter !== "none") {
    const center = box.getCenter(new THREE.Vector3());
    const offset =
      recenter === "base"
        ? new THREE.Vector3(-center.x, -box.min.y, -center.z)
        : center.negate();
    work.position.copy(offset);
    work = bakeTransforms(work);
    report.push(`recentered (${recenter})`);
  }

  // Material zone mapping
  const materialCache = new Map();
  const zoneFor = (materialName) => zoneMap[materialName] ?? defaultZone;
  work.traverse((node) => {
    if (!node.isMesh) return;
    const remap = (material) => {
      const zone = zoneFor(material?.name ?? "");
      if (!zone) return material ?? new THREE.MeshStandardMaterial({ name: "unzoned" });
      const key = `zone:${zone}`;
      if (!materialCache.has(key)) {
        materialCache.set(key, new THREE.MeshStandardMaterial({ name: key }));
      }
      return materialCache.get(key);
    };
    node.material = Array.isArray(node.material) ? node.material.map(remap) : remap(node.material);
  });
  if (Object.keys(zoneMap).length || defaultZone) {
    report.push(`material zones: ${[...materialCache.keys()].join(", ") || "(none mapped)"}`);
  }

  // Mesh naming
  let meshIndex = 0;
  work.traverse((node) => {
    if (node.isMesh) node.name = `${assetName}_${meshIndex++}`;
  });

  // Part wrapping
  let final = work;
  if (isPart) {
    const jointGroup = new THREE.Group();
    jointGroup.name = `JOINT_${joint}`;
    for (const child of [...work.children]) jointGroup.add(child);
    final = new THREE.Group();
    final.name = `${deity}_${category}_${assetName}`;
    final.add(jointGroup);
    report.push(`wrapped in JOINT_${joint}`);
  }
  return { object: final, report };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

await mkdir(outDir, { recursive: true });

let geometryMeta = {};
if (has("copy-only")) {
  await copyFile(inputPath, modelOut);
  console.log(`copied ${inputPath} → ${modelOut} (no geometry processing)`);
  // Even without processing, probe the container so the sidecar carries
  // real measured metadata — this is the path textured AI GLBs take.
  try {
    const probe = glbStats(parseGlbJson(await readFile(modelOut)));
    geometryMeta = {
      triangles: probe.triangles,
      vertices: probe.vertices,
      boundsM: probe.bounds.map((b) => Number(b.toFixed(4))),
    };
    console.log(
      `  • probed: ${probe.triangles.toLocaleString()} triangles, ${probe.vertices.toLocaleString()} vertices, bounds ${geometryMeta.boundsM.join(" × ")} m (accessor-space)`,
    );
    console.log(`  • materials: ${probe.materialNames.join(", ") || "(none named)"}`);
    if (probe.textures.length) {
      for (const texture of probe.textures) {
        console.log(
          `  • texture: ${texture.name} (${texture.mimeType}, ${(texture.bytes / 1e6).toFixed(2)} MB${texture.external ? ", EXTERNAL — must be embedded" : ""})`,
        );
      }
    }
    if (isPart && !probe.nodeNames.some((n) => n.startsWith("JOINT_"))) {
      console.warn(
        `  ! part GLB has no JOINT_${joint} group — add it in a DCC or re-run without --copy-only`,
      );
    }
    if (probe.size < 0.01 || probe.size > 2.0) {
      console.warn(
        `  ! bounds ${probe.size.toFixed(3)} m look wrong for the canonical metre scale — normalize before shipping`,
      );
    }
  } catch (e) {
    console.warn(`  ! could not probe container: ${e.message}`);
  }
} else {
  const loaded = await loadInput(inputPath);
  const { object, report } = normalize(loaded);
  const { triangles, vertices, size } = stats(object);
  geometryMeta = {
    triangles,
    vertices,
    boundsM: [Number(size.x.toFixed(4)), Number(size.y.toFixed(4)), Number(size.z.toFixed(4))],
  };
  for (const line of report) console.log(`  • ${line}`);
  console.log(
    `  • ${triangles.toLocaleString()} triangles, ${vertices.toLocaleString()} vertices, bounds ${geometryMeta.boundsM.join(" × ")} m`,
  );
  const exporter = new GLTFExporter();
  const buffer = await new Promise((resolve, reject) =>
    exporter.parse(object, resolve, reject, { binary: true }),
  );
  await writeFile(modelOut, Buffer.from(buffer));
  console.log(`wrote ${modelOut} (${buffer.byteLength.toLocaleString()} bytes)`);
}

const provenance = {
  type: sourceType,
  ...(flag("provider") ? { provider: flag("provider") } : {}),
  ...(flag("tool") ? { tool: flag("tool") } : {}),
  ...(flag("creator") ? { creator: flag("creator") } : {}),
  ...(flag("notes") ? { notes: flag("notes") } : {}),
};

const materialZones = [
  ...new Set(Object.values(zoneMap).concat(defaultZone ? [defaultZone] : [])),
];

const sidecar = {
  id,
  version,
  name,
  deity,
  category,
  kind: isPart ? { type: "part", slot } : { type: "attachment", sockets },
  stage,
  provenance,
  model: "model.glb",
  thumbnail: "thumbnail.png",
  materialZones,
  ...(Object.keys(geometryMeta).length ? { geometry: geometryMeta } : {}),
  units: "meters",
  upAxis: "+Y",
  forwardAxis: "+Z",
  printability: { printSourceAvailable: false },
};
await writeFile(path.join(outDir, "asset.json"), JSON.stringify(sidecar, null, 2) + "\n");
console.log(`wrote ${path.join(outDir, "asset.json")}`);

const manifestEntry = `  {
    id: "${id}",
    version: ${version},
    name: "${name}",
    kind: ${isPart ? `{ type: "part", slot: "${slot}" }` : `{ type: "attachment", sockets: [${sockets.map((s) => `"${s}"`).join(", ")}] }`},
    deityCompatibility: ["${deity}"],
    stage: "${stage}",
    source: { kind: "glb", path: "${publicPath}" },
    thumbnail: "/assets/${deity}/${category}/${assetName}/${version}/thumbnail.png",
    provenance: ${JSON.stringify(provenance)},
    ${Object.keys(geometryMeta).length ? `geometry: ${JSON.stringify(geometryMeta)},` : ""}
    materialZones: [${materialZones.map((z) => `"${z}"`).join(", ")}],
    category: "${category}",
    printability: { printSourceAvailable: false },
  },`;
await writeFile(path.join(outDir, "manifest-entry.ts.txt"), manifestEntry + "\n");

console.log(`\nManifest entry (also written to manifest-entry.ts.txt):\n${manifestEntry}`);
console.log(`\nNext steps:
  1. Review the entry and add it to packages/asset-system/src/manifests/${deity}.ts
  2. pnpm validate-assets
  3. node scripts/generate-thumbnails.mjs   (with the dev server running)
  4. Inspect at /dev/assets/${id} and test in Divine Studio`);
