/**
 * Walking a path along a body's surface.
 *
 * Ornaments that wrap — a serpent round the neck, a sacred thread across a
 * shoulder, a sash behind a waist — have always been authored here as
 * world-space points, then nudged when they turned out to be inside the
 * mesh. That is backwards. What the author actually knows is the ROUTE:
 * "start low on the chest, climb the front, round the back of the neck,
 * come out at the left shoulder". Where that route lands is the body's
 * business, not the ornament's.
 *
 * So a path is authored in surface coordinates — a bearing around the body
 * and a height — and evaluated onto whatever body is wearing it, standing
 * off the skin by a declared clearance. Change the body and the ornament
 * follows; it cannot end up inside, because it is never expressed in a
 * space where "inside" is representable.
 *
 * The clearance is a gap between the SKIN and the ornament's surface, so
 * a path that carries a thickness must declare it: a tube whose spine was
 * held six millimetres off the chest, but which is eleven millimetres
 * thick, has half of itself in the chest. Hence the clearance may be a
 * function of the distance along the route.
 */
import * as THREE from "three";
import type { BodyProfile } from "./bodyProfile";

/** A point on the route: a bearing around the body, and a height. */
export interface SurfaceWaypoint {
  /**
   * Bearing in radians, measured from the front and turning toward the
   * figure's left. Values outside one turn are meaningful: 0 → 2π is one
   * full wrap, and 0 → 3π is a turn and a half.
   */
  bearing: number;
  /** Height in chest-joint-local metres. */
  y: number;
  /**
   * Extra stand-off at this waypoint, over the path's clearance — for the
   * places an ornament lifts away from the body rather than hugging it.
   */
  lift?: number;
}

export interface SurfaceWalk {
  /** The route, in chest-joint-local space. */
  points: THREE.Vector3[];
  /** Outward direction at each point, for anything that must face away. */
  normals: THREE.Vector3[];
}

/** A point on the skin, and the direction that is away from it. */
export interface SurfaceFrame {
  /** The point on the skin, chest-joint-local. */
  point: THREE.Vector3;
  /** Unit normal of the surface there, pointing out of the body. */
  normal: THREE.Vector3;
}

/**
 * The surface's OWN normal at a point, measured over a span.
 *
 * WHAT WAS WRONG. Clearance used to be applied along the horizontal
 * direction away from the slice's centre. On a vertical surface that IS
 * the normal, which is why it served for waists and necks and ribcages
 * for so long. Over a shoulder it is not: the skin there slopes, its
 * normal points partly UPWARD, and pushing horizontally slides the
 * ornament sideways along the slope instead of lifting it off. Measured
 * on the shipped human, the normal at the side of the neck's base tilts
 * forty to fifty-seven degrees above horizontal — so an ornament asked to
 * stand twenty millimetres clear of the skin achieved six and a half,
 * and travelled the rest of the way out across the deltoid. That is the
 * pair of gold bars the kantha used to hang over the shoulders.
 *
 * WHAT IT IS NOW. The torso is a parametric surface: a bearing and a
 * height give a point, and that is the whole of what `surfaceAt` is. So
 * the normal is the one any parametric surface has — the cross product of
 * its two tangents — found by differencing the primitive rather than by
 * modelling the body a second time. On a vertical surface it returns
 * exactly the horizontal direction it replaces, so nothing that was
 * already right moves.
 *
 * THE SPAN IS THE WHOLE OF THE CARE REQUIRED, and it is why this takes
 * one. A normal is only as good as the scale it is measured at:
 *
 *   • Below the body's own `surfaceResolution` it measures the
 *     interpolation between two samples rather than the body.
 *   • In a CONCAVITY — the hollow between neck and shoulder, an armpit —
 *     a faithful local normal is actively wrong for something worn. The
 *     offset converges toward the centre of curvature, so the point ends
 *     up nearer the far wall of the hollow than it started. Measured,
 *     a two-millimetre difference there turned a twenty-millimetre
 *     clearance into three and a half; the flat approximation managed six
 *     and a half, and this managed thirteen.
 *
 * Both say the same thing: a thing worn at a stand-off of `span`
 * BRIDGES features smaller than `span`, so that is the scale its normal
 * should be measured at. Hence the window is the larger of the stand-off
 * asked for and the resolution the body admits to. It is not a shoulder
 * correction, and there is no anatomy named anywhere in it — a hollow is
 * simply a place where the surface turns faster than the ornament can
 * follow, and the span is what decides which those are.
 */
