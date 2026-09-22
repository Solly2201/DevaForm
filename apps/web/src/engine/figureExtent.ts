/**
 * How big the statue standing on the stage actually is.
 *
 * The engine builds a figure; it does not decide how that figure is
 * photographed. But a camera cannot compose a picture of something whose
 * size it does not know, and the only honest source for the size is the
 * geometry that was built — not the skeleton's nominal height, which says
 * nothing about a crown, a trunk or a lotus base, and not an authored
 * number per deity, which is a promise the asset can quietly break.
 *
 * So this measures, and hands back plain metres. It carries no camera, no
 * stage and no composition: the presentation layer reads these numbers
 * and makes its own decisions (see presentation/heroFraming.ts).
 *
 * THE POSED FIGURE, skin and morphs included. A seated Ganesha is not as
 * tall as a standing one, and a hand closed by a morph is not where its
 * bones say it is — see deformedVertex for why bone transforms alone are
 * not enough.
 */
import * as THREE from "three";
import { deformedVertex } from "./skinning";
import type { CharacterRig } from "./rig";

export interface FigureExtent {
  /** World Y of the lowest point of the whole statue — where it stands. */
  footY: number;
  /** World Y of the highest — the finial of a crown, not the scalp. */
  topY: number;
  /**
   * World Y of the head joint, when the figure has one: the base of the
   * skull. What is above it is head and whatever is worn on it.
   */
  headY: number;
  /** Where the figure stands, horizontally. */
  centreX: number;
  centreZ: number;
  /** Greatest horizontal distance from that centre — the figure's reach. */
  radius: number;
}

/** Nothing measured yet. */
export function isMeasured(extent: FigureExtent | null): extent is FigureExtent {
  return extent !== null && extent.topY > extent.footY;
}

/**
 * Measure the statue, in world space.
 *
 * Skinned meshes are walked vertex by vertex, because that is the only
 * place a posed body's extent exists. Everything else — a crown, a
 * chakra, a lotus base, all of it rigid — is measured from its own
 * bounding box, which is exact for geometry that only ever moves as a
 * whole and costs eight points instead of eight thousand.
 */
export function measureFigure(rig: CharacterRig): FigureExtent | null {
  rig.root.updateWorldMatrix(true, true);

  let footY = Number.POSITIVE_INFINITY;
  let topY = Number.NEGATIVE_INFINITY;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let seen = false;

  const point = new THREE.Vector3();
  const box = new THREE.Box3();
  const take = (x: number, y: number, z: number) => {
    seen = true;
    if (y < footY) footY = y;
    if (y > topY) topY = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  };

  rig.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const position = mesh.geometry?.getAttribute("position");
    if (!position) return;
    mesh.updateWorldMatrix(true, false);

    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      for (let i = 0; i < position.count; i += 1) {
        deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
        take(point.x, point.y, point.z);
      }
      return;
    }

    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.copy(mesh.geometry.boundingBox as THREE.Box3).applyMatrix4(mesh.matrixWorld);
    take(box.min.x, box.min.y, box.min.z);
    take(box.max.x, box.max.y, box.max.z);
  });

  if (!seen) return null;

  const centreX = (minX + maxX) / 2;
  const centreZ = (minZ + maxZ) / 2;
  const head = rig.joints.get("head");
  const headY = head
    ? head.getWorldPosition(new THREE.Vector3()).y
    : footY + (topY - footY) * 0.82;

  return {
    footY,
    topY,
    headY,
    centreX,
    centreZ,
    radius: Math.max(maxX - centreX, maxZ - centreZ),
  };
}
