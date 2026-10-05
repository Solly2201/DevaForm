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
    mm: 16,
    reason: "constitutive",
    why: "an earring's hook passes through the earlobe on purpose; its fit says piercedThrough. It reads deeper on the stylised figure than it did, because his EARS only became measurable when the head joined the flesh",
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
    id: "ganesha.eyes.serene",
    mm: 17,
    reason: "constitutive",
    why: "an eye is in its socket. It became measurable when the head joined the figure's flesh, and what it measures is the eyeball inside the skull",
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
    mm: 46,
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
    mm: 25,
    reason: "seam",
    why: "a sculpted head socketed into a neck overlaps it; the overlap is what hides the join",
  },
  {
    id: "ganesha.trunk.leftCurl",
    mm: 24,
    reason: "seam",
    why: "the trunk's root is inside the head it grows from. It was 61mm in `dance` and 50mm in `royal`, which was not a root at all but the trunk curled into the belly — both presets turned it by POSITIVE x, which the `blessing` preset's own comment says folds it back into the torso",
  },
  {
    id: "ganesha.tusks.single",
    mm: 5,
    reason: "seam",
    why: "a tusk's root is inside the jaw it grows from",
  },
  {
    id: "ganesha.waist.kamarband",
    mm: 6,
    reason: "seam",
    why:
      "a sash wound round a waist beds into what it is tied over, and the belt is now seated on the dhoti's own measured radius rather than pushed clear of it by a body-derived floor. Before that it had NO penetration and stood eighty millimetres proud of the cloth — a gold flange wider than Ganesha's belly, visible from every angle in the showcase captures. A few millimetres of bite is what a tied band looks like; the alternative was a hoop in the air",
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
    mm: 13,
    reason: "grip",
    why: "a sweet pressed into the fist that closes on it",
  },
  {
    id: "ganesha.anklets.payal",
    mm: 17,
    reason: "grip",
    why: "a folded leg presses its own anklet against its own calf. Seated, that is contact between two parts of ONE body, which is what a seated statue does; it appears in `meditation` and `royal` and nowhere else",
  },
  {
    id: "shiva.attribute.trishul",
    mm: 11,
    reason: "grip",
    why: "a staff set down beside a seated figure rests against the thigh it is set down beside. Appears in `shiva.meditation` only",
  },
  {
    id: "ganesha.item.lotus",
    mm: 6,
    reason: "grip",
    why: "a lotus stem against the fingers round it, measurable since the hands became part of the figure rather than something worn on it",
  },
  {
    id: "ganesha.item.axe",
    mm: 7,
    reason: "grip",
    why: "the parashu's haft against the fingers round it, measurable for the same reason",
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
    mm: 12,
    reason: "defect",
    why: "swept station by station, a ring of this armlet's radius is inside the stylised figure at EVERY station of the upper arm — a thick arm carried against a chest that wide leaves nowhere for one to pass. It sits where the overlap is smallest and the armpit hides it. Both mesh bodies are clear; see bandSeat.test.ts",
  },
  {
    id: "ganesha.garment.shawl",
    mm: 21,
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
    mm: 15,
    reason: "defect",
    why: "the collar's rear span presses into the nape. Deeper than it read before, because the head and neck it presses into were not in the figure until they were",
  },
];

/** Anything at all may be this far in: below it the sign itself flutters. */
const FLOOR_MM = 2;

async function rigFor(config: CharacterConfiguration, preset?: string) {
  const materials = new ZoneMaterials();
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rig = buildRig(config, materials);
  poseRig(rig, preset ? { preset, jointOverrides: {} } : config.pose);
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

/**
 * Every pose the figure is offered in, not only the one it arrives in.
 *
 * This whole table was measured in the default pose first, and four
 * defects were hiding one pose away. Ganesha's trunk read twenty
 * millimetres standing -- its root, correct -- and SIXTY-ONE dancing,
 * because the preset turned it into his belly. His anklet is clear
 * standing and fifteen millimetres into his own calf sitting down. Shiva's
 * trishul rests against his thigh when he is seated and nowhere else.
 *
 * A figure that is right in one pose and wrong in another is a figure
 * nobody measured in the other.
 */
const POSES: Record<string, readonly string[]> = {
  ganesha: ["blessing", "standing", "meditation", "royal", "dance"],
  shiva: [
    "shiva.standing",
    "shiva.standingStaff",
    "shiva.blessing",
    "shiva.meditation",
    "shiva.tandava",
  ],
  vishnu: ["vishnu.regal"],
};

describe.each([
  ["ganesha", createDefaultGaneshaConfiguration],
  ["shiva", createDefaultShivaConfiguration],
  ["vishnu", createDefaultVishnuConfiguration],
] as const)("%s", (label, make) => {
  it.each(POSES[label]!)("in %s, is inside itself only where the table says", async (preset) => {
    const { rig, materials } = await rigFor(make(), preset);
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
