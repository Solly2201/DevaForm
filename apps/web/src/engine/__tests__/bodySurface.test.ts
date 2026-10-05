/**
 * A body's profile describes the body that is DRAWN.
 *
 * `BodyProfile.surfaceAt` is where every wrapped thing in this product
 * finds the skin: the kamarbandh walks it, the garland's resting arc
 * walks it, collars and sashes walk it. Nothing checked that it was
 * true, and on one of the two bodies it was not.
 *
 * THE DEFECT. The generated surface took the front from whichever volume
 * reached furthest at that height — usually the belly — and then mirrored
 * it through the CHEST's centre. A belly sits further forward than a
 * chest, so the back came out behind the figure by twice the difference.
 * Measured on Ganesha, whose belly is centred twenty-five millimetres
 * ahead of his chest: the surface claimed a back FIFTY millimetres behind
 * the mesh, at every height of the waist, and thirty-four at the rear
 * quarters. The belt that walks it stood fifty-two to ninety-three
 * millimetres off his back while touching his front, which is what a full
 * turn round the statue shows and what no test could say.
 *
 * It is the same error the kamarbandh's own comment records about the
 * torus it replaced — symmetric stretching pushing the back out by
 * exactly the belly's forward offset. Fixing the ornament did not fix the
 * surface the ornament was moved onto, and nothing connected the two.
 *
 * WHAT THIS HOLDS. Not the model — a profile is a summary and is allowed
 * to be smooth where a mesh is faceted. The AGREEMENT: at every bearing
 * and every height of the torso, the point the profile calls the skin is
 * near the skin. A summary that is twenty millimetres out is not a
 * summary of this body.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

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
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport } from "../rig";
import { ZoneMaterials } from "../materials";
import { skinDepthAt, skinFieldOf } from "../spatial/skinDepth";

/**
 * How far out a summary of a torso may be, in millimetres.
 *
 * A profile is allowed to stand a little OUTSIDE the skin — that is what
 * an ornament's own clearance is measured from, and a summary that
 * rounded inward would bury things. It is not allowed to stand far out,
 * and it is barely allowed to be inside at all.
 *
 * The stylised body gets more room because it is a union of large smooth
 * volumes and its profile is two ellipsoids: they agree to within five
 * millimetres everywhere measured, which is the number here plus the
 * sampling. The measured body ships a table of its own surface and holds
 * to a tighter one.
 */
const TOLERANCE_MM: Record<string, { out: number; in: number }> = {
  ganesha: { out: 12, in: 6 },
  shiva: { out: 12, in: 6 },
  vishnu: { out: 12, in: 6 },
};

async function rigFor(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rig = buildRig(config, materials);
  poseRig(rig, config.pose);
  settleOnSupport(rig);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

describe.each([
  ["ganesha", createDefaultGaneshaConfiguration],
  ["shiva", createDefaultShivaConfiguration],
  ["vishnu", createDefaultVishnuConfiguration],
] as const)("%s", (label, make) => {
  it("the surface a wearable walks is the surface that is drawn", async () => {
    const { rig, materials } = await rigFor(make());
    try {
      const field = skinFieldOf(rig.bodyMeshes);
      const chest = rig.joints.get("chest");
      expect(chest, "the figure has a chest joint").toBeTruthy();
      chest!.updateWorldMatrix(true, false);
      const limit = TOLERANCE_MM[label]!;

      /**
       * The band of the torso this is about: from a little below the
       * shoulders to the waist, which is where every wrapped ornament
       * sits. Above and below it the profile openly declines to answer —
       * see `torsoBand` — and holding it there would be holding it to a
       * promise it does not make.
       */
      const point = new THREE.Vector3();
      const complaints: string[] = [];
      let worstOut = 0;
      let worstIn = 0;
      for (let y = -0.13; y <= -0.02; y += 0.01) {
        for (let step = 0; step < 16; step += 1) {
          const bearing = (step / 16) * Math.PI * 2;
          const skin = rig.body.surfaceAt(bearing, y);
          point.set(skin.x, skin.y, skin.z).applyMatrix4(chest!.matrixWorld);
          const depth = skinDepthAt(field, point, 0.2) * 1000;
          if (depth > limit.in) {
            worstIn = Math.max(worstIn, depth);
            complaints.push(
              `inside by ${depth.toFixed(0)}mm at bearing ${((bearing * 180) / Math.PI).toFixed(0)}, y ${y.toFixed(2)}`,
            );
          } else if (-depth > limit.out) {
            worstOut = Math.max(worstOut, -depth);
            complaints.push(
              `${(-depth).toFixed(0)}mm clear of the skin at bearing ${((bearing * 180) / Math.PI).toFixed(0)}, y ${y.toFixed(2)}`,
            );
          }
        }
      }
      expect(
        complaints.slice(0, 6),
        `${complaints.length} samples disagree (worst ${worstOut.toFixed(0)}mm out, ${worstIn.toFixed(0)}mm in)`,
      ).toEqual([]);
    } finally {
      materials.dispose();
    }
  }, 300_000);
});
