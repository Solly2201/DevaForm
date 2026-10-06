/**
 * Cloth worn short is gathered onto the hips, not merely cut shorter.
 *
 * A full-length wrap has to contain two legs side by side, so its hem is
 * cut to the body's own `legSpreadX` plus the knee. A pose declares
 * `garment: "short"` precisely because a leg is NOT down there any more —
 * Ganesha's `dance` lifts one and swings it across, Shiva's `tandava` the
 * same — and a cone that wide, merely shortened, is a hoop the raised
 * thigh sweeps straight through. That is what both of them did.
 *
 * WHY THIS AND NOT A PENETRATION MEASURE. Two were written first and both
 * were abandoned, which is worth recording. A garment is SUPPOSED to be
 * inside the skin where it grips the hip, so "how deep is this cloth in
 * the body" reports thirty millimetres on every correct standing figure.
 * And a limb drawn up against the hip puts the waistband inside the
 * limb's own capsule, so "how deep is this cloth in a leg" cannot tell
 * gripping from penetrating in exactly the poses that matter — measured,
 * it called Shiva's standing tiger hide forty-two millimetres through his
 * own thigh, which a close-up plainly shows it is not. Tuning either
 * threshold until the right figures passed would have been fitting the
 * number to the instrument's bias.
 *
 * The CAUSE is not ambiguous, and it is one number: what the hem is cut
 * to. The effect was verified by eye, from four bearings, on the
 * production build.
 */
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () =>
  import("./glbLoader").then((module) => module.diskLoader()),
);

import {
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport } from "../rig";
import { ZoneMaterials } from "../materials";
import { deformedVertex } from "../skinning";
import type { BodyProfile } from "../generators/bodyProfile";

/**
 * How wide the garment's hem is, and the body it is cut for.
 *
 * The MEDIAN across twenty-four bearings, not the maximum: a dhoti wears
 * trim — pleat strips, a sash, a knot — and those stand proud of the
 * cloth at a handful of bearings. The wrap itself occupies all of them,
 * so the median is the wrap and the maximum is whatever is pinned to it.
 */
async function hemOf(
  config: CharacterConfiguration,
  assetId: string,
): Promise<{ hem: number; body: BodyProfile }> {
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
    if (!pelvis) return { hem: 0, body: rig.body };
    const point = new THREE.Vector3();
    const all: THREE.Vector3[] = [];
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
        deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
        pelvis.worldToLocal(point);
        all.push(point.clone());
      }
    });
    if (all.length === 0) return { hem: 0, body: rig.body };
    const lowest = Math.min(...all.map((p) => p.y));
    const bins = new Array<number>(24).fill(0);
    for (const p of all) {
      if (p.y > lowest + 0.025) continue;
      const turn = Math.PI * 2;
      const bearing = ((Math.atan2(p.x, p.z) % turn) + turn) % turn;
      const bin = Math.round((bearing / turn) * 24) % 24;
      bins[bin] = Math.max(bins[bin] ?? 0, Math.hypot(p.x, p.z));
    }
    const present = bins.filter((value) => value > 0).sort((a, b) => a - b);
    const hem = present[Math.floor(present.length / 2)] ?? 0;
    return { hem, body: rig.body };
  } finally {
    materials.dispose();
  }
}

const CASES = [
  {
    label: "ganesha",
    make: createDefaultGaneshaConfiguration,
    asset: { assetId: "ganesha.garment.dhoti", version: 2 },
    moving: "dance",
    still: "standing",
  },
  {
    label: "shiva",
    make: createDefaultShivaConfiguration,
    asset: { assetId: "shiva.garment.dhoti", version: 2 },
    moving: "shiva.tandava",
    still: "shiva.standing",
  },
] as const;

describe("a wrap worn short is gathered onto the hips", () => {
  it.each(CASES.map((c) => [c.label, c] as const))(
    "%s",
    async (label, testCase) => {
      const base = testCase.make();
      const dress = (preset: string): CharacterConfiguration => ({
        ...base,
        pose: { ...base.pose, preset },
        parts: { ...base.parts, lowerGarment: testCase.asset },
      });
      const still = await hemOf(dress(testCase.still), testCase.asset.assetId);
      const moving = await hemOf(dress(testCase.moving), testCase.asset.assetId);
      expect(still.hem, `${label}: the standing wrap has a hem`).toBeGreaterThan(0.05);

      const body = moving.body;
      /** What a full-length hem is cut to: two legs, with their knees. */
      const legSpan = body.legSpreadX + Math.max(body.kneeRadius, body.calfRadius) + 0.012;
      /** What a gathered hem is cut to: the hips the pose left in place. */
      const hips = body.pelvisHalfWidth + 0.014;

      expect(
        moving.hem,
        `${label}: hem ${(moving.hem * 1000).toFixed(0)} mm worn short, against hips ` +
          `${(hips * 1000).toFixed(0)} mm and a standing leg span of ` +
          `${(legSpan * 1000).toFixed(0)} mm`,
      ).toBeLessThan(hips);

      // And the standing wrap is still cut for the legs it contains.
      expect(
        still.hem,
        `${label}: the standing hem is ${(still.hem * 1000).toFixed(0)} mm`,
      ).toBeGreaterThan(hips * 0.6);
    },
    600_000,
  );
});
