/**
 * Clothing generators: dhoti styles and the angavastram shawl.
 */
import * as THREE from "three";
import { mesh, pleatedCylinder } from "../geometry";
import { seatedLapWrap } from "./seatedWrap";
import { pushOutsideBody, surfaceRibbon, type SurfaceWaypoint } from "./surfaceWalk";
import { num, type PartGenerator } from "./types";

export const humanoidDhoti: PartGenerator = (ctx) => {
  const garment = ctx.materials.get("garment");
  const accent = ctx.materials.get("garmentAccent");
  const length = num(ctx, "length", 1);
  const layered = num(ctx, "layered", 0);
  /**
   * HOW THE CLOTH IS FINISHED, which is what actually distinguishes one
   * dhoti from another.
   *
   * Every dhoti is a wrapped skirt — that is what the word means — so the
   * variants cannot differ in being one. What differs is what is done
   * with the loose length: pleated into a fan at the centre front and
   * bordered (`fan`), or caught up in a sash knotted at the hip with its
   * ends left hanging (`sash`). Those are different garments to look at
   * and they share the containment the base wrap already guarantees.
   */
  const fan = num(ctx, "fan", 0);
  const sash = num(ctx, "sash", 0);
  const bulk = ctx.proportions.bulk;
  const group = new THREE.Group();

  // The skirt wraps the body's measured clearance radius — wide enough
  // that this body's knee/shin masses stay inside it in standing poses,
  // and always outside the measured hips. Slimmer bodies get a slimmer
  // wrap instead of one deity's barrel.
  // Tied at the waist, following the hips, flaring to the clearance the
  // legs need. A wrap that leaves the waist as wide as the hem is a
  // barrel, not a garment — the taper is what makes it read as cloth.
  /**
   * AND IT TAPERS DOWNWARD, because the legs do.
   *
   * The comment above says it: "a wrap that leaves the waist as wide as
   * the hem is a barrel, not a garment -- the taper is what makes it read
   * as cloth." Then the waist was widened to clear the hips, which are
   * the widest thing it has to pass, and top and bottom became the same
   * number: a perfect cylinder, which is what a side view showed.
   *
   * Both are true at once if the taper runs the other way. The hips are
   * at the TOP and the legs draw in below them -- measured on the
   * stylised body, the calf and knee masses reach a hundred and
   * thirty-six millimetres where the hips reach a hundred and
   * sixty-five -- so the hem can come in without touching anything.
   */
  const hemClearance =
    ctx.body.legSpreadX + Math.max(ctx.body.kneeRadius, ctx.body.calfRadius) + 0.012;
  const bottomR = Math.max(hemClearance, ctx.body.dhotiRadius * 0.86);
  /**
   * THE WAIST CLEARS THE HIPS, not the pelvis.
   *
   * `pelvisHalfWidth` is the seat mass, and on a stylised body the thigh
   * masses hang outboard of it: ninety millimetres to the joint plus a
   * seventy-five millimetre sphere, where the pelvis is a hundred and
   * fifty-two. The skirt's top was cut to the pelvis plus twelve, which
   * is NARROWER than the hip it has to pass over, so a facet of the hip
   * came through the cloth and read as a patch of skin on the skirt.
   *
   * `dhotiRadius` is the body's own statement of the radius a wrap needs
   * to clear its hips and standing legs; the waist is held to it too. The
   * taper survives, because the hem is drawn at ninety-four percent of
   * the bottom and the bottom is no wider than before.
   */
  const topR = Math.max(ctx.body.pelvisHalfWidth + 0.012, ctx.body.dhotiRadius, bottomR);
  const waistY = ctx.body.waistSeatY;
  // Seated drape volumes are authored against the classic wrap; scale
  // them with the actual wrap so slim bodies get a proportionate lap.
  const lapScale = bottomR / (0.165 * bulk);

  if (ctx.seated) {
    /**
     * SEATED CLOTH IS STILL CLOTH.
     *
     * The lap used to be one flattened sphere — a smooth ball the width
     * of the crossed legs, with a half-torus laid across its front for a
     * hem. On the stylised body it passed; on a seated mesh figure it is
     * a cream cushion swallowing the legs, and Shiva in meditation read
     * as sitting inside a cocoon. A sphere has no folds, no hem it can
     * hold, and no relationship with the legs under it, so there is
     * nothing about it the eye can take for fabric.
     *
     * What a seated wrap actually is: the same pleated cone as the
     * standing one, drawn short and wide. A waist that grips, a fall that
     * flares over the knees, pleats that catch light down their length,
     * and a banded hem at the bottom. It is built from the same
     * `pleatedCylinder` as the standing skirt for exactly that reason —
     * the thing that reads as cloth is the pleating, and a seated figure
     * has no less claim on it than a standing one.
     *
     * The width comes from the legs the figure ACTUALLY has: `legExtentAt`
     * is the body's own statement of how far its legs reach at a height,
     * which on a folded pose is the knees. Authored numbers would be the
     * stylised body's lap on a mesh body's knees all over again.
     */
    const lap = seatedLapWrap(ctx.body, ctx.seatedLegs);
    // A lap is wider than it is deep, so the wrap over it is an ellipse.
    // A circle big enough for the knees stands out into the air in front
    // of the shins by the difference, which is most of a hand's width.
    const lapR = lap.lapRadiusX;
    const squash = lap.lapRadiusZ / lap.lapRadiusX;
    const skirtDrop = waistY - lap.hemY;

    group.add(
      mesh(pleatedCylinder(topR * 1.02, lapR, skirtDrop, 20, Math.max(0.008, lapR * 0.05)), garment, {
        position: [0, waistY - skirtDrop / 2, 0],
        scale: [1, 1, squash],
      }),
    );
    // The lap itself: a shallow dome closing the top of that cone, so
    // nothing looks down inside the wrap from three-quarters.
    group.add(
      mesh(new THREE.SphereGeometry(lapR, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), garment, {
        position: [0, waistY - skirtDrop + 0.004, 0],
        scale: [1, 0.26, squash],
      }),
    );
    // Hem band round the bottom edge — the line that says where the
    // cloth ends, which a sphere could never have.
    group.add(
      mesh(new THREE.TorusGeometry(lapR * 0.985, 0.011, 10, 48), accent, {
        position: [0, waistY - skirtDrop + 0.008, 0],
        rotation: [Math.PI / 2, 0, 0],
        scale: [1, squash, 1],
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

  /**
   * HOW THE POSE WEARS IT, which this generator was not reading.
   *
   * `PosePreset.garment` says whether cloth is worn full, gathered or
   * short, and it is declared BY THE POSE rather than inferred — a
   * dancing figure's wrap is short because the pose says a leg is out,
   * not because a renderer noticed a leg through a skirt. The hide
   * generator has always honoured it. This one did not, so Ganesha's
   * `dance` preset declared `garment: "short"` and got a full-length
   * skirt, and his raised leg went straight through the red.
   *
   * The same shape as a wearable's `clearanceM`: a field one generator
   * reads and another ignores is worse than a field nobody reads,
   * because it looks answered.
   */
  const worn = ctx.garment === "short" ? 0.45 : ctx.garment === "gathered" ? 0.75 : 1;
  const skirtLength = (0.2 + 0.17 * length) * worn;
  const hemY = waistY - skirtLength;

  // Main pleated skirt
  // Folds in proportion to the wrap: seven millimetres is four percent
  // of a stylised figure's radius and reads as a smooth tube.
  const fold = Math.max(0.007, topR * 0.055);
  group.add(
    mesh(pleatedCylinder(topR, bottomR * 0.94, skirtLength, 16, fold), garment, {
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
  /**
   * WHERE THE CLOTH IS AT A GIVEN HEIGHT, and which way it leans.
   *
   * The skirt is a cone from `topR` at the waist to `hemR` at the hem,
   * pleated a whole `fold` either side of that. Anything laid on its
   * front has to follow both or it sinks in at one end and stands off at
   * the other — which is what the strips below were doing: placed at a
   * single fixed depth, they disappeared into the wrap near the waist and
   * surfaced in pale flecks lower down, on every dhoti in the picker.
   */
  const hemR = bottomR * 0.94;
  const cloth = {
    lean: Math.atan2(topR - hemR, skirtLength),
    at: (y: number) => hemR + (topR - hemR) * ((y - hemY) / Math.max(1e-6, skirtLength)),
    // Beyond the pleat crests, with room for a strip's own half-thickness.
    clear: fold * 1.75,
  };

  // Front pleat fan — three accent strips flaring toward the hem
  const fanStrips = 3;
  for (let i = 0; i < fanStrips; i++) {
    const t = i / (fanStrips - 1) - 0.5;
    const stripLength = skirtLength * (0.88 - Math.abs(t) * 0.14);
    const centreY = waistY - 0.005 - stripLength / 2;
    group.add(
      mesh(new THREE.BoxGeometry(0.032, stripLength, 0.005), accent, {
        position: [t * 0.06, centreY, cloth.at(centreY) + cloth.clear],
        rotation: [-cloth.lean, 0, t * 0.1],
      }),
    );
  }

  if (fan > 0) {
    /**
     * THE ROYAL FINISH: a deep pleated fan at the centre front, and a
     * border heavy enough to read as one.
     *
     * The kachcha's loose length is pleated and tucked so it hangs as a
     * fan from the waist, and on a court dhoti that fan is the garment's
     * whole front. It is built as separate blades rather than as one
     * plate because a fan is a stack of folds seen edge-on — a single box
     * with an accent material is a bib.
     *
     * It hangs OUTSIDE the skirt it is pleated from (the skirt's own
     * radius plus the fold depth), falls a little past the hem the way a
     * tucked length does, and shortens with the pose exactly as the
     * skirt does, so a dancing figure does not wade through it.
     */
    const fanLength = skirtLength * 1.08;
    const blades = 7;
    /**
     * THE FAN FOLLOWS THE SKIRT, which is not optional.
     *
     * Placed at a fixed depth the blades sank into the cloth at the waist
     * — where the wrap is at `topR` — and emerged near the hem, where it
     * has drawn in to `bottomR`. What that renders as is a jagged gold
     * and red sawtooth down the front: not a fan, a z-fight. The skirt is
     * a cone, so the fan hanging on it leans at the cone's own angle and
     * its depth is read off the cloth at each blade's own height.
     */
    for (let i = 0; i < blades; i += 1) {
      const t = i / (blades - 1) - 0.5;
      // Shorter at the edges, so the fan's lower edge is a curve.
      const length = fanLength * (1 - Math.abs(t) * 0.12);
      const width = 0.03 + Math.abs(t) * 0.004;
      const centreY = waistY - 0.004 - length / 2;
      /**
       * Clear of the PLEAT CRESTS, not of the cone.
       *
       * `pleatedCylinder` swings a whole `fold` either side of the
       * nominal radius, and the blade has its own half-thickness behind
       * its centre line. At 1.25 folds the blade's back face sat at 0.8
       * of a fold — inside the crests — and the crests came through it in
       * ragged red teeth. The crest is at one fold, the blade's back face
       * has to be beyond that, and the margin is what stops it flickering
       * as the figure turns.
       */
      const depth = cloth.at(centreY) + cloth.clear;
      group.add(
        mesh(new THREE.BoxGeometry(width, length, fold * 0.9), accent, {
          position: [t * 0.085 * (depth / topR), centreY, depth - Math.abs(t) * 0.014],
          rotation: [-cloth.lean, -t * 0.5, t * 0.07],
        }),
      );
    }
    // A broad border round the hem, which is what makes it court dress
    // rather than a longer skirt.
    group.add(
      mesh(new THREE.CylinderGeometry(bottomR * 0.95, bottomR * 0.95, 0.034, 40, 1, true), accent, {
        position: [0, hemY + 0.019, 0],
      }),
    );
    // And a second waistband above the first: the tuck that holds it.
    group.add(
      mesh(new THREE.TorusGeometry(topR * 1.005, 0.011, 10, 48), accent, {
        position: [0, waistY - 0.026, 0],
        rotation: [Math.PI / 2, 0, 0],
      }),
    );
  }

  if (sash > 0) {
    /**
     * THE PATKA: a sash knotted at the hip with its ends left to hang.
     *
     * Distinct from the angavastram, which crosses the chest from a
     * shoulder — this one belongs to the waist, and it is the thing the
     * reference sheet's fifth dhoti is named for. Knot at the wearer's
     * left hip, two falls of different lengths beside the skirt.
     *
     * OUTSIDE the skirt and outside anything wound over it. It is the
     * outermost layer at the waist by construction: a sash is tied last.
     */
    /**
     * ON THE HIP, OUTSIDE THE WRAP.
     *
     * The knot was placed at a fraction of the hem radius and a fraction
     * of the waist radius independently, which put it most of the way
     * inside the skirt: from three-quarters only the ends were visible
     * and the sash read as two strips of cloth with nothing tying them.
     * A knot sits ON the cloth, so its distance from the axis is read off
     * the wrap at its own height like everything else here.
     */
    const knotY = waistY - 0.02;
    const knotR = cloth.at(knotY) + cloth.clear;
    // Forty degrees round from the front, on the wearer's left: far
    // enough to read as a hip rather than a buckle, near enough to be
    // seen from the front three-quarter the figure is shown at.
    const knotBearing = -0.7;
    const knotX = Math.sin(knotBearing) * knotR;
    const knotZ = Math.cos(knotBearing) * knotR;
    group.add(
      mesh(new THREE.SphereGeometry(0.027, 14, 12), accent, {
        position: [knotX, knotY, knotZ],
        scale: [1.15, 0.8, 0.9],
        rotation: [0, -knotBearing, 0.2],
      }),
    );
    // The two ends. Different lengths, because a tied sash has no reason
    // to be symmetrical and a symmetrical one reads as moulded.
    for (const [drop, offset, twist] of [
      [0.86, -0.1, 0.08],
      [0.6, 0.12, -0.12],
    ] as const) {
      const length = skirtLength * drop;
      const centreY = knotY - 0.012 - length / 2;
      const bearing = knotBearing + offset;
      // Each end follows the wrap down, like the fan does.
      const radius = cloth.at(centreY) + cloth.clear * 1.3;
      group.add(
        mesh(new THREE.BoxGeometry(0.042, length, fold * 0.8), accent, {
          position: [Math.sin(bearing) * radius, centreY, Math.cos(bearing) * radius],
          rotation: [-cloth.lean, -bearing, twist],
        }),
      );
    }
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
  /**
   * ABOVE THE WAISTBAND, which is where an upper cloth belongs.
   *
   * The route used to dip to a tenth of the torso's height — the hip, and
   * the hip is already wearing a skirt. Two garments competing for one
   * surface is a fight the drape cannot win: measured across every Shiva
   * pose, the uttariya reached twenty-eight to sixty-eight millimetres
   * inside whichever lower garment was on, and the two corrections that
   * belong at this layer (asking for clearance per BEARING, and pushing
   * the ribbon's edges out as well as its spine) between them removed
   * only about half of it. The rest is below the band `BodyProfile`
   * admits to describing, where no clearance query can be trusted.
   *
   * So the sash ends at the waist. That is also what an uttariya IS — the
   * upper cloth, worn over the shoulder and across the chest — and a sash
   * that stops where the dhoti starts is the dress the references draw.
   */
  const route: SurfaceWaypoint[] = [
    { bearing: 1.15, y: at(0.97) },
    { bearing: 0.5, y: at(0.8) },
    { bearing: -0.1, y: at(0.58) },
    { bearing: -0.75, y: at(0.47) },
    { bearing: -1.5, y: at(0.41) },
    { bearing: -Math.PI, y: at(0.46) },
    { bearing: -4.2, y: at(0.58) },
    { bearing: -5.0, y: at(0.84) },
    { bearing: 1.15 - Math.PI * 2, y: at(0.97) },
  ];

  /**
   * How far off the skin, ALONG the route — because what is under a sash
   * changes along it.
   *
   * Its low point dips to the hip, and the hip is already wearing a
   * skirt. Measured on Ganesha with a single clearance: a hundred and
   * seventeen of the sash's six hundred vertices were inside the dhoti,
   * the deepest by fifty-nine millimetres, and a thirty-millimetre patch
   * of it came out through the red on the far side — which is the tan
   * blob a rear-quarter view shows on the skirt, with nothing actually
   * misplaced behind it.
   *
   * The route's own heights say where it is, and the rig says what is
   * already worn there. A sash over a bare shoulder is unaffected: there
   * is nothing under it, so the clearance is the cloth's own.
   */
  const alongRoute = <K extends "y" | "bearing">(t: number, key: K): number => {
    const span = (route.length - 1) * Math.min(1, Math.max(0, t));
    const first = route[Math.floor(span)] ?? route[0]!;
    const second = route[Math.min(route.length - 1, Math.floor(span) + 1)] ?? first;
    return first[key] + (second[key] - first[key]) * (span - Math.floor(span));
  };
  const heightAt = (t: number): number => alongRoute(t, "y");
  const bearingAt = (t: number): number => alongRoute(t, "bearing");
  const cloth = surfaceRibbon(body, route, {
    halfWidth: (t) => halfWidth * (0.72 + 0.28 * Math.sin(Math.min(1, t * 1.6) * Math.PI)),
    thickness,
    /**
     * PER BEARING, and that is the whole correction.
     *
     * `wornClearanceAt` returns how far the cloth under it stands outside
     * the BODY, and asked without a bearing it measures that against the
     * body's FRONT. A skirt is roughly circular and a torso is not: at
     * the front the body is a hundred and ninety-two millimetres and the
     * skirt two hundred and fifty, so the sash wanted fifty-eight; carry
     * that same fifty-eight round to the back, where the body is a
     * hundred and fifty, and the sash lands at two hundred and eight —
     * forty millimetres inside the skirt it is supposed to lie on.
     *
     * Measured across every Shiva pose and every lower garment, the
     * uttariya reached twenty-eight to sixty-eight millimetres inside.
     * Asking at the bearing the ribbon is actually at removes all of it.
     */
    clearance: (t) =>
      Math.max(
        thickness * 0.35,
        ctx.wornClearanceAt("chest", heightAt(t), bearingAt(t)) + thickness * 0.35,
      ),
    samples: 150,
  });
  pushOutsideBody(cloth, body, { y: 0, z: 0 }, thickness * 0.25);

  /**
   * AND OUTSIDE WHAT IT IS DRAPED OVER, vertex by vertex.
   *
   * `clearance` places the ribbon's SPINE, and a ribbon has width: where
   * the route turns hardest its outer corner swings inboard of the spine
   * and lands inside the skirt. That is the same structural gap
   * `pushOutsideBody` exists to close against the body, and it closes it
   * against the body only — measured, the spine-level fix took the
   * uttariya from fifty down to thirty-seven millimetres inside the
   * dhoti, and the thirty-seven that remained were all edge.
   *
   * So the guarantee is restated where it has to hold: no vertex of this
   * cloth is nearer the axis than the cloth it is worn over. Pushed along
   * its own bearing, which is the direction "outward" means for a wrap,
   * and only outward — a vertex already clear is left alone.
   */
  {
    const position = cloth.getAttribute("position");
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) {
      point.fromBufferAttribute(position, i);
      const bearing = Math.atan2(point.x, point.z);
      const skin = body.surfaceAt(bearing, point.y);
      const offset = ctx.wornOffsetAt("chest", point.y, bearing);
      if (offset === null) continue;
      const want = Math.hypot(skin.x, skin.z) + offset + thickness * 0.5;
      const radius = Math.hypot(point.x, point.z);
      if (radius >= want || radius < 1e-5) continue;
      const scale = want / radius;
      position.setXYZ(i, point.x * scale, point.y, point.z * scale);
    }
    position.needsUpdate = true;
    cloth.computeVertexNormals();
  }

  const mesh = new THREE.Mesh(cloth, accent);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return [{ joint: "chest", object: group }];
};
