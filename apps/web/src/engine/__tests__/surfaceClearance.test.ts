/**
 * Clearance means distance from the body, not travel along it.
 *
 * THE DEFECT. `walkSurface` offered a clearance and applied it
 * horizontally — away from the slice's own centre. On a vertical surface
 * that IS the normal, which is why it served waists, necks and ribcages
 * for as long as it did. Over a shoulder it is not: the skin slopes, its
 * normal points partly upward, and a horizontal push slides the ornament
 * sideways along the slope rather than lifting it off. Measured on the
 * shipped human, the surface normal at the side of the neck's base tilts
 * forty to fifty-seven degrees above horizontal.
 *
 * So an ornament asked to stand twenty millimetres clear of the skin
 * stood SIX AND A HALF millimetres clear and travelled the rest of the
 * way out across the deltoid. That is the pair of gold bars the kantha
 * hung over the shoulders, and no amount of tuning the clearance removed
 * it, because the clearance was what caused it.
 *
 * WHAT THIS MEASURES. Not the direction — a test that asserted a
 * direction would be asserting the implementation. The PROPERTY: ask for
 * more clearance and more clearance is what you get, measured as the true
 * minimum distance from the point to the skin, searched rather than
 * approximated. That property is what "clearance" is supposed to mean,
 * it is what was broken, and it is indifferent to how the fix works.
 *
 * WHY THE TRANSITIONS GET THEIR OWN CASES. A hollow — between neck and
 * shoulder, or an armpit — is where a faithful local normal is actively
 * wrong for something worn: the offset converges toward the centre of
 * curvature and ends up nearer the far wall than it started. Measured
 * there, a two-millimetre difference turned a twenty-millimetre clearance
 * into three and a half, which is WORSE than the flat approximation it
 * replaced. The span the normal is measured over is what fixes that, and
 * these cases are what hold it honest.
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
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig } from "../rig";
import { ZoneMaterials } from "../materials";
import type { BodyProfile } from "../generators/bodyProfile";
import { surfaceFrameAt, surfaceRibbon, walkSurface } from "../generators/surfaceWalk";

async function bodyOf(config: CharacterConfiguration): Promise<{
  body: BodyProfile;
  dispose: () => void;
}> {
  const materials = new ZoneMaterials();
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rig = buildRig(config, materials);
  poseRig(rig, config.pose);
  rig.root.updateWorldMatrix(true, true);
  return { body: rig.body, dispose: () => materials.dispose() };
}

/**
 * The honest metric: how far a point really is from the skin.
 *
 * Searched over the surface rather than computed from a radius, because
 * the radial distance is the very approximation under test — it is what
 * says a point that has slid along a shoulder is still "clear" of it. A
 * coarse sweep for the neighbourhood, then three refinements, which on
 * this surface lands within a few hundredths of a millimetre.
 */
function distanceToSkin(body: BodyProfile, target: THREE.Vector3): number {
  const at = (bearing: number, y: number) => {
    const skin = body.surfaceAt(bearing, y);
    return new THREE.Vector3(skin.x, y, skin.z);
  };
  let best = Infinity;
  let bestBearing = 0;
  let bestY = target.y;
  for (let i = 0; i < 180; i += 1) {
    const bearing = (i / 180) * Math.PI * 2;
    for (let j = -14; j <= 14; j += 1) {
      const y = target.y + j * 0.012;
      const distance = at(bearing, y).distanceTo(target);
      if (distance < best) {
        best = distance;
        bestBearing = bearing;
        bestY = y;
      }
    }
  }
  for (let pass = 0; pass < 3; pass += 1) {
    const spanBearing = (Math.PI * 2) / 180 / 2 ** pass;
    const spanY = 0.012 / 2 ** pass;
    for (let i = -6; i <= 6; i += 1) {
      for (let j = -6; j <= 6; j += 1) {
        const bearing = bestBearing + (i / 6) * spanBearing;
        const y = bestY + (j / 6) * spanY;
        const distance = at(bearing, y).distanceTo(target);
        if (distance < best) {
          best = distance;
          bestBearing = bearing;
          bestY = y;
        }
      }
    }
  }
  return best;
}

