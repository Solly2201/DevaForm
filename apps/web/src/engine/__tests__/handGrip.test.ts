/**
 * A closed hand closes AROUND what it is holding.
 *
 * THE DEFECT, in one number: the fist's aperture was three point seven
 * millimetres whether it was given a lotus stem of four, an axe haft of
 * seven, or a modak of THIRTY. The hand was not adapting to anything.
 *
 * Two things were wrong and the second hid the first.
 *
 * FINGERS CURLED BACKWARDS. `fingerPoints` rotated each phalanx about
 * +X, and about +X a finger pointing down turns away from the palm it
 * belongs to — so every closing mudra curled its fingers behind the hand.
 * Measured, the four tips reached a maximum of nine to fifteen
 * millimetres of local Z while the grip point they are supposed to close
 * on sits at twenty-two, and the nearest any finger came to it was
 * thirteen. In the Studio that is a ball of knuckles with the haft
 * running down the outside, which is what Ganesha had.
 *
 * AND THE SOLVER'S FALLBACK WAS THE TIGHTEST FIST. `closureFor` searches
 * outward for the closure that just clears the item and returns the last
 * one that did — but it started its answer at the mudra's FULL closure,
 * so the moment the first step already had the fingers inside the item it
 * broke and returned that. Which, with fingers curling the wrong way, was
 * every item. If a hand cannot open far enough for what it is given, the
 * honest answer is the widest it opens.
 *
 * Only Ganesha wears these hands; Shiva and Vishnu carry theirs in their
 * body mesh, and their holds are the anchors this must not move.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { getJoint } from "@devaform/character-schema";
import { makeHand } from "../generators/body";
import { deriveBodyProfile } from "../generators/bodyProfile";
import { ZoneMaterials } from "../materials";
import type { GeneratorContext } from "../generators/types";

/**
 * Where a gripping hand holds a shaft, hand-local. Mirrors `gripPoint`
 * in body.ts — stated here so the test says what it is measuring against
 * rather than importing the thing under test.
 */
const GRIP = new THREE.Vector3(0, -0.052, 0.022);

function context(materials: ZoneMaterials): GeneratorContext {
  return {
    params: {},
    materials,
    proportions: { height: 1, bulk: 1 },
    morphs: {},
    hands: {},
    arms: {},
    armSlots: [],
    held: {},
    seated: false,
    garment: "full",
    body: deriveBodyProfile({ belly: 1 }, { height: 1, bulk: 1 }),
    jointOffset: (child: never) => getJoint(child).position,
  } as unknown as GeneratorContext;
}

/**
 * The four finger TUBES, which are what closes on anything.
 *
 * The palm and the knuckle ridge are fixed geometry that happens to lie
 * near the grip point, and measuring them instead is how an earlier
 * version of this reported an aperture that never changed — it was
 * reading the knuckle, not the fingers.
 *
 * BY NAME, not by child index. This was `[3, 5, 7, 9]`, and adding a
 * muscle pad to the palm renumbered the children under it — which it
 * caught, loudly, but only because the indices then landed on nothing at
 * all. Landing on the wrong mesh would have been silent.
 */
function fingerTubes(hand: THREE.Group): THREE.Mesh[] {
  const tubes: THREE.Mesh[] = [];
  hand.traverse((node) => {
    if (typeof node.name === "string" && node.name.startsWith("finger:")) {
      tubes.push(node as THREE.Mesh);
    }
  });
  return tubes;
}

function fingerPointsOf(hand: THREE.Group): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  hand.updateMatrixWorld(true);
  for (const mesh of fingerTubes(hand)) {
    const position = mesh.geometry.getAttribute("position");
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < position.count; i += 1) {
      points.push(
        new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld),
      );
    }
  }
  return points;
}

/**
 * The gap the shaft has to fit through: how near a finger comes to the
 * grip point, measured ACROSS the channel. The channel runs along the
 * hand's X, so the plane that matters is Y–Z.
 */
