/**
 * EXPERIMENTAL — evaluating spatial occupancy claims.
 *
 * The vocabulary (asset-system/spatial.ts) states where material, voids,
 * clearance and contact are; this module answers questions about those
 * statements. Two rules keep it in its lane:
 *
 * 1. It VALIDATES, it never PLACES. Nothing here takes a configuration,
 *    chooses a hand, or moves an object. The resolver decides what an
 *    attribute is doing; walkSurface and the grip chain decide where it
 *    goes; this measures whether the geometry that resulted is
 *    physically coherent.
 *
 * 2. It runs at authoring/validation/test time. Per-frame collision was
 *    considered and deliberately not built — the placement systems are
 *    constructive (an ornament walked along a measured surface cannot be
 *    inside it), so there is nothing for a runtime check to catch that a
 *    build-time check does not catch cheaper.
 *
 * The query hierarchy is broad-to-narrow: axis-aligned bounds first
 * (level 0), then the analytic primitives (level 1), then sampled mesh
 * points where no primitive describes the form (level 2). Signed
 * distances are negative inside material, so "clearance" reads directly
 * off the number.
 */
import * as THREE from "three";
import type { SpatialOccupancy, SpatialPrimitive, SpatialRegionKind } from "@devaform/asset-system";

type Cylinder = Extract<SpatialPrimitive, { shape: "cylinder" }>;
type Capsule = Extract<SpatialPrimitive, { shape: "capsule" }>;

const v = (t: readonly [number, number, number]): THREE.Vector3 =>
  new THREE.Vector3(t[0], t[1], t[2]);

/**
 * Signed distance from a point to a primitive's surface, negative inside
 * the material. For the annulus this is the solid-of-revolution distance,
 * so a point in the HOLE is outside — which is the entire reason the
 * shape exists: a box or a hull would call the hole "inside".
 */
export function signedDistance(point: THREE.Vector3, primitive: SpatialPrimitive): number {
  switch (primitive.shape) {
    case "sphere":
      return point.distanceTo(v(primitive.center)) - primitive.radius;
    case "capsule": {
      const start = v(primitive.start);
      const end = v(primitive.end);
      const along = end.clone().sub(start);
      const t = THREE.MathUtils.clamp(
        point.clone().sub(start).dot(along) / Math.max(along.lengthSq(), 1e-12),
        0,
        1,
      );
      return point.distanceTo(start.addScaledVector(along, t)) - primitive.radius;
    }
    case "cylinder": {
      const { axial, radial } = frameOf(point, v(primitive.center), v(primitive.axis));
      const dAxial = Math.abs(axial) - primitive.halfHeight;
      const dRadial = radial - primitive.radius;
      if (dAxial <= 0 && dRadial <= 0) return Math.max(dAxial, dRadial);
      return Math.hypot(Math.max(dAxial, 0), Math.max(dRadial, 0));
    }
    case "annulus": {
      const { axial, radial } = frameOf(point, v(primitive.center), v(primitive.axis));
      const dAxial = Math.abs(axial) - primitive.halfHeight;
      // Outside the material either outward past the rim or inward into
      // the hole — whichever is nearer.
      const dRadial = Math.max(primitive.innerRadius - radial, radial - primitive.outerRadius);
      if (dAxial <= 0 && dRadial <= 0) return Math.max(dAxial, dRadial);
      return Math.hypot(Math.max(dAxial, 0), Math.max(dRadial, 0));
    }
    case "box": {
      const dx = Math.abs(point.x - primitive.center[0]) - primitive.halfExtents[0];
      const dy = Math.abs(point.y - primitive.center[1]) - primitive.halfExtents[1];
      const dz = Math.abs(point.z - primitive.center[2]) - primitive.halfExtents[2];
      const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0));
      return outside > 0 ? outside : Math.max(dx, dy, dz);
    }
  }
}

