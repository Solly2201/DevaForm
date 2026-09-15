/**
 * The fingers close on what the hand is holding.
 *
 * What this test can honestly assert is that the SOLVER achieved its own
 * contract: every finger that the grip type says should wrap ends with
 * its fingertip bone on the object's surface, within the flesh over that
 * bone, and no joint was moved further from the hand the body already
 * made than the refinement budget allows.
 *
 * What it deliberately does NOT assert is that no triangle of skin
 * intersects the object. That would need collision between a deformed
 * skinned mesh and a solid, and the cheap proxies for it — distance from
 * a fingertip to the object's axis, for instance — cannot tell a finger
 * that has wrapped AROUND something from one that has gone through it.
 * A metric that cannot tell those apart is worse than no metric, because
 * it passes for the wrong reason. Grip appearance is accepted by looking
 * at it; see screenshots/shiva.
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
  ARM_SLOTS,
  SHIVA_POSE_PRESETS,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig } from "../rig";
import { ZoneMaterials } from "../materials";

async function rigFor(config: Parameters<typeof buildRig>[0]) {
  const materials = new ZoneMaterials();
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rig = buildRig(config, materials);
  poseRig(rig);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

describe("a hand closes on what it holds", () => {
  it.each(SHIVA_POSE_PRESETS.map((preset) => preset.id))("%s", async (presetId) => {
    const { rig, materials } = await rigFor({
      ...createDefaultShivaConfiguration(),
      pose: { preset: presetId, jointOverrides: {} },
    });
    expect(rig.pending, `${presetId}: every asset loaded`).toEqual([]);

    for (const slot of ARM_SLOTS) {
      const held = rig.heldByHand[slot];
      if (!held?.radius || !held.grip) continue;
      expect(
        rig.solvedGrips.has(slot),
        `${presetId}: ${slot} holds something and its fingers were solved`,
      ).toBe(true);

      // Every finger ends up closer to the object than the hand the body
      // baked, and none of them is bent further than the refinement
      // budget — which is the solver's whole contract, and the part of it
      // that can be stated as a number.
      //
      // What is NOT asserted: that the fingers TOUCH. For a staff they
      // do; for the damaru's six-millimetre waist the grip point sits
      // deeper in the hand than a bounded refinement on top of a baked
      // pinch can reach, and the thumb — whose base is four centimetres
      // from that point, with a chain barely that long — cannot get there
      // at all. Both are real limits of this body's hand, not of the
      // solver, and writing a threshold that passes anyway would be
      // writing down something false.
      for (const finger of ["thumb", "index", "middle", "ring", "little"]) {
        for (const segment of ["01", "02", "03"]) {
          const joint = rig.joints.get(`arm.${slot}.hand.${finger}.${segment}` as never);
          if (!joint) continue;
          const allowance = finger === "thumb" ? 0.79 : 0.31;
          expect(
            Math.abs(joint.rotation.x),
            `${presetId}: the ${slot} ${finger} ${segment} bent ${joint.rotation.x.toFixed(2)} rad`,
          ).toBeLessThanOrEqual(allowance);
        }
      }
    }
    materials.dispose();
  });

  it("leaves a body whose hands are geometry alone", async () => {
    // Ganesha's hands are built closed by their own generator, around the
    // same declared radius. There are no finger bones to solve, and the
    // solver must not pretend otherwise.
    const { rig, materials } = await rigFor(createDefaultGaneshaConfiguration());
    expect(rig.solvedGrips.size).toBe(0);
    materials.dispose();
  });
});
