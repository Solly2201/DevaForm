/**
 * Geometry construction helpers for the procedural prototype assets.
 *
 * The visual quality of the placeholder Ganesha comes almost entirely from
 * three primitives:
 * - taperedTube: smooth varying-radius tube along a spline (trunk, tusks,
 *   fingers, limbs, drapes, stems)
 * - lathe: revolved 2D profiles (crowns, bases, bells, modak)
 * - pleatedCylinder: radially rippled cylinder (dhoti pleats)
 */
import * as THREE from "three";

export type V3 = readonly [number, number, number];

export function v3(...p: V3): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[1], p[2]);
}

export interface MeshTransform {
  position?: V3;
  rotation?: V3;
  scale?: V3 | number;
}

export function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  transform?: MeshTransform,
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  m.receiveShadow = true;
  if (transform?.position) m.position.set(...transform.position);
  if (transform?.rotation) m.rotation.set(...transform.rotation);
  if (transform?.scale !== undefined) {
    if (typeof transform.scale === "number") m.scale.setScalar(transform.scale);
    else m.scale.set(...transform.scale);
  }
  return m;
}

/**
 * Smooth tube of varying radius along a Catmull-Rom spline through `points`.
 * `radius` is either [startRadius, endRadius] (linear taper) or a function
 * of t in [0,1]. Ends are closed with fan caps.
 */
export function taperedTube(
  points: readonly V3[],
  radius: readonly [number, number] | ((t: number) => number),
  tubularSegments = 32,
  radialSegments = 14,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => v3(...p)),
    false,
    "catmullrom",
    0.5,
  );
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const radiusAt =
    typeof radius === "function"
      ? radius
      : (t: number) => radius[0] + (radius[1] - radius[0]) * t;

  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    const center = curve.getPoint(t);
    const normal = frames.normals[i] ?? new THREE.Vector3(1, 0, 0);
    const binormal = frames.binormals[i] ?? new THREE.Vector3(0, 0, 1);
    const r = Math.max(0.0005, radiusAt(t));
    for (let j = 0; j < radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI * 2;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      positions.push(
        center.x + r * (cos * normal.x + sin * binormal.x),
        center.y + r * (cos * normal.y + sin * binormal.y),
        center.z + r * (cos * normal.z + sin * binormal.z),
      );
    }
  }

  // Winding: outward-facing triangles (positive signed volume) so lighting
  // and back-face culling treat the tube as solid, opaque geometry.
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * radialSegments + j;
      const b = i * radialSegments + ((j + 1) % radialSegments);
      const c = (i + 1) * radialSegments + j;
      const d = (i + 1) * radialSegments + ((j + 1) % radialSegments);
      indices.push(a, b, c, b, d, c);
    }
  }

  // End caps (fan to center points).
  const startCenter = curve.getPoint(0);
  const endCenter = curve.getPoint(1);
  const startIndex = positions.length / 3;
  positions.push(startCenter.x, startCenter.y, startCenter.z);
  const endIndex = positions.length / 3;
  positions.push(endCenter.x, endCenter.y, endCenter.z);
  for (let j = 0; j < radialSegments; j++) {
    const a = j;
    const b = (j + 1) % radialSegments;
    indices.push(startIndex, a, b);
    const lastRing = tubularSegments * radialSegments;
    indices.push(endIndex, lastRing + b, lastRing + a);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Elliptical loft — ONE smooth surface swept vertically through elliptical
 * cross-sections. This is the sculptural primitive for coherent anatomy
 * (torsos, necks, skulls): silhouettes come from the section curve, not
 * from unions of visible spheres. Sections are Catmull-Rom-interpolated so
 * transitions (shoulder→waist→hip, cheek→jaw→chin) flow organically.
 *
 * Each section: local height y, half-widths rx (X) and rz (Z), optional
 * forward offset z. Ends are closed with fan caps.
 */
export interface LoftSection {
  y: number;
  rx: number;
  rz: number;
  z?: number;
}

export function loft(
  sections: readonly LoftSection[],
  radialSegments = 28,
  ringsPerSpan = 5,
): THREE.BufferGeometry {
  const spline = (pick: (s: LoftSection) => number) =>
    new THREE.CatmullRomCurve3(
      sections.map((s, i) => new THREE.Vector3(i, pick(s), 0)),
      false,
      "catmullrom",
      0.5,
    );
  const yC = spline((s) => s.y);
  const rxC = spline((s) => s.rx);
  const rzC = spline((s) => s.rz);
  const zC = spline((s) => s.z ?? 0);

  const rings = (sections.length - 1) * ringsPerSpan;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const y = yC.getPoint(t).y;
    const rx = Math.max(0.0005, rxC.getPoint(t).y);
    const rz = Math.max(0.0005, rzC.getPoint(t).y);
    const zOff = zC.getPoint(t).y;
    for (let j = 0; j < radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI * 2;
      positions.push(Math.cos(angle) * rx, y, Math.sin(angle) * rz + zOff);
    }
  }
  // Outward winding (positive signed volume), matching taperedTube.
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * radialSegments + j;
      const b = i * radialSegments + ((j + 1) % radialSegments);
      const c = (i + 1) * radialSegments + j;
      const d = (i + 1) * radialSegments + ((j + 1) % radialSegments);
      indices.push(a, c, b, b, c, d);
    }
  }
  // Caps
  const first = sections[0];
  const last = sections[sections.length - 1];
  const bottomIndex = positions.length / 3;
  positions.push(0, first?.y ?? 0, first?.z ?? 0);
  const topIndex = positions.length / 3;
  positions.push(0, last?.y ?? 0, last?.z ?? 0);
  const lastRing = rings * radialSegments;
  for (let j = 0; j < radialSegments; j++) {
    const next = (j + 1) % radialSegments;
    indices.push(bottomIndex, j, next);
    indices.push(topIndex, lastRing + next, lastRing + j);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Revolved profile. Points are [radiusX, y] pairs from bottom to top.
 */
export function lathe(
  profile: ReadonlyArray<readonly [number, number]>,
  segments = 40,
): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    profile.map(([x, y]) => new THREE.Vector2(Math.max(0.0001, x), y)),
    segments,
  );
}

/**
 * Cylinder with sinusoidal radial ripples — cloth pleats. Open-ended;
 * centered on origin like CylinderGeometry.
 */
export function pleatedCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  pleats = 14,
  amplitude = 0.006,
  radialSegments = 72,
  heightSegments = 8,
): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(
    radiusTop,
    radiusBottom,
    height,
    radialSegments,
    heightSegments,
    true,
  );
  const position = geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const angle = Math.atan2(vertex.z, vertex.x);
    // Pleats deepen toward the hem.
    const depthFactor = THREE.MathUtils.mapLinear(vertex.y, height / 2, -height / 2, 0.25, 1);
    const offset = Math.sin(angle * pleats) * amplitude * depthFactor;
    const radial = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
    const scale = (radial + offset) / radial;
    position.setX(i, vertex.x * scale);
    position.setZ(i, vertex.z * scale);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** Ring of N instances of a builder placed on a circle in the XZ plane. */
export function radialRing(
  count: number,
  radius: number,
  build: (index: number, angle: number) => THREE.Object3D,
  faceOutward = true,
): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const child = build(i, angle);
    child.position.x += Math.cos(angle) * radius;
    child.position.z += Math.sin(angle) * radius;
    if (faceOutward) child.rotation.y += -angle + Math.PI / 2;
    group.add(child);
  }
  return group;
}
