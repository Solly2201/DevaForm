/**
 * Is the crown ON the head, and does it narrow as it rises?
 *
 * Two questions, both asked of the built geometry, both of which the
 * Vishnu kirita failed while every other test in the suite passed.
 *
 * SEATING. A crown is worn. Its band grips the skull somewhere above the
 * ears and below the crown of the head, and everything above that
 * contains the head rather than hovering over it. The failure mode has a
 * look: a gap of dark hair between a thin brow band and a gold tower
 * resting on top of it, which is a hat balanced on somebody rather than a
 * crown they are wearing.
 *
 * SILHOUETTE. A kirita mukuta narrows. That is the whole shape, and
 * getting it backwards reads as a basket or an upturned bucket however
 * finely the surface is chased. The generator's own comments say this in
 * so many words and the geometry did the opposite: measured, the tower
 * was widest near its top.
 *
 * Both are about the SILHOUETTE a person sees, so both are measured off
 * the vertices that are drawn rather than off the numbers that were
 * meant to produce them.
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
  type SocketId,
} from "@devaform/character-schema";
import { listAssets } from "@devaform/asset-system";
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

/** Every drawn vertex of one named object, in rig-local metres. */
function pointsOf(rig: ReturnType<typeof buildRig>, name: string): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  rig.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    let owner: THREE.Object3D | null = node;
    let found = false;
    while (owner && owner !== rig.root) {
      if (owner.name === name) {
        found = true;
        break;
      }
      owner = owner.parent;
    }
    if (!found) return;
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

/** The head's own drawn vertices: whatever flesh the figure wears up there. */
function headPoints(rig: ReturnType<typeof buildRig>): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const point = new THREE.Vector3();
  for (const mesh of rig.bodyMeshes) {
    const position = mesh.geometry.getAttribute("position");
    if (!position) continue;
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < position.count; i += 1) {
      deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
      rig.root.worldToLocal(point);
      points.push(point.clone());
    }
  }
  return points;
}

/**
 * The widest radius a cloud reaches in each horizontal slice.
 *
 * Slices rather than a single extent, because the question is about the
 * PROFILE: a crown that is widest at the bottom and one that is widest at
 * the top have the same bounding box.
 */
function profile(points: readonly THREE.Vector3[], slices = 14) {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    low = Math.min(low, point.y);
    high = Math.max(high, point.y);
  }
  const widest = new Float64Array(slices);
  const span = high - low;
  if (span <= 0) return { low, high, widest };
  for (const point of points) {
    const slice = Math.min(slices - 1, Math.floor(((point.y - low) / span) * slices));
    const radius = Math.hypot(point.x, point.z);
    if (radius > (widest[slice] ?? 0)) widest[slice] = radius;
  }
  return { low, high, widest };
}

/**
 * Who wears one, declared.
 *
 * Shiva does not. He wears jata — matted hair piled and bound, with the
 * crescent and the Ganga in it — and a crown on that would be a different
 * god. Asserting that every deity offers a crown reported correct
 * iconography as a missing asset.
 */
/**
 * THE CRANIUM AND WHAT IS GROWN ON IT — which is what a crown goes round,
 * and nothing else that happens to hang off the same joint.
 *
 * Ears are the reason this is a list rather than "everything under the
 * head joint". Ganesha's reach 186 mm at exactly the height his band
 * runs, and a kirita sits BETWEEN ears rather than around them; measured
 * the broad way, all three of his crowns were reported as buried in hair
 * he does not have. Tusks, trunk, eyes and brows are excluded for the
 * same reason: a crown has no relationship with any of them.
 */
const UNDER_A_CROWN = /\.(head|hair|jata)\./;

function everythingOnTheHead(
  rig: ReturnType<typeof buildRig>,
  exclude: string,
): THREE.Vector3[] {
  const head = rig.joints.get("head" as never);
  if (!head) return [];
  const points: THREE.Vector3[] = [];
  const point = new THREE.Vector3();
  head.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    let owner: THREE.Object3D | null = node;
    let label: string | null = null;
    while (owner) {
      if (typeof owner.name === "string" && owner.name.includes(exclude)) return;
      if (typeof owner.name === "string" && owner.name.startsWith("part:")) label = owner.name;
      owner = owner.parent;
    }
    if (!label || !UNDER_A_CROWN.test(label)) return;
    const position = mesh.geometry.getAttribute("position");
    if (!position) return;
    mesh.updateWorldMatrix(true, false);
    const stride = Math.max(1, Math.floor(position.count / 2000));
    for (let i = 0; i < position.count; i += stride) {
      deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
      rig.root.worldToLocal(point);
      points.push(point.clone());
    }
  });
  return points;
}

