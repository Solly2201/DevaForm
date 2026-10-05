/**
 * How far inside the DRAWN body a point is — anywhere on the body.
 *
 * WHY THE EXISTING MEASUREMENTS COULD NOT ANSWER THIS. Everything that
 * measures a worn thing against a body in this engine measures it against
 * `BodyProfile`, and `BodyProfile` is a torso: `torsoBand` exists
 * precisely because `surfaceAt` keeps answering above the shoulders and
 * below the hips with a neck-sized cylinder, and its own notes record a
 * crown reported "seventy millimetres inside a body that is not there".
 * So the validators decline — correctly — to look at a crown, a hem, an
 * anklet, a hide over a thigh, or anything on an arm.
 *
 * Which leaves the one question a full turn round the statue asks: is any
 * of this inside the figure, ANYWHERE. A customer rotating to the rear
 * quarter is not looking at the torso band.
 *
 * WHAT IT MEASURES. The skinned, morphed triangles that are actually
 * rendered — via `deformedVertex`, because this engine closes a fist with
 * a morph and a bone-only reading of a fist is an open hand. No profile,
 * no proxy, no primitive: a bead is inside the arm when it is inside the
 * arm's triangles.
 *
 * WHAT IT IS NOT. Not a placement system and not a resolver. It reads a
 * result and reports a number, which is the boundary the occupancy
 * experiment settled on and this stays inside it.
 *
 * THE SIGN IS COUNTED, NOT INFERRED FROM A NORMAL. The obvious reading —
 * nearest triangle, then which side of its plane the point falls on —
 * was tried first and it is wrong on this body. It reported the
 * vaijayanti forty-eight millimetres INSIDE Vishnu's upper back at a
 * point six millimetres BEHIND the back's own bounding box, because a
 * face normal is only outward if the winding says so, and this figure's
 * extra arms are mirrored copies whose winding is reversed. A
 * measurement that trusts winding is measuring the exporter.
 *
 * So inside-ness is a parity count: fire a ray and see how many times it
 * leaves the solid. That is indifferent to winding, to mirroring, and to
 * which mesh a triangle came from, and it stays right for a body built
 * out of several closed pieces because each piece contributes an even
 * count to any point outside it. Three jittered rays vote, because a ray
 * that grazes a shared edge is counted twice by both its triangles.
 *
 * The one case it cannot see is a sealed interior cavity, and a human
 * mesh has none. Near the skin the vote can still flutter at the
 * half-millimetre, so callers get a DEPTH and should hold things to a
 * threshold rather than to zero.
 */
import * as THREE from "three";
import { deformedVertex } from "../skinning";

/** A posed body, flattened to world-space triangles with a lookup grid. */
export interface SkinField {
  /** Triangle corners, 9 floats each, world space. */
  readonly tris: Float32Array;
  readonly count: number;
  readonly bounds: THREE.Box3;
  readonly cell: number;
  /** Grid cell key -> triangle indices overlapping it. */
  readonly grid: Map<number, number[]>;
  /** (y,z) cell -> triangles a +x ray through that cell could meet. */
  readonly beams: Map<number, number[]>;
}

const KEY_SPAN = 1024;
const keyOf = (ix: number, iy: number, iz: number) =>
  (ix + 512) * KEY_SPAN * KEY_SPAN + (iy + 512) * KEY_SPAN + (iz + 512);
const beamOf = (iy: number, iz: number) => (iy + 512) * KEY_SPAN + (iz + 512);

/**
 * Flatten posed meshes into one triangle soup.
 *
 * `cell` is the grid pitch: queries only ever look at the cells a search
 * radius reaches, so it trades memory for the number of triangles each
 * question has to consider. Twenty millimetres suits a body a metre tall.
 */