/**
 * The direction this replaced: horizontal, away from the slice's centre.
 *
 * Kept, and measured against, because "better than what was there" is a
 * claim a test can make honestly and "within 55% of ideal" is not. How
 * much of a clearance is reachable at all depends on the shape: offsetting
 * from a CONCAVE surface converges toward its centre of curvature, so a
 * narrow hollow cannot give four millimetres of separation to anything,
 * however the direction is chosen. What it can be held to is that the new
 * direction never does worse than the old one, and does better wherever
 * the body is not vertical.
 */
function horizontalOutward(body: BodyProfile, bearing: number, y: number): THREE.Vector3 {
  const skin = body.surfaceAt(bearing, y);
  const opposite = body.surfaceAt(bearing + Math.PI, y);
  const outward = new THREE.Vector3(
    skin.x - (skin.x + opposite.x) / 2,
    0,
    skin.z - (skin.z + opposite.z) / 2,
  );
  if (outward.lengthSq() < 1e-12) outward.set(0, 0, 1);
  return outward.normalize();
}

/**
 * Six places on a torso, named for the shape they are rather than for the
 * anatomy they happen to be: what the fix has to handle is a surface that
 * is vertical, one that curves, one that slopes, and one that turns back
 * on itself. The bodies supply the anatomy.
 */
const PLACES = [
  { label: "a flat torso", bearing: Math.PI / 2, y: 0.0 },
  { label: "a curved chest", bearing: 0, y: 0.05 },
  { label: "a shoulder slope", bearing: Math.PI / 2, y: 0.1 },
  { label: "the neck-to-shoulder transition", bearing: Math.PI / 2, y: 0.13 },
  { label: "over the shoulder", bearing: (105 * Math.PI) / 180, y: 0.11 },
  { label: "the back of the neck", bearing: Math.PI, y: 0.12 },
] as const;

/** Clearances to ask for, in metres: a bead, a band, a thick torque. */
const ASKED = [0.004, 0.008, 0.012, 0.02] as const;

const SUBJECTS = [
  { label: "a measured body", make: createDefaultVishnuConfiguration },
  { label: "a generated body", make: createDefaultGaneshaConfiguration },
] as const;