function frameOf(
  point: THREE.Vector3,
  center: THREE.Vector3,
  axis: THREE.Vector3,
): { axial: number; radial: number } {
  const unit = axis.clone().normalize();
  const offset = point.clone().sub(center);
  const axial = offset.dot(unit);
  const radial = offset.addScaledVector(unit, -axial).length();
  return { axial, radial };
}

/**
 * The least signed distance from a point to any region of the given kind
 * — negative means the point is inside one. +Infinity when the occupancy
 * states no region of that kind, which reads as "infinitely clear", the
 * honest answer to a question the asset never made a claim about.
 */
export function clearanceTo(
  occupancy: SpatialOccupancy,
  kind: SpatialRegionKind,
  point: THREE.Vector3,
): number {
  let least = Number.POSITIVE_INFINITY;
  for (const region of occupancy.regions) {
    if (region.kind !== kind) continue;
    least = Math.min(least, signedDistance(point, region.primitive));
  }
  return least;
}

/** Level-0 broad phase: the axis-aligned bounds of one primitive. */
export function primitiveBounds(primitive: SpatialPrimitive): THREE.Box3 {
  switch (primitive.shape) {
    case "sphere": {
      const c = v(primitive.center);
      const r = primitive.radius;
      return new THREE.Box3(c.clone().subScalar(r), c.clone().addScalar(r));
    }
    case "capsule": {
      const box = new THREE.Box3().setFromPoints([v(primitive.start), v(primitive.end)]);
      return box.expandByScalar(primitive.radius);
    }
    case "cylinder":
    case "annulus": {
      const radius = primitive.shape === "cylinder" ? primitive.radius : primitive.outerRadius;
      const c = v(primitive.center);
      const along = v(primitive.axis).normalize().multiplyScalar(primitive.halfHeight);
      const box = new THREE.Box3().setFromPoints([c.clone().add(along), c.clone().sub(along)]);
      return box.expandByScalar(radius);
    }
    case "box": {
      const c = v(primitive.center);
      const h = v(primitive.halfExtents);
      return new THREE.Box3(c.clone().sub(h), c.clone().add(h));
    }
  }
}

/** Level-0 broad phase over a whole occupancy, one kind at a time. */
export function occupancyBounds(occupancy: SpatialOccupancy, kind: SpatialRegionKind): THREE.Box3 {
  const box = new THREE.Box3();
  for (const region of occupancy.regions) {
    if (region.kind !== kind) continue;
    box.union(primitiveBounds(region.primitive));
  }
  return box;
}

/**
 * Does a capsule genuinely pass THROUGH a void — a finger through a
 * bangle, a shaft through the channel a closed fist keeps open?
 *
 * True only when the capsule's axis crosses the void's full height and
 * the capsule, at its own radius, stays inside the void's radius the
 * whole way. This is the question a bounding box answers wrongly by
 * construction: the box of a bangle CONTAINS the finger that fits it, so
 * box-versus-box reports the correct fit and the oversized jam
 * identically.
 */
export function passesThroughVoid(voidSpace: Cylinder, capsule: Capsule): boolean {
  const axis = v(voidSpace.axis).normalize();
  const center = v(voidSpace.center);
  const start = v(capsule.start);
  const end = v(capsule.end);
  const a0 = start.clone().sub(center).dot(axis);
  const a1 = end.clone().sub(center).dot(axis);
  // The segment must span the whole void, or the thing is resting in the
  // opening rather than passing through it.
  if (Math.min(a0, a1) > -voidSpace.halfHeight || Math.max(a0, a1) < voidSpace.halfHeight) {
    return false;
  }
  const allowed = voidSpace.radius - capsule.radius;
  if (allowed < 0) return false;
  // Where the segment crosses the void's slab, it must stay within the
  // allowed radius of the void's own axis. Sampled: the radial offset of
  // a straight segment from a straight axis is convex, so a fine sweep
  // cannot miss a violation bigger than its step.
  const STEPS = 32;
  const point = new THREE.Vector3();
  for (let i = 0; i <= STEPS; i += 1) {
    const t = i / STEPS;
    const axial = a0 + (a1 - a0) * t;
    if (Math.abs(axial) > voidSpace.halfHeight) continue;
    point.copy(start).lerp(end, t).sub(center);
    const radial = point.addScaledVector(axis, -point.dot(axis)).length();
    if (radial > allowed) return false;
  }
  return true;
}