export function surfaceFrameAt(
  body: BodyProfile,
  bearing: number,
  y: number,
  /** How far off the skin this frame is going to be used at, metres. */
  span: number,
): SurfaceFrame {
  const at = (towards: number, height: number) => {
    const skin = body.surfaceAt(towards, height);
    return new THREE.Vector3(skin.x, height, skin.z);
  };
  const here = at(bearing, y);
  // The slice's own centre, which is both what "outward" is relative to
  // and what turns a span in metres into a step in bearing.
  const opposite = body.surfaceAt(bearing + Math.PI, y);
  const centreX = (here.x + opposite.x) / 2;
  const centreZ = (here.z + opposite.z) / 2;
  const radial = new THREE.Vector3(here.x - centreX, 0, here.z - centreZ);
  if (radial.lengthSq() < 1e-12) radial.set(0, 0, 1);
  const radius = Math.max(1e-3, radial.length());
  radial.normalize();

  const reach = Math.max(0, span);
  const stepY = Math.max(reach, body.surfaceResolution.height) / 2;
  const stepBearing = Math.max(reach / radius, body.surfaceResolution.bearing) / 2;
  const alongBearing = at(bearing + stepBearing, y).sub(at(bearing - stepBearing, y));
  const alongHeight = at(bearing, y + stepY).sub(at(bearing, y - stepY));
  const normal = new THREE.Vector3().crossVectors(alongBearing, alongHeight);
  // Degenerate where the surface pinches to nothing — the top of a
  // closed form, or a body that reports no width. The radial is the
  // honest answer there and it is what this replaced.
  if (normal.lengthSq() < 1e-16) return { point: here, normal: radial };
  normal.normalize();
  // Orientation, not geometry: the cross product's sign follows from the
  // parameterisation, and a body whose bearings ran the other way would
  // hand back an inward normal. Cheap to settle rather than assume.
  if (normal.dot(radial) < 0) normal.negate();
  return { point: here, normal };
}

/**
 * Evaluate a route onto a body.
 *
 * Waypoints are interpolated with a Catmull-Rom through the SURFACE
 * coordinates rather than through the resulting positions, so the path
 * curves the way the body does instead of cutting the corner between two
 * points on it — which is exactly how a spline drawn through world-space
 * samples ends up inside a chest.
 */
export function walkSurface(
  body: BodyProfile,
  route: readonly SurfaceWaypoint[],
  /**
   * How far the path runs off the skin — a constant, or, for a form whose
   * girth varies, its half-thickness plus the gap wanted under it, as a
   * function of the fraction travelled along the route.
   */
  clearance: number | ((t: number) => number),
  samples = 96,
): SurfaceWalk {
  const standOff = typeof clearance === "number" ? () => clearance : clearance;
  // Knots spaced by how far the route actually travels between waypoints,
  // not by how many waypoints there are. Five small steps up the chest
  // followed by three big ones round the neck are not equal strides, and
  // treating them as equal is what made the path swing wide.
  const knots: number[] = [0];
  for (let k = 1; k < route.length; k += 1) {
    const a = route[k - 1] as SurfaceWaypoint;
    const b = route[k] as SurfaceWaypoint;
    const here = body.surfaceAt(a.bearing, a.y);
    const there = body.surfaceAt(b.bearing, b.y);
    const radius = (Math.hypot(here.x, here.z) + Math.hypot(there.x, there.z)) / 2;
    const step = Math.hypot(b.y - a.y, radius * (b.bearing - a.bearing));
    knots.push((knots[k - 1] as number) + Math.max(step, 1e-4));
  }
  const span = knots[knots.length - 1] as number;
  for (let k = 0; k < knots.length; k += 1) knots[k] = (knots[k] as number) / span;

  const read = (pick: (step: SurfaceWaypoint) => number) =>
    interpolate(knots, route.map(pick));
  const bearingAt = read((step) => step.bearing);
  const heightAt = read((step) => step.y);
  const liftAt = read((step) => step.lift ?? 0);

  const points: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const bearing = bearingAt(t);
    const y = heightAt(t);
    // Clearance is separation FROM the skin, so it is applied along the
    // skin's own normal — see surfaceFrameAt. The route's own direction
    // is untouched: the bearing and the height are where the author put
    // them, and only the offset off the surface changes.
    const stand = standOff(t) + Math.max(0, liftAt(t));
    const frame = surfaceFrameAt(body, bearing, y, stand);
    points.push(frame.point.clone().addScaledVector(frame.normal, stand));
    normals.push(frame.normal);
  }
  return { points, normals };
}

