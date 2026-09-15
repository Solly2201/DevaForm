/**
 * A material that renders vertex colours needs a mesh that has them.
 *
 * Three.js does not warn: a mesh whose material declares `vertexColors`
 * and whose geometry has no colour attribute renders BLACK. In a scene
 * full of cloth that is not a subtle defect — the pleat beside the sash
 * came out as a hole cut through the dhoti in every three-quarter view,
 * and it survived a full render pass because a black shape against a dark
 * background reads as a gap rather than as a piece of geometry.
 *
 * So it is asserted, over every mesh of every configuration that ships.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type * as THREE from "three";

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
  POSE_PRESETS,
  SHIVA_POSE_PRESETS,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig } from "../rig";
import { ZoneMaterials } from "../materials";

const CASES = [
  ...SHIVA_POSE_PRESETS.map((preset) => ["shiva", preset.id, createDefaultShivaConfiguration] as const),
  ...POSE_PRESETS.map((preset) => ["ganesha", preset.id, createDefaultGaneshaConfiguration] as const),
];

describe("nothing renders black for want of a colour attribute", () => {
  it.each(CASES.map(([deity, preset]) => `${deity} ${preset}`))("%s", async (label) => {
    const [, preset, make] = CASES.find(([d, p]) => `${d} ${p}` === label)!;
    const materials = new ZoneMaterials();
    const config = { ...make(), pose: { preset, jointOverrides: {} } };
    buildRig(config, materials);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const rig = buildRig(config, materials);
    poseRig(rig);

    const offenders: string[] = [];
    rig.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const used = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of used) {
        if (!(material as THREE.MeshStandardMaterial).vertexColors) continue;
        if (mesh.geometry.getAttribute("color")) continue;
        offenders.push(`${mesh.name || "(unnamed)"} [${material.name}]`);
      }
    });
    expect(offenders, `${label}: meshes wearing a vertex-colour material without one`).toEqual([]);
    materials.dispose();
  });
});
