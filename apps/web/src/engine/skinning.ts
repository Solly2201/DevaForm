/**
 * Skinned-mesh and morph-target support — generic engine capability.
 *
 * DevaForm's procedural assets are rigid parts mounted on joints. A
 * production-style body is instead ONE continuous skinned mesh that bends
 * at the joints, plus named morph targets for morphology. This module is
 * the whole of that capability, and it is deity-agnostic by construction:
 * it knows about joints, bones, morph names and meshes — never about a
 * particular deity, asset id or authoring tool.
 *
 * Contract (see docs/asset-specification.md):
 * - a skinned GLB's bones are named after canonical joint ids
 * - the mesh is authored against the canonical REST skeleton, in character
 *   space (the space the joints live in)
 * - morph target names are declared in the asset manifest's morphTargets
 *
 * Binding strategy: the GLB's own bones are discarded and the mesh is
 * re-bound to THIS rig's joint objects, with bind-time inverse matrices
 * taken from those joints. The existing pose system therefore drives GPU
 * skinning with no per-frame synchronization: posing rotates the joints,
 * the renderer refreshes the skeleton, the GPU deforms the mesh.
 */
import * as THREE from "three";
import { isJointId, isSocketId, type JointId, type SocketId } from "@devaform/character-schema";

/**
 * glTF node names are sanitized on load (three's PropertyBinding strips
 * "." among other reserved characters), so a bone cannot literally be
 * named `arm.frontLeft.upper`. Skinned assets therefore write joint ids
 * with "_" in place of "." — `arm_frontLeft_upper` — and both spellings
 * resolve here. Joint ids contain no underscores, so the mapping is
 * unambiguous.
 */
export function boneNameToJointId(boneName: string): JointId | null {
  if (isJointId(boneName)) return boneName;
  const dotted = boneName.replace(/_/g, ".");
  return isJointId(dotted) ? dotted : null;
}

/** Same sanitization tolerance for `SOCKET_<id>` empties inside a GLB. */
export function socketNameToSocketId(socketName: string): SocketId | null {
  if (isSocketId(socketName)) return socketName;
  const dotted = socketName.replace(/_/g, ".");
  return isSocketId(dotted) ? dotted : null;
}

export function collectSkinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(object as THREE.SkinnedMesh);
  });
  return meshes;
}

/** Rest-pose drift beyond this is reported: the mesh would deform wrongly. */
const REST_TOLERANCE_M = 0.005;

/**
 * Re-bind a skinned mesh onto this rig's joints.
 *
 * `characterRoot` must already contain both the mesh and the joints, with
 * the joints at REST (bind time). Returns false — with a warning — when
 * the asset violates the bone-naming contract; the caller then leaves the
 * mesh undeformed rather than guessing a mapping.
 */