describe.each(SUBJECTS.map((subject) => [subject.label, subject] as const))(
  "%s: asking for clearance gets clearance",
  (_label, subject) => {
    for (const place of PLACES) {
      it(`${place.label}: more clearance is more distance`, async () => {
        const { body, dispose } = await bodyOf(subject.make());
        try {
          const skin = body.surfaceAt(place.bearing, place.y);
          const seat = new THREE.Vector3(skin.x, place.y, skin.z);

          const achieved = ASKED.map((asked) => {
            const frame = surfaceFrameAt(body, place.bearing, place.y, asked);
            // The seat itself must not move: clearance is separation, not
            // a different place on the body.
            expect(frame.point.distanceTo(seat), "the frame sits on its own point").toBeLessThan(
              1e-9,
            );
            return distanceToSkin(body, seat.clone().addScaledVector(frame.normal, asked));
          });

          /**
           * MONOTONE, which is the whole claim. A direction that merely
           * travels along the surface can leave this flat — the ornament
           * moves, the distance does not — and that is exactly what the
           * horizontal offset did over a shoulder.
           */
          for (let i = 1; i < achieved.length; i += 1) {
            expect(
              achieved[i]!,
              `${place.label}: ${ASKED[i]! * 1000}mm gave ${achieved[i]! * 1000}mm, ` +
                `${ASKED[i - 1]! * 1000}mm gave ${achieved[i - 1]! * 1000}mm`,
            ).toBeGreaterThan(achieved[i - 1]!);
          }

          /**
           * AND NEVER WORSE THAN THE DIRECTION IT REPLACED.
           *
           * The honest comparison. How much of a clearance is reachable
           * at all is a property of the shape — a hollow cannot give four
           * millimetres of separation to anything — so what this holds is
           * that the new direction beats the old one everywhere and is
           * never a regression anywhere, including the places where the
           * old one was already right.
           */
          const flat = horizontalOutward(body, place.bearing, place.y);
          for (let i = 0; i < ASKED.length; i += 1) {
            const before = distanceToSkin(body, seat.clone().addScaledVector(flat, ASKED[i]!));
            expect(
              achieved[i]!,
              `${place.label} at ${ASKED[i]! * 1000}mm: horizontal gave ` +
                `${(before * 1000).toFixed(1)}mm, the surface normal gave ` +
                `${(achieved[i]! * 1000).toFixed(1)}mm`,
            ).toBeGreaterThanOrEqual(before - 1e-6);
          }

          /**
           * And on a surface that is NOT vertical, strictly better — at
           * the largest clearance, where the difference is a thing you
           * can see rather than a rounding.
           */
          if (place.label !== "a flat torso") {
            const widest = ASKED[ASKED.length - 1]!;
            const before = distanceToSkin(body, seat.clone().addScaledVector(flat, widest));
            expect(
              achieved[achieved.length - 1]! - before,
              `${place.label}: the surface normal should beat horizontal at ${widest * 1000}mm`,
            ).toBeGreaterThan(0);
          }
        } finally {
          dispose();
        }
      }, 180_000);
    }

    /**
     * And the direction is the surface's, not the slice's.
     *
     * One assertion about HOW, because it is the thing that was wrong and
     * a reader deserves to see it stated: where the body slopes, the
     * outward direction has a vertical part. Where it does not, it has
     * none — which is the guarantee that waists, necks and ribcages are
     * exactly where they were.
     */
    it("the normal tilts where the body slopes, and not where it does not", async () => {
      const { body, dispose } = await bodyOf(subject.make());
      try {
        const tiltAt = (bearing: number, y: number) =>
          (Math.asin(Math.max(-1, Math.min(1, surfaceFrameAt(body, bearing, y, 0.012).normal.y))) *
            180) /
          Math.PI;
        const shoulder = Math.abs(tiltAt(Math.PI / 2, 0.1));
        const waist = Math.abs(tiltAt(Math.PI / 2, 0.0));
        expect(shoulder, "the shoulder's normal rises off horizontal").toBeGreaterThan(12);
        expect(shoulder, `shoulder ${shoulder.toFixed(0)}deg vs waist ${waist.toFixed(0)}deg`)
          .toBeGreaterThan(waist);
      } finally {
        dispose();
      }
    }, 180_000);
  },
);

