/**
 * A customisation product must not be able to generate a broken statue.
 *
 * Every combination of morph weights the editor can produce is a product
 * the customer might order, so every one of them has to hold together:
 * the garment still contains the legs, the serpent still lies outside the
 * chest, the collar ornaments still sit on the body rather than in it.
 *
 * The extremes are what matter. A body profile blends scalar
 * measurements per morph, and everything fitted to the body reads that
 * blend — so the question is not whether the middle of the range works
 * (it demonstrably does) but whether the corners do.
 *
 * The real body mesh is loaded here: a fit that is only checked against a
 * stand-in is not checked.
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
import { getAvailableDeity } from "@devaform/asset-system";
import { buildRig, poseRig } from "../rig";
import { ZoneMaterials } from "../materials";

/**
 * The morph combinations a customer can actually reach.
 *
 * The editor offers body VARIANTS — named silhouettes, each a set of
 * weights — plus the deity's own default. Anything outside that set is
 * not a product, so the corners tested here are the corners that exist,
 * plus the two degenerate ones (nothing at all, and everything at once)
 * which the schema permits even though no picker produces them.
 */
function combinations(): Array<{ name: string; morphs: Record<string, number> }> {
  const shiva = getAvailableDeity("shiva");
  const targets = ["bodyLean", "bodyAthletic", "bodyPowerful", "bodyHeroic", "bodyAscetic"];
  const cases: Array<{ name: string; morphs: Record<string, number> }> = [
    { name: "default", morphs: createDefaultShivaConfiguration().morphs },
    { name: "none", morphs: {} },
    {
      name: "every body morph at full",
      morphs: Object.fromEntries(targets.map((target) => [target, 1])),
    },
    {
      name: "heaviest and leanest together",
      morphs: { bodyPowerful: 1, bodyHeroic: 1, bodyAscetic: 1, bodyLean: 1 },
    },
  ];
  for (const variant of shiva?.bodyVariants ?? []) {
    cases.push({ name: `variant ${variant.id}`, morphs: { ...variant.morphs } });
  }
  // And each morph alone, at the top of its range.
  for (const target of targets) cases.push({ name: `${target} alone`, morphs: { [target]: 1 } });
  return cases;
}

async function rigFor(config: CharacterConfiguration): Promise<{
  rig: ReturnType<typeof buildRig>;
  materials: ZoneMaterials;
}> {
  const materials = new ZoneMaterials();
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rig = buildRig(config, materials);
  poseRig(rig);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

/** Every vertex of one named attachment, in the statue's own space. */
function pointsOf(rig: ReturnType<typeof buildRig>, name: string): THREE.Vector3[] {
  let found: THREE.Object3D | null = null;
  rig.root.traverse((object) => {
    if (object.name === name) found = object;
  });
  if (!found) return [];
  const points: THREE.Vector3[] = [];
  const point = new THREE.Vector3();
  (found as THREE.Object3D).traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.updateWorldMatrix(true, false);
    const position = mesh.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i += 5) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      points.push(rig.root.worldToLocal(point.clone()));
    }
  });
  return points;
}

/**
 * The TORSO's skin, in the same space, as a coarse height-slice index.
 *
 * The torso only. At chest height a slice of the whole body also holds
 * two arms, and a wedge of it aimed at a shoulder answers with the
 * outside of an upper arm — which makes a serpent lying on the collarbone
 * look a centimetre deep in flesh that is not there. Vertices are chosen
 * by the bone that owns them, which is the one thing that cannot be
 * confused by where a limb happens to be.
 */
