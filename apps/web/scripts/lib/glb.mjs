/**
 * GLB container probing shared by the validator and the ingest tool.
 * Reads the JSON chunk only — no image decoding — so it works on textured
 * AI-generated GLBs that Node's three.js loader cannot fully parse.
 */

export function parseGlbJson(buffer) {
  if (buffer.length < 20) throw new Error("file too small to be a GLB");
  if (buffer.toString("ascii", 0, 4) !== "glTF") throw new Error("bad magic (not a GLB)");
  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`unsupported glTF version ${version}`);
  if (buffer.readUInt32LE(8) !== buffer.length) {
    throw new Error("declared length != file size");
  }
  const jsonChunkLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a) throw new Error("first chunk is not JSON");
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonChunkLength));
}

export function glbStats(json) {
  const accessors = json.accessors ?? [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  let vertices = 0;
  let boundsMissing = false;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const positionAccessor = accessors[primitive.attributes?.POSITION ?? -1];
      if (!positionAccessor?.min || !positionAccessor?.max) {
        boundsMissing = true;
        continue;
      }
      vertices += positionAccessor.count ?? 0;
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], positionAccessor.min[axis]);
        max[axis] = Math.max(max[axis], positionAccessor.max[axis]);
      }
      const indexAccessor = accessors[primitive.indices ?? -1];
      triangles += Math.floor((indexAccessor?.count ?? positionAccessor.count) / 3);
    }
  }
  // Texture payloads: image bufferView sizes (bytes), without decoding.
  const bufferViews = json.bufferViews ?? [];
  const textures = (json.images ?? []).map((image, index) => ({
    index,
    name: image.name ?? `image_${index}`,
    mimeType: image.mimeType ?? "unknown",
    bytes: image.bufferView !== undefined ? (bufferViews[image.bufferView]?.byteLength ?? 0) : 0,
    external: image.uri !== undefined,
  }));
  return {
    meshCount: (json.meshes ?? []).length,
    triangles,
    vertices,
    boundsMissing,
    bounds: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    size: Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]),
    materialNames: (json.materials ?? []).map((m) => m.name ?? ""),
    nodeNames: (json.nodes ?? []).map((n) => n.name ?? ""),
    textures,
  };
}

/**
 * Skin + morph-target contract checks. A skinned asset replaces the
 * JOINT_<id> group contract: its bones must name canonical joints, each
 * exactly once, and its morph targets must be named and consistent with
 * whatever the manifest declares.
 */
export function skinningProblems(json, entry, boneNameToJointId) {
  const problems = [];
  const nodes = json.nodes ?? [];

  for (const [index, skin] of (json.skins ?? []).entries()) {
    const claimed = new Map();
    for (const nodeIndex of skin.joints ?? []) {
      const boneName = nodes[nodeIndex]?.name;
      if (!boneName) {
        problems.push(`skin ${index}: joint node ${nodeIndex} has no name`);
        continue;
      }
      const jointId = boneNameToJointId(boneName);
      if (!jointId) {
        problems.push(
          `skin ${index}: bone "${boneName}" names no joint of skeleton "${entry.skeleton ?? "canonical"}"`,
        );
        continue;
      }
      if (claimed.has(jointId)) {
        problems.push(
          `skin ${index}: bones "${claimed.get(jointId)}" and "${boneName}" both map to ${jointId}`,
        );
        continue;
      }
      claimed.set(jointId, boneName);
    }
    if ((skin.joints ?? []).length === 0) problems.push(`skin ${index}: declares no joints`);
  }

  const declared = new Set(entry.morphTargets ?? []);
  const found = new Set();
  for (const [meshIndex, mesh] of (json.meshes ?? []).entries()) {
    const primitives = mesh.primitives ?? [];
    const skinnedPrimitive = primitives.some((p) => p.attributes?.JOINTS_0 !== undefined);
    const meshIsSkinned = nodes.some((n) => n.mesh === meshIndex && n.skin !== undefined);
    if (meshIsSkinned && !skinnedPrimitive) {
      problems.push(`mesh ${meshIndex}: skinned node but no JOINTS_0/WEIGHTS_0 attributes`);
    }
    const targetCounts = new Set(primitives.map((p) => (p.targets ?? []).length));
    if (targetCounts.size > 1) {
      problems.push(`mesh ${meshIndex}: primitives disagree on morph target count`);
    }
    const targetCount = primitives[0]?.targets?.length ?? 0;
    if (targetCount === 0) continue;
    const names = mesh.extras?.targetNames ?? [];
    if (names.length !== targetCount) {
      problems.push(
        `mesh ${meshIndex}: ${targetCount} morph targets but ${names.length} names in extras.targetNames`,
      );
    }
    for (const name of names) found.add(name);
  }

  for (const name of declared) {
    if (!found.has(name)) {
      problems.push(`manifest declares morph target "${name}" that the GLB does not expose`);
    }
  }
  return problems;
}
