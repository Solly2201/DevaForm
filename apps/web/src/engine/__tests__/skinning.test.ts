/**
 * Stage-0 engine spike regressions: skinned meshes and morph targets.
 *
 * These cover the generic capability only — a synthetic skinned mesh built
 * to the published contract (bones named after canonical joint ids, two
 * morph targets). No deity, asset id or authoring tool appears in the
 * engine paths under test.
 */
import { describe, expect, it, vi } from "vitest";

const skinnedScene = vi.hoisted(() => ({ current: null as unknown }));

// GLTFLoader cannot fetch in Node. Tests that exercise the rig's GLB path
// hand it a synthetic scene; the rest keep the "never resolves" behavior
// the existing suites rely on.
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(_path: string, onLoad: (gltf: { scene: unknown }) => void): void {
      if (skinnedScene.current) onLoad({ scene: skinnedScene.current });
    }
  },
}));

import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  HUMANOID_SKELETON,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  type JointId,
} from "@devaform/character-schema";
import { buildJointHierarchy, buildRig } from "../rig";
import { applyPose } from "../pose";
import { analyzeRigForPrint, exportRigStl } from "../printExport";
import { ZoneMaterials } from "../materials";
import {
  applyMorphInfluences,
  bakeSceneForExport,
  bindSkinnedMeshToJoints,
  boneNameToJointId,
  collectSkinnedMeshes,
} from "../skinning";

const UPPER = new THREE.Vector3(0.175, 0.89, 0.045);
const FOREARM = UPPER.clone().add(new THREE.Vector3(0.02, -0.16, 0));
const HAND = FOREARM.clone().add(new THREE.Vector3(0, -0.14, 0));

/**
 * Minimal fixture mirroring scripts/generate-spike-skinned.mjs: a four-ring
 * tube down the front-left arm chain, weighted across three bones, with two
 * morph targets ("grow" swells every ring, "stretch" pushes the tip down).
 */
function makeSkinnedFixture(): { root: THREE.Group; mesh: THREE.SkinnedMesh } {
  const rings = [
    { point: UPPER, bones: [0, 1], weights: [1, 0] },
    { point: UPPER.clone().lerp(FOREARM, 0.5), bones: [0, 1], weights: [0.5, 0.5] },
    { point: FOREARM, bones: [1, 2], weights: [1, 0] },
    { point: HAND, bones: [1, 2], weights: [0, 1] },
  ];
  const segments = 6;
  const positions: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const grow: number[] = [];
  const stretch: number[] = [];
  const indices: number[] = [];

  rings.forEach((ring, r) => {
    for (let s = 0; s < segments; s += 1) {
      const angle = (s / segments) * Math.PI * 2;
      const radial = new THREE.Vector3(Math.cos(angle) * 0.04, 0, Math.sin(angle) * 0.04);
      const point = ring.point.clone().add(radial);
      positions.push(point.x, point.y, point.z);
      skinIndices.push(ring.bones[0]!, ring.bones[1]!, 0, 0);
      skinWeights.push(ring.weights[0]!, ring.weights[1]!, 0, 0);
      grow.push(radial.x * 0.5, 0, radial.z * 0.5);
      stretch.push(0, r === rings.length - 1 ? -0.1 : 0, 0);
    }
  });
  for (let r = 0; r < rings.length - 1; r += 1) {
    for (let s = 0; s < segments; s += 1) {
      const next = (s + 1) % segments;
      const a = r * segments + s;
      const b = r * segments + next;
      const c = (r + 1) * segments + s;
      const d = (r + 1) * segments + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices);
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [
    new THREE.Float32BufferAttribute(grow, 3),
    new THREE.Float32BufferAttribute(stretch, 3),
  ];

  const root = new THREE.Group();
  const upper = new THREE.Bone();
  upper.name = "arm_frontLeft_upper";
  upper.position.copy(UPPER);
  const forearm = new THREE.Bone();
  forearm.name = "arm_frontLeft_forearm";
  forearm.position.set(0.02, -0.16, 0);
  const hand = new THREE.Bone();
  hand.name = "arm_frontLeft_hand";
  hand.position.set(0, -0.14, 0);
  upper.add(forearm);
  forearm.add(hand);
  root.add(upper);

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = "fixtureLimb";
  mesh.morphTargetDictionary = { grow: 0, stretch: 1 };
  mesh.morphTargetInfluences = [0, 0];
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([upper, forearm, hand]));
  return { root, mesh };
}

