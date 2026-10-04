/**
 * A variant is a different thing, not a different name for one.
 *
 * The Studio offered one of each facial feature, which is no choice at
 * all about the part of a statue a devotee looks at. What it offers now
 * is several — and the way it offers them is the thing worth protecting:
 * one generator, a handful of numbers, and the manifest spends them. The
 * failure mode of that bargain is a variant that is declared, listed,
 * selectable, and identical to its neighbour, because the parameter it
 * differs by was never read.
 *
 * So each variant is BUILT and measured against the others. Two assets
 * whose geometry comes out the same are either a duplicate nobody meant
 * to ship or a parameter the generator ignores, and both are worth
 * failing a build over.
 *
 * And they are measured on the SAME body, because that is the other half
 * of the claim: these are built from whatever skull is wearing them, so
 * one set of assets serves every human-faced deity rather than one set
 * per deity.
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
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
  type PartSlot,
} from "@devaform/character-schema";
import { listAssets } from "@devaform/asset-system";
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
 * What a part actually came out as: how much of it there is, and where.
 *
 * Vertex count alone would miss a parameter that moves geometry without
 * adding any — which is most of them — so the bounds come too, rounded to
 * a tenth of a millimetre.
 */
function shapeOf(rig: Awaited<ReturnType<typeof rigFor>>["rig"], assetId: string): string {
  let vertices = 0;
  const box = new THREE.Box3();
  box.makeEmpty();
  rig.root.traverse((node) => {
    if (node.name !== `part:${assetId}`) return;
    node.updateWorldMatrix(true, true);
    node.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const position = mesh.geometry?.getAttribute("position");
      if (!mesh.isMesh || !position) return;
      vertices += position.count;
      mesh.updateWorldMatrix(true, false);
      box.expandByObject(mesh);
    });
  });
  if (vertices === 0) return "";
  const at = (n: number) => n.toFixed(4);
  return `${vertices}|${at(box.min.x)},${at(box.min.y)},${at(box.min.z)},${at(box.max.x)},${at(box.max.y)},${at(box.max.z)}`;
}

const SUBJECTS = [
  { label: "shiva", make: createDefaultShivaConfiguration },
  { label: "vishnu", make: createDefaultVishnuConfiguration },
] as const;

/** The feature slots a customer is offered a choice in. */
const FEATURE_SLOTS: PartSlot[] = ["brows", "hair"];

describe("every offered feature variant is its own shape", () => {
  for (const subject of SUBJECTS) {
    for (const slot of FEATURE_SLOTS) {
      const offered = listAssets({ deity: subject.make().deity, slot });
      if (offered.length === 0) continue;

      it(`${subject.label} · ${slot}: ${offered.length} offered, all distinct`, async () => {
        expect(offered.length, "a choice means more than one").toBeGreaterThan(1);

        const shapes = new Map<string, string>();
        for (const asset of offered) {
          const base = subject.make();
          const config: CharacterConfiguration = {
            ...base,
            parts: { ...base.parts, [slot]: { assetId: asset.id, version: asset.version } },
          };
          const { rig, materials } = await rigFor(config);
          try {
            const shape = shapeOf(rig, asset.id);
            expect(shape, `${asset.id} built nothing`).not.toBe("");
            shapes.set(asset.id, shape);
          } finally {
            materials.dispose();
          }
        }

        const distinct = new Set(shapes.values());
        expect(
          distinct.size,
          `these came out identical: ${[...shapes.keys()].join(", ")}`,
        ).toBe(offered.length);
      }, 120_000);
    }
  }

  /**
   * And they are the SAME assets on both faces.
   *
   * The point of building a feature from the measured skull is that one
   * set serves every human-faced deity. A brow that had to be authored
   * per deity would be a brow authored against a body.
   */
  it("the brows are shared between the deities that have a face for them", () => {
    const shiva = listAssets({ deity: "shiva", slot: "brows" }).map((a) => a.id);
    const vishnu = listAssets({ deity: "vishnu", slot: "brows" }).map((a) => a.id);
    expect(shiva.length).toBeGreaterThan(1);
    expect(vishnu).toEqual(shiva);
    // And not offered to a deity with no human face to put them on.
    expect(listAssets({ deity: "ganesha", slot: "brows" })).toEqual([]);
  });

  /**
   * A face that cannot be changed is the defect this fixes, so the
   * default has to actually wear one — a feature nobody is shown is a
   * feature nobody finds.
   */
  it("both faces arrive wearing a brow", () => {
    expect(createDefaultShivaConfiguration().parts.brows).toBeDefined();
    expect(createDefaultVishnuConfiguration().parts.brows).toBeDefined();
  });
});