/**
 * Push every vertex of a finished piece of geometry out of the body.
 *
 * `walkSurface` guarantees the clearance for a path that IS a walk. Not
 * everything is: a serpent's hood and head are a form built off the end of
 * the route, and nothing about hand-placed control points keeps them
 * outside a shoulder. Measured, the head of the naga had a tenth of its
 * surface inside the figure — invisible from the front, and unarguable
 * from the side.
 *
 * So the guarantee is made structural instead of hoped for: any vertex
 * closer to the slice's own centre than the skin plus the clearance is
 * moved radially out to exactly that. Vertices already clear are left
 * alone, so a reared hood keeps its shape and only what was buried moves.
 *
 * `toChest` maps the geometry's own space into the chest-joint space the
 * body's surface answers in.
 */
export function pushOutsideBody(
  geometry: THREE.BufferGeometry,
  body: BodyProfile,
  toChest: { y: number; z: number },
  clearance: number,
): void {
  const position = geometry.getAttribute("position");
  let moved = 0;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i) + toChest.y;
    const z = position.getZ(i) + toChest.z;
    const centreZ = (body.surfaceAt(0, y).z + body.surfaceAt(Math.PI, y).z) / 2;
    const bearing = Math.atan2(x, z - centreZ);
    const skin = body.surfaceAt(bearing, y);
    const here = Math.hypot(x, z - centreZ);
    const there = Math.hypot(skin.x, skin.z - centreZ) + clearance;
    if (here >= there || here < 1e-6) continue;
    const scale = there / here;
    position.setX(i, x * scale);
    position.setZ(i, (z - centreZ) * scale + centreZ - toChest.z);
    moved += 1;
  }
  if (moved > 0) {
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }
}

/**
 * Smooth cubic interpolation through knotted values, with overshoot
 * limited (Fritsch–Carlson).
 *
 * A uniform Catmull-Rom was the obvious choice and the wrong one: it
 * overshoots wherever the spacing between points changes sharply, and a
 * route that climbs the chest in small steps and then goes round the neck
 * in large ones changes spacing sharply by construction. The overshoot
 * swung the bearing past its waypoints and drove the path through the
 * flanks of the ribcage.
 *
 * Tangents here are the three-point difference over the ACTUAL knot
 * spacing, so ordinary stretches curve as smoothly as they ever did; the
 * limiter only bites where a tangent would carry the curve well past the
 * waypoints on either side. Clamping every tangent instead — plain
 * monotone interpolation — buys the same safety at the price of a flat
 * spot at every turning point, and a serpent creased at each one.
 */
function interpolate(knots: readonly number[], values: readonly number[]): (t: number) => number {
  const n = values.length;
  if (n === 1) return () => values[0] as number;
  const secants: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = (knots[i + 1] as number) - (knots[i] as number);
    secants.push(((values[i + 1] as number) - (values[i] as number)) / dx);
  }
  const slopes: number[] = new Array(n);
  slopes[0] = secants[0] as number;
  slopes[n - 1] = secants[n - 2] as number;
  for (let i = 1; i < n - 1; i += 1) {
    slopes[i] =
      ((values[i + 1] as number) - (values[i - 1] as number)) /
      ((knots[i + 1] as number) - (knots[i - 1] as number));
  }
  // Fritsch–Carlson: a tangent may not carry the curve more than three
  // secants away from where the waypoints put it.
  for (let i = 0; i < n - 1; i += 1) {
    const secant = secants[i] as number;
    if (secant === 0) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
      continue;
    }
    const before = (slopes[i] as number) / secant;
    const after = (slopes[i + 1] as number) / secant;
    const excess = before * before + after * after;
    if (excess > 9) {
      const scale = 3 / Math.sqrt(excess);
      slopes[i] = scale * before * secant;
      slopes[i + 1] = scale * after * secant;
    }
  }
  return (t: number): number => {
    const u = Math.min(1, Math.max(0, t));
    let i = n - 2;
    for (let k = 0; k < n - 1; k += 1) {
      if (u <= (knots[k + 1] as number)) {
        i = k;
        break;
      }
    }
    const x0 = knots[i] as number;
    const dx = (knots[i + 1] as number) - x0;
    const s = dx > 0 ? (u - x0) / dx : 0;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * (values[i] as number) +
      (s3 - 2 * s2 + s) * dx * (slopes[i] as number) +
      (-2 * s3 + 3 * s2) * (values[i + 1] as number) +
      (s3 - s2) * dx * (slopes[i + 1] as number)
    );
  };
}

