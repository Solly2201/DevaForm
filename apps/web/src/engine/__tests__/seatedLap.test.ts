/**
 * A seated garment is cut to the lap the pose makes, not to a circle.
 *
 * `seatedGarment` already asks whether cloth hangs below the legs, and it
 * did not. What nothing asked is whether the cloth has anything to do
 * with the legs at all — and it did not: the wrap was a surface of
 * revolution, so Ganesha's Royal Ease wore a 236 mm drum with a level
 * hem, both knees stuck out of its sides as bare nubs, and the asymmetry
 * the pose was authored for, one leg folded flat and the other drawn up,
 * was invisible under it.
 *
 * Two claims, and they are the two halves of the same thing:
 *
 *   - the lap is measured, and it is NOT round. A pose that folds one leg
 *     and raises the other reaches further at some bearings than others,
 *     and the measurement has to say so;
 *   - the cloth follows it. Where the legs reach further, the cloth is
 *     wider; where there are no legs, it comes in.
 *
 * And the profile the lap is measured from has to describe the body that
 * is drawn. It said the knee was 42 mm while `humanoidBody` put a 54 mm
 * sphere there, which is the twelve millimetres the knees came through by.
 */
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () =>
  import("./glbLoader").then((module) => module.diskLoader()),
);

import {
  createDefaultGaneshaConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport } from "../rig";
import { ZoneMaterials } from "../materials";
import { deriveBodyProfile } from "../generators/bodyProfile";

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

/** The garment's widest reach at each of twelve bearings, pelvis-local. */
function clothByBearing(rig: ReturnType<typeof buildRig>, assetId: string): number[] {
  const pelvis = rig.joints.get("pelvis");
  const bins = new Array<number>(12).fill(0);
  if (!pelvis) return bins;
  const point = new THREE.Vector3();
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
    for (let i = 0; i < position.count; i += 1) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      pelvis.worldToLocal(point);
      const turn = Math.PI * 2;
      const bearing = ((Math.atan2(point.x, point.z) % turn) + turn) % turn;
      const bin = Math.round((bearing / turn) * 12) % 12;
      bins[bin] = Math.max(bins[bin] ?? 0, Math.hypot(point.x, point.z));
    }
  });
  return bins;
}

const DHOTI = "ganesha.garment.dhoti";

describe("the body profile describes the body that is drawn", () => {
  /**
   * `humanoidBody` builds the knee from `ctx.body.kneeRadius`, so the one
   * number is both what is drawn and what every garment is told. This
   * pins the value a seated wrap was found to need.
   */
  it("the knee is the knee the leg is built with", () => {
    const profile = deriveBodyProfile({}, { height: 1, bulk: 1 });
    expect(profile.kneeRadius * 1000).toBeCloseTo(54, 0);
  });
});

describe("a seated lap is measured, and it is not round", () => {
  it.each(["royal", "meditation"])("%s", async (preset) => {
    const base = createDefaultGaneshaConfiguration();
    const { rig, materials } = await build({
      ...base,
      pose: { ...base.pose, preset },
    });
    try {
      const legs = rig.seatedLegs;
      expect(legs, `${preset} reports a lap`).not.toBeNull();
      if (!legs) return;

      /**
       * THE LAP IS NOT A CIRCLE.
       *
       * Folded legs reach much further across the figure than behind it.
       * Measured on these poses the spread is well over a hand's width;
       * anything under fifty millimetres means the measurement has
       * collapsed to a radius and the cloth built from it will be a drum.
       */
      const spread = Math.max(...legs.reach) - Math.min(...legs.reach);
      expect(
        spread * 1000,
        `${preset}: the lap's widest and narrowest bearings differ by ` +
          `${(spread * 1000).toFixed(0)} mm`,
      ).toBeGreaterThan(50);

      // And its floor is not level either: there are legs in front and
      // none behind, so the hem has somewhere to rise to.
      const fall = Math.max(...legs.floor) - Math.min(...legs.floor);
      expect(fall * 1000, `${preset}: the lap's floor varies by ${(fall * 1000).toFixed(0)} mm`)
        .toBeGreaterThan(30);

      /**
       * AND THE CLOTH FOLLOWS IT.
       *
       * The garment's own widest bearing has to be near the lap's widest
       * bearing. A drum is equally wide everywhere, so its spread is
       * nearly zero — which is exactly what this caught.
       */
      const cloth = clothByBearing(rig, DHOTI);
      const clothSpread = Math.max(...cloth) - Math.min(...cloth);
      expect(
        clothSpread * 1000,
        `${preset}: the garment's widest and narrowest bearings differ by ` +
          `${(clothSpread * 1000).toFixed(0)} mm — a drum differs by nothing`,
      ).toBeGreaterThan(30);
    } finally {
      materials.dispose();
    }
  });
});
