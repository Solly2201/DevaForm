/**
 * Does any skin show through the skirt?
 *
 * The existing garment tests each answer one narrower question: whether
 * the body's DECLARED wrap radius contains the legs (`garmentLayer`),
 * whether Shiva's hide stays outside his hips (`garmentFit`), whether one
 * garment is inside another (`garmentLayering`). None of them asks the
 * plainest one, of every lower garment the picker offers, on the figure
 * that wears it: is there a point on this body that a viewer can see
 * because the cloth is not in front of it.
 *
 * It is the question a person actually asks, and it found pale flecks of
 * hip showing through red cloth on a Ganesha that passed everything else.
 *
 * PER BEARING AND PER ROW, which is the whole method. A skirt measured at
 * its widest against a body measured at its widest is two numbers from
 * opposite sides of the figure, and their difference is a gap that exists
 * nowhere — this repository has walked into that artefact enough times to
 * know better. Cloth covers a body at each point of the circle
 * separately, so that is where the comparison belongs.
 */
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () =>
  import("./glbLoader").then((module) => module.diskLoader()),
);

import { listAssets } from "@devaform/asset-system";
import {
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport } from "../rig";
import { ZoneMaterials } from "../materials";
import { deformedVertex } from "../skinning";

const BEARINGS = 24;
const ROWS = 10;

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

/** Every drawn vertex of one named part, rig-local. */
function partPoints(rig: ReturnType<typeof buildRig>, assetId: string): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const point = new THREE.Vector3();
  rig.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    let owner: THREE.Object3D | null = node;
    let mine = false;
    while (owner && owner !== rig.root) {
      if (owner.name === `part:${assetId}`) {
        mine = true;
        break;
      }
      owner = owner.parent;
    }
    if (!mine) return;
    const position = mesh.geometry.getAttribute("position");
    if (!position) return;
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < position.count; i += 1) {
      deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
      rig.root.worldToLocal(point);
      points.push(point.clone());
    }
  });
  return points;
}

/** The figure's own flesh. */
function bodyPoints(rig: ReturnType<typeof buildRig>): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const point = new THREE.Vector3();
  for (const mesh of rig.bodyMeshes) {
    const position = mesh.geometry.getAttribute("position");
    if (!position) continue;
    mesh.updateWorldMatrix(true, false);
    const stride = Math.max(1, Math.floor(position.count / 6000));
    for (let i = 0; i < position.count; i += stride) {
      deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
      rig.root.worldToLocal(point);
      points.push(point.clone());
    }
  }
  return points;
}

const bearingOf = (point: THREE.Vector3) =>
  ((Math.round((Math.atan2(point.x, point.z) / (Math.PI * 2)) * BEARINGS) % BEARINGS) + BEARINGS) %
  BEARINGS;

/** The widest radius a cloud reaches, by row and bearing. */
function reachGrid(points: readonly THREE.Vector3[], low: number, high: number) {
  const grid = new Float64Array(ROWS * BEARINGS);
  const span = Math.max(1e-6, high - low);
  for (const point of points) {
    if (point.y < low || point.y > high) continue;
    const row = Math.min(ROWS - 1, Math.floor(((point.y - low) / span) * ROWS));
    const key = row * BEARINGS + bearingOf(point);
    const radius = Math.hypot(point.x, point.z);
    if (radius > (grid[key] ?? 0)) grid[key] = radius;
  }
  return grid;
}

const FIGURES: ReadonlyArray<[string, () => CharacterConfiguration]> = [
  ["ganesha", createDefaultGaneshaConfiguration],
  ["shiva", createDefaultShivaConfiguration],
  ["vishnu", createDefaultVishnuConfiguration],
];

