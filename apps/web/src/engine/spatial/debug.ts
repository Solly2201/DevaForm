/**
 * EXPERIMENTAL — developer visualization of spatial occupancy.
 *
 * Wireframes only, coloured by what a region claims and whether the
 * claim holds: GREEN valid occupancy, RED collision, BLUE void, YELLOW
 * clearance. Nothing imports this from the customer-facing Studio; it
 * exists so a /dev page or a test screenshot can show what the
 * validator measured, and it goes when the experiment's fate is
 * decided.
 */
import * as THREE from "three";
import type { SpatialOccupancy, SpatialPrimitive, SpatialRegionKind } from "@devaform/asset-system";

const COLORS: Record<SpatialRegionKind, number> = {
  occupied: 0x22cc55, // green — where material is
  void: 0x3377ff, // blue — legitimately empty
  clearance: 0xffcc00, // yellow — keep-out margin
  contact: 0xcc66ff, // violet — expected touch
};
const COLLIDING = 0xee2222; // red — a claim that failed validation

function primitiveGeometry(primitive: SpatialPrimitive): THREE.BufferGeometry {
  switch (primitive.shape) {
    case "sphere":
      return new THREE.SphereGeometry(primitive.radius, 16, 12);
    case "capsule": {
      const length = new THREE.Vector3(...primitive.end).distanceTo(
        new THREE.Vector3(...primitive.start),
      );
      return new THREE.CapsuleGeometry(primitive.radius, length, 4, 12);
    }
    case "cylinder":
      return new THREE.CylinderGeometry(
        primitive.radius,
        primitive.radius,
        primitive.halfHeight * 2,
        20,
        1,
        true,
      );
    case "annulus":
      return new THREE.TorusGeometry(
        (primitive.innerRadius + primitive.outerRadius) / 2,
        (primitive.outerRadius - primitive.innerRadius) / 2,
        10,
        28,
      );
    case "box":
      return new THREE.BoxGeometry(
        primitive.halfExtents[0] * 2,
        primitive.halfExtents[1] * 2,
        primitive.halfExtents[2] * 2,
      );
  }
}

function placePrimitive(mesh: THREE.Object3D, primitive: SpatialPrimitive): void {
  const UP = new THREE.Vector3(0, 1, 0);
  switch (primitive.shape) {
    case "sphere":
    case "box":
      mesh.position.set(...primitive.center);
      break;
    case "capsule": {
      const start = new THREE.Vector3(...primitive.start);
      const end = new THREE.Vector3(...primitive.end);
      mesh.position.copy(start).add(end).multiplyScalar(0.5);
      const along = end.sub(start);
      if (along.lengthSq() > 1e-12) {
        mesh.quaternion.setFromUnitVectors(UP, along.normalize());
      }
      break;
    }
    case "cylinder":
    case "annulus": {
      mesh.position.set(...primitive.center);
      const axis = new THREE.Vector3(...primitive.axis).normalize();
      // Torus geometry rings about +Z, cylinder about +Y.
      const own = primitive.shape === "annulus" ? new THREE.Vector3(0, 0, 1) : UP;
      mesh.quaternion.setFromUnitVectors(own, axis);
      break;
    }
  }
}

/**
 * A wireframe group for one occupancy, in the occupancy's own space.
 * Pass the labels of regions that failed validation to paint them red.
 */
export function occupancyDebugGroup(
  occupancy: SpatialOccupancy,
  colliding: ReadonlySet<string> = new Set(),
): THREE.Group {
  const group = new THREE.Group();
  group.name = "spatial-debug";
  occupancy.regions.forEach((region, index) => {
    const failed = colliding.has(region.label ?? String(index));
    const material = new THREE.MeshBasicMaterial({
      color: failed ? COLLIDING : COLORS[region.kind],
      wireframe: true,
      transparent: true,
      opacity: failed ? 0.9 : 0.45,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(primitiveGeometry(region.primitive), material);
    mesh.name = `spatial-debug:${region.kind}:${region.label ?? index}`;
    placePrimitive(mesh, region.primitive);
    group.add(mesh);
  });
  return group;
}
