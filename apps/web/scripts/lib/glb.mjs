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