describe.each(FIGURES)("%s's lower garments", (deity, make) => {
  const garments = listAssets({
    deity: deity as "ganesha" | "shiva" | "vishnu",
    slot: "lowerGarment",
  });

  it("there are garments to audit", () => {
    expect(garments.length, `${deity} offers a lower garment`).toBeGreaterThan(0);
  });

  it.each(garments.map((asset) => [asset.id, asset.version] as const))(
    "%s covers the body it is wrapped round",
    async (assetId, version) => {
      /**
       * UNLESS IT IS NOT A SKIRT.
       *
       * A few garments here deliberately do not enclose the figure, and
       * holding them to a skirt's rule is holding them to somebody else's
       * iconography. Shiva's tiger hide is the clearest case: its own
       * manifest says "no cloth under it: the skin is the garment", and a
       * bare thigh beside a hide slung over the hips is the ascetic the
       * reference draws. Measured as a skirt it reports 62 mm of exposed
       * leg, and every millimetre of that is correct.
       *
       * Listed by name with the reason, the way the penetration table
       * lists its exceptions, so an exemption is a decision somebody made
       * rather than a threshold nobody can see.
       */
      const notASkirt: Record<string, string> = {
        "shiva.garment.vyaghracharma":
          "the hide alone, worn with nothing under it — the thigh below it is bare by design",
        "humanoid.garment.hideWrap":
          "the generic hide wrap, same reason: it is slung over the hips rather than closed round them",
      };
      if (notASkirt[assetId]) return;

      const base = make();
      const config: CharacterConfiguration = {
        ...base,
        parts: { ...base.parts, lowerGarment: { assetId, version } },
      };
      const { rig, materials } = await build(config);
      try {
        const cloth = partPoints(rig, assetId);
        expect(cloth.length, `${assetId} built cloth`).toBeGreaterThan(100);

        let low = Number.POSITIVE_INFINITY;
        let high = Number.NEGATIVE_INFINITY;
        for (const point of cloth) {
          low = Math.min(low, point.y);
          high = Math.max(high, point.y);
        }
        /**
         * BELOW THE TIE, which is the part a skirt actually covers.
         *
         * The top of a wrap is a waistband, and what is beside a
         * waistband is a belly overhanging it and a pair of arms hanging
         * past it. Measured over the full span, that reported Ganesha's
         * stomach as 12 mm of exposed skin and Shiva's forearms as 238,
         * neither of which is a hole in a garment — they are things a
         * garment was never covering.
         *
         * So the band is the skirt proper: clear of the hem, which is a
         * boundary with legs below it by design, and clear of the tie.
         */
        const span = high - low;
        const from = low + span * 0.06;
        const to = low + span * 0.74;

        const clothReach = reachGrid(cloth, from, to);
        const skinReach = reachGrid(bodyPoints(rig), from, to);

        let worst = 0;
        let where = "";
        for (let row = 0; row < ROWS; row += 1) {
          for (let bearing = 0; bearing < BEARINGS; bearing += 1) {
            const key = row * BEARINGS + bearing;
            const skin = skinReach[key] ?? 0;
            const garment = clothReach[key] ?? 0;
            // No cloth at this bearing and row is not a hole in the
            // garment — it is somewhere the garment does not go, like
            // between the legs below a short hem.
            if (skin === 0 || garment === 0) continue;
            const out = (skin - garment) * 1000;
            if (out > worst) {
              worst = out;
              where = `row ${row}, ${((bearing / BEARINGS) * 360).toFixed(0)}°`;
            }
          }
        }
        /**
         * THREE MILLIMETRES.
         *
         * Not zero: cloth and skin are measured on different meshes at
         * different densities, and a vertex of one landing a hair outside
         * a facet of the other is sampling rather than a hole. Three is
         * under what a viewer can see at the distance a statue is looked
         * at, and well under the flecks that prompted this — which were
         * the hip standing proud of the wrap.
         */
        expect(
          worst,
          `${assetId}: the body stands ${worst.toFixed(1)} mm outside the cloth at ${where}`,
        ).toBeLessThan(3);
      } finally {
        materials.dispose();
      }
    },
    180_000,
  );
});