/** The widest radius a cloud reaches between two heights. */
function widestBetween(
  points: readonly THREE.Vector3[],
  low: number,
  high: number,
): number {
  let widest = 0;
  for (const point of points) {
    if (point.y < low || point.y > high) continue;
    widest = Math.max(widest, Math.hypot(point.x, point.z));
  }
  return widest;
}

const CROWNS: ReadonlyArray<[string, () => CharacterConfiguration, boolean]> = [
  ["ganesha", createDefaultGaneshaConfiguration, true],
  ["shiva", createDefaultShivaConfiguration, false],
  ["vishnu", createDefaultVishnuConfiguration, true],
];

describe.each(CROWNS)("%s's crowns", (deity, make, wearsOne) => {
  const options = listAssets({
    deity: deity as "ganesha" | "shiva" | "vishnu",
    socket: "head.crown" as SocketId,
  });

  it(wearsOne ? "there are crowns to audit" : "wears no crown, by iconography", () => {
    if (wearsOne) expect(options.length, `${deity} offers a crown`).toBeGreaterThan(0);
    else expect(options.length, `${deity} should wear jata, not a crown`).toBe(0);
  });

  it.each(options.map((asset) => [asset.id, asset.version] as const))(
    "%s is worn on the head and narrows as it rises",
    async (assetId, version) => {
      const base = make();
      const config: CharacterConfiguration = {
        ...base,
        attachments: [
          ...base.attachments.filter((entry) => entry.socket !== "head.crown"),
          { socket: "head.crown" as SocketId, asset: { assetId, version } },
        ],
      };
      const { rig, materials } = await build(config);
      try {
        const crown = pointsOf(rig, `attachment:${assetId}`);
        expect(crown.length, `${assetId} built geometry`).toBeGreaterThan(100);
        const head = headPoints(rig);
        expect(head.length, "the figure has a head to wear it on").toBeGreaterThan(100);

        const crownProfile = profile(crown);
        const headTop = Math.max(...head.map((point) => point.y));

        /**
         * IT GRIPS THE HEAD. The crown's lowest point has to be below the
         * top of the head — otherwise it is sitting on it, not round it.
         * A kirita's band runs above the ears; the crown of the head is
         * inside the crown.
         */
        const bite = (headTop - crownProfile.low) * 1000;
        expect(
          bite,
          `${assetId} reaches only ${bite.toFixed(0)} mm below the top of the head — ` +
            `it is balanced on it rather than worn`,
        ).toBeGreaterThan(20);

        /**
         * AND IT CONTAINS WHAT IS ALREADY ON THE HEAD.
         *
         * Hair is a separate part, so the profile that sizes a crown knew
         * nothing about it. Measured on Vishnu: where the kirita's band
         * runs, his hair reached 95 mm and the band was built to 88 — the
         * band was INSIDE the hair, invisible, and the only part of the
         * crown anyone could see was the tower emerging from a dark dome.
         * A correctly tapered, correctly seated crown read as a party hat.
         */
        const onHead = everythingOnTheHead(rig, assetId);
        if (onHead.length > 0) {
          const bandLow = crownProfile.low;
          const bandHigh = crownProfile.low + 0.03;
          const headWide = widestBetween(onHead, bandLow, bandHigh);
          const crownWide = widestBetween(crown, bandLow, bandHigh);
          if (headWide > 0) {
            expect(
              crownWide * 1000,
              `${assetId}: the band is ${(crownWide * 1000).toFixed(0)} mm where what it ` +
                `passes is ${(headWide * 1000).toFixed(0)} mm — it is inside the hair`,
            ).toBeGreaterThanOrEqual(headWide * 1000 - 0.5);
          }
        }

        /**
         * IT NARROWS. The top third must not be wider than the bottom
         * third. Measured on the Vishnu kirita before this test existed:
         * the tower was widest just under its own rim, which is the
         * upturned bucket the generator's comments warn against.
         */
        const slices = crownProfile.widest;
        const third = Math.floor(slices.length / 3);
        const bottom = Math.max(...[...slices].slice(0, third));
        const top = Math.max(...[...slices].slice(slices.length - third));
        expect(
          top,
          `${assetId} is ${(top * 1000).toFixed(0)} mm wide near the top against ` +
            `${(bottom * 1000).toFixed(0)} mm near the base — it opens upward, which is a basket`,
        ).toBeLessThan(bottom);
      } finally {
        materials.dispose();
      }
    },
    180_000,
  );
});