function skinSlices(rig: ReturnType<typeof buildRig>): Map<number, THREE.Vector2[]> {
  const SLICE = 0.01;
  const TORSO = /^(pelvis|spine|chest|neck)$/;
  const slices = new Map<number, THREE.Vector2[]>();
  const point = new THREE.Vector3();
  for (const mesh of rig.bodyMeshes) {
    const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh
      ? (mesh as THREE.SkinnedMesh)
      : null;
    if (!skinned) continue;
    const position = mesh.geometry.getAttribute("position");
    const joints = mesh.geometry.getAttribute("skinIndex");
    const weights = mesh.geometry.getAttribute("skinWeight");
    const isTorso = skinned.skeleton.bones.map((bone) =>
      TORSO.test(bone.name.replace(/^joint:/, "").replace(/_/g, ".")),
    );
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < position.count; i += 1) {
      let share = 0;
      for (let k = 0; k < 4; k += 1) {
        const bone = [joints.getX(i), joints.getY(i), joints.getZ(i), joints.getW(i)][k]!;
        const weight = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)][k]!;
        if (isTorso[bone]) share += weight;
      }
      if (share < 0.75) continue;
      point.fromBufferAttribute(position, i);
      skinned.applyBoneTransform(i, point);
      point.applyMatrix4(mesh.matrixWorld);
      rig.root.worldToLocal(point);
      const key = Math.round(point.y / SLICE);
      const slice = slices.get(key);
      const flat = new THREE.Vector2(point.x, point.z);
      if (slice) slice.push(flat);
      else slices.set(key, [flat]);
    }
  }
  return slices;
}

/**
 * How far inside the skin a point is, along its own bearing about the
 * body's axis at that height. Positive means buried.
 */
function depthInside(slices: Map<number, THREE.Vector2[]>, point: THREE.Vector3): number {
  const slice = slices.get(Math.round(point.y / 0.01));
  if (!slice || slice.length < 16) return 0;
  const centre = new THREE.Vector2();
  for (const flat of slice) centre.add(flat);
  centre.multiplyScalar(1 / slice.length);
  const here = new THREE.Vector2(point.x, point.z).sub(centre);
  const bearing = Math.atan2(here.y, here.x);
  // The skin on this bearing: the furthest vertex within a narrow wedge.
  let skin = 0;
  for (const flat of slice) {
    const offset = flat.clone().sub(centre);
    const angle = Math.atan2(offset.y, offset.x) - bearing;
    const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
    if (Math.abs(wrapped) > 0.25) continue;
    skin = Math.max(skin, offset.length());
  }
  return skin === 0 ? 0 : skin - here.length();
}

describe("no morph combination breaks the statue", () => {
  const cases = combinations();

  it.each(cases.map((entry) => entry.name))("%s", async (name) => {
    const { morphs } = cases.find((entry) => entry.name === name)!;
    const { rig, materials } = await rigFor({
      ...createDefaultShivaConfiguration(),
      morphs,
    });
    expect(rig.pending, `${name}: every asset loaded`).toEqual([]);
    expect(rig.warnings, `${name}: nothing failed to resolve`).toEqual([]);

    const slices = skinSlices(rig);
    // Ornaments worn ON the body: a few millimetres inside is contact,
    // a centimetre is a bead swallowed by a chest.
    for (const [attachment, allowed] of [
      ["attachment:shiva.ornament.naga", 0.006],
      ["attachment:shiva.mala.rudraksha", 0.008],
    ] as const) {
      const points = pointsOf(rig, attachment);
      expect(points.length, `${name}: ${attachment} is in the scene`).toBeGreaterThan(20);
      let worst = 0;
      for (const point of points) worst = Math.max(worst, depthInside(slices, point));
      expect(
        worst,
        `${name}: ${attachment} is ${(worst * 1000).toFixed(1)} mm inside the body`,
      ).toBeLessThan(allowed);
    }

    // And the figure still stands on its base whatever shape it is.
    let lowest = Number.POSITIVE_INFINITY;
    const point = new THREE.Vector3();
    for (const mesh of rig.bodyMeshes) {
      const position = mesh.geometry.getAttribute("position");
      const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh
        ? (mesh as THREE.SkinnedMesh)
        : null;
      for (let i = 0; i < position.count; i += 1) {
        point.fromBufferAttribute(position, i);
        if (skinned) skinned.applyBoneTransform(i, point);
        point.applyMatrix4(mesh.matrixWorld);
        lowest = Math.min(lowest, rig.root.worldToLocal(point).y);
      }
    }
    expect(
      Math.abs(lowest - rig.baseTop),
      `${name}: the body's lowest point is ${((lowest - rig.baseTop) * 1000).toFixed(1)} mm from the base`,
    ).toBeLessThan(0.002);
    materials.dispose();
  });
});
