// Quick CLI: print container stats + per-accessor min/max for a GLB.
import { readFileSync } from "node:fs";
import { parseGlbJson, glbStats } from "./lib/glb.mjs";

const file = process.argv[2];
const json = parseGlbJson(readFileSync(file));
console.log(JSON.stringify(glbStats(json), null, 1));
for (const mesh of json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    const acc = json.accessors?.[prim.attributes?.POSITION];
    if (acc) console.log(mesh.name, "POSITION min", acc.min, "max", acc.max);
    console.log(mesh.name, "attrs", Object.keys(prim.attributes ?? {}), "material", prim.material);
  }
}