/** Mount a fresh copy of the fixture on a fresh humanoid joint hierarchy. */
function mountFixture(): {
  characterRoot: THREE.Group;
  joints: Map<JointId, THREE.Object3D>;
  mesh: THREE.SkinnedMesh;
  warnings: string[];
  bound: boolean;
} {
  const { root: source } = makeSkinnedFixture();
  const { characterRoot, joints } = buildJointHierarchy(HUMANOID_SKELETON);
  const instance = cloneSkinned(source);
  const mesh = collectSkinnedMeshes(instance)[0]!;
  characterRoot.add(mesh);
  mesh.position.set(0, 0, 0);
  const warnings: string[] = [];
  const bound = bindSkinnedMeshToJoints(mesh, joints, characterRoot, warnings, "fixture");
  return { characterRoot, joints, mesh, warnings, bound };
}

/**
 * Deformed world position of one vertex. Outside the render loop nothing
 * refreshes the scene graph, so the whole hierarchy (mesh AND the joints
 * acting as bones) is updated first — the renderer does this per frame.
 */
function vertexWorld(mesh: THREE.SkinnedMesh, index: number): THREE.Vector3 {
  let top: THREE.Object3D = mesh;
  while (top.parent) top = top.parent;
  top.updateMatrixWorld(true);
  return mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
}

const TIP_VERTEX = 18; // first vertex of the distal ring
const ROOT_VERTEX = 0; // first vertex of the proximal ring

describe("bone name → joint id", () => {
  it("accepts canonical ids and the underscore spelling glTF preserves", () => {
    expect(boneNameToJointId("chest")).toBe("chest");
    expect(boneNameToJointId("arm_frontLeft_upper")).toBe("arm.frontLeft.upper");
    expect(boneNameToJointId("leg_left_shin")).toBe("leg.left.shin");
  });

  it("refuses names that are not joints rather than guessing", () => {
    expect(boneNameToJointId("mixamorig:Spine")).toBeNull();
    expect(boneNameToJointId("Bone.001")).toBeNull();
    expect(boneNameToJointId("")).toBeNull();
  });
});

