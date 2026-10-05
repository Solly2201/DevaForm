/**
 * Everything of this statue that is inside this statue, and why.
 *
 * A full turn round the three figures, measured rather than looked at:
 * every mesh that is not the body, every vertex, against the triangles
 * that are actually drawn. Most of what it finds is CORRECT. An earring
 * is supposed to be through an earlobe, a hair cap is rooted in the
 * skull, a sculpted head overlaps the neck it was socketed into, a fist
 * closes on the sweet it holds, and the inner wall of a wrapped garment
 * is inside the leg by construction — that is what stops a gap showing
 * at the hem.
 *
 * So a bare "nothing may intersect" would be false, and a test that
 * listed intersections without saying which were meant would be noise.
 * This one carries the REASON beside each allowance. The table below is
 * the classification: it says, asset by asset, whether the overlap is
 * part of what the thing is, a seam where two pieces were joined, the
 * lining of a garment that no customer can see, the grip of a hand on
 * what it holds, or a defect that is known and not yet fixed. Anything
 * not in the table may not be inside the figure at all.
 *
 * It is a ratchet in both directions. A new piece that starts
 * intersecting fails because the table does not mention it. An existing
 * one that gets deeper fails against its own number. The numbers are
 * measurements rather than margins — they were read off the statues —
 * so the right response to one of them growing is to find out what moved.
 *
 * WHAT IS NOT MEASURED HERE. Looseness, which `wornFit.test` owns;
 * whether the profile describes the body, which `bodySurface.test` owns;
 * and whether a band is round its limb, which `bandSeat.test` owns. This
 * one owns depth, for everything.
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
import { deformedVertex } from "../skinning";
import { skinDepthAt, skinFieldOf } from "../spatial/skinDepth";

/** Why a thing may be inside the figure. */
type Reason =
  /** The overlap IS the object: a pierced ear, paint on skin, a hair root. */
  | "constitutive"
  /** Two pieces joined: a swapped head in a neck, a hand on a wrist. */
  | "seam"
  /** A closed garment's inner wall, which must be inside or a gap shows. */
  | "lining"
  /** A held thing pressed into the fingers that close on it. */
  | "grip"
  /** Known, measured, not yet fixed. Each of these is a piece of work. */
  | "defect";

const ALLOWED: Array<{ id: string; mm: number; reason: Reason; why: string }> = [
  // --- constitutive ---------------------------------------------------
  {
    id: "ganesha.earrings.kundala",
    mm: 11,
    reason: "constitutive",
    why: "an earring's hook passes through the earlobe on purpose; its fit says piercedThrough",
  },
  {
    id: "vishnu.forehead.tilaka",
    mm: 6,
    reason: "constitutive",
    why: "paint on skin has no clearance; its fit says appliedTo, and a brow curves under it",
  },
  {
    id: "shiva.forehead.trinetra",
    mm: 5,
    reason: "constitutive",
    why: "the third eye is in the forehead, not standing off it",
  },
  {
    id: "humanoid.brows.serene",
    mm: 5,
    reason: "constitutive",
    why: "brows are drawn into the face they belong to",
  },
  {
    id: "humanoid.brows.strong",
    mm: 5,
    reason: "constitutive",
    why: "brows are drawn into the face they belong to",
  },
  {
    id: "shiva.jata.flowing",
    mm: 40,
    reason: "constitutive",
    why: "a hair cap is rooted in the skull it covers; only its outside is ever seen",
  },
  {
    id: "vishnu.hair.flowing",
    mm: 25,
    reason: "constitutive",
    why: "a hair cap is rooted in the skull it covers",
  },
  {
    id: "vishnu.crown.kirita",
    mm: 34,
    reason: "constitutive",
    why: "a crown's band encircles the head OVER the hair, so its inner face is inside the scalp",
  },

  // --- seams ----------------------------------------------------------
  {
    id: "(anon)head_classicSculpt",
    mm: 20,
    reason: "seam",
    why: "a sculpted head socketed into a neck overlaps it; the overlap is what hides the join",
  },
  {
    id: "ganesha.trunk.leftCurl",
    mm: 22,
    reason: "seam",
    why: "the trunk's root is inside the head it grows from",
  },
  {
    id: "ganesha.hands.classic",
    mm: 14,
    reason: "seam",
    why: "a hand part overlaps the wrist stump it continues",
  },

  // --- linings --------------------------------------------------------
  {
    id: "ganesha.garment.dhoti",
    mm: 40,
    reason: "lining",
    why: "the inner wall of a wrapped lower garment sits inside the legs. Asked from the other side — does the BODY come out through the cloth — the answer between hem and waistband is no, on all three figures; the escapes are at the two openings, which is what an opening is",
  },
  {
    id: "vishnu.garment.dhoti",
    mm: 25,
    reason: "lining",
    why: "the inner wall of this figure's lower garment, measured the same way and clean the same way between its two openings",
  },
  {
    id: "shiva.garment.tigerHide",
    mm: 42,
    reason: "lining",
    why: "the inner wall of the hide, which wraps the hips over the cloth beneath it and must be inside the leg to close",
  },

  // --- grips ----------------------------------------------------------
  {
    id: "ganesha.item.modak",
    mm: 10,
    reason: "grip",
    why: "a sweet pressed into the fist that closes on it",
  },
  {
    id: "shiva.attribute.damaru",
    mm: 5,
    reason: "grip",
    why: "the drum's waist against the fingers round it",
  },
  {
    id: "vishnu.attribute.shankha",
    mm: 12,
    reason: "grip",
    why: "the conch against the thumb that holds it",
  },

  // --- defects: each of these is a piece of work ----------------------
  {
    id: "ganesha.armlets.vanki",
    mm: 9,
    reason: "defect",
    why: "swept station by station, a ring of this armlet's radius is inside the stylised figure at EVERY station of the upper arm — a thick arm carried against a chest that wide leaves nowhere for one to pass. It sits where the overlap is smallest and the armpit hides it. Both mesh bodies are clear; see bandSeat.test.ts",
  },
  {
    id: "ganesha.garment.shawl",
    mm: 16,
    reason: "defect",
    why: "the sash crosses the shoulder and the upper arm rather than lying over them, and its lower end stops at a flat cut rather than a hem",
  },
  {
    id: "vishnu.garland.vaijayanti",
    mm: 9,
    reason: "defect",
    why: "the resting arc crosses the deltoid, which the torso surface it walks cannot see, because a deltoid belongs to an arm",
  },
  {
    id: "ganesha.necklace.haram",
    mm: 7,
    reason: "defect",
    why: "the collar's rear span presses into the nape",
  },
];

