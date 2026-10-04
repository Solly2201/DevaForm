/**
 * Clothing generators: dhoti styles and the angavastram shawl.
 */
import * as THREE from "three";
import { mesh, pleatedCylinder } from "../geometry";
import { pushOutsideBody, surfaceRibbon, type SurfaceWaypoint } from "./surfaceWalk";
import { num, type PartGenerator } from "./types";

export const humanoidDhoti: PartGenerator = (ctx) => {
  const garment = ctx.materials.get("garment");
  const accent = ctx.materials.get("garmentAccent");
  const length = num(ctx, "length", 1);
  const layered = num(ctx, "layered", 0);
  const bulk = ctx.proportions.bulk;
  const group = new THREE.Group();

  // The skirt wraps the body's measured clearance radius — wide enough
  // that this body's knee/shin masses stay inside it in standing poses,
  // and always outside the measured hips. Slimmer bodies get a slimmer
  // wrap instead of one deity's barrel.
  // Tied at the waist, following the hips, flaring to the clearance the
  // legs need. A wrap that leaves the waist as wide as the hem is a
  // barrel, not a garment — the taper is what makes it read as cloth.
  const bottomR = Math.max(ctx.body.dhotiRadius, ctx.body.pelvisHalfWidth + 0.012);
  const topR = ctx.body.pelvisHalfWidth + 0.012;
  const waistY = ctx.body.waistSeatY;
  // Seated drape volumes are authored against the classic wrap; scale
  // them with the actual wrap so slim bodies get a proportionate lap.
  const lapScale = bottomR / (0.165 * bulk);

  if (ctx.seated) {
    // Seated poses: drape a lap cloth over the folded legs instead of a
    // full standing skirt that would clip through them.
    group.add(
      mesh(pleatedCylinder(topR, topR * 1.18, 0.1, 18, 0.006), garment, {
        position: [0, waistY - 0.05, 0],
      }),
    );
    // Lap drape — wide, flattened cushion of cloth over the crossed legs
    group.add(
      mesh(new THREE.SphereGeometry(0.19 * bulk * lapScale, 32, 22), garment, {
        position: [0, -0.075, 0.05],
        scale: [1.15, 0.42, 0.95],
      }),
    );
    // Hem falling over the front edge of the lap
    group.add(
      mesh(new THREE.TorusGeometry(0.185 * bulk * lapScale, 0.012, 10, 40, Math.PI), accent, {
        position: [0, -0.09, 0.055],
        rotation: [0.25, 0, 0],
        scale: [1.05, 0.9, 0.85],
      }),
    );
    // Waist wrap band
    group.add(
      mesh(new THREE.TorusGeometry(topR * 0.99, 0.016, 12, 48), garment, {
        position: [0, waistY + 0.005, 0],
        rotation: [Math.PI / 2, 0, 0],
      }),
    );
    // Center pleat fan spilling onto the lap
    group.add(
      mesh(new THREE.BoxGeometry(0.05, 0.13, 0.006), accent, {
        position: [0, -0.06, 0.155 * bulk * lapScale],
        rotation: [0.55, 0, 0],
      }),
    );
    return [{ joint: "pelvis", object: group }];
  }

  const skirtLength = 0.2 + 0.17 * length;
  const hemY = waistY - skirtLength;

  // Main pleated skirt
  group.add(
    mesh(pleatedCylinder(topR, bottomR * 0.94, skirtLength, 16, 0.007), garment, {
      position: [0, waistY - skirtLength / 2, 0],
    }),
  );
  // Hem band
  group.add(
    mesh(new THREE.TorusGeometry(bottomR * 0.94, 0.009, 10, 48), accent, {
      position: [0, hemY + 0.004, 0],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  if (layered > 0) {
    // Shorter over-layer
    group.add(
      mesh(pleatedCylinder(topR * 1.03, topR * 0.9, skirtLength * 0.55, 22, 0.006), accent, {
        position: [0, waistY - (skirtLength * 0.55) / 2, 0],
      }),
    );
  }
  // Waist wrap band
  group.add(
    mesh(new THREE.TorusGeometry(topR * 0.99, 0.016, 12, 48), garment, {
      position: [0, waistY + 0.005, 0],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  // Front pleat fan — three accent strips flaring toward the hem
  const fanStrips = 3;
  for (let i = 0; i < fanStrips; i++) {
    const t = i / (fanStrips - 1) - 0.5;
    const stripLength = skirtLength * (0.88 - Math.abs(t) * 0.14);
    group.add(
      mesh(new THREE.BoxGeometry(0.032, stripLength, 0.005), accent, {
        position: [t * 0.06, waistY - 0.005 - stripLength / 2, bottomR * 0.9 + 0.01],
        rotation: [0.02, 0, t * 0.1],
      }),
    );
  }

  return [{ joint: "pelvis", object: group }];
};

/**
 * The angavastram — a band of cloth over one shoulder, not a cord.
 *
 * WHAT WAS WRONG. The drape was a `taperedTube` through five control
 * points, and three of them were measured while TWO were typed: the
 * shoulder end and the hip end were authored as `[±0.16 * bulk, y, 0.02]`
 * — a z of two centimetres, which is near the middle of a torso rather
 * than on its surface. So the sash began and ended INSIDE the body.
 * Measured on Ganesha, whose shoulders are broadest, it reached
 * seventy-two millimetres in, which is the "upper garment intersecting
 * the shoulders" this fixes. Not a scale problem and not a clearance
 * problem: two points on a route were never expressed in the body's
 * coordinates at all.
 *
 * WHAT IT IS NOW. One route, authored entirely in bearings and heights,
 * walked onto whatever body wears it, and built as a RIBBON — cloth has
 * a width and a thickness and they are different numbers. The heights
 * come from the torso the body reports rather than from the figure
 * somebody had on screen, so the sash crosses a broad chest and a narrow
 * one at the same place on each.
 *
 * `pushOutsideBody` closes the loop. The walk guarantees the spine of the
 * band; the band has width, and where the route turns hardest its outer
 * corner can still reach skin. That guarantee is structural and already
 * exists — the serpent has used it since it was built.
 */
export const humanoidShawl: PartGenerator = (ctx) => {
  const accent = ctx.materials.get("garmentAccent");
  const group = new THREE.Group();
  const body = ctx.body;

  // The torso's own extent, so a sash crosses the same landmarks on any
  // body: the shoulder line at the top, the hip at the bottom.
  const SPINE_TO_CHEST_Y = 0.16;
  const top = body.chestCenterY + body.chestRadiusY;
  const bottom = body.bellyCenterY - body.bellyRadiusY - SPINE_TO_CHEST_Y;
  const at = (fraction: number) => bottom + (top - bottom) * fraction;

  const halfWidth = body.neckRadius * 0.62;
  const thickness = body.neckRadius * 0.1;

  /**
   * Over the LEFT shoulder, across the chest to the right hip, round the
   * back and home. Bearings turn toward the figure's left, so running
   * NEGATIVE from the front crosses to the right and carries on behind.
   */
  const route: SurfaceWaypoint[] = [
    { bearing: 1.15, y: at(0.97) },
    { bearing: 0.5, y: at(0.78) },
    { bearing: -0.1, y: at(0.52) },
    { bearing: -0.75, y: at(0.26) },
    { bearing: -1.5, y: at(0.12) },
    { bearing: -Math.PI, y: at(0.2) },
    { bearing: -4.2, y: at(0.5) },
    { bearing: -5.0, y: at(0.82) },
    { bearing: 1.15 - Math.PI * 2, y: at(0.97) },
  ];

  const cloth = surfaceRibbon(body, route, {
    halfWidth: (t) => halfWidth * (0.72 + 0.28 * Math.sin(Math.min(1, t * 1.6) * Math.PI)),
    thickness,
    clearance: thickness * 0.35,
    samples: 150,
  });
  pushOutsideBody(cloth, body, { y: 0, z: 0 }, thickness * 0.25);

  const mesh = new THREE.Mesh(cloth, accent);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return [{ joint: "chest", object: group }];
};
