/**
 * Two garments worn together occupy different volumes.
 *
 * Shiva's reference dress is three layers — a cream dhoti to the ankle, a
 * tiger skin slung over the hips, an ochre sash — and for a while it read
 * as two. The skin's own tail and the cream it was worn over came out as
 * a single washed-out tan patch across the thigh, which is what "two
 * representations of the same garment" looks like from outside.
 *
 * It was not a render-order problem and could not have been fixed by one.
 * The skin WAS given extra clearance for being worn over cloth; what the
 * number allowed for was the cream's spine, and `dhotiColumn` gathers by
 * a fifth of its own radius — about twenty-four millimetres on this body,
 * which is more than the twenty-five the skin stood off by. The cream's
 * fold crests came through the hide wherever they met. Cloth that gathers
 * is thicker than the surface it is lofted from, and an outer layer has
 * to clear the gathers rather than the loft.
 *
 * So this measures the relationship rather than the appearance: where two
 * garments share a height, the outer one's surface must be outside the
 * inner one's.
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
  createDefaultShivaConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, type CharacterRig } from "../rig";
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

const wearing = (assetId: string): CharacterConfiguration => {
  const base = createDefaultShivaConfiguration();
  return { ...base, parts: { ...base.parts, lowerGarment: { assetId, version: 2 } } };
};

/**
 * The garment's meshes, split by material.
 *
 * The hide and the cloth are one PART — layers of one garment rather than
 * two assets — so they cannot be told apart by node name. They can be
 * told apart by what they are made of, which is the thing that makes them
 * read as different garments in the first place.
 */
function layers(rig: CharacterRig, assetId: string): Map<string, THREE.Vector3[]> {
  const byMaterial = new Map<string, THREE.Vector3[]>();
  rig.root.traverse((node) => {
    if (node.name !== `part:${assetId}`) return;
    node.updateWorldMatrix(true, true);
    node.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const position = mesh.geometry?.getAttribute("position");
      if (!mesh.isMesh || !position || Array.isArray(mesh.material)) return;
      /**
       * By material AND by whether it is textured.
       *
       * The accent zone carries three different things on this garment —
       * the skin, the sash, and the dhoti's own hem border — and only the
       * skin is mapped with the rosettes. Keyed on the zone alone, a
       * comparison of "skin versus cloth" quietly becomes a comparison of
       * the dhoti's hem border with the dhoti, which is not a layering
       * question at all.
       */
      const material = mesh.material as THREE.Material & { map?: THREE.Texture | null };
      const key = `${material.name || "unnamed"}${material.map ? ":mapped" : ""}`;
      const bucket = byMaterial.get(key) ?? [];
      mesh.updateWorldMatrix(true, false);
      for (let i = 0; i < position.count; i += 3) {
        bucket.push(
          new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld),
        );
      }
      byMaterial.set(key, bucket);
    });
  });
  return byMaterial;
}

/** How far out from the body's own vertical axis a point sits. */
const radiusOf = (point: THREE.Vector3) => Math.hypot(point.x, point.z);