describe("a thing that crosses the shoulder keeps its clearance there", () => {
  /**
   * The route is the same route; only the stand-off changes.
   *
   * This is the other half of the brief: preserve the intended
   * longitudinal position. A "fix" that moved the ornament along its
   * route to somewhere more convenient would pass every distance check
   * above and be useless, so the walk is run at two clearances and the
   * points are compared for where they sit AROUND the body as well as how
   * far off it they are.
   */
  const ROUTE = [
    { bearing: -0.4, y: 0.06 },
    { bearing: -1.4, y: 0.1 },
    { bearing: -Math.PI / 2 - 0.3, y: 0.115 },
    { bearing: -2.6, y: 0.11 },
    { bearing: -Math.PI, y: 0.1 },
  ];

  it("an ornament: every sample gains distance, and none of them wanders", async () => {
    const { body, dispose } = await bodyOf(createDefaultVishnuConfiguration());
    try {
      const near = walkSurface(body, ROUTE, 0.004, 48);
      const far = walkSurface(body, ROUTE, 0.016, 48);
      expect(near.points.length).toBe(far.points.length);

      let gained = 0;
      let minGain = Infinity;
      for (let i = 0; i < near.points.length; i += 1) {
        const a = distanceToSkin(body, near.points[i] as THREE.Vector3);
        const b = distanceToSkin(body, far.points[i] as THREE.Vector3);
        expect(b, `sample ${i}: 4mm gave ${(a * 1000).toFixed(1)}mm, 16mm gave ${(b * 1000).toFixed(1)}mm`)
          .toBeGreaterThan(a);
        gained += b - a;
        minGain = Math.min(minGain, b - a);
      }
      /**
       * And the gain is most of the twelve millimetres asked for — at
       * EVERY sample, not on average.
       *
       * The mean is the forgiving measure and the one that let this pass
       * while it was still broken: a route that is mostly vertical
       * averages well however badly it does over the shoulder. Both
       * numbers are here with the measurements that set them. Walking
       * this route and offsetting horizontally gives a mean of 7.8 mm and
       * a WORST sample of 5.1; offsetting along the surface's own normal
       * gives 11.8 and 10.0. The thresholds sit between those, so this
       * fails if the old direction ever comes back.
       */
      const mean = gained / near.points.length;
      expect(mean * 1000, `mean gain ${(mean * 1000).toFixed(1)}mm of an asked 12mm`).toBeGreaterThan(
        10,
      );
      expect(
        minGain * 1000,
        `worst sample gained ${(minGain * 1000).toFixed(1)}mm of an asked 12mm`,
      ).toBeGreaterThan(8);

      /**
       * THE ROUTE IS WHERE THE AUTHOR PUT IT.
       *
       * Said exactly rather than by a tolerance on bearing: take each
       * sample back along its own normal by its own clearance, and the
       * point of SKIN it was standing off from must be the same point at
       * both clearances. That is the whole of "preserve the longitudinal
       * position" — the ornament moved away from the body, not along it —
       * and a fix that slid the route somewhere more convenient fails it
       * however good its distances looked.
       */
      for (let i = 0; i < near.points.length; i += 1) {
        const footNear = (near.points[i] as THREE.Vector3)
          .clone()
          .addScaledVector(near.normals[i] as THREE.Vector3, -0.004);
        const footFar = (far.points[i] as THREE.Vector3)
          .clone()
          .addScaledVector(far.normals[i] as THREE.Vector3, -0.016);
        expect(
          footNear.distanceTo(footFar) * 1000,
          `sample ${i}: the skin point moved ${(footNear.distanceTo(footFar) * 1000).toFixed(2)}mm`,
        ).toBeLessThan(0.01);
      }
    } finally {
      dispose();
    }
  }, 180_000);

  it("a garment: a ribbon over the shoulder clears the skin along its whole width", async () => {
    const { body, dispose } = await bodyOf(createDefaultVishnuConfiguration());
    try {
      const measure = (clearance: number) => {
        const cloth = surfaceRibbon(body, ROUTE, {
          halfWidth: 0.022,
          thickness: 0.003,
          clearance,
          samples: 40,
        });
        const position = cloth.getAttribute("position");
        let worst = Infinity;
        for (let i = 0; i < position.count; i += 1) {
          worst = Math.min(
            worst,
            distanceToSkin(
              body,
              new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)),
            ),
          );
        }
        cloth.dispose();
        return worst;
      };
      /**
       * A ribbon is the harder case: it has WIDTH, and its edges sit
       * where its spine does not. Lifting the spine along a sloped
       * surface used to leave the downhill edge in the skin, because the
       * band's own across-direction was built from a horizontal outward.
       */
      const thin = measure(0.004);
      const thick = measure(0.016);
      expect(thick, `4mm clearance left ${(thin * 1000).toFixed(1)}mm; 16mm left ${(thick * 1000).toFixed(1)}mm`)
        .toBeGreaterThan(thin);
      expect(thin * 1000, "even the thin one keeps its edges out of the body").toBeGreaterThan(0);
    } finally {
      dispose();
    }
  }, 180_000);
});
