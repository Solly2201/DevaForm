/**
 * A seated pose seats the figure.
 *
 * "Royal Ease" did not. Its pendant leg hung nearly straight down — the
 * ankle 274 mm below the pelvis against the folded leg's 188 — so the
 * lowest thing on the statue was that foot, and settling it onto the base
 * stood the whole figure up on its toe with the other leg tucked inside
 * the skirt. Eight hundred tests passed on it. Every one of them asked
 * whether a garment fitted, whether an ornament touched, whether a hand
 * could reach; not one asked whether a figure described as seated was
 * sitting on anything.
 *
 * The measure is the pelvis's own height over the support, against the
 * same figure standing. A statue that sits is markedly lower than the
 * same statue upright, and no amount of styling hides the difference.
 */
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () =>
  import("./glbLoader").then((module) => module.diskLoader()),
);

import {
  POSE_PRESETS,
  SHIVA_POSE_PRESETS,
  VISHNU_POSE_PRESETS,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport } from "../rig";
import { ZoneMaterials } from "../materials";

async function pelvisOver(config: CharacterConfiguration): Promise<number> {
  const materials = new ZoneMaterials();
  try {
    let rig = buildRig(config, materials);
    for (let attempt = 0; attempt < 6 && rig.pending.length > 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      rig = buildRig(config, materials);
    }
    poseRig(rig, config.pose);
    settleOnSupport(rig);
    rig.root.updateWorldMatrix(true, true);
    const pelvis = rig.joints.get("pelvis");
    if (!pelvis) return 0;
    return pelvis.getWorldPosition(new THREE.Vector3()).y - rig.baseTop;
  } finally {
    materials.dispose();
  }
}

const ALL = [...POSE_PRESETS, ...SHIVA_POSE_PRESETS, ...VISHNU_POSE_PRESETS];

const DEITIES = [
  { id: "ganesha", make: createDefaultGaneshaConfiguration, standing: "standing" },
  { id: "shiva", make: createDefaultShivaConfiguration, standing: "shiva.standing" },
  { id: "vishnu", make: createDefaultVishnuConfiguration, standing: "vishnu.regal" },
] as const;

const CASES = DEITIES.flatMap((deity) =>
  ALL.filter(
    (preset) =>
      preset.seated &&
      (preset.id.startsWith(`${deity.id}.`) || !preset.id.includes(".")) &&
      // Only the presets this deity is actually offered.
      (deity.id === "ganesha" || preset.id.startsWith(`${deity.id}.`)),
  ).map((preset) => ({ deity, preset })),
);

describe("a seated pose puts the figure on its base", () => {
  it("there are seated poses to check", () => {
    expect(CASES.length).toBeGreaterThan(1);
  });

  it.each(CASES.map((c) => [`${c.deity.id} ${c.preset.id}`, c] as const))(
    "%s sits",
    async (label, testCase) => {
      const base = testCase.deity.make();
      const upright = await pelvisOver({
        ...base,
        pose: { ...base.pose, preset: testCase.deity.standing },
      });
      const seated = await pelvisOver({
        ...base,
        pose: { ...base.pose, preset: testCase.preset.id },
      });
      const ratio = seated / Math.max(1e-6, upright);
      /**
       * TWO THIRDS.
       *
       * A figure that folds its legs loses most of their length from its
       * standing height; measured here, the seated presets that work come
       * out near half. Two thirds is well clear of those and well clear
       * of the failure, which was ninety-odd per cent — a standing figure
       * with its legs hidden.
       */
      expect(
        ratio,
        `${label}: the pelvis sits at ${(ratio * 100).toFixed(0)}% of its standing height ` +
          `(${(seated * 1000).toFixed(0)} mm over the base, upright ${(upright * 1000).toFixed(0)})`,
      ).toBeLessThan(0.67);
    },
    600_000,
  );
});
