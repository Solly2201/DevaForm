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
import {
  GANESHA_SKELETON,
  HUMANOID_SKELETON,
  HUMAN_FOUR_ARM_SKELETON,
  HUMAN_SKELETON,
  MATERIAL_ZONES,
  PART_SLOTS,
  SKELETON,
  SOCKETS,
  type SkeletonDefinition,
} from "../src/index";

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
  /**
   * The individual skeletons, so tooling can check an asset against the
   * anatomy it DECLARES rather than against the union of every anatomy
   * that exists. A body built for the human rig must not ship bones for
   * a second pair of arms, and only this tells a validator that.
   */
  skeletons: Object.fromEntries(
    (
      [
        HUMANOID_SKELETON,
        GANESHA_SKELETON,
        HUMAN_SKELETON,
        HUMAN_FOUR_ARM_SKELETON,
      ] as SkeletonDefinition[]
    ).map(
      (skeleton) => [
        skeleton.id,
        {
          joints: skeleton.joints.map((joint) => joint.id),
          sockets: skeleton.sockets.map((socket) => socket.id),
          armSlots: skeleton.armSlots,
          extensions: skeleton.extensions,
        },
      ],
    ),
  ),
  materialZones: MATERIAL_ZONES,
  partSlots: PART_SLOTS,
};

const file = path.join(outDir, "canonical-rig.json");
writeFileSync(file, JSON.stringify(payload, null, 2));
console.log(`wrote ${file}`);
console.log(
  `  ${payload.skeleton.length} joints, ${payload.sockets.length} sockets, ${payload.materialZones.length} zones`,
);
for (const [id, skeleton] of Object.entries(payload.skeletons)) {
  console.log(`  skeleton ${id}: ${skeleton.joints.length} joints, ${skeleton.armSlots.length} arms`);
}
