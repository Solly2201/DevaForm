/**
 * EXPERIMENTAL — spatial occupancy metadata.
 *
 * The existing layers answer two questions and answer them well:
 * presentations say what an attribute is DOING (semantic), and sockets,
 * grip frames and measured body surfaces say what it ATTACHES TO
 * (relational). What none of them can state is the third question: where
 * the asset's physical material actually is, where its legitimate empty
 * space is, and how much room it needs — so nothing today can say "a
 * finger fits through this bangle" or "this shaft is really the radius
 * its grip frame declares".
 *
 * This vocabulary states that, and ONLY that. A spatial region never
 * chooses a hand, a socket or a presentation; the resolver keeps that
 * job. A region is a claim about geometry that a validator can hold the
 * asset to — measured against the built mesh, never trusted from it.
 *
 * Everything here is plain serializable data with no THREE dependency,
 * for the same reason presentations are: claims about an asset belong in
 * the manifest layer, and the maths that evaluates them belongs to
 * whoever owns the geometry (the engine's `spatial/` module).
 *
 * The primitive set is deliberately the smallest one that can keep a
 * hole: a bounding box or a convex hull cannot represent a bangle
 * without filling it in, and an occupancy story that cannot tell
 * material from a hole answers the ring question wrongly by
 * construction. Sampled/SDF representations are deliberately absent —
 * see docs/spatial-occupancy-experiment.md for why they were not
 * justified by the cases tested.
 */
import type { Vec3 } from "@devaform/character-schema";

/**
 * A solid in the asset's own space (same frame as its geometry: origin at
 * the socket or grip point, +Y up — see docs/asset-specification.md §3).
 * Rigid placement only; the asset spec already forbids non-uniform scale.
 */
export type SpatialPrimitive =
  | { shape: "sphere"; center: Vec3; radius: number }
  /** Material within `radius` of the segment `start`–`end`. */
  | { shape: "capsule"; start: Vec3; end: Vec3; radius: number }
  /** Material within `radius` of `axis` through `center`, `halfHeight` each way. */
  | { shape: "cylinder"; center: Vec3; axis: Vec3; radius: number; halfHeight: number }
  /**
   * Material between `innerRadius` and `outerRadius` about `axis` — a ring
   * that KEEPS its hole. The hole itself is the cylinder
   * (center, axis, innerRadius, halfHeight), which `voidOfAnnulus` states.
   */
  | {
      shape: "annulus";
      center: Vec3;
      axis: Vec3;
      innerRadius: number;
      outerRadius: number;
      halfHeight: number;
    }
  /** Axis-aligned in asset space. */
  | { shape: "box"; center: Vec3; halfExtents: Vec3 };

/**
 * What a region claims about its space.
 *
 * occupied  — physical material is here.
 * void      — legitimately empty interior (a bangle's hole, the channel
 *             through a closed fist). Things are ALLOWED here; the point
 *             of stating it is that a coarser volume would forbid it.
 * clearance — keep-out margin around the material. Another asset's
 *             occupied space entering it is a warning, not contact.
 * contact   — where the asset expects to touch what it attaches to (a
 *             grip band, a crown's seat).
 */
export const SPATIAL_REGION_KINDS = ["occupied", "void", "clearance", "contact"] as const;
export type SpatialRegionKind = (typeof SPATIAL_REGION_KINDS)[number];

export interface SpatialRegion {
  kind: SpatialRegionKind;
  /** What this region is, for diagnostics — "shaft", "hole", "grip band". */
  label?: string;
  primitive: SpatialPrimitive;
}

/**
 * An asset's spatial claims. Optional everywhere: most assets are placed
 * relationally and never need one, and an absent occupancy means "not
 * stated", never "empty".
 */
export interface SpatialOccupancy {
  regions: readonly SpatialRegion[];
}

/** The hole an annulus keeps, as a primitive in its own right. */
export function voidOfAnnulus(
  annulus: Extract<SpatialPrimitive, { shape: "annulus" }>,
): Extract<SpatialPrimitive, { shape: "cylinder" }> {
  return {
    shape: "cylinder",
    center: annulus.center,
    axis: annulus.axis,
    radius: annulus.innerRadius,
    halfHeight: annulus.halfHeight,
  };
}

const isVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every((n) => Number.isFinite(n));

const positive = (value: unknown): value is number => typeof value === "number" && value > 0;

/**
 * Hold a (possibly deserialized) occupancy to its own rules. Returns
 * sentences, like the conformance checks do, so a failing sidecar names
 * its defect instead of throwing a type error at a customer.
 */
export function validateSpatialOccupancy(raw: unknown): string[] {
  const issues: string[] = [];
  const occupancy = raw as SpatialOccupancy;
  if (typeof raw !== "object" || raw === null || !Array.isArray(occupancy.regions)) {
    return ["spatial occupancy must be an object with a regions array"];
  }
  occupancy.regions.forEach((region: SpatialRegion | null | undefined, index) => {
    const at = `region ${index}${region?.label ? ` (${region.label})` : ""}`;
    if (!region || !(SPATIAL_REGION_KINDS as readonly string[]).includes(region.kind)) {
      issues.push(`${at}: unknown kind "${String(region?.kind)}"`);
      return;
    }
    const primitive = region.primitive as SpatialPrimitive | undefined;
    if (!primitive || typeof primitive !== "object") {
      issues.push(`${at}: missing primitive`);
      return;
    }
    switch (primitive.shape) {
      case "sphere":
        if (!isVec3(primitive.center)) issues.push(`${at}: sphere center is not a point`);
        if (!positive(primitive.radius)) issues.push(`${at}: sphere radius must be positive`);
        break;
      case "capsule":
        if (!isVec3(primitive.start) || !isVec3(primitive.end)) {
          issues.push(`${at}: capsule needs start and end points`);
        }
        if (!positive(primitive.radius)) issues.push(`${at}: capsule radius must be positive`);
        break;
      case "cylinder":
        if (!isVec3(primitive.center) || !isVec3(primitive.axis)) {
          issues.push(`${at}: cylinder needs a center and an axis`);
        } else if (Math.hypot(...primitive.axis) < 1e-9) {
          issues.push(`${at}: cylinder axis must not be zero`);
        }
        if (!positive(primitive.radius)) issues.push(`${at}: cylinder radius must be positive`);
        if (!positive(primitive.halfHeight)) issues.push(`${at}: cylinder halfHeight must be positive`);
        break;
      case "annulus":
        if (!isVec3(primitive.center) || !isVec3(primitive.axis)) {
          issues.push(`${at}: annulus needs a center and an axis`);
        } else if (Math.hypot(...primitive.axis) < 1e-9) {
          issues.push(`${at}: annulus axis must not be zero`);
        }
        if (!positive(primitive.innerRadius) || !positive(primitive.outerRadius)) {
          issues.push(`${at}: annulus radii must be positive`);
        } else if (primitive.innerRadius >= primitive.outerRadius) {
          issues.push(`${at}: annulus inner radius must be smaller than its outer radius`);
        }
        if (!positive(primitive.halfHeight)) issues.push(`${at}: annulus halfHeight must be positive`);
        break;
      case "box":
        if (!isVec3(primitive.center)) issues.push(`${at}: box center is not a point`);
        if (!isVec3(primitive.halfExtents) || !primitive.halfExtents.every((n) => n > 0)) {
          issues.push(`${at}: box halfExtents must be three positive numbers`);
        }
        break;
      default:
        issues.push(`${at}: unknown shape "${String((primitive as { shape?: unknown }).shape)}"`);
    }
  });
  return issues;
}