export function skinFieldOf(meshes: readonly THREE.Mesh[], cell = 0.02): SkinField {
  const corners: number[] = [];
  const point = new THREE.Vector3();
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute("position");
    if (!position) continue;
    mesh.updateWorldMatrix(true, false);
    const index = mesh.geometry.getIndex();
    const total = index ? index.count : position.count;
    const world: THREE.Vector3[] = [];
    for (let i = 0; i < position.count; i += 1) {
      world.push(deformedVertex(mesh, i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
    }
    for (let t = 0; t + 2 < total; t += 3) {
      for (let c = 0; c < 3; c += 1) {
        const vertex = world[index ? index.getX(t + c) : t + c];
        if (!vertex) continue;
        corners.push(vertex.x, vertex.y, vertex.z);
      }
    }
    void point;
  }
  const tris = new Float32Array(corners);
  const count = Math.floor(tris.length / 9);
  const bounds = new THREE.Box3();
  const grid = new Map<number, number[]>();
  const beams = new Map<number, number[]>();
  const lo = new THREE.Vector3();
  const hi = new THREE.Vector3();
  for (let t = 0; t < count; t += 1) {
    const o = t * 9;
    lo.set(
      Math.min(tris[o]!, tris[o + 3]!, tris[o + 6]!),
      Math.min(tris[o + 1]!, tris[o + 4]!, tris[o + 7]!),
      Math.min(tris[o + 2]!, tris[o + 5]!, tris[o + 8]!),
    );
    hi.set(
      Math.max(tris[o]!, tris[o + 3]!, tris[o + 6]!),
      Math.max(tris[o + 1]!, tris[o + 4]!, tris[o + 7]!),
      Math.max(tris[o + 2]!, tris[o + 5]!, tris[o + 8]!),
    );
    bounds.expandByPoint(lo);
    bounds.expandByPoint(hi);
    for (let iy = Math.floor(lo.y / cell); iy <= Math.floor(hi.y / cell); iy += 1) {
      for (let iz = Math.floor(lo.z / cell); iz <= Math.floor(hi.z / cell); iz += 1) {
        const beam = beamOf(iy, iz);
        const along = beams.get(beam);
        if (along) along.push(t);
        else beams.set(beam, [t]);
        for (let ix = Math.floor(lo.x / cell); ix <= Math.floor(hi.x / cell); ix += 1) {
          const key = keyOf(ix, iy, iz);
          const bucket = grid.get(key);
          if (bucket) bucket.push(t);
          else grid.set(key, [t]);
        }
      }
    }
  }
  return { tris, count, bounds, cell, grid, beams };
}

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const near = new THREE.Vector3();
const edge1 = new THREE.Vector3();
const edge2 = new THREE.Vector3();
const normal = new THREE.Vector3();
const triangle = new THREE.Triangle();

/**
 * Signed depth of one world-space point: positive INSIDE the skin.
 *
 * `reach` bounds the search — a point further than that from any triangle
 * is outside by at least `reach` and the exact figure does not matter.
 */
export function skinDepthAt(field: SkinField, p: THREE.Vector3, reach = 0.08): number {
  const cells = Math.ceil(reach / field.cell);
  const cx = Math.floor(p.x / field.cell);
  const cy = Math.floor(p.y / field.cell);
  const cz = Math.floor(p.z / field.cell);
  let best = Infinity;
  let bestTri = -1;
  const seen = new Set<number>();
  // Grow the search ring by ring: the nearest triangle is usually in the
  // first one, and a body a metre tall has a lot of cells further out.
  for (let ring = 0; ring <= cells; ring += 1) {
    for (let ix = cx - ring; ix <= cx + ring; ix += 1) {
      for (let iy = cy - ring; iy <= cy + ring; iy += 1) {
        for (let iz = cz - ring; iz <= cz + ring; iz += 1) {
          const onShell =
            ring === 0 ||
            Math.abs(ix - cx) === ring ||
            Math.abs(iy - cy) === ring ||
            Math.abs(iz - cz) === ring;
          if (!onShell) continue;
          const bucket = field.grid.get(keyOf(ix, iy, iz));
          if (!bucket) continue;
          for (const t of bucket) {
            if (seen.has(t)) continue;
            seen.add(t);
            const o = t * 9;
            a.set(field.tris[o]!, field.tris[o + 1]!, field.tris[o + 2]!);
            b.set(field.tris[o + 3]!, field.tris[o + 4]!, field.tris[o + 5]!);
            c.set(field.tris[o + 6]!, field.tris[o + 7]!, field.tris[o + 8]!);
            triangle.set(a, b, c);
            triangle.closestPointToPoint(p, near);
            const distance = near.distanceTo(p);
            if (distance < best) {
              best = distance;
              bestTri = t;
            }
          }
        }
      }
    }
    // One ring past the first hit: a nearer triangle can only live within
    // `best` of the point, and that is at most one more cell out.
    if (bestTri >= 0 && ring * field.cell > best) break;
  }
  if (bestTri < 0) return -reach;
  return insideSkin(field, p) ? best : -best;
}

/** How many times a +x ray from `p` crosses the surface. */
function crossings(field: SkinField, y: number, z: number, px: number): number {
  const along = field.beams.get(beamOf(Math.floor(y / field.cell), Math.floor(z / field.cell)));
  if (!along) return 0;
  let hits = 0;
  for (const t of along) {
    const o = t * 9;
    a.set(field.tris[o]!, field.tris[o + 1]!, field.tris[o + 2]!);
    b.set(field.tris[o + 3]!, field.tris[o + 4]!, field.tris[o + 5]!);
    c.set(field.tris[o + 6]!, field.tris[o + 7]!, field.tris[o + 8]!);
    // Möller–Trumbore, specialised to the +x direction.
    edge1.subVectors(b, a);
    edge2.subVectors(c, a);
    // pvec = dir x edge2, with dir = (1,0,0)
    normal.set(0, -edge2.z, edge2.y);
    const det = edge1.dot(normal);
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    near.set(px - a.x, y - a.y, z - a.z);
    const u = near.dot(normal) * inv;
    if (u < 0 || u > 1) continue;
    // qvec = tvec x edge1
    const qx = near.y * edge1.z - near.z * edge1.y;
    const qy = near.z * edge1.x - near.x * edge1.z;
    const qz = near.x * edge1.y - near.y * edge1.x;
    const v = qx * inv;
    if (v < 0 || u + v > 1) continue;
    const distance = (edge2.x * qx + edge2.y * qy + edge2.z * qz) * inv;
    if (distance > 0) hits += 1;
  }
  return hits;
}

/**
 * Is this point within the solid the body's triangles enclose?
 *
 * Three rays, offset by a fraction of a millimetre from each other, and
 * the majority wins — a single ray that grazes the edge shared by two
 * triangles is counted by both and comes back with the wrong parity.
 */
export function insideSkin(field: SkinField, p: THREE.Vector3): boolean {
  let votes = 0;
  for (const [dy, dz] of JITTER) {
    if (crossings(field, p.y + dy, p.z + dz, p.x) % 2 === 1) votes += 1;
  }
  return votes >= 2;
}

const JITTER: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.00037, -0.00061],
  [-0.00053, 0.00043],
];