function apertureOf(points: readonly THREE.Vector3[]): number {
  let best = Infinity;
  for (const point of points) {
    best = Math.min(best, Math.hypot(point.y - GRIP.y, point.z - GRIP.z));
  }
  return best;
}

describe("a gripping hand closes around its item", () => {
  it("the fingers reach PAST the grip point rather than stopping behind it", () => {
    const materials = new ZoneMaterials();
    try {
      const points = fingerPointsOf(makeHand(context(materials), "grip", -1, 0.0072));
      expect(points.length, "the hand has fingers to measure").toBeGreaterThan(100);
      /**
       * The one assertion that was false, and the whole defect. A hand
       * that encloses a shaft has finger in front of it; a hand that
       * curls away from the palm does not. Measured, this reached 9–15 mm
       * against a grip point at 22; it reaches past 40 now.
       */
      const furthest = Math.max(...points.map((point) => point.z));
      expect(
        furthest * 1000,
        `the fingers reach ${(furthest * 1000).toFixed(1)}mm, the grip point is at ${(GRIP.z * 1000).toFixed(0)}mm`,
      ).toBeGreaterThan(GRIP.z * 1000 + 8);
    } finally {
      materials.dispose();
    }
  });

  /**
   * AND THE APERTURE FOLLOWS THE ITEM.
   *
   * Not a fixed number per radius — the fist has a limit and a thirty
   * millimetre sweet is beyond it — but a hand asked to hold a thicker
   * thing must not close TIGHTER than one asked to hold a thin thing.
   * That is what "closes onto what it is holding" means, and the
   * measurement that exposed it was six radii producing one aperture.
   */
  it("opens wider for a thicker item, and never the same for all of them", () => {
    const materials = new ZoneMaterials();
    try {
      const radii = [0.0038, 0.0072, 0.012, 0.02] as const;
      const apertures = radii.map((radius) =>
        apertureOf(fingerPointsOf(makeHand(context(materials), "grip", -1, radius))),
      );
      for (let i = 1; i < apertures.length; i += 1) {
        expect(
          apertures[i]!,
          `${radii[i]! * 1000}mm gave ${(apertures[i]! * 1000).toFixed(1)}mm, ` +
            `${radii[i - 1]! * 1000}mm gave ${(apertures[i - 1]! * 1000).toFixed(1)}mm`,
        ).toBeGreaterThanOrEqual(apertures[i - 1]! - 1e-6);
      }
      expect(
        new Set(apertures.map((value) => Math.round(value * 10000))).size,
        `all four radii closed to the same aperture: ${apertures.map((a) => (a * 1000).toFixed(1)).join(", ")}mm`,
      ).toBeGreaterThan(1);

      // A hand holding a haft is not a fist: it leaves room for it.
      const haft = apertureOf(fingerPointsOf(makeHand(context(materials), "grip", -1, 0.0072)));
      const empty = apertureOf(fingerPointsOf(makeHand(context(materials), "grip", -1)));
      expect(haft, "holding something opens the hand more than holding nothing").toBeGreaterThan(
        empty,
      );
    } finally {
      materials.dispose();
    }
  });

  /**
   * And an OPEN hand is still open.
   *
   * The curl direction is shared by every mudra, so a fix aimed at the
   * fist could quietly fold a blessing palm shut. Abhaya is Ganesha's
   * most visible gesture and the thing a devotee reads first.
   */
  it("leaves an open gesture open", () => {
    const materials = new ZoneMaterials();
    try {
      const open = fingerPointsOf(makeHand(context(materials), "open", -1));
      const fist = fingerPointsOf(makeHand(context(materials), "grip", -1));
      const reach = (points: readonly THREE.Vector3[]) =>
        Math.min(...points.map((point) => point.y));
      // An open hand's fingers extend; a fist's come back up. Measured by
      // how far down the hand they reach.
      expect(reach(open), "open fingers extend further than a fist's").toBeLessThan(reach(fist));
    } finally {
      materials.dispose();
    }
  });
});
