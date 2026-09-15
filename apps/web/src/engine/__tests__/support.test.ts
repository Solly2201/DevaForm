/**
 * A statue stands on its base.
 *
 * Not "approximately on", and not "on, in the one pose the offset was
 * typed for". Every pose of every deity puts the lowest point of the body
 * on the support and nothing below it — which is the whole of what a
 * viewer checks first, without knowing they are checking it.
 *
 * The real body meshes are loaded here, from the files that ship: a
 * measured mesh body is the case that broke, and a test that mocks it away
 * cannot see the break. Seated poses were levitating a hand's breadth
 * above the base for exactly as long as nothing measured them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

const PUBLIC_DIR = join(__dirname, "..", "..", "..", "public");

// The real loader, fed from disk. GLTFLoader.parse needs no network, so a
// test can have the actual asset instead of a stand-in for it.
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", async () => {
  interface RealLoader {
    parse(
      data: ArrayBuffer,
      path: string,
      onLoad: (gltf: { scene: THREE.Group }) => void,
    ): void;
  }
  const actual = await vi.importActual<{ GLTFLoader: new () => RealLoader }>(
    "three/examples/jsm/loaders/GLTFLoader.js",
  );
  return {
    GLTFLoader: class {
      private readonly real = new actual.GLTFLoader();
      load(
        path: string,
        onLoad: (gltf: { scene: THREE.Group }) => void,
        _progress?: unknown,
        onError?: (error: unknown) => void,
      ): void {
        try {
          const file = readFileSync(join(PUBLIC_DIR, path.replace(/^\//, "")));
          const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
          this.real.parse(buffer as ArrayBuffer, "", onLoad);
        } catch (error) {
          onError?.(error);
        }
      }
    },
  };
});

import {
  POSE_PRESETS,
  SHIVA_POSE_PRESETS,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig } from "../rig";
import { deformedVertex } from "../skinning";
import { ZoneMaterials } from "../materials";

/** The lowest point of the body itself, in the statue's own space. */
function lowestFlesh(rig: ReturnType<typeof buildRig>): number {
  const point = new THREE.Vector3();
  let lowest = Number.POSITIVE_INFINITY;
  for (const mesh of rig.bodyMeshes) {
    const position = mesh.geometry.getAttribute("position");
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < position.count; i += 1) {
      deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
      lowest = Math.min(lowest, rig.root.worldToLocal(point).y);
    }
  }
  return lowest;
}

async function rigFor(config: CharacterConfiguration): Promise<{
  rig: ReturnType<typeof buildRig>;
  materials: ZoneMaterials;
}> {
  const materials = new ZoneMaterials();
  // The cache answers "loading" until the parse settles, so the rig is
  // built once to ask for the file and again once it has arrived.
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rig = buildRig(config, materials);
  poseRig(rig);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

const CASES = [
  ...POSE_PRESETS.map((preset) => ["ganesha", preset, createDefaultGaneshaConfiguration] as const),
  ...SHIVA_POSE_PRESETS.map((preset) => ["shiva", preset, createDefaultShivaConfiguration] as const),
];

describe("a statue rests on its base", () => {
  it.each(CASES.map(([deity, preset]) => `${deity} ${preset.id}`))("%s", async (label) => {
    const [, preset, make] = CASES.find(([d, p]) => `${d} ${p.id}` === label)!;
    const { rig, materials } = await rigFor({
      ...make(),
      pose: { preset: preset.id, jointOverrides: {} },
    });
    expect(rig.pending, `${label}: every asset loaded`).toEqual([]);
    expect(rig.bodyMeshes.length, `${label}: the body is in the scene`).toBeGreaterThan(0);

    const lowest = lowestFlesh(rig);
    // Half a millimetre at statue scale: contact, not an approach.
    expect(
      Math.abs(lowest - rig.baseTop),
      `${label}: the body's lowest point is ${((lowest - rig.baseTop) * 1000).toFixed(1)} mm ` +
        `from the base (+ floats, − sinks)`,
    ).toBeLessThan(0.0005);
    materials.dispose();
  });

  it("barely moves a standing figure, which already stood almost correctly", async () => {
    // The mesh body is modelled with its soles on the ground, so settling
    // a standing pose moves it by the width of a pencil line — which is
    // the proof that this REPLACED the authored offsets rather than adding
    // a second placement step on top of them.
    const { rig, materials } = await rigFor(createDefaultShivaConfiguration());
    expect(Math.abs(rig.joints.get("root")!.position.y)).toBeLessThan(0.001);
    materials.dispose();
  });
});
