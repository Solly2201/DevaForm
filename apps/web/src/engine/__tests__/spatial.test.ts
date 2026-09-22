/**
 * EXPERIMENT — can a compact spatial representation say what the current
 * vocabulary cannot?
 *
 * The current system's spatial knowledge is relational and constructive:
 * measured body surfaces, walks along them, grip frames, declared
 * clearances. It has no way to state where an asset's MATERIAL is as
 * distinct from its legitimate empty space — so nothing today can answer
 * "does a finger fit through this bangle?", because a bounding box or a
 * convex hull of a ring has no hole.
 *
 * These tests hold the experimental occupancy layer to that exact
 * question, and to the failure the coarser representations are proven to
 * have — the box test PASSES the wrong answer on purpose, as evidence.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  validateSpatialOccupancy,
  voidOfAnnulus,
  type SpatialOccupancy,
  type SpatialPrimitive,
} from "@devaform/asset-system";
import {
  capsuleClearance,
  clearanceTo,
  closestApproach,
  occupancyBounds,
  passesThroughVoid,
  primitiveBounds,
  signedDistance,
} from "../spatial/occupancy";
import { boundsOf, fitAnnulus, radialBand, surfacePoints } from "../spatial/derive";

type Capsule = Extract<SpatialPrimitive, { shape: "capsule" }>;

/**
 * A bangle-like test ring: nothing in the registry is a hollow attachment
 * yet (limb bands are procedural part slots, fitted by construction), so
 * the hollow case is a fixture. Torus about +Z: hole radius 8 mm, outer
 * rim 14 mm, 3 mm deep.
 */
function testRing(): { object: THREE.Object3D; holeRadius: number; outerRadius: number } {
  const object = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.003, 12, 48));
  return { object, holeRadius: 0.008, outerRadius: 0.014 };
}

const fingerThrough = (radius: number, offsetX = 0): Capsule => ({
  shape: "capsule",
  start: [offsetX, 0, -0.05],
  end: [offsetX, 0, 0.05],
  radius,
});

describe("occupancy distinguishes material from a hole", () => {
  it("derives a ring's annulus from its own triangles, no authored constants", () => {
    const { object, holeRadius, outerRadius } = testRing();
    const points = surfacePoints(object, object, 1);
    const annulus = fitAnnulus(points, new THREE.Vector3(0, 0, 1));
    expect(annulus).not.toBeNull();
    expect(annulus!.innerRadius).toBeCloseTo(holeRadius, 3);
    expect(annulus!.outerRadius).toBeCloseTo(outerRadius, 3);
    expect(annulus!.halfHeight).toBeCloseTo(0.003, 3);
  });

  it("a point in the hole is OUTSIDE the material; a point in the rim is inside", () => {
    const { object } = testRing();
    const annulus = fitAnnulus(surfacePoints(object, object, 1), new THREE.Vector3(0, 0, 1))!;
    // Dead centre of the hole: empty space, and the representation knows.
    expect(signedDistance(new THREE.Vector3(0, 0, 0), annulus)).toBeGreaterThan(0);
    // Inside the rim's material.
    expect(signedDistance(new THREE.Vector3(0.011, 0, 0), annulus)).toBeLessThan(0);
    // Outside the whole ring.
    expect(signedDistance(new THREE.Vector3(0.03, 0, 0), annulus)).toBeGreaterThan(0);
  });

  it("a compatible object passes through the void; an oversized one cannot", () => {
    const { object } = testRing();
    const annulus = fitAnnulus(surfacePoints(object, object, 1), new THREE.Vector3(0, 0, 1))!;
    const hole = voidOfAnnulus(annulus);
    // A 6 mm finger through an 8 mm hole: fits.
    expect(passesThroughVoid(hole, fingerThrough(0.006))).toBe(true);
    // A 10 mm finger through the same hole: does not.
    expect(passesThroughVoid(hole, fingerThrough(0.01))).toBe(false);
    // A 6 mm finger aimed 4 mm off the hole's axis: jams on the rim.
    expect(passesThroughVoid(hole, fingerThrough(0.006, 0.004))).toBe(false);
    // A stub that never crosses the ring is resting in the opening, not
    // passing through it.
    expect(
      passesThroughVoid(hole, {
        shape: "capsule",
        start: [0, 0, 0.001],
        end: [0, 0, 0.05],
        radius: 0.006,
      }),
    ).toBe(false);
  });

  it("a bounding box cannot make that distinction — proven, not asserted", () => {
    const { object } = testRing();
    const annulus = fitAnnulus(surfacePoints(object, object, 1), new THREE.Vector3(0, 0, 1))!;
    const ringBox = primitiveBounds(annulus);
    const fits = primitiveBounds(fingerThrough(0.006));
    const jams = primitiveBounds(fingerThrough(0.01));
    // Level 0 reports the correct fit and the oversized jam identically:
    // both intersect the ring's box. The box is still useful — as a broad
    // phase — but as an occupancy answer it is wrong by construction,
    // which is why the hierarchy cannot stop at level 0 for hollow forms.
    expect(ringBox.intersectsBox(fits)).toBe(true);
    expect(ringBox.intersectsBox(jams)).toBe(true);
  });
});