/**
 * A BAND of cloth lying on the body, rather than a tube of it.
 *
 * Every sash, shawl and waistband in this repository was a `taperedTube`
 * — a hosepipe of circular section — which is why the complaint about
 * them was always the same word: they read as tubes. Cloth has a width
 * and a thickness and they are not the same number; a sash is a flat
 * band following the body, and the difference between that and a round
 * cord is most of what makes a garment look like a garment.
 *
 * Built on the walk, so it inherits everything the walk guarantees: the
 * route is authored in the body's own surface coordinates, and the band
 * stands off the skin by the clearance the caller declares. The width
 * runs ACROSS the surface — along the direction perpendicular both to
 * the path and to the outward normal — so the band lies on the body
 * rather than cutting through it edge-first.
 *
 * `taper` lets a sash narrow toward its ends, which is what stops a band
 * from terminating in a blunt rectangle.
 */
export function surfaceRibbon(
  body: BodyProfile,
  route: readonly SurfaceWaypoint[],
  options: {
    /** Half the cloth's width, metres — constant, or along the route. */
    halfWidth: number | ((t: number) => number);
    /** How thick the cloth is, metres. */
    thickness: number;
    /** Gap between the skin and the cloth's underside, metres. */
    clearance: number;
    samples?: number;
  },
): THREE.BufferGeometry {
  const samples = options.samples ?? 120;
  const width =
    typeof options.halfWidth === "number" ? () => options.halfWidth as number : options.halfWidth;
  // The walk is told to hold the UNDERSIDE off the skin, so the spine
  // rides half the cloth's thickness higher than that.
  const walk = walkSurface(
    body,
    route,
    options.clearance + options.thickness / 2,
    samples,
  );

  const positions: number[] = [];
  const indices: number[] = [];
  const tangent = new THREE.Vector3();
  const across = new THREE.Vector3();
  for (let i = 0; i <= samples; i += 1) {
    const here = walk.points[i] as THREE.Vector3;
    const ahead = walk.points[Math.min(samples, i + 1)] as THREE.Vector3;
    const behind = walk.points[Math.max(0, i - 1)] as THREE.Vector3;
    tangent.copy(ahead).sub(behind);
    if (tangent.lengthSq() < 1e-12) tangent.set(0, 1, 0);
    tangent.normalize();
    const outward = walk.normals[i] as THREE.Vector3;
    across.copy(tangent).cross(outward);
    if (across.lengthSq() < 1e-12) across.set(1, 0, 0);
    across.normalize();

    const half = width(i / samples);
    const lift = options.thickness / 2;
    // Four corners of this rung: outer edge pair, then inner edge pair.
    for (const [side, up] of [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ] as const) {
      positions.push(
        here.x + across.x * half * side + outward.x * lift * up,
        here.y + across.y * half * side + outward.y * lift * up,
        here.z + across.z * half * side + outward.z * lift * up,
      );
    }
  }
  // Four quads per segment: top, bottom and the two edges — a closed
  // band, so it reads solid from any angle including its own hem.
  for (let i = 0; i < samples; i += 1) {
    const a = i * 4;
    const b = a + 4;
    for (let corner = 0; corner < 4; corner += 1) {
      const next = (corner + 1) % 4;
      indices.push(a + corner, b + corner, a + next, a + next, b + corner, b + next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
