/**
 * A band that says it goes ROUND a limb has no metal inside the figure.
 *
 * WHY THIS IS NOT ALREADY COVERED. `wornFit.test` asks whether a band's
 * hole admits the limb, and it asks `BodyProfile`, which answers for one
 * bone at a time. Both halves of that are right for the question it
 * answers and neither can see the question this one asks. Measured on
 * the shipped statues, every armlet passed the hole check while sitting
 * inside the figure:
 *
 *   Vishnu   226 vertices in, 16.0 mm deep — of the hundred and ninety-one
 *            counted by bone, EIGHTY-NINE were inside the rear left upper
 *            arm and nineteen inside the chest
 *   Shiva     32 vertices in,  8.5 mm deep
 *   Ganesha   68 vertices in,  8.1 mm deep
 *
 * The band's hole was never the problem: on Vishnu it is four
 * millimetres wider than the arm it encircles. What was wrong was WHERE,
 * and nothing could say so, because the only body any validator could
 * consult was a summary of one limb and the thing in the way was a
 * different limb.
 *
 * So this measures against the triangles that are actually drawn —
 * skinned and morphed, the whole figure, every mesh — and it is indifferent
 * to which bone the obstruction belongs to. That is the only way to state
 * the rule a customer sees: there is no gold inside this statue.
 *
 * WHAT IT DOES NOT CHECK. Looseness. A hole too big is a different defect
 * with a different fix, and `wornFit.test` owns it. This one owns depth.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

const PUBLIC_DIR = join(__dirname, "..", "..", "..", "public");
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", async () => {
  interface RealLoader {
    parse(data: ArrayBuffer, path: string, onLoad: (gltf: { scene: THREE.Group }) => void): void;
  }
  const actual = await vi.importActual<{ GLTFLoader: new () => RealLoader }>(
    "three/examples/jsm/loaders/GLTFLoader.js",
  );
  return {
    GLTFLoader: class {
      private readonly real = new actual.GLTFLoader();
      load(path: string, onLoad: (gltf: { scene: THREE.Group }) => void): void {
        const file = readFileSync(join(PUBLIC_DIR, path.replace(/^\//, "")));
        const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
        this.real.parse(buffer as ArrayBuffer, "", onLoad);
      }
    },
  };
});

import { listAssets } from "@devaform/asset-system";
import {
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport } from "../rig";
import { ZoneMaterials } from "../materials";
import { deformedVertex } from "../skinning";
import { skinDepthAt, skinFieldOf } from "../spatial/skinDepth";

/**
 * What a figure is allowed to bury, and why.
 *
 * Ganesha is the one body in the product with no answer: swept station by
 * station with a ring of the armlet's own radius, a ring round its upper
 * arm is inside the figure at EVERY station — least of all near the
 * shoulder, four millimetres at a third of the arm rising to eight by
 * three quarters. A thick arm carried against a chest that wide leaves
 * nowhere for a ring to pass, and the armpit is where the overlap hides.
 * The number is the measurement, not a margin: if it grows, something
 * changed and this should say so.
 */
const ALLOWED_MM: Record<string, number> = { ganesha: 9, shiva: 2, vishnu: 2 };

async function rigFor(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rig = buildRig(config, materials);
  poseRig(rig, config.pose);
  settleOnSupport(rig);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

/** Asset ids whose fit says they encircle a body region. */
function encircling(): Set<string> {
  const ids = new Set<string>();
  for (const asset of listAssets({})) {
    if (asset.fit?.kind === "encircles") ids.add(asset.id);
  }
  return ids;
}

describe.each([
  ["ganesha", createDefaultGaneshaConfiguration],
  ["shiva", createDefaultShivaConfiguration],
  ["vishnu", createDefaultVishnuConfiguration],
] as const)("%s", (label, make) => {
  it("wears no band inside itself", async () => {
    const { rig, materials } = await rigFor(make());
    try {
      const bands = encircling();
      expect(bands.size, "some asset says it encircles something").toBeGreaterThan(2);
      const field = skinFieldOf(rig.bodyMeshes);
      const body = new Set<THREE.Mesh>(rig.bodyMeshes);
      const allowed = (ALLOWED_MM[label] ?? 2) / 1000;

      const worst = new Map<string, { deep: number; n: number; at: THREE.Vector3 }>();
      const point = new THREE.Vector3();
      rig.root.traverse((node) => {
        const id = node.name.replace(/^(part|attachment):/, "");
        if (id === node.name || !bands.has(id)) return;
        node.traverse((part) => {
          if (!(part instanceof THREE.Mesh) || body.has(part)) return;
          const position = part.geometry.getAttribute("position");
          if (!position) return;
          part.updateWorldMatrix(true, false);
          for (let i = 0; i < position.count; i += 1) {
            deformedVertex(part, i, point).applyMatrix4(part.matrixWorld);
            const depth = skinDepthAt(field, point);
            if (depth <= allowed) continue;
            const row = worst.get(id) ?? { deep: 0, n: 0, at: new THREE.Vector3() };
            row.n += 1;
            if (depth > row.deep) {
              row.deep = depth;
              row.at.copy(point);
            }
            worst.set(id, row);
          }
        });
      });

      const complaints = [...worst.entries()].map(
        ([id, row]) =>
          `${id}: ${row.n} vertices inside the figure, worst ${(row.deep * 1000).toFixed(1)}mm ` +
          `at [${row.at.x.toFixed(3)}, ${row.at.y.toFixed(3)}, ${row.at.z.toFixed(3)}] ` +
          `(allowance ${(allowed * 1000).toFixed(0)}mm)`,
      );
      expect(complaints, complaints.join("; ")).toEqual([]);
    } finally {
      materials.dispose();
    }
  }, 300_000);
});