/** Shortest distance between two segments — the capsule narrow phase. */
function segmentDistance(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  q0: THREE.Vector3,
  q1: THREE.Vector3,
): number {
  const d1 = p1.clone().sub(p0);
  const d2 = q1.clone().sub(q0);
  const r = p0.clone().sub(q0);
  const a = d1.lengthSq();
  const e = d2.lengthSq();
  const f = d2.dot(r);
  let s: number;
  let t: number;
  if (a <= 1e-12 && e <= 1e-12) return p0.distanceTo(q0);
  if (a <= 1e-12) {
    s = 0;
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = d1.dot(r);
    if (e <= 1e-12) {
      t = 0;
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = d1.dot(d2);
      const denominator = a * e - b * b;
      s = denominator > 1e-12 ? THREE.MathUtils.clamp((b * f - c * e) / denominator, 0, 1) : 0;
      t = THREE.MathUtils.clamp((b * s + f) / e, 0, 1);
      s = THREE.MathUtils.clamp((b * t - d1.dot(r)) / a, 0, 1);
    }
  }
  const closestP = p0.clone().addScaledVector(d1, s);
  const closestQ = q0.clone().addScaledVector(d2, t);
  return closestP.distanceTo(closestQ);
}

/** Signed clearance between two capsules — negative means they overlap. */
export function capsuleClearance(a: Capsule, b: Capsule): number {
  return (
    segmentDistance(v(a.start), v(a.end), v(b.start), v(b.end)) - a.radius - b.radius
  );
}

/**
 * The nearest approach between two sampled point sets, with a level-0
 * bounds rejection and a uniform grid so the narrow phase only visits
 * neighbouring cells. This is what attribute-versus-attribute questions
 * fall back to when neither side's form is a primitive: two ornaments
 * are strangers to each other today — each is held out of the BODY, and
 * nothing anywhere states their relationship to each other.
 */
export function closestApproach(
  a: readonly THREE.Vector3[],
  b: readonly THREE.Vector3[],
  /** Cell size; approaches beyond ~2 cells report as +Infinity. */
  cell = 0.02,
): number {
  if (a.length === 0 || b.length === 0) return Number.POSITIVE_INFINITY;
  const boundsA = new THREE.Box3().setFromPoints(a as THREE.Vector3[]);
  const boundsB = new THREE.Box3().setFromPoints(b as THREE.Vector3[]);
  const margin = 2 * cell;
  if (!boundsA.expandByScalar(margin).intersectsBox(boundsB)) return Number.POSITIVE_INFINITY;

  const key = (x: number, y: number, z: number) => `${x}|${y}|${z}`;
  const grid = new Map<string, THREE.Vector3[]>();
  for (const point of b) {
    const k = key(Math.floor(point.x / cell), Math.floor(point.y / cell), Math.floor(point.z / cell));
    const bin = grid.get(k);
    if (bin) bin.push(point);
    else grid.set(k, [point]);
  }
  let nearest = Number.POSITIVE_INFINITY;
  for (const point of a) {
    const cx = Math.floor(point.x / cell);
    const cy = Math.floor(point.y / cell);
    const cz = Math.floor(point.z / cell);
    for (let x = cx - 1; x <= cx + 1; x += 1) {
      for (let y = cy - 1; y <= cy + 1; y += 1) {
        for (let z = cz - 1; z <= cz + 1; z += 1) {
          const bin = grid.get(key(x, y, z));
          if (!bin) continue;
          for (const other of bin) {
            nearest = Math.min(nearest, point.distanceTo(other));
          }
        }
      }
    }
  }
  return nearest;
}
