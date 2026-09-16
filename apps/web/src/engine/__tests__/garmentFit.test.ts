/**
 * A garment contains the body it is worn on.
 *
 * The human-observer question is "does this look worn, or wrapped around?"
 * — and the way that fails first is not subtle: a limb comes through the
 * cloth. It happened here, and from the front it was invisible. The back
 * view showed both calves standing outside a dhoti that looked perfectly
 * well fitted from every other angle.
 *
 * So it is measured rather than looked at. At a series of heights down the
 * legs, the cloth's own cross-section is read off the geometry that was
 * actually built and compared with the limb that has to be inside it. A
 * garment that cannot contain the leg fails here, on every pose the pose
 * system says the cloth is worn full.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(): void {
      /* never resolves in tests */
    }
  },
}));
import * as THREE from "three";
import {
  SHIVA_POSE_PRESETS,
  createDefaultShivaConfiguration,
  garmentFitOf,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { getAsset } from "@devaform/asset-system";
import { buildRig, poseRig } from "../rig";
import { ZoneMaterials } from "../materials";

const ASSET_ID = "humanoid.body.human";
const PUBLIC_DIR = join(__dirname, "..", "..", "..", "public");
const asset = getAsset(ASSET_ID);

interface GlbJson {
  nodes?: Array<{ name?: string }>;
  skins?: Array<{ joints: number[] }>;
  materials?: Array<{ name?: string }>;
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    count: number;
    componentType?: number;
    type?: string;
  }>;
  bufferViews?: Array<{ byteOffset?: number; byteLength: number }>;
  meshes?: Array<{
    primitives: Array<{ attributes: Record<string, number>; material?: number }>;
  }>;
}

const isEyeMaterial = (gltf: GlbJson, material: number): boolean =>
  (gltf.materials?.[material]?.name ?? "").startsWith("fixed:eye") ||
  gltf.materials?.[material]?.name === "fixed:iris";

/** Minimal GLB reader: the JSON chunk and the binary chunk of a glTF. */
function readGlb(path: string): { json: GlbJson; bin: Buffer } {
  const buffer = readFileSync(path);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength));
  const binStart = 20 + jsonLength;
  return { json, bin: buffer.subarray(binStart + 8, binStart + 8 + buffer.readUInt32LE(binStart)) };
}

function accessorBytes(
  glb: { json: GlbJson; bin: Buffer },
  accessorIndex: number,
  stride: number,
): { buffer: ArrayBuffer; count: number } {
  const accessor = glb.json.accessors![accessorIndex]!;
  const view = glb.json.bufferViews![accessor.bufferView!]!;
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return {
    buffer: glb.bin.buffer.slice(
      glb.bin.byteOffset + offset,
      glb.bin.byteOffset + offset + accessor.count * stride,
    ) as ArrayBuffer,
    count: accessor.count,
  };
}

/** Float32 VEC3 accessor as a flat array. */
function readVec3(glb: { json: GlbJson; bin: Buffer }, accessorIndex: number): Float32Array {
  return new Float32Array(accessorBytes(glb, accessorIndex, 12).buffer);
}

/** VEC4 joint indices, whatever width the exporter chose. */
function readJoints(glb: { json: GlbJson; bin: Buffer }, accessorIndex: number): Uint32Array {
  const accessor = glb.json.accessors![accessorIndex]!;
  // 5121 = unsigned byte, 5123 = unsigned short, 5125 = unsigned int.
  const width = accessor.componentType === 5121 ? 1 : accessor.componentType === 5123 ? 2 : 4;
  const { buffer, count } = accessorBytes(glb, accessorIndex, width * 4);
  const raw =
    width === 1
      ? new Uint8Array(buffer)
      : width === 2
        ? new Uint16Array(buffer)
        : new Uint32Array(buffer);
  return Uint32Array.from({ length: count * 4 }, (_unused, i) => raw[i] ?? 0);
}

/** VEC4 skin weights as floats. */
function readWeights(glb: { json: GlbJson; bin: Buffer }, accessorIndex: number): Float32Array {
  return new Float32Array(accessorBytes(glb, accessorIndex, 16).buffer);
}

