/**
 * Seated, cloth rests on the legs — it does not hang below them.
 *
 * A standing garment's hem falls because there is a leg inside it all the
 * way down. Fold the legs and that stops being true: everything below the
 * crossed shins is empty space, and cloth drawn into it is a flap hanging
 * off the front of the figure with nothing behind it. Shiva's meditation
 * was two of those at once — the tiger skin kept its standing depth and
 * reached a hundred and thirteen millimetres below the cream it was worn
 * over, and the cream was two tubes, one per thigh.
 *
 * The figure's OWN lowest point cannot catch it: a seated figure rests on
 * its knees and ankles, so anything above the ground passes. What catches
 * it is the lap the pose actually makes — `rig.seatedLegs`, the same
 * measurement the garments are cut from (see `seatedLapWrap`). Cloth may
 * reach the legs and stop; past them it is hanging in air.
 */
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () =>
  import("./glbLoader").then((module) => module.diskLoader()),
);

import { listAssets } from "@devaform/asset-system";
import {
  POSE_PRESETS,
  SHIVA_POSE_PRESETS,
  VISHNU_POSE_PRESETS,
  createDefaultShivaConfiguration,
  createDefaultGaneshaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport } from "../rig";
import { ZoneMaterials } from "../materials";
import { deformedVertex } from "../skinning";

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

/** The lowest world Y reached by the meshes of one part. */
function lowestOf(rig: ReturnType<typeof buildRig>, assetId: string): number {
  const point = new THREE.Vector3();
  let lowest = Infinity;
  rig.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    let owner: THREE.Object3D | null = node;
    let mine = false;
    while (owner && owner !== rig.root) {
      if (owner.name === `part:${assetId}`) mine = true;
      owner = owner.parent;
    }
    if (!mine) return;
    const position = mesh.geometry.getAttribute("position");
    if (!position) return;
    mesh.updateWorldMatrix(true, false);
    const stride = Math.max(1, Math.floor(position.count / 3000));
    for (let i = 0; i < position.count; i += stride) {
      const y = deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld).y;
      if (y < lowest) lowest = y;
    }
  });
  return lowest;
}

/** Where the folded legs bottom out, in world space. */
function lapFloor(rig: ReturnType<typeof buildRig>): number | null {
  const legs = rig.seatedLegs;
  const pelvis = rig.joints.get("pelvis");
  if (!legs || !pelvis) return null;
  return pelvis.getWorldPosition(new THREE.Vector3()).y + legs.floorY;
}

const SEATED = [...POSE_PRESETS, ...SHIVA_POSE_PRESETS, ...VISHNU_POSE_PRESETS].filter(
  (preset) => preset.seated,
);

const DEITIES = [
  { id: "shiva", make: createDefaultShivaConfiguration },
  { id: "ganesha", make: createDefaultGaneshaConfiguration },
  { id: "vishnu", make: createDefaultVishnuConfiguration },
] as const;

const CASES = DEITIES.flatMap((deity) => {
  const base = deity.make();
  const poses = SEATED.filter((preset) =>
    preset.id.startsWith(`${deity.id}.`) || !preset.id.includes("."),
  );
  return listAssets({ deity: deity.id, slot: "lowerGarment" }).flatMap((asset) =>
    poses.map((preset) => ({
      label: `${deity.id} ${preset.id} + ${asset.name}`,
      config: {
        ...base,
        pose: { ...base.pose, preset: preset.id },
        parts: { ...base.parts, lowerGarment: { assetId: asset.id, version: asset.version } },
      } as CharacterConfiguration,
      assetId: asset.id,
    })),
  );
});

describe("seated garments rest on the figure", () => {
  it("there are seated poses and garments to test", () => {
    expect(CASES.length).toBeGreaterThan(8);
  });

  it.each(CASES.map((c) => [c.label, c] as const))(
    "%s",
    async (_label, testCase) => {
      const { rig, materials } = await build(testCase.config);
      try {
        const garment = lowestOf(rig, testCase.assetId);
        const floor = lapFloor(rig);
        expect(floor, `${testCase.label}: the pose reports no lap`).not.toBeNull();
        if (!Number.isFinite(garment) || floor === null) return;
        const below = (floor - garment) * 1000;
        /**
         * THIRTY MILLIMETRES.
         *
         * Cloth pools where it meets what it rests on, and the lap floor
         * is measured to the leg's own girth rather than to its skin, so
         * a hem a little past it is cloth behaving. Past that it is
         * hanging in air the figure does not occupy — three centimetres
         * is already most of a shin's thickness on this body.
         */
        expect(below, `${testCase.label}: cloth hangs ${below.toFixed(1)} mm below the lap`)
          .toBeLessThan(30);
      } finally {
        materials.dispose();
      }
    },
    600_000,
  );
});