export function bindSkinnedMeshToJoints(
  mesh: THREE.SkinnedMesh,
  joints: ReadonlyMap<JointId, THREE.Object3D>,
  characterRoot: THREE.Object3D,
  warnings: string[],
  label: string,
): boolean {
  const sourceBones = mesh.skeleton?.bones ?? [];
  if (sourceBones.length === 0) {
    warnings.push(`${label}: skinned mesh "${mesh.name}" has no bones`);
    return false;
  }

  // Asset-space rest positions, read before the source bones are dropped.
  const sourceRoot = sourceBones[0]?.parent ?? sourceBones[0];
  sourceRoot?.updateWorldMatrix(true, true);
  const sourceRest = sourceBones.map((bone) => bone.getWorldPosition(new THREE.Vector3()));

  characterRoot.updateMatrixWorld(true);

  const bones: THREE.Object3D[] = [];
  const claimed = new Set<JointId>();
  const restPoint = new THREE.Vector3();
  for (const [index, bone] of sourceBones.entries()) {
    const jointId = boneNameToJointId(bone.name);
    if (!jointId) {
      warnings.push(`${label}: bone "${bone.name}" does not name a known joint`);
      return false;
    }
    const joint = joints.get(jointId);
    if (!joint) {
      warnings.push(
        `${label}: bone "${bone.name}" needs joint ${jointId}, which this skeleton does not have`,
      );
      return false;
    }
    if (claimed.has(jointId)) {
      warnings.push(`${label}: two bones map to joint ${jointId}`);
      return false;
    }
    claimed.add(jointId);

    // The mesh must have been authored against the canonical rest pose,
    // in character space — otherwise skinning distorts it silently.
    const authored = sourceRest[index];
    if (authored) {
      characterRoot.worldToLocal(joint.getWorldPosition(restPoint));
      const drift = restPoint.distanceTo(authored);
      if (drift > REST_TOLERANCE_M) {
        warnings.push(
          `${label}: bone "${bone.name}" rests ${(drift * 1000).toFixed(0)} mm from joint ${jointId}`,
        );
      }
    }
    bones.push(joint);
  }

  // Joints are plain Object3Ds; Skeleton only reads bone.matrixWorld, so
  // the rig's joint hierarchy serves directly as the skeleton.
  const skeleton = new THREE.Skeleton(bones as THREE.Bone[]);
  // bind() without an explicit bind matrix recomputes the inverse bind
  // matrices from the joints' CURRENT (rest) world matrices, so the mesh
  // is undeformed at rest whatever the asset's own inverses were.
  mesh.bind(skeleton);
  // A deformed mesh outruns its bind-pose bounds; culling by them would
  // pop the body out of view in strong poses.
  mesh.frustumCulled = false;
  return true;
}

/**
 * Drive morph targets from a configuration's morph weights.
 *
 * Named weights meet asset-declared morph targets: a mesh applies the
 * weights it exposes and ignores the rest, and a target with no weight
 * returns to neutral. Weights naming targets no mesh exposes are simply
 * unused — the forward-compatible semantics the schema already promises.
 * This is a GPU attribute update: no geometry is rebuilt.
 */
export function applyMorphInfluences(
  root: THREE.Object3D,
  morphs: Readonly<Record<string, number>>,
): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const dictionary = mesh.morphTargetDictionary;
    const influences = mesh.morphTargetInfluences;
    if (!dictionary || !influences) return;
    for (const [name, index] of Object.entries(dictionary)) {
      const weight = morphs[name];
      influences[index] = typeof weight === "number" ? weight : 0;
    }
  });
}

/**
 * World-space snapshot of a mesh as it is currently deformed — skinning
 * and morph influences resolved into plain vertex positions.
 */
export function bakeMeshGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  const source = mesh.geometry;
  const deforms =
    (mesh as THREE.SkinnedMesh).isSkinnedMesh ||
    ((mesh.morphTargetInfluences?.length ?? 0) > 0 &&
      source.morphAttributes.position !== undefined);

  if (!deforms) {
    const baked = source.clone();
    baked.applyMatrix4(mesh.matrixWorld);
    return baked;
  }

  const position = source.getAttribute("position");
  const vertex = new THREE.Vector3();
  const baked = new THREE.BufferGeometry();
  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
    positions[i * 3] = vertex.x;
    positions[i * 3 + 1] = vertex.y;
    positions[i * 3 + 2] = vertex.z;
  }
  baked.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const index = source.getIndex();
  if (index) baked.setIndex(index.clone());
  baked.computeVertexNormals();
  return baked;
}

const BAKE_MATERIAL = new THREE.MeshBasicMaterial();

/**
 * Flatten a rendered hierarchy into static world-space meshes — what the
 * viewer currently shows, ready for exporters that read geometry rather
 * than GPU state. Callers must dispose() when finished.
 */
export function bakeSceneForExport(root: THREE.Object3D): {
  group: THREE.Group;
  dispose: () => void;
} {
  root.updateWorldMatrix(true, true);
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const geometry = bakeMeshGeometry(mesh);
    geometries.push(geometry);
    const baked = new THREE.Mesh(geometry, BAKE_MATERIAL);
    baked.name = mesh.name;
    group.add(baked);
  });
  group.updateMatrixWorld(true);
  return {
    group,
    dispose: () => {
      for (const geometry of geometries) geometry.dispose();
    },
  };
}