/** Anything at all may be this far in: below it the sign itself flutters. */
const FLOOR_MM = 2;

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

describe("the classification itself", () => {
  it("gives every allowance a reason", () => {
    for (const row of ALLOWED) {
      expect(row.why.length, `${row.id} says why`).toBeGreaterThan(20);
      expect(row.mm, `${row.id} allows a finite depth`).toBeLessThan(50);
    }
    // The ones that are not yet right, so the count cannot quietly grow.
    const defects = ALLOWED.filter((row) => row.reason === "defect").map((row) => row.id);
    expect(defects.sort()).toEqual([
      "ganesha.armlets.vanki",
      "ganesha.garment.shawl",
      "ganesha.necklace.haram",
      "vishnu.garland.vaijayanti",
    ]);
  });
});

describe.each([
  ["ganesha", createDefaultGaneshaConfiguration],
  ["shiva", createDefaultShivaConfiguration],
  ["vishnu", createDefaultVishnuConfiguration],
] as const)("%s", (_label, make) => {
  it("is inside itself only where the table says, and no deeper", async () => {
    const { rig, materials } = await rigFor(make());
    try {
      const field = skinFieldOf(rig.bodyMeshes);
      const body = new Set<THREE.Mesh>(rig.bodyMeshes);
      const budget = new Map(ALLOWED.map((row) => [row.id, row.mm]));

      const deepest = new Map<string, number>();
      const point = new THREE.Vector3();
      rig.root.traverse((node) => {
        if (!(node instanceof THREE.Mesh) || body.has(node)) return;
        let owner: THREE.Object3D | null = node;
        while (owner && !/^(part|attachment):/.test(owner.name)) owner = owner.parent;
        const id = owner ? owner.name.replace(/^(part|attachment):/, "") : `(anon)${node.name}`;
        const position = node.geometry.getAttribute("position");
        if (!position) return;
        node.updateWorldMatrix(true, false);
        // Enough samples to find a defect, few enough to stay a test.
        const stride = Math.max(1, Math.floor(position.count / 900));
        for (let i = 0; i < position.count; i += stride) {
          deformedVertex(node, i, point).applyMatrix4(node.matrixWorld);
          const depth = skinDepthAt(field, point) * 1000;
          if (depth > (deepest.get(id) ?? -Infinity)) deepest.set(id, depth);
        }
      });

      const complaints: string[] = [];
      for (const [id, depth] of deepest) {
        if (depth <= FLOOR_MM) continue;
        const allowed = budget.get(id);
        if (allowed === undefined) {
          complaints.push(
            `${id} is ${depth.toFixed(1)}mm inside the figure and the table does not say why`,
          );
        } else if (depth > allowed) {
          complaints.push(
            `${id} is ${depth.toFixed(1)}mm inside the figure, deeper than the ${allowed}mm recorded`,
          );
        }
      }
      expect(complaints, complaints.join("; ")).toEqual([]);
    } finally {
      materials.dispose();
    }
  }, 600_000);
});
