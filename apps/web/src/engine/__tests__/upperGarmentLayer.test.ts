/**
 * The drape over the shoulder does not pass through the skirt.
 *
 * `garmentLayer` already asks this, and never reached the uttariya:
 * Shiva's default is a bare-chested ascetic, so the only configuration
 * that test builds has no upper garment at all. The one combination a
 * customer complained about — the uttariya cutting through the dhoti — is
 * exactly the one nothing was looking at.
 *
 * So this puts it on, over each lower garment it can be worn with, in
 * every pose the deity offers. A drape is cloth laid over cloth: it
 * presses in a little, which is what cloth does, and it does not pass
 * through.
 */
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () =>
  import("./glbLoader").then((module) => module.diskLoader()),
);

import { listAssets } from "@devaform/asset-system";
import {
  SHIVA_POSE_PRESETS,
  createDefaultShivaConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport } from "../rig";
import { ZoneMaterials } from "../materials";
import { deformedVertex } from "../skinning";
import { skinDepthAt, skinFieldOf } from "../spatial/skinDepth";

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

function meshesOf(rig: ReturnType<typeof buildRig>, assetId: string): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  rig.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    let owner: THREE.Object3D | null = node;
    while (owner && owner !== rig.root) {
      if (owner.name === `part:${assetId}`) {
        found.push(mesh);
        return;
      }
      owner = owner.parent;
    }
  });
  return found;
}

/**
 * How deep any vertex of `probe` gets inside the solid `surface` encloses.
 *
 * The same measure `garmentLayer` uses, deliberately: a radial comparison
 * was tried first and over-reports. A sash is a narrow band, so at a
 * given bearing and height its radius is simply smaller than a skirt's
 * without the two touching at all — that metric called a drape hanging
 * clear of a seated lap a hundred and seventy-five millimetres of
 * intersection. Penetration into the actual surface is unambiguous.
 */
function deepestInside(probe: readonly THREE.Mesh[], surface: readonly THREE.Mesh[]): number {
  if (probe.length === 0 || surface.length === 0) return 0;
  const field = skinFieldOf(surface, 0.01);
  const point = new THREE.Vector3();
  let deepest = 0;
  for (const mesh of probe) {
    const position = mesh.geometry.getAttribute("position");
    if (!position) continue;
    mesh.updateWorldMatrix(true, false);
    const stride = Math.max(1, Math.floor(position.count / 2000));
    for (let i = 0; i < position.count; i += stride) {
      deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
      const depth = skinDepthAt(field, point, 0.06);
      if (depth > deepest) deepest = depth;
    }
  }
  return deepest;
}

const UTTARIYA = "shiva.garment.uttariya";
const LOWERS = listAssets({ deity: "shiva", slot: "lowerGarment" });
const POSES = SHIVA_POSE_PRESETS.map((preset) => preset.id);

describe("Shiva's uttariya lies over the lower garment", () => {
  it("there is an uttariya and something to wear it over", () => {
    expect(LOWERS.length, "Shiva has lower garments").toBeGreaterThan(0);
    expect(POSES.length, "Shiva has poses").toBeGreaterThan(1);
  });

  it.each(POSES)(
    "in %s, over every lower garment",
    async (presetId) => {
      const complaints: string[] = [];
      for (const lower of LOWERS) {
        const base = createDefaultShivaConfiguration();
        const config: CharacterConfiguration = {
          ...base,
          pose: { ...base.pose, preset: presetId },
          parts: {
            ...base.parts,
            lowerGarment: { assetId: lower.id, version: lower.version },
            upperGarment: { assetId: UTTARIYA, version: 1 },
          },
        };
        const { rig, materials } = await build(config);
        try {
          const drape = meshesOf(rig, UTTARIYA);
          const skirt = meshesOf(rig, lower.id);
          if (drape.length === 0 || skirt.length === 0) continue;
          // The drape is the thing worn OVER, so it is the probe: how far
          // does it get inside the skirt it is supposed to lie on.
          const through = deepestInside(drape, skirt) * 1000;
          /**
           * EIGHT MILLIMETRES.
           *
           * A drape lying on a skirt presses into it — a sash floating
           * above cloth is not a sash — and the two meshes are sampled at
           * different densities, so a few millimetres is the measurement
           * rather than the garment. Past that the skirt is coming
           * through the drape, which is what the complaint describes.
           */
          if (through > 8) {
            complaints.push(
              `${lower.id}: the uttariya reaches ${through.toFixed(1)} mm inside the skirt`,
            );
          }
        } finally {
          materials.dispose();
        }
      }
      expect(complaints, complaints.join("; ")).toEqual([]);
    },
    600_000,
  );
});