/** The garment's half-extent in x and z at a height, from its own mesh. */
const BEARINGS = 24;

const binOf = (x: number, dz: number): number =>
  Math.min(
    BEARINGS - 1,
    Math.floor(((Math.atan2(x, dz) + Math.PI) / (Math.PI * 2)) * BEARINGS),
  );

/**
 * The cloth's outline at a height: how far it reaches on each of
 * twenty-four bearings about the figure's axis.
 *
 * Per bearing, not as a bounding box. A box is the union of everything at
 * that height, so a sash hanging down the front reports cloth "in front
 * of" a leg at the back, and a dhoti with an open back passes a test that
 * only asks for the extremes. The render does not average; it shows the
 * bearing you are standing on.
 *
 * `wrapped` counts the bearings that have any cloth at all. Below the hem
 * only the low-hanging sides remain, and a leg beside those is below the
 * garment rather than through it.
 */
interface Outline {
  samples: number;
  wrapped: number;
  centreZ: number;
  reach: number[];
}

function outlineOf(meshes: readonly THREE.Mesh[], y: number, band: number): Outline {
  const points: number[] = [];
  let minZ = Infinity;
  let maxZ = -Infinity;
  const p = new THREE.Vector3();
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i += 1) {
      p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      if (Math.abs(p.y - y) > band) continue;
      points.push(p.x, p.z);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
  }
  // Bearings are taken about the cloth's own centre, because the wrap sits
  // on the legs rather than on the pelvis joint.
  const centreZ = points.length > 0 ? (minZ + maxZ) / 2 : 0;
  const reach = new Array<number>(BEARINGS).fill(0);
  let wrapped = 0;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]!;
    const dz = points[i + 1]! - centreZ;
    const bin = binOf(x, dz);
    if (reach[bin] === 0) wrapped += 1;
    reach[bin] = Math.max(reach[bin]!, Math.hypot(x, dz));
  }
  return { samples: points.length / 2, wrapped, centreZ, reach };
}

/**
 * How low the cloth reaches on each bearing.
 *
 * The hem is not level — it is lifted at the sides, on purpose — so a leg
 * can be below the cloth on one bearing while the cloth still goes all
 * the way round at that height. Bare below the hem is the garment working
 * as designed; bare with cloth above AND below it is a hole.
 */
function hemOf(meshes: readonly THREE.Mesh[]): number[] {
  const hem = new Array<number>(BEARINGS).fill(Infinity);
  const p = new THREE.Vector3();
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i += 1) {
      p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const bin = binOf(p.x, p.z);
      hem[bin] = Math.min(hem[bin]!, p.y);
    }
  }
  return hem;
}

/** Is a point at this height within the cloth on its own bearing? */
function insideCloth(outline: Outline, x: number, z: number, slack: number): boolean {
  const dz = z - outline.centreZ;
  const reach = outline.reach[binOf(x, dz)] ?? 0;
  return reach > 0 && Math.hypot(x, dz) <= reach + slack;
}

/**
 * The garment's meshes, in the rig where they hang. Not clones: the
 * pieces ride joints, so a copy re-parented under a fresh group loses the
 * whole chain that put them on the body.
 */
function garmentOf(rig: ReturnType<typeof buildRig>): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  rig.root.traverse((node) => {
    if (!node.name.startsWith("part:shiva.garment")) return;
    node.updateWorldMatrix(true, true);
    node.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) meshes.push(mesh);
    });
  });
  expect(meshes.length, "the garment is in the scene").toBeGreaterThan(0);
  return meshes;
}

/**
 * Shiva in a pose, wearing whichever lower garment is being judged.
 *
 * The containment test below is about garments that CONTAIN — a dhoti is
 * a column of cloth round both legs, and a leg outside it is a defect
 * that is invisible from the front and unarguable from the side. That is
 * not true of every lower garment: a wrapped tiger skin is cut so the
 * legs come out of it, and asking whether it contains them is asking the
 * wrong question about the right object. So the test names the garment it
 * is judging instead of taking whatever the default happens to be.
 */
