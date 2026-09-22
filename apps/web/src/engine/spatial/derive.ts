/**
 * EXPERIMENTAL — deriving spatial occupancy from geometry that exists.
 *
 * The manifests DECLARE (a grip radius, a clearance); the generators
 * CONSTRUCT (a walk along a measured surface). Neither ever measures the
 * finished mesh back. That gap has produced real defects: an asset once
 * declared a 6 mm grip radius so the fist would close photogenically,
 * and the render showed a hand closed on nothing beside a floating
 * wheel. A declaration nothing checks is a declaration something will
 * eventually game.
 *
 * So the occupancy of a built asset is MEASURED here, not authored:
 * derived representations cost zero manifest constants, cannot drift
 * from the geometry, and give validation something to hold the
 * declarations against.
 */
import * as THREE from "three";
import type { SpatialPrimitive } from "@devaform/asset-system";

/**
 * Sampled surface points of everything meshed under `object`, expressed
 * in `frame`'s local space (pass the rig root for statue space, or the
 * object itself for its own). Level-2 occupancy for forms no primitive
 * describes — a serpent's hood, a strand of beads.
 */
export function surfacePoints(
  object: THREE.Object3D,
  frame: THREE.Object3D,
  stride = 5,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const point = new THREE.Vector3();
  object.updateWorldMatrix(true, true);
  frame.updateWorldMatrix(true, false);
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute("position");
    if (!position) return;
    for (let i = 0; i < position.count; i += stride) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      points.push(frame.worldToLocal(point.clone()));
    }
  });
  return points;
}

export interface RadialBand {
  /** Furthest any vertex in the band stands from the axis. */
  maxRadius: number;
  /** Nearest any vertex in the band stands to the axis. */
  minRadius: number;
  /** How many vertices the band actually saw. */
  samples: number;
}

/**
 * Measure the geometry's radial extent about an axis, within an axial
 * window — the shape of the question "how thick IS this where the hand
 * closes?". The declared `grip.radius` is a promise about exactly this
 * band, and this is the measurement the promise can be held to.
 */
export function radialBand(
  points: readonly THREE.Vector3[],
  origin: THREE.Vector3,
  axis: THREE.Vector3,
  halfWindow: number,
): RadialBand {
  const unit = axis.clone().normalize();
  const offset = new THREE.Vector3();
  let maxRadius = 0;
  let minRadius = Number.POSITIVE_INFINITY;
  let samples = 0;
  for (const point of points) {
    offset.copy(point).sub(origin);
    const axial = offset.dot(unit);
    if (Math.abs(axial) > halfWindow) continue;
    const radial = offset.addScaledVector(unit, -axial).length();
    maxRadius = Math.max(maxRadius, radial);
    minRadius = Math.min(minRadius, radial);
    samples += 1;
  }
  return { maxRadius, minRadius: samples > 0 ? minRadius : 0, samples };
}

/**
 * Fit an annulus to a ring-like mesh: project every vertex onto the
 * given axis, and the hole is whatever the vertices never enter. No
 * authored constants — the ring's own triangles say where its material
 * and its void are, which is the property a hand-typed inner radius
 * cannot have (it can drift from the mesh; this cannot).
 *
 * The axis is a hint about which way the ring faces, not a measurement —
 * for generated bands it is the limb axis the generator aimed at; for a
 * delivered GLB it is the authoring convention (+Y through the hole, per
 * the asset spec).
 */
export function fitAnnulus(
  points: readonly THREE.Vector3[],
  axis: THREE.Vector3,
): Extract<SpatialPrimitive, { shape: "annulus" }> | null {
  if (points.length < 8) return null;
  const unit = axis.clone().normalize();
  const centroid = new THREE.Vector3();
  for (const point of points) centroid.add(point);
  centroid.multiplyScalar(1 / points.length);

  const offset = new THREE.Vector3();
  let innerRadius = Number.POSITIVE_INFINITY;
  let outerRadius = 0;
  let axialMin = Number.POSITIVE_INFINITY;
  let axialMax = Number.NEGATIVE_INFINITY;
  // The centroid estimates where the axis passes; recentre it axially so
  // halfHeight measures each way from the ring's own midplane.
  let meanAxial = 0;
  for (const point of points) meanAxial += point.clone().sub(centroid).dot(unit);
  meanAxial /= points.length;
  const center = centroid.clone().addScaledVector(unit, meanAxial);

  for (const point of points) {
    offset.copy(point).sub(center);
    const axial = offset.dot(unit);
    axialMin = Math.min(axialMin, axial);
    axialMax = Math.max(axialMax, axial);
    const radial = offset.addScaledVector(unit, -axial).length();
    innerRadius = Math.min(innerRadius, radial);
    outerRadius = Math.max(outerRadius, radial);
  }
  if (!(innerRadius > 0) || innerRadius >= outerRadius) return null;
  return {
    shape: "annulus",
    center: [center.x, center.y, center.z],
    axis: [unit.x, unit.y, unit.z],
    innerRadius,
    outerRadius,
    halfHeight: Math.max(Math.abs(axialMin), Math.abs(axialMax)),
  };
}

/** Level-0: the axis-aligned bounds of sampled points. */
export function boundsOf(points: readonly THREE.Vector3[]): THREE.Box3 {
  return new THREE.Box3().setFromPoints(points as THREE.Vector3[]);
}
