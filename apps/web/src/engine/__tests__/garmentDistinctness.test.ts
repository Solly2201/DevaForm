/**
 * Two garments in the picker are two garments.
 *
 * "Short Dhoti" and "Dhoti and Tiger Hide" were the same costume at two
 * lengths: the short one was built with `hide: 1`, so a customer who
 * chose the cloth-only wrap got a full tiger skin slung over the hips.
 * Nothing caught it, because every test asked whether a garment fitted
 * the body and none asked whether it was the garment next to it.
 *
 * So this compares each pair of a deity's lower garments as a customer
 * sees them: the SILHOUETTE, sampled as the widest the garment reaches at
 * each height down the figure. A choice that changes nothing visible is
 * not a choice, and padding a picker with one is the thing this exists to
 * stop.
 *
 * Upper garments and crowns too — the same argument, and the crowns are
 * where it is most likely to bite: five of them were added in one pass
 * from one generator and a handful of numbers, which is exactly the
 * bargain whose failure mode is a parameter nobody read.
 *
 * Faces and hair are checked the same way in featureVariants.
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
 * How wide the asset reaches at each of a fixed ladder of heights.
 *
 * Forty millimetres a rung, from the floor to two metres: fine enough
 * that a hem moving by a hand's width lands on a different rung, tall
 * enough to include a crown — which an earlier ladder stopping at the
 * shoulders did not, and reported every crown as identical to every
 * other because it had measured none of them.
 */
const RUNG = 0.04;
const RUNGS = 50;

function silhouette(rig: ReturnType<typeof buildRig>, assetId: string): number[] {
  // Parts are named `part:<id>`; attachments `attachment:<id>`.
  const owners = [`part:${assetId}`, `attachment:${assetId}`];
  const widths = new Array<number>(RUNGS).fill(0);
  const point = new THREE.Vector3();
  rig.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    let owner: THREE.Object3D | null = node;
    let mine = false;
    while (owner && owner !== rig.root) {
      if (owners.includes(owner.name)) mine = true;
      owner = owner.parent;
    }
    if (!mine) return;
    const position = mesh.geometry.getAttribute("position");
    if (!position) return;
    mesh.updateWorldMatrix(true, false);
    const stride = Math.max(1, Math.floor(position.count / 4000));
    for (let i = 0; i < position.count; i += stride) {
      deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
      const rung = Math.floor(point.y / RUNG);
      if (rung < 0 || rung >= RUNGS) continue;
      const radius = Math.hypot(point.x, point.z);
      if (radius > (widths[rung] as number)) widths[rung] = radius;
    }
  });
  return widths;
}

/** The biggest difference between two silhouettes, in millimetres. */
function apart(a: readonly number[], b: readonly number[]): number {
  let most = 0;
  for (let i = 0; i < a.length; i += 1) {
    most = Math.max(most, Math.abs((a[i] as number) - (b[i] as number)) * 1000);
  }
  return most;
}

const DEITIES = [
  { id: "ganesha", make: createDefaultGaneshaConfiguration },
  { id: "shiva", make: createDefaultShivaConfiguration },
  { id: "vishnu", make: createDefaultVishnuConfiguration },
] as const;

const SLOTS = ["lowerGarment", "upperGarment"] as const;
const CROWN = "head.crown";

describe("every crown in the picker is a different crown", () => {
  for (const deity of DEITIES) {
    const crowns = listAssets({ deity: deity.id, socket: CROWN });
    if (crowns.length < 2) continue;
    it(
      `${deity.id}: ${crowns.length} crowns, all distinct`,
      async () => {
        const base = deity.make();
        const shapes = new Map<string, number[]>();
        for (const asset of crowns) {
          const config: CharacterConfiguration = {
            ...base,
            attachments: [
              ...base.attachments.filter((entry) => entry.socket !== CROWN),
              { socket: CROWN, asset: { assetId: asset.id, version: asset.version } },
            ],
          };
          const { rig, materials } = await build(config);
          try {
            shapes.set(asset.id, silhouette(rig, asset.id));
          } finally {
            materials.dispose();
          }
        }
        const complaints: string[] = [];
        for (let i = 0; i < crowns.length; i += 1) {
          for (let j = i + 1; j < crowns.length; j += 1) {
            const a = crowns[i]!;
            const b = crowns[j]!;
            const difference = apart(shapes.get(a.id) ?? [], shapes.get(b.id) ?? []);
            // Ten millimetres: a crown is a tenth the height of a figure
            // and sits where the eye goes first, so the threshold is
            // tighter than a garment's.
            if (difference < 10) {
              complaints.push(`${a.name} and ${b.name} differ by only ${difference.toFixed(1)} mm`);
            }
          }
        }
        expect(complaints, complaints.join("; ")).toEqual([]);
      },
      900_000,
    );
  }
});

describe("every garment in the picker is a different garment", () => {
  for (const deity of DEITIES) {
    for (const slot of SLOTS) {
      const assets = listAssets({ deity: deity.id, slot });
      if (assets.length < 2) continue;
      it(
        `${deity.id} ${slot}: ${assets.length} choices, all distinct`,
        async () => {
          const base = deity.make();
          const shapes = new Map<string, number[]>();
          for (const asset of assets) {
            const config: CharacterConfiguration = {
              ...base,
              parts: { ...base.parts, [slot]: { assetId: asset.id, version: asset.version } },
            };
            const { rig, materials } = await build(config);
            try {
              shapes.set(asset.id, silhouette(rig, asset.id));
            } finally {
              materials.dispose();
            }
          }
          const complaints: string[] = [];
          for (let i = 0; i < assets.length; i += 1) {
            for (let j = i + 1; j < assets.length; j += 1) {
              const a = assets[i]!;
              const b = assets[j]!;
              const difference = apart(shapes.get(a.id) ?? [], shapes.get(b.id) ?? []);
              /**
               * TWENTY-FIVE MILLIMETRES.
               *
               * Two garments differing by less than that somewhere down
               * the figure are the same garment with different styling
               * notes: at a metre of statue it is under a finger's width,
               * and on a thumbnail it is nothing. A real alternative
               * changes a hem, a length or a layer, and every one of
               * those is tens of millimetres.
               */
              if (difference < 25) {
                complaints.push(
                  `${a.name} and ${b.name} differ by only ${difference.toFixed(1)} mm`,
                );
              }
            }
          }
          expect(complaints, complaints.join("; ")).toEqual([]);
        },
        900_000,
      );
    }
  }
});
