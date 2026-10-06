/**
 * A drape is worn over a body. It does not pass through its arms.
 *
 * `upperGarmentLayer` already asks whether Shiva's uttariya passes
 * through the DHOTI, and it does not. Nothing asked about the arms, and
 * the arms are where it was: the ribbon leaves the left shoulder, runs
 * down the side, and the forearm came through it — visible from the
 * figure's own left at any distance a customer would look from.
 *
 * The question has to be asked about the LIMBS specifically, because the
 * answer for the torso is the opposite: a drape SHOULD press into a
 * chest. Cloth touching a body is cloth; cloth with a forearm through it
 * is a bug. So this measures how deep the garment gets inside the skin,
 * and attributes each penetration to the part of the figure it is in —
 * by which joint it is nearest to, which is the only thing that
 * distinguishes an arm from the chest beside it.
 */
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () =>
  import("./glbLoader").then((module) => module.diskLoader()),
);

import {
  SHIVA_POSE_PRESETS,
  createDefaultShivaConfiguration,
  type CharacterConfiguration,
  type JointId,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport } from "../rig";
import { ZoneMaterials } from "../materials";
import { deformedVertex } from "../skinning";
import { skinDepthAt, skinFieldOf } from "../spatial/skinDepth";

const UTTARIYA = "shiva.garment.uttariya";

/** The joints a garment must stay out of, and the ones it may lie on. */
const LIMB_JOINTS: readonly JointId[] = [
  "arm.frontLeft.upper",
  "arm.frontLeft.forearm",
  "arm.frontLeft.hand",
  "arm.frontRight.upper",
  "arm.frontRight.forearm",
  "arm.frontRight.hand",
];
const TORSO_JOINTS: readonly JointId[] = ["chest", "spine", "pelvis", "head"];

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
  const owners = [`part:${assetId}`, `attachment:${assetId}`];
  rig.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    let owner: THREE.Object3D | null = node;
    while (owner && owner !== rig.root) {
      if (owners.includes(owner.name)) {
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
 * The repository's own penetration measure, as `upperGarmentLayer` uses
 * it: a radial comparison over-reports badly on narrow things, and every
 * one of these is narrow.
 */
function deepestInside(probe: readonly THREE.Mesh[], surface: readonly THREE.Mesh[]): number {
  if (probe.length === 0 || surface.length === 0) return 0;
  const field = skinFieldOf(surface, 0.008);
  const point = new THREE.Vector3();
  let deepest = 0;
  for (const mesh of probe) {
    const position = mesh.geometry.getAttribute("position");
    if (!position) continue;
    mesh.updateWorldMatrix(true, false);
    const stride = Math.max(1, Math.floor(position.count / 2000));
    for (let i = 0; i < position.count; i += stride) {
      deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
      deepest = Math.max(deepest, skinDepthAt(field, point, 0.05));
    }
  }
  return deepest;
}

function placesOf(rig: ReturnType<typeof buildRig>, ids: readonly JointId[]): THREE.Vector3[] {
  const places: THREE.Vector3[] = [];
  for (const id of ids) {
    const joint = rig.joints.get(id);
    if (joint) places.push(joint.getWorldPosition(new THREE.Vector3()));
  }
  return places;
}

/** How near `point` comes to the nearest of a set of places. */
function nearest(point: THREE.Vector3, places: readonly THREE.Vector3[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const place of places) best = Math.min(best, point.distanceTo(place));
  return best;
}

const POSES = SHIVA_POSE_PRESETS.map((preset) => preset.id);

describe("Shiva's uttariya stays out of his arms", () => {
  it("there are poses to check", () => {
    expect(POSES.length).toBeGreaterThan(3);
  });

  it.each(POSES)(
    "in %s",
    async (presetId) => {
      const base = createDefaultShivaConfiguration();
      const config: CharacterConfiguration = {
        ...base,
        pose: { ...base.pose, preset: presetId },
        parts: { ...base.parts, upperGarment: { assetId: UTTARIYA, version: 1 } },
      };
      const { rig, materials } = await build(config);
      try {
        const drape = meshesOf(rig, UTTARIYA);
        if (drape.length === 0 || rig.bodyMeshes.length === 0) return;
        const field = skinFieldOf(rig.bodyMeshes, 0.012);
        const limbs = placesOf(rig, LIMB_JOINTS);
        const torso = placesOf(rig, TORSO_JOINTS);
        expect(limbs.length, "the figure has arms").toBeGreaterThan(0);

        const point = new THREE.Vector3();
        let worst = 0;
        let where = "";
        for (const mesh of drape) {
          const position = mesh.geometry.getAttribute("position");
          if (!position) continue;
          mesh.updateWorldMatrix(true, false);
          const stride = Math.max(1, Math.floor(position.count / 3000));
          for (let i = 0; i < position.count; i += stride) {
            deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
            const depth = skinDepthAt(field, point, 0.08);
            if (depth <= worst) continue;
            // In the arm, or on the chest? Whichever joint it is nearer.
            if (nearest(point, limbs) >= nearest(point, torso)) continue;
            worst = depth;
            where = `(${point.x.toFixed(3)}, ${point.y.toFixed(3)}, ${point.z.toFixed(3)})`;
          }
        }
        /**
         * TEN MILLIMETRES.
         *
         * A drape lying along an upper arm presses into it — that is what
         * cloth on a body does, and the shoulder is where this garment is
         * tied. The two meshes are sampled at different densities, so a
         * few millimetres is the measurement rather than the garment.
         * Past a centimetre the limb is coming through the cloth, which
         * is what the complaint describes and what a close-up of the left
         * forearm showed.
         */
        expect(
          worst * 1000,
          `the uttariya reaches ${(worst * 1000).toFixed(1)} mm into an arm at ${where}`,
        ).toBeLessThan(10);
      } finally {
        materials.dispose();
      }
    },
    600_000,
  );
});

/**
 * AND THE THINGS WORN WITH IT.
 *
 * A drape crossing the chest shares that chest with a serpent, two
 * rudraksha malas, armlets and bangles, and the arms carry a trident and
 * a drum. Layering is intended — a mala lies ON cloth — so the question
 * is not contact but passage: whether the drape is INSIDE one of them.
 */
const WORN = [
  "shiva.ornament.naga",
  "shiva.mala.rudraksha",
  "shiva.attribute.trishul",
  "shiva.attribute.damaru",
] as const;

describe("Shiva's uttariya does not pass through what he wears with it", () => {
  it.each(POSES)(
    "in %s",
    async (presetId) => {
      const base = createDefaultShivaConfiguration();
      const config: CharacterConfiguration = {
        ...base,
        pose: { ...base.pose, preset: presetId },
        parts: { ...base.parts, upperGarment: { assetId: UTTARIYA, version: 1 } },
      };
      const { rig, materials } = await build(config);
      try {
        const drape = meshesOf(rig, UTTARIYA);
        if (drape.length === 0) return;
        const complaints: string[] = [];
        for (const id of WORN) {
          const worn = meshesOf(rig, id);
          if (worn.length === 0) continue;
          const through = deepestInside(drape, worn) * 1000;
          /**
           * TWELVE MILLIMETRES. These are thin things — a cord of beads
           * is eight millimetres through — so a drape resting against one
           * registers a few millimetres of its own thickness. Past that
           * the cloth is inside it.
           */
          if (through > 12) {
            complaints.push(`${id}: the uttariya reaches ${through.toFixed(1)} mm inside it`);
          }
        }
        expect(complaints, complaints.join("; ")).toEqual([]);
      } finally {
        materials.dispose();
      }
    },
    600_000,
  );
});