describe("Shiva's layered dress is layered", () => {
  /**
   * ONLY THE ONE THAT HAS BOTH.
   *
   * The short dhoti used to be in this list and was built with `hide: 1`,
   * so a customer who chose "Short Dhoti" got a full tiger skin slung
   * over the hips, indistinguishable in character from the asset next to
   * it called "Dhoti and Tiger Hide". Two of four lower garments were the
   * same costume at two lengths, and the combination the asset was NAMED
   * after could not be reached at all.
   *
   * What this list protected for it was "the hide is outside the cloth",
   * which is not a question any more. The protection has moved rather
   * than gone: `the cloth-only garments wear no hide` below holds a
   * stronger thing, that the four choices remain four choices.
   */
  for (const assetId of ["shiva.garment.tigerHide"]) {
    it(`${assetId}: the skin sits outside the cloth it is worn over`, async () => {
      const { rig, materials } = await rigFor(wearing(assetId));
      try {
        const byMaterial = layers(rig, assetId);
        const names = [...byMaterial.keys()];
        expect(
          names.length,
          `${assetId} has more than one layer: ${names.join(", ")}`,
        ).toBeGreaterThan(1);

        const hide = byMaterial.get("zone:garmentAccent:mapped") ?? [];
        const cloth = byMaterial.get("zone:garment:mapped") ?? [];
        expect(hide.length, `there is hide to measure (${names.join(", ")})`).toBeGreaterThan(50);
        expect(cloth.length, `there is cloth to measure (${names.join(", ")})`).toBeGreaterThan(50);

        /**
         * WHERE THEY SHARE A HEIGHT, the skin is further out.
         *
         * Compared band by band rather than as a whole, because the cream
         * reaches the ankle and the skin stops at the thigh: one
         * worst-case over the whole garment would be comparing a hem with
         * a hip. Within a band they are the same place on the body, and
         * the outer layer has to be outside.
         */
        const BAND = 0.03;
        const inBand = (points: readonly THREE.Vector3[], centre: number) =>
          points.filter((point) => Math.abs(point.y - centre) < BAND / 2);
        const low = Math.min(...hide.map((point) => point.y));
        const high = Math.max(...hide.map((point) => point.y));
        let compared = 0;
        const complaints: string[] = [];
        for (let y = low + BAND; y < high; y += BAND) {
          const hideBand = inBand(hide, y);
          const clothBand = inBand(cloth, y);
          if (hideBand.length < 8 || clothBand.length < 8) continue;
          compared += 1;
          const hideOut = Math.max(...hideBand.map(radiusOf));
          const clothOut = Math.max(...clothBand.map(radiusOf));
          if (hideOut < clothOut - 0.001) {
            complaints.push(
              `at ${(y * 1000).toFixed(0)}mm the cloth reaches ${(clothOut * 1000).toFixed(1)}mm ` +
                `and the skin only ${(hideOut * 1000).toFixed(1)}mm`,
            );
          }
        }
        expect(compared, "the two layers share some height to compare").toBeGreaterThan(2);
        expect(complaints, complaints.join("; ")).toEqual([]);
      } finally {
        materials.dispose();
      }
    }, 180_000);
  }

  /**
   * And a SHORTER garment is actually shorter.
   *
   * The short dhoti is offered as its own choice, and a choice that comes
   * out the same length as the full one is not one.
   */
  /**
   * And the choices stay distinct.
   *
   * A catalogue of four lower garments where two draw the same hide is a
   * catalogue of three, and the customer cannot tell from the names which
   * two. The hide is the mapped accent material — the rosettes — so its
   * absence is measurable rather than a matter of opinion.
   */
  it("the cloth-only garments wear no hide", async () => {
    for (const assetId of ["shiva.garment.dhoti", "shiva.garment.dhotiShort"]) {
      const { rig, materials } = await rigFor(wearing(assetId));
      try {
        const byMaterial = layers(rig, assetId);
        const hide = byMaterial.get("zone:garmentAccent:mapped") ?? [];
        const cloth = byMaterial.get("zone:garment:mapped") ?? [];
        expect(cloth.length, `${assetId} is made of cloth`).toBeGreaterThan(50);
        expect(
          hide.length,
          `${assetId} says it is cloth only, and ${hide.length} vertices of hide were built`,
        ).toBe(0);
      } finally {
        materials.dispose();
      }
    }
  }, 300_000);

  it("the short dhoti is shorter than the full one", async () => {
    const full = await rigFor(wearing("shiva.garment.tigerHide"));
    const short = await rigFor(wearing("shiva.garment.dhotiShort"));
    try {
      const hemOf = (rig: CharacterRig, id: string) => {
        const cloth = layers(rig, id).get("zone:garment:mapped") ?? [];
        expect(cloth.length).toBeGreaterThan(50);
        return Math.min(...cloth.map((point) => point.y));
      };
      const longHem = hemOf(full.rig, "shiva.garment.tigerHide");
      const shortHem = hemOf(short.rig, "shiva.garment.dhotiShort");
      expect(
        shortHem - longHem,
        `the short hem is at ${(shortHem * 1000).toFixed(0)}mm, the full one at ${(longHem * 1000).toFixed(0)}mm`,
      ).toBeGreaterThan(0.04);
    } finally {
      full.materials.dispose();
      short.materials.dispose();
    }
  }, 180_000);
});