describe("binding a skinned mesh to rig joints", () => {
  it("binds every bone and leaves the mesh undeformed at rest", () => {
    const { mesh, warnings, bound } = mountFixture();
    expect(bound).toBe(true);
    expect(warnings).toEqual([]);
    expect(mesh.skeleton.bones).toHaveLength(3);
    expect(mesh.skeleton.bones.map((b) => b.name)).toEqual([
      "joint:arm.frontLeft.upper",
      "joint:arm.frontLeft.forearm",
      "joint:arm.frontLeft.hand",
    ]);
    // Rest pose: skinning is the identity, so vertices stay where authored.
    const authored = new THREE.Vector3().fromBufferAttribute(
      mesh.geometry.getAttribute("position"),
      TIP_VERTEX,
    );
    expect(vertexWorld(mesh, TIP_VERTEX).distanceTo(authored)).toBeLessThan(1e-6);
  });

  it("rejects a bone that names no joint instead of silently dropping it", () => {
    const { root: source } = makeSkinnedFixture();
    const { characterRoot, joints } = buildJointHierarchy(HUMANOID_SKELETON);
    const instance = cloneSkinned(source);
    const mesh = collectSkinnedMeshes(instance)[0]!;
    mesh.skeleton.bones[1]!.name = "mixamorig:LeftForeArm";
    characterRoot.add(mesh);
    const warnings: string[] = [];
    expect(bindSkinnedMeshToJoints(mesh, joints, characterRoot, warnings, "fixture")).toBe(false);
    expect(warnings[0]).toContain("does not name a known joint");
  });

  it("rejects two bones claiming the same joint", () => {
    const { root: source } = makeSkinnedFixture();
    const { characterRoot, joints } = buildJointHierarchy(HUMANOID_SKELETON);
    const instance = cloneSkinned(source);
    const mesh = collectSkinnedMeshes(instance)[0]!;
    mesh.skeleton.bones[1]!.name = "arm_frontLeft_upper";
    characterRoot.add(mesh);
    const warnings: string[] = [];
    expect(bindSkinnedMeshToJoints(mesh, joints, characterRoot, warnings, "fixture")).toBe(false);
    expect(warnings.join(" ")).toContain("two bones map to joint");
  });

  it("reports a mesh authored against a different rest pose", () => {
    const { root: source } = makeSkinnedFixture();
    const { characterRoot, joints } = buildJointHierarchy(HUMANOID_SKELETON);
    const instance = cloneSkinned(source);
    const mesh = collectSkinnedMeshes(instance)[0]!;
    mesh.skeleton.bones[0]!.position.x += 0.05;
    instance.updateMatrixWorld(true);
    characterRoot.add(mesh);
    const warnings: string[] = [];
    bindSkinnedMeshToJoints(mesh, joints, characterRoot, warnings, "fixture");
    expect(warnings.join(" ")).toMatch(/rests \d+ mm from joint/);
  });
});

describe("pose drives skinning", () => {
  it("bends distal vertices while the proximal end stays put", () => {
    const { joints, mesh } = mountFixture();
    const restTip = vertexWorld(mesh, TIP_VERTEX);
    const restRoot = vertexWorld(mesh, ROOT_VERTEX);

    applyPose(joints, {
      preset: null,
      jointOverrides: { "arm.frontLeft.forearm": [-1.4, 0, 0] },
    });

    const posedTip = vertexWorld(mesh, TIP_VERTEX);
    const posedRoot = vertexWorld(mesh, ROOT_VERTEX);
    expect(posedTip.distanceTo(restTip)).toBeGreaterThan(0.05);
    expect(posedRoot.distanceTo(restRoot)).toBeLessThan(1e-6);
    // Bending the elbow forward swings the forearm out of the rest line.
    expect(posedTip.z).toBeGreaterThan(restTip.z + 0.05);
  });
});

describe("morph targets from configuration weights", () => {
  it("applies a single named weight", () => {
    const { characterRoot, mesh } = mountFixture();
    const rest = vertexWorld(mesh, ROOT_VERTEX);
    applyMorphInfluences(characterRoot, { grow: 1 });
    expect(mesh.morphTargetInfluences).toEqual([1, 0]);
    expect(vertexWorld(mesh, ROOT_VERTEX).distanceTo(rest)).toBeGreaterThan(0.01);
  });

  it("combines two morph targets simultaneously", () => {
    const { characterRoot, mesh } = mountFixture();
    const restTip = vertexWorld(mesh, TIP_VERTEX);
    applyMorphInfluences(characterRoot, { grow: 1 });
    const grown = vertexWorld(mesh, TIP_VERTEX);
    applyMorphInfluences(characterRoot, { grow: 1, stretch: 1 });
    const both = vertexWorld(mesh, TIP_VERTEX);
    expect(mesh.morphTargetInfluences).toEqual([1, 1]);
    // The second target adds its own displacement on top of the first.
    expect(both.y).toBeLessThan(grown.y - 0.05);
    expect(both.distanceTo(restTip)).toBeGreaterThan(grown.distanceTo(restTip));
  });

  it("ignores weights the mesh does not expose and neutralizes the rest", () => {
    const { characterRoot, mesh } = mountFixture();
    applyMorphInfluences(characterRoot, { grow: 1 });
    applyMorphInfluences(characterRoot, { trunkLength: 1, eyeSize: -1 });
    expect(mesh.morphTargetInfluences).toEqual([0, 0]);
  });

  it("combines morphs with pose", () => {
    const { characterRoot, joints, mesh } = mountFixture();
    const rest = vertexWorld(mesh, TIP_VERTEX);
    applyMorphInfluences(characterRoot, { grow: 1, stretch: 1 });
    const morphed = vertexWorld(mesh, TIP_VERTEX);
    applyPose(joints, {
      preset: null,
      jointOverrides: { "arm.frontLeft.forearm": [-1.4, 0, 0] },
    });
    const posed = vertexWorld(mesh, TIP_VERTEX);
    expect(morphed.distanceTo(rest)).toBeGreaterThan(0.01);
    expect(posed.distanceTo(morphed)).toBeGreaterThan(0.05);
  });
});

