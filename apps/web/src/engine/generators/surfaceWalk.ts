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
    const skin = body.surfaceAt(bearing, y);
    // Outward is away from the slice's own centre, which is the direction
    // the surface faces at this bearing.
    const centre = body.surfaceAt(bearing + Math.PI, y);
    const outward = new THREE.Vector3(
      skin.x - (skin.x + centre.x) / 2,
      0,
      skin.z - (skin.z + centre.z) / 2,
    );
    if (outward.lengthSq() < 1e-12) outward.set(0, 0, 1);
    outward.normalize();
    const stand = standOff(t) + Math.max(0, liftAt(t));
    points.push(new THREE.Vector3(skin.x, y, skin.z).addScaledVector(outward, stand));
    normals.push(outward);
  }
  return { points, normals };
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