const shiva = (preset: string, lowerGarment = "shiva.garment.dhoti"): CharacterConfiguration => {
  const base = createDefaultShivaConfiguration();
  return {
    ...base,
    parts: { ...base.parts, lowerGarment: { assetId: lowerGarment, version: 2 } },
    pose: { preset, jointOverrides: {} },
  };
};

/**
 * The body's OWN leg vertices, read from the shipped GLB.
 *
 * The profile reports a mean limb radius about the joint axis, and a calf
 * is not a cylinder: it bulges backward by rather more than its mean. A
 * garment checked against the profile passed while both calves stood
 * outside the cloth in the render, which is the whole reason this file
 * exists. So the check is against the mesh that is actually shipped.
 *
 * Rest-pose vertices are used, which is exact for the poses under test:
 * every "full garment" pose leaves the legs within a few degrees of rest,
 * and the tolerance below covers that.
 */
function bodyLegVertices(hipY: number): Float32Array {
  const source = asset!.source;
  if (source.kind !== "glb") throw new Error("expected a GLB body");
  const glb = readGlb(join(PUBLIC_DIR, source.path.replace(/^\//, "")));
  const skinJoints = glb.json.skins?.[0]?.joints ?? [];
  // Which skin-joint indices are legs. By BONE, not by height: filtering
  // on height alone swept in the hanging fingers, which are level with a
  // thigh and seventeen centimetres out, and reported them as legs coming
  // through the cloth.
  const isLegBone = new Set<number>();
  skinJoints.forEach((node, index) => {
    const name = glb.json.nodes?.[node]?.name ?? "";
    if (/^leg[._]/.test(name)) isLegBone.add(index);
  });
  expect(isLegBone.size, "leg bones found in the skin").toBeGreaterThan(3);

  const kept: number[] = [];
  for (const mesh of glb.json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if (primitive.material !== undefined && isEyeMaterial(glb.json, primitive.material)) continue;
      const positions = readVec3(glb, primitive.attributes.POSITION!);
      const joints = readJoints(glb, primitive.attributes.JOINTS_0!);
      const weights = readWeights(glb, primitive.attributes.WEIGHTS_0!);
      for (let v = 0; v < positions.length / 3; v += 1) {
        let legShare = 0;
        for (let k = 0; k < 4; k += 1) {
          if (isLegBone.has(joints[v * 4 + k] ?? -1)) legShare += weights[v * 4 + k] ?? 0;
        }
        // Mostly a leg, and below the hip: the part a dhoti has to cover.
        if (legShare < 0.6) continue;
        const y = positions[v * 3 + 1]!;
        if (y > hipY - 0.02) continue;
        kept.push(positions[v * 3]!, y, positions[v * 3 + 2]!);
      }
    }
  }
  return Float32Array.from(kept);
}

/**
 * Every body vertex in a height band, whatever bone drives it.
 *
 * `bodyLegVertices` filters by leg BONE, which is right for "is a leg
 * outside the cloth" and useless for the hips: nothing round the pelvis
 * is driven by a leg, so the band came back empty and the measurement
 * judged nothing at all while reporting success.
 *
 * The ARMS are excluded, though. They hang at the sides and their hands
 * are level with the hips, fifteen centimetres out — read as body, they
 * say the hips are three hundred millimetres across and every scrap of
 * cloth is inside them.
 */
function bodyVerticesBetween(lo: number, hi: number): Float32Array {
  const source = asset!.source;
  if (source.kind !== "glb") throw new Error("expected a GLB body");
  const glb = readGlb(join(PUBLIC_DIR, source.path.replace(/^\//, "")));
  const skinJoints = glb.json.skins?.[0]?.joints ?? [];
  const isArmBone = new Set<number>();
  skinJoints.forEach((node, index) => {
    const name = glb.json.nodes?.[node]?.name ?? "";
    if (/^arm[._]/.test(name)) isArmBone.add(index);
  });
  expect(isArmBone.size, "arm bones found in the skin").toBeGreaterThan(3);

  const kept: number[] = [];
  for (const mesh of glb.json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if (primitive.material !== undefined && isEyeMaterial(glb.json, primitive.material)) continue;
      const positions = readVec3(glb, primitive.attributes.POSITION!);
      const joints = readJoints(glb, primitive.attributes.JOINTS_0!);
      const weights = readWeights(glb, primitive.attributes.WEIGHTS_0!);
      for (let v = 0; v < positions.length / 3; v += 1) {
        const y = positions[v * 3 + 1]!;
        if (y < lo || y > hi) continue;
        let arm = 0;
        for (let k = 0; k < 4; k += 1) {
          if (isArmBone.has(joints[v * 4 + k]!)) arm += weights[v * 4 + k]!;
        }
        if (arm > 0.35) continue;
        kept.push(positions[v * 3]!, y, positions[v * 3 + 2]!);
      }
    }
  }
  return Float32Array.from(kept);
}

describe("a garment that contains the legs, contains them", () => {
  const full = SHIVA_POSE_PRESETS.filter((preset) => garmentFitOf(preset) === "full");

  // There was a second test here, comparing the cloth against the body
  // profile's limb radii. It is gone: those radii are now the radius that
  // CONTAINS a limb about its own axis — which is what a band ornament
  // needs — and the garment is cut to the measured leg ENVELOPE, the
  // outer reach of both legs at a height. The two are different
  // descriptions of a leg and they disagree by a few millimetres over the
  // upper thigh, so the proxy was failing a garment the mesh itself says
  // is correct. What follows judges the cloth against the actual body.

  it.each(full.map((preset) => preset.id))(
    "%s: no part of the real leg mesh stands outside the cloth",
    (presetId) => {
      const config = shiva(presetId);
      const materials = new ZoneMaterials();
      const rig = buildRig(config, materials);
      poseRig(rig);
      rig.root.updateWorldMatrix(true, true);
      const garment = garmentOf(rig);
      const hipY = rig.joints
        .get("leg.left.thigh")!
        .getWorldPosition(new THREE.Vector3()).y;
      const legs = bodyLegVertices(hipY);

      const outlineAt = (y: number) => outlineOf(garment, y, 0.014);
      const hem = hemOf(garment);

      let outside = 0;
      let judged = 0;
      const where: string[] = [];
      // A few millimetres, because the pose moves the legs a little from
      // the rest positions these vertices were read at.
      const SLACK = 0.006;
      for (let i = 0; i < legs.length; i += 3) {
        const x = legs[i]!;
        const y = legs[i + 1]!;
        const z = legs[i + 2]!;
        const outline = outlineAt(y);
        // Only where the cloth actually goes round, and only above the
        // hem ON THIS BEARING: below it the leg is bare on purpose.
        if (outline.wrapped < BEARINGS - 2) continue;
        if (y < (hem[binOf(x, z - outline.centreZ)] ?? Infinity) + 0.004) continue;
        judged += 1;
        if (!insideCloth(outline, x, z, SLACK)) {
          outside += 1;
          if (where.length < 6) {
            const dz = z - outline.centreZ;
            where.push(
              `y=${y.toFixed(3)} bearing=${Math.round((Math.atan2(x, dz) * 180) / Math.PI)}° ` +
                `r=${Math.hypot(x, dz).toFixed(4)} cloth=${(outline.reach[binOf(x, dz)] ?? 0).toFixed(4)}`,
            );
          }
        }
      }
      expect(judged, `${presetId}: no leg vertices fell inside the garment's span`).toBeGreaterThan(
        200,
      );
      // Not a rate: a count. Ten vertices in a thousand is a patch of
      // bare calf the size of a thumbprint, and it is visible from the
      // side at any distance you would look at a statue from.
      expect(
        outside,
        `${presetId}: of ${judged} leg vertices judged — ${where.join("; ")}`,
      ).toBe(0);
      materials.dispose();
    },
  );
});


/**
 * A garment that is NOT a column still has one thing it must not do.
 *
 * Shiva's default is a tiger skin: wound round the hips, cut so the legs
 * come out of it, deliberately shallow on one side. Containment says
 * nothing about it. Clearance does — cloth is worn ON a body, and cloth
 * inside the body is skin coming through a hide, which is this file's
 * defect in the only form a wrap can have it.
 *
 * MEASURED ONLY WHERE THE BODY IS ONE VOLUME. Around the hips it is, and
 * a bearing-and-radius map of it means something. Below the thigh seat
 * there are two legs, and the same map says the body reaches to the outer
 * edge of each — so cloth hanging BETWEEN the legs, which is what a tail
 * does, reads as cloth inside a thigh. A metric that cannot tell those
 * apart is worse than none, because it fails for the wrong reason; this
 * one stops where it stops being true.
 */
describe("a wrapped garment stays outside the body", () => {
  const full = SHIVA_POSE_PRESETS.filter((preset) => garmentFitOf(preset) === "full");

  it.each(full.map((preset) => preset.id))("%s: no cloth inside the hips", (presetId) => {
    const config = shiva(presetId, "shiva.garment.vyaghracharma");
    const materials = new ZoneMaterials();
    const rig = buildRig(config, materials);
    poseRig(rig);
    rig.root.updateWorldMatrix(true, true);
    const garment = garmentOf(rig);
    const hipY = rig.joints.get("leg.left.thigh")!.getWorldPosition(new THREE.Vector3()).y;
    // The single-volume band: from the thigh seat up to the waist.
    const top = hipY + 0.09;
    const bottom = hipY - 0.01;

    const body = bodyVerticesBetween(bottom, top);
    const ROWS = 12;
    const rowOf = (y: number) =>
      Math.min(ROWS - 1, Math.max(0, Math.round(((top - y) / (top - bottom)) * (ROWS - 1))));
    const reach = new Float64Array(ROWS * BEARINGS);
    const centre = new Float64Array(ROWS);
    const seen = new Float64Array(ROWS);
    for (let i = 0; i < body.length; i += 3) {
      const y = body[i + 1]!;
      if (y > top || y < bottom) continue;
      const row = rowOf(y);
      centre[row] = (centre[row] ?? 0) + body[i + 2]!;
      seen[row] = (seen[row] ?? 0) + 1;
    }
    for (let row = 0; row < ROWS; row += 1) {
      centre[row] = (centre[row] ?? 0) / Math.max(1, seen[row] ?? 1);
    }
    for (let i = 0; i < body.length; i += 3) {
      const y = body[i + 1]!;
      if (y > top || y < bottom) continue;
      const row = rowOf(y);
      const dz = body[i + 2]! - centre[row]!;
      const at = row * BEARINGS + binOf(body[i]!, dz);
      reach[at] = Math.max(reach[at]!, Math.hypot(body[i]!, dz));
    }

    // Four millimetres of tolerance: the pose moves the body a little
    // from the rest positions it was read at, and cloth lying ON skin is
    // allowed to touch it.
    const TOLERANCE = 0.004;
    let inside = 0;
    let judged = 0;
    const where: string[] = [];
    const point = new THREE.Vector3();
    for (const mesh of garment) {
      const positions = mesh.geometry.getAttribute("position");
      for (let v = 0; v < positions.count; v += 1) {
        point.fromBufferAttribute(positions, v);
        mesh.localToWorld(point);
        if (point.y > top || point.y < bottom) continue;
        const row = rowOf(point.y);
        const dz = point.z - centre[row]!;
        const skin = reach[row * BEARINGS + binOf(point.x, dz)]!;
        if (skin <= 0) continue;
        judged += 1;
        const r = Math.hypot(point.x, dz);
        if (r < skin - TOLERANCE) {
          inside += 1;
          if (where.length < 5) {
            where.push(
              `y=${point.y.toFixed(3)} bearing=${Math.round((Math.atan2(point.x, dz) * 180) / Math.PI)}° ` +
                `cloth=${r.toFixed(4)} skin=${skin.toFixed(4)}`,
            );
          }
        }
      }
    }
    expect(judged, `${presetId}: cloth vertices were judged`).toBeGreaterThan(200);
    expect(
      inside,
      `${presetId}: ${inside} of ${judged} cloth vertices inside the hips — ${where.join("; ")}`,
    ).toBe(0);
    materials.dispose();
  });
});