describe("instance isolation", () => {
  it("keeps pose and morph state independent between two instances", () => {
    const first = mountFixture();
    const second = mountFixture();
    expect(first.mesh.skeleton).not.toBe(second.mesh.skeleton);

    const secondRestTip = vertexWorld(second.mesh, TIP_VERTEX);
    applyMorphInfluences(first.characterRoot, { grow: 1, stretch: 1 });
    applyPose(first.joints, {
      preset: null,
      jointOverrides: { "arm.frontLeft.forearm": [-1.4, 0, 0] },
    });

    expect(second.mesh.morphTargetInfluences).toEqual([0, 0]);
    expect(vertexWorld(second.mesh, TIP_VERTEX).distanceTo(secondRestTip)).toBeLessThan(1e-6);
    expect(vertexWorld(first.mesh, TIP_VERTEX).distanceTo(secondRestTip)).toBeGreaterThan(0.05);
  });
});

describe("export bakes the deformed state", () => {
  it("bakes posed and morphed vertices, not the bind pose", () => {
    const { characterRoot, joints, mesh } = mountFixture();
    const bindBox = new THREE.Box3().setFromObject(bakeSceneForExport(characterRoot).group);

    applyMorphInfluences(characterRoot, { grow: 1, stretch: 1 });
    applyPose(joints, {
      preset: null,
      jointOverrides: { "arm.frontLeft.forearm": [-1.4, 0, 0] },
    });
    const { group, dispose } = bakeSceneForExport(characterRoot);
    const posedBox = new THREE.Box3().setFromObject(group);

    // The baked geometry matches what the viewer shows, vertex for vertex.
    const baked = (group.children[0] as THREE.Mesh).geometry.getAttribute("position");
    const bakedTip = new THREE.Vector3().fromBufferAttribute(baked, TIP_VERTEX);
    expect(bakedTip.distanceTo(vertexWorld(mesh, TIP_VERTEX))).toBeLessThan(1e-6);
    expect(posedBox.max.z).toBeGreaterThan(bindBox.max.z + 0.05);
    dispose();
  });

  it("exportRigStl writes the posed state", () => {
    const { characterRoot, joints, mesh } = mountFixture();
    const root = new THREE.Group();
    root.add(characterRoot);
    const rig = {
      root,
      skeleton: HUMANOID_SKELETON,
      joints,
      sockets: new Map(),
      worldAlignedAttachments: [],
      warnings: [],
    } as unknown as Parameters<typeof exportRigStl>[0];

    const restStl = exportRigStl(rig);
    applyPose(joints, {
      preset: null,
      jointOverrides: { "arm.frontLeft.forearm": [-1.4, 0, 0] },
    });
    const posedStl = exportRigStl(rig);

    expect(restStl.size).toBe(posedStl.size); // same triangle count…
    expect(mesh.geometry.getIndex()!.count / 3).toBeGreaterThan(0);
    return Promise.all([restStl.arrayBuffer(), posedStl.arrayBuffer()]).then(([rest, posed]) => {
      // …different vertex data: the bake followed the pose.
      expect(Buffer.compare(Buffer.from(rest), Buffer.from(posed))).not.toBe(0);
    });
  });
});

