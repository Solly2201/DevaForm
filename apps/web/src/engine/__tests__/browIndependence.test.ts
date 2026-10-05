/**
 * Eye spacing moves the eyes. It must not thin the eyebrows.
 *
 * Reported from using the editor: dragging eye spacing wider makes the
 * brows look thinner. They are separate facial features and one control
 * should not quietly operate the other.
 *
 * WHAT IS MEASURED, and why it is not the tube's radius. The brow is a
 * tapered tube of a fixed radius, so its geometry is trivially unchanged
 * by spacing and a test on the raw mesh would pass while the defect was
 * still on screen. What a customer sees is how much of the brow is
 * OUTSIDE the face — a brow laid on a curved brow plate at a constant
 * depth sinks into it as it travels outward, and a brow half-buried in
 * the skull reads as a thinner brow.
 *
 * So this measures the visible part: brow vertices standing proud of the
 * head's own surface, at narrow, default and wide spacing.
 */
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () =>
  import("./glbLoader").then((module) => module.diskLoader()),
);

import {
  createDefaultGaneshaConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport } from "../rig";
import { ZoneMaterials } from "../materials";
import { deformedVertex } from "../skinning";
import { skinFieldOf, insideSkin } from "../spatial/skinDepth";

async function build(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  let rig = buildRig(config, materials);
  for (let attempt = 0; attempt < 6 && rig.pending.length > 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    rig = buildRig(config, materials);
  }
  poseRig(rig, config.pose);
  settleOnSupport(rig);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

/**
 * The brows, found by their material rather than by a name: they are the
 * only thing in the eye assembly drawn in the secondary skin tone, and
 * the generator builds them as bare meshes without a group of their own.
 */
function browMeshes(rig: ReturnType<typeof buildRig>): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  rig.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as THREE.Material & { name?: string };
    // Zone materials are named `zone:<zone>` — see ZoneMaterials.
    if (material?.name === "zone:skinSecondary") found.push(mesh);
  });
  return found;
}

/** How many of a mesh's vertices stand outside the figure's own skin. */
function visibleVertices(
  rig: ReturnType<typeof buildRig>,
  meshes: readonly THREE.Mesh[],
): { visible: number; total: number } {
  const field = skinFieldOf([...rig.bodyMeshes]);
  const point = new THREE.Vector3();
  let visible = 0;
  let total = 0;
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute("position");
    if (!position) continue;
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < position.count; i += 1) {
      deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
      total += 1;
      if (!insideSkin(field, point)) visible += 1;
    }
  }
  return { visible, total };
}

describe("eye spacing does not operate the eyebrows", () => {
  it(
    "the same amount of brow is visible at narrow, default and wide spacing",
    async () => {
      const readings: Array<{ spacing: number; visible: number; total: number }> = [];
      for (const spacing of [-1, 0, 1]) {
        const base = createDefaultGaneshaConfiguration();
        const config: CharacterConfiguration = {
          ...base,
          morphs: { ...base.morphs, eyeSpacing: spacing },
        };
        const { rig, materials } = await build(config);
        try {
          const brows = browMeshes(rig);
          expect(brows.length, `brows exist at spacing ${spacing}`).toBeGreaterThan(0);
          readings.push({ spacing, ...visibleVertices(rig, brows) });
        } finally {
          materials.dispose();
        }
      }

      // Every reading describes the same two brows, so the vertex count
      // cannot change — only how many of them are out in the light.
      const counts = new Set(readings.map((r) => r.total));
      expect(counts.size, "the brows are the same geometry throughout").toBe(1);

      const fractions = readings.map((r) => r.visible / Math.max(1, r.total));
      const spread = Math.max(...fractions) - Math.min(...fractions);
      /**
       * FIVE PER CENT.
       *
       * The brow travels sideways by design — it belongs above its eye —
       * so a little more or less of its outer end meets the curve of the
       * head. What must not happen is the brow sinking into the face as
       * it moves, which is what reads as thinning.
       */
      expect(
        spread,
        `visible brow: ${readings
          .map((r) => `${r.spacing}: ${((r.visible / r.total) * 100).toFixed(1)}%`)
          .join(", ")}`,
      ).toBeLessThan(0.05);
    },
    240_000,
  );
});
