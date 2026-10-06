/**
 * A staff set down beside the figure stands on the pedestal.
 *
 * Planting already puts the butt at `baseTop` and pushes the shaft out
 * far enough to clear the posed skin — a trishul that stood in a
 * meditating Shiva's thigh is why. What nothing checked is whether the
 * place it was pushed OUT to is still on the base: the clearance is
 * measured from the figure, and the base is a disc of its own size. Past
 * its rim the butt is at the right height over nothing, which from
 * three-quarters reads as a mace hovering beside the lotus.
 *
 * So this asks for the thing a photograph shows: the lowest point of a
 * planted item, and whether the base is underneath it.
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

/** The base's own footprint, in statue-root metres. */
function baseRadius(rig: ReturnType<typeof buildRig>): number {
  const box = new THREE.Box3();
  let radius = 0;
  rig.root.traverse((node) => {
    if (!node.name.startsWith("base:")) return;
    box.setFromObject(node);
    radius = Math.max(
      radius,
      Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z)),
    );
  });
  return radius;
}

const SEATED_OR_STANDING = [...POSE_PRESETS, ...SHIVA_POSE_PRESETS, ...VISHNU_POSE_PRESETS];

const DEITIES = [
  { id: "ganesha", make: createDefaultGaneshaConfiguration },
  { id: "shiva", make: createDefaultShivaConfiguration },
  { id: "vishnu", make: createDefaultVishnuConfiguration },
] as const;

const CASES = DEITIES.flatMap((deity) =>
  SEATED_OR_STANDING.filter(
    (preset) => preset.id.startsWith(`${deity.id}.`) || !preset.id.includes("."),
  )
    .filter((preset) => deity.id === "ganesha" || preset.id.startsWith(`${deity.id}.`))
    .map((preset) => ({ deity, preset })),
);

describe("a planted attribute stands on the base", () => {
  it("there are poses to check", () => {
    expect(CASES.length).toBeGreaterThan(3);
  });

  it.each(CASES.map((c) => [`${c.deity.id} ${c.preset.id}`, c] as const))(
    "%s",
    async (label, testCase) => {
      const base = testCase.deity.make();
      const { rig, materials } = await build({
        ...base,
        pose: { ...base.pose, preset: testCase.preset.id },
      });
      try {
        if (rig.planted.length === 0) return;
        const radius = baseRadius(rig);
        expect(radius, `${label}: the figure has a base`).toBeGreaterThan(0.05);
        const complaints: string[] = [];
        const point = new THREE.Vector3();
        const box = new THREE.Box3();
        for (const { object } of rig.planted) {
          object.updateWorldMatrix(true, true);
          box.setFromObject(object);
          // The butt: the lowest corner of what was planted, in the
          // statue's own frame.
          point.set((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
          rig.root.worldToLocal(point);
          const out = Math.hypot(point.x, point.z);
          /**
           * The rim, with a centimetre of grace: a staff touching the
           * outermost petal is standing on the base. Beyond that it is
           * standing on the floor beside it, which is what this exists
           * to catch.
           */
          if (out > radius + 0.01) {
            complaints.push(
              `${object.name || "a planted item"} stands ${((out - radius) * 1000).toFixed(0)} mm ` +
                `past the base's rim (${(out * 1000).toFixed(0)} mm out, base ${(radius * 1000).toFixed(0)})`,
            );
          }
        }
        expect(complaints, `${label}: ${complaints.join("; ")}`).toEqual([]);
      } finally {
        materials.dispose();
      }
    },
    600_000,
  );
});