describe("procedural export is unchanged by the bake", () => {
  it("exports every Ganesha triangle, in world space", async () => {
    const config = createDefaultGaneshaConfiguration();
    config.parts.head = { assetId: "ganesha.head.classic", version: 3 };
    config.attachments = config.attachments.filter((a) => a.socket !== "base.platform");
    const rig = buildRig(config, new ZoneMaterials());
    const analysis = analyzeRigForPrint(rig, 230);

    const buffer = await exportRigStl(rig).arrayBuffer();
    // Binary STL: triangle count is a uint32 at byte 80.
    const declared = new DataView(buffer).getUint32(80, true);
    expect(declared).toBe(analysis.triangles);
    expect(buffer.byteLength).toBe(84 + declared * 50);

    // World-space bounds survive the bake (the statue is not at the origin).
    const box = new THREE.Box3().setFromObject(rig.root);
    const { group, dispose } = bakeSceneForExport(rig.root);
    const bakedBox = new THREE.Box3().setFromObject(group);
    expect(bakedBox.min.distanceTo(box.min)).toBeLessThan(1e-6);
    expect(bakedBox.max.distanceTo(box.max)).toBeLessThan(1e-6);
    dispose();
  });
});

describe("rig integration", () => {
  it("mounts and binds a skinned GLB part through buildRig", () => {
    const { root: source } = makeSkinnedFixture();
    skinnedScene.current = source;
    try {
      const config = createDefaultShivaConfiguration();
      // Any GLB-sourced part exercises the loader path; the mocked loader
      // supplies the synthetic skinned scene for it.
      config.parts.head = { assetId: "ganesha.head.aidraft", version: 2 };
      // The GLB cache answers "loading" on first request and rebuilds when
      // the asset arrives (see glbCache); the first build primes it.
      buildRig(config, new ZoneMaterials());
      const rig = buildRig(config, new ZoneMaterials());

      const skinned = collectSkinnedMeshes(rig.root);
      expect(skinned).toHaveLength(1);
      expect(rig.warnings).toEqual([]);
      expect(skinned[0]!.skeleton.bones[0]).toBe(rig.joints.get("arm.frontLeft.upper"));
      // Bound to the rig's own joints — posing the rig deforms the mesh.
      const rest = vertexWorld(skinned[0]!, TIP_VERTEX);
      applyPose(rig.joints, {
        preset: null,
        jointOverrides: { "arm.frontLeft.forearm": [-1.4, 0, 0] },
      });
      expect(vertexWorld(skinned[0]!, TIP_VERTEX).distanceTo(rest)).toBeGreaterThan(0.05);
    } finally {
      skinnedScene.current = null;
    }
  });

  it("leaves procedural deities untouched: no skinned meshes, no warnings", () => {
    const ganesha = createDefaultGaneshaConfiguration();
    ganesha.parts.head = { assetId: "ganesha.head.classic", version: 3 };
    ganesha.attachments = ganesha.attachments.filter((a) => a.socket !== "base.platform");
    const ganeshaRig = buildRig(ganesha, new ZoneMaterials());
    expect(ganeshaRig.warnings).toEqual([]);
    expect(collectSkinnedMeshes(ganeshaRig.root)).toHaveLength(0);

    const shivaRig = buildRig(createDefaultShivaConfiguration(), new ZoneMaterials());
    expect(shivaRig.warnings).toEqual([]);
    expect(collectSkinnedMeshes(shivaRig.root)).toHaveLength(0);
  });
});
