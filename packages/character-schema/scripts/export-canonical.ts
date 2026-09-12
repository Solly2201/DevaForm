/**
 * Exports the canonical rig contract (skeleton, sockets, material zones,
 * part slots) as JSON for DCC tooling — the Blender template builds its
 * armature and socket empties from this file, so the rig can never drift
 * from the schema.
 *
 * Run: pnpm --filter @devaform/character-schema export-canonical
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MATERIAL_ZONES, PART_SLOTS, SKELETON, SOCKETS } from "../src/index";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "..", "..", "..", "tools", "blender");
mkdirSync(outDir, { recursive: true });

const payload = {
  units: "meters",
  orientation: { up: "+Y", forward: "+Z" },
  canonicalHeightM: 1.0,
  skeleton: SKELETON.map((joint) => ({
    id: joint.id,
    parent: joint.parent,
    position: joint.position,
  })),
  sockets: SOCKETS.map((socket) => ({
    id: socket.id,
    joint: socket.joint,
    position: socket.position,
    rotation: socket.rotation,
  })),
  materialZones: MATERIAL_ZONES,
  partSlots: PART_SLOTS,
};

const file = path.join(outDir, "canonical-rig.json");
writeFileSync(file, JSON.stringify(payload, null, 2));
console.log(`wrote ${file}`);
console.log(
  `  ${payload.skeleton.length} joints, ${payload.sockets.length} sockets, ${payload.materialZones.length} zones`,
);
