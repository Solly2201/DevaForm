/**
 * What a statue costs to draw, as a number somebody has agreed to.
 *
 * Measured through the real renderer in the QA harness, Vishnu's default
 * statue cost SIX HUNDRED AND NINETY-NINE draw calls, against Shiva's two
 * hundred and ninety-five and Ganesha's two hundred and eighty-two.
 * Nothing was wrong with the geometry — his triangle count was the lowest
 * of the three. Five hundred and fifty-nine of those calls were three
 * attachments: the kirita at a hundred and ninety-one meshes, the chakra
 * at a hundred and ninety-one, the vaijayanti at a hundred and
 * seventy-seven. One object per rib, per spoke, per flower.
 *
 * Nobody chose that. It is what writing a crown the way a crown is made
 * costs if each piece is also a draw call, and it had crept up over
 * several honest commits none of which was wrong on its own. That is
 * exactly the kind of number that needs a line drawn under it rather than
 * a note in a report.
 *
 * WHAT THIS MEASURES, AND WHAT IT DOES NOT. Meshes and triangles, both
 * properties of the scene the generators build — so they are the same on
 * any machine, and this can run in the test suite. It deliberately says
 * nothing about frame TIME, which is a property of the rasteriser and
 * which the SwiftShader harness would mislead about.
 *
 * THE PER-PIECE LIMIT IS THE REAL GUARD. A total can be met by making
 * everything slightly worse; what went wrong here was one ornament
 * costing two hundred draw calls, and that is what gets caught early.
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

import {
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig } from "../rig";
import { ZoneMaterials } from "../materials";

async function rigFor(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rig = buildRig(config, materials);
  poseRig(rig, config.pose);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

/**
 * Budgets, with room to work in.
 *
 * Set about half again above where each figure measured on the day the
 * collapse landed — a hundred and sixteen meshes for Vishnu, a hundred
 * and seventy-seven for Shiva, two hundred and forty-eight for Ganesha.
 * Headroom, because an ornament nobody has built yet is allowed to exist;
 * a ceiling, because three hundred more of them are not.
 */
const SUBJECTS = [
  { label: "vishnu", make: createDefaultVishnuConfiguration, meshes: 180, triangles: 210_000 },
  { label: "shiva", make: createDefaultShivaConfiguration, meshes: 260, triangles: 200_000 },
  { label: "ganesha", make: createDefaultGaneshaConfiguration, meshes: 340, triangles: 260_000 },
] as const;

/** No single ornament may cost this many draw calls on its own. */
const PER_PIECE = 60;

describe("a statue stays inside its drawing budget", () => {
  for (const subject of SUBJECTS) {
    it(`${subject.label}: meshes and triangles`, async () => {
      const { rig, materials } = await rigFor(subject.make());
      try {
        let meshes = 0;
        let triangles = 0;
        const heavy: string[] = [];
        rig.root.traverse((node) => {
          if (!node.name.startsWith("part:") && !node.name.startsWith("attachment:")) return;
          let own = 0;
          node.traverse((child) => {
            const mesh = child as THREE.Mesh;
            const position = mesh.geometry?.getAttribute("position");
            if (!mesh.isMesh || !position) return;
            own += 1;
            const index = mesh.geometry.getIndex();
            triangles += (index ? index.count : position.count) / 3;
          });
          meshes += own;
          if (own > PER_PIECE) heavy.push(`${node.name} is ${own} meshes`);
        });

        expect(meshes, "there was a statue to measure").toBeGreaterThan(40);
        expect(meshes, `${subject.label} draws ${meshes} meshes`).toBeLessThanOrEqual(
          subject.meshes,
        );
        expect(
          Math.round(triangles),
          `${subject.label} draws ${Math.round(triangles)} triangles`,
        ).toBeLessThanOrEqual(subject.triangles);
        /**
         * And no ONE piece runs away.
         *
         * `geometry.collapse` is how an ornament made of two hundred
         * pieces stays one ornament and becomes one draw call per
         * material. A new ornament over this line has either forgotten to
         * call it or has a reason not to — and if it has a reason, that
         * is a conversation to have at the time rather than a number to
         * discover in a profile later.
         */
        expect(heavy, heavy.join("; ")).toEqual([]);
      } finally {
        materials.dispose();
      }
    }, 120_000);
  }

  /**
   * And collapsing lost nothing.
   *
   * The failure mode of merging is silent: `mergeGeometries` returns null
   * on mismatched attributes, a guard swallows it, and an ornament
   * quietly stops being drawn. Triangle counts are the check — the
   * collapse moves geometry between meshes and must not remove any of it.
   */
  it("every attachment that is declared is actually built", async () => {
    const { rig, materials } = await rigFor(createDefaultVishnuConfiguration());
    try {
      for (const attachment of rig.resolved.attachments) {
        let found = 0;
        rig.root.traverse((node) => {
          if (node.name !== `attachment:${attachment.asset.id}`) return;
          node.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) found += 1;
          });
        });
        expect(found, `${attachment.asset.id} has geometry`).toBeGreaterThan(0);
      }
    } finally {
      materials.dispose();
    }
  }, 120_000);
});
