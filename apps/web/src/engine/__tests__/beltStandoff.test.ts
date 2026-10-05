/**
 * How far the waist belt stands off the cloth it is tied round.
 *
 * A kamarband is a sash wound over a dhoti. It follows the cloth; it is
 * not a plate hung at the waist. In the showcase captures Ganesha's read
 * as a flange — a gold disc projecting past the red skirt far enough to
 * cast its own shadow on it, standing further out than his own belly —
 * and the cause was in what the belt had been told was underneath it
 * rather than in any number it was built from. See `wornRadius` in
 * rig.ts: the sash's tail crosses the waist, both garments were pooled
 * into one radius, and the belt swelled to clear a layer that in fact
 * lies ON it.
 *
 * So this measures the thing the eye objects to. Not "does the belt
 * intersect the dhoti" — the penetration table covers that, and wants a
 * few millimetres of bite so the sash grips. The question here is the
 * opposite one: how far OUTSIDE the cloth does it sit, and is that a
 * distance a wound sash could plausibly have.
 */
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () =>
  import("./glbLoader").then((module) => module.diskLoader()),
);

import {
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport } from "../rig";
import { ZoneMaterials } from "../materials";
import { deformedVertex } from "../skinning";

/**
 * Every vertex the rig built under a name matching `match`, in rig-local
 * space, attributed to the NEAREST named ancestor.
 *
 * Nearest, not outermost: walking all the way up lands on the character
 * root and reports the whole figure as one object, which is how the first
 * version of this probe measured a belt and a body together and found
 * nothing wrong with either.
 */
function pointsOf(
  rig: ReturnType<typeof buildRig>,
  match: (name: string) => boolean,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  rig.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    let owner: THREE.Object3D | null = node;
    let label = mesh.name ?? "";
    while (owner && owner !== rig.root) {
      if (typeof owner.name === "string" && owner.name.length > 0) {
        label = owner.name;
        break;
      }
      owner = owner.parent;
    }
    if (!match(label)) return;
    const position = mesh.geometry.getAttribute("position");
    if (!position) return;
    mesh.updateWorldMatrix(true, false);
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) {
      deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
      rig.root.worldToLocal(point);
      points.push(point.clone());
    }
  });
  return points;
}

const BEARINGS = 24;

/**
 * The widest radius a point cloud reaches inside a height band, PER
 * BEARING.
 *
 * Per bearing because the alternative is the artefact this project keeps
 * walking into: a belt measured at its widest point against cloth
 * measured at its widest point is two numbers from opposite sides of the
 * figure, and their difference is a gap that exists nowhere. A belt is
 * worn against the cloth at each point of its circle, so that is where
 * the question has to be asked.
 */
function radiiIn(
  points: readonly THREE.Vector3[],
  low: number,
  high: number,
): Float64Array {
  const widest = new Float64Array(BEARINGS);
  for (const point of points) {
    if (point.y < low || point.y > high) continue;
    const bin =
      ((Math.round((Math.atan2(point.x, point.z) / (Math.PI * 2)) * BEARINGS) % BEARINGS) +
        BEARINGS) %
      BEARINGS;
    const radius = Math.hypot(point.x, point.z);
    if (radius > (widest[bin] ?? 0)) widest[bin] = radius;
  }
  return widest;
}

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

/**
 * Who is expected to be wearing one.
 *
 * DECLARED, not discovered. The first version of this file searched for a
 * name no object had — the belt is an attachment, and it was looking only
 * at parts — found nothing on all three figures, and reported three green
 * results while the flange was still in every capture. A measurement that
 * cannot find its subject has to say so rather than pass.
 */
const FIGURES: ReadonlyArray<[string, () => CharacterConfiguration, boolean]> = [
  ["ganesha", createDefaultGaneshaConfiguration, true],
  ["shiva", createDefaultShivaConfiguration, false],
  ["vishnu", createDefaultVishnuConfiguration, false],
];

const isBelt = (name: string) => /kamarband|waistband|belt/i.test(name);
const isLowerGarment = (name: string) => /dhoti|tigerhide|lower/i.test(name);

describe.each(FIGURES)("%s's waist belt", (deity, make, wears) => {
  it(
    "is wound on the cloth, not hung off it",
    async () => {
      const { rig, materials } = await build(make());
      try {
        const belt = pointsOf(rig, isBelt);
        if (!wears) {
          expect(belt.length, `${deity} was not expected to wear a waist belt`).toBe(0);
          return;
        }
        expect(belt.length, `${deity}'s waist belt was not built at all`).toBeGreaterThan(0);

        // The band the belt occupies, and the cloth measured in the SAME
        // band — comparing radii across different heights is how a
        // tapered skirt gets reported as a belt sinking into it.
        let low = Number.POSITIVE_INFINITY;
        let high = Number.NEGATIVE_INFINITY;
        for (const point of belt) {
          low = Math.min(low, point.y);
          high = Math.max(high, point.y);
        }
        const beltAt = radiiIn(belt, low, high);

        const cloth = pointsOf(rig, isLowerGarment);
        const clothAt = radiiIn(cloth, low, high);
        expect(
          Math.max(...clothAt),
          `${deity}: no lower garment under the belt at y ${low.toFixed(3)}..${high.toFixed(3)}`,
        ).toBeGreaterThan(0);

        // The worst bearing at which both are present. A bearing the belt
        // reaches and the cloth does not is not a standoff, it is the
        // edge of the skirt.
        let standoff = 0;
        let worstBearing = -1;
        let beltThere = 0;
        let clothThere = 0;
        for (let bin = 0; bin < BEARINGS; bin += 1) {
          const beltR = beltAt[bin] ?? 0;
          const clothR = clothAt[bin] ?? 0;
          if (beltR === 0 || clothR === 0) continue;
          const gap = (beltR - clothR) * 1000;
          if (gap > standoff) {
            standoff = gap;
            worstBearing = bin;
            beltThere = beltR;
            clothThere = clothR;
          }
        }
        expect(worstBearing, `${deity}: belt and cloth never meet at a bearing`).toBeGreaterThan(-1);
        /**
         * WHY TWENTY MILLIMETRES.
         *
         * A sash wound over a dhoti stands off the cloth by its own
         * thickness and the fold it makes — a centimetre is generous, two
         * is a thick ceremonial band. Past that it stops reading as cloth
         * on cloth and starts reading as a ring the figure has been put
         * through, which is precisely what the capture showed.
         */
        expect(
          standoff,
          `${deity}: the belt stands ${standoff.toFixed(1)} mm proud of the cloth at bearing ` +
            `${((worstBearing / BEARINGS) * 360).toFixed(0)}° ` +
            `(belt ${(beltThere * 1000).toFixed(1)} mm, cloth ${(clothThere * 1000).toFixed(1)} mm, ` +
            `over y ${low.toFixed(3)}..${high.toFixed(3)})`,
        ).toBeLessThan(20);
      } finally {
        materials.dispose();
      }
    },
    180_000,
  );
});