describe("occupancy answers plain overlap questions", () => {
  const shaft: Capsule = { shape: "capsule", start: [0, -0.2, 0], end: [0, 0.2, 0], radius: 0.008 };

  it("clearly separate assets are clear", () => {
    const other: Capsule = {
      shape: "capsule",
      start: [0.1, -0.2, 0],
      end: [0.1, 0.2, 0],
      radius: 0.008,
    };
    expect(capsuleClearance(shaft, other)).toBeCloseTo(0.1 - 0.016, 4);
  });

  it("clearly overlapping assets are found overlapping", () => {
    const crossing: Capsule = {
      shape: "capsule",
      start: [-0.1, 0, 0.002],
      end: [0.1, 0, 0.002],
      radius: 0.008,
    };
    expect(capsuleClearance(shaft, crossing)).toBeLessThan(0);
  });

  it("clearance regions read separately from occupied ones", () => {
    const occupancy: SpatialOccupancy = {
      regions: [
        { kind: "occupied", label: "shaft", primitive: shaft },
        {
          kind: "clearance",
          label: "swing room",
          primitive: { ...shaft, radius: 0.03 },
        },
      ],
    };
    const near = new THREE.Vector3(0.02, 0, 0);
    // Outside the material, inside the declared margin: a warning-shaped
    // answer, distinct from a collision-shaped one.
    expect(clearanceTo(occupancy, "occupied", near)).toBeGreaterThan(0);
    expect(clearanceTo(occupancy, "clearance", near)).toBeLessThan(0);
    // A kind the asset never claimed answers "infinitely clear".
    expect(clearanceTo(occupancy, "void", near)).toBe(Number.POSITIVE_INFINITY);
    expect(occupancyBounds(occupancy, "occupied").isEmpty()).toBe(false);
  });
});

describe("spatial metadata is plain data", () => {
  it("round-trips through JSON without loss and validates", () => {
    const { object } = testRing();
    const annulus = fitAnnulus(surfacePoints(object, object, 1), new THREE.Vector3(0, 0, 1))!;
    const occupancy: SpatialOccupancy = {
      regions: [
        { kind: "occupied", label: "ring", primitive: annulus },
        { kind: "void", label: "hole", primitive: voidOfAnnulus(annulus) },
      ],
    };
    const revived = JSON.parse(JSON.stringify(occupancy)) as SpatialOccupancy;
    expect(revived).toEqual(occupancy);
    expect(validateSpatialOccupancy(revived)).toEqual([]);
  });

  it("names its defects instead of loading them", () => {
    const issues = validateSpatialOccupancy({
      regions: [
        {
          kind: "occupied",
          label: "inside-out",
          primitive: {
            shape: "annulus",
            center: [0, 0, 0],
            axis: [0, 0, 1],
            innerRadius: 0.02,
            outerRadius: 0.01,
            halfHeight: 0.003,
          },
        },
        { kind: "solid", primitive: { shape: "sphere", center: [0, 0, 0], radius: 1 } },
      ],
    });
    expect(issues.some((issue) => issue.includes("inner radius"))).toBe(true);
    expect(issues.some((issue) => issue.includes('unknown kind "solid"'))).toBe(true);
  });
});

describe("cost", () => {
  it("narrow-phase queries are microseconds, and the grid keeps point pairs off the table", () => {
    const { object } = testRing();
    const annulus = fitAnnulus(surfacePoints(object, object, 1), new THREE.Vector3(0, 0, 1))!;
    const point = new THREE.Vector3();
    const QUERIES = 100_000;
    const t0 = performance.now();
    let sum = 0;
    for (let i = 0; i < QUERIES; i += 1) {
      point.set((i % 100) / 1000, ((i / 100) % 100) / 1000, 0.001);
      sum += signedDistance(point, annulus);
    }
    const perQuery = (performance.now() - t0) / QUERIES;
    expect(Number.isFinite(sum)).toBe(true);
    // Not a benchmark harness — a guard that the narrow phase stays in
    // validation-tool territory (well under a millisecond per query).
    expect(perQuery).toBeLessThan(0.05);

    const cloudA: THREE.Vector3[] = [];
    const cloudB: THREE.Vector3[] = [];
    for (let i = 0; i < 4000; i += 1) {
      const angle = (i / 4000) * Math.PI * 2;
      cloudA.push(new THREE.Vector3(Math.cos(angle) * 0.1, i / 40000, Math.sin(angle) * 0.1));
      cloudB.push(new THREE.Vector3(Math.cos(angle) * 0.1, 0.3 + i / 40000, Math.sin(angle) * 0.1));
    }
    const t1 = performance.now();
    const approach = closestApproach(cloudA, cloudB, 0.02);
    const gridMs = performance.now() - t1;
    expect(approach).toBeGreaterThan(0.05);
    expect(gridMs).toBeLessThan(250);
    expect(boundsOf(cloudA).isEmpty()).toBe(false);
  });
});

describe("the measurement a declaration can be held to", () => {
  it("reads a shaft's real thickness where a hand would close", () => {
    // A 8 mm shaft that SAYS it is 8 mm — radialBand agrees with it.
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 24, 8));
    const points = surfacePoints(shaft, shaft, 1);
    const band = radialBand(points, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0.1);
    expect(band.samples).toBeGreaterThan(20);
    expect(band.maxRadius).toBeCloseTo(0.008, 3);
    // The same mesh DECLARING 6 mm is the historical defect: a hand asked
    // to close on 6 mm around 8 mm of material. The measurement is what
    // makes the lie checkable at all.
    expect(Math.abs(band.maxRadius - 0.006)).toBeGreaterThan(0.0015);
  });
});
