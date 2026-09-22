/**
 * A joint the customer bends actually bends.
 *
 * The Pose panel writes euler rotations into `pose.jointOverrides`, the
 * store marks the creation dirty, the viewport's pose effect re-runs —
 * and nothing moved, because `poseRig` re-applied `rig.resolved.pose`:
 * the pose as it stood the moment the rig was BUILT. Bending a knee or
 * twisting a torso does not rebuild the rig (correctly — no geometry
 * changed), so every adjustment re-asserted the pose it was trying to
 * change and the sliders were decoration.
 *
 * This is that defect, written as a measurement. It asks the geometry
 * where a knee is, not the store what it thinks it stored: a test that
 * reads back the configuration would have passed throughout.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

const PUBLIC_DIR = join(__dirname, "..", "..", "..", "public");

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", async () => {
  interface RealLoader {
    parse(
      data: ArrayBuffer,
      path: string,
      onLoad: (gltf: { scene: THREE.Group }) => void,
    ): void;
  }
  const actual = await vi.importActual<{ GLTFLoader: new () => RealLoader }>(
    "three/examples/jsm/loaders/GLTFLoader.js",
  );
  return {
    GLTFLoader: class {
      private readonly real = new actual.GLTFLoader();
      load(
        path: string,
        onLoad: (gltf: { scene: THREE.Group }) => void,
        _progress?: unknown,
        onError?: (error: unknown) => void,
      ): void {
        try {
          const file = readFileSync(join(PUBLIC_DIR, path.replace(/^\//, "")));
          const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
          this.real.parse(buffer as ArrayBuffer, "", onLoad);
        } catch (error) {
          onError?.(error);
        }
      }
    },
  };
});

import {
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
  type JointId,
  type PoseConfiguration,
  type Vec3,
} from "@devaform/character-schema";
import { buildRig, poseRig, type CharacterRig } from "../rig";
import { ZoneMaterials } from "../materials";

async function rigFor(config: CharacterConfiguration): Promise<CharacterRig> {
  const materials = new ZoneMaterials();
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return buildRig(config, materials);
}

/**
 * Where a joint is AND which way it faces, as one point in the world.
 *
 * A point offset from the joint's origin rather than the origin itself,
 * because a twist about a joint's own axis moves the origin not at all —
 * turning the head is exactly the sort of adjustment this has to count,
 * and measuring the head joint's position would call it a no-op.
 */
const PROBE = new THREE.Vector3(0.07, 0.05, 0.11);

function jointAt(rig: CharacterRig, id: JointId): THREE.Vector3 {
  rig.root.updateWorldMatrix(true, true);
  const joint = rig.joints.get(id);
  expect(joint, `the rig has a ${id}`).toBeDefined();
  return joint!.localToWorld(PROBE.clone());
}

const DEITIES = [
  ["ganesha", createDefaultGaneshaConfiguration],
  ["shiva", createDefaultShivaConfiguration],
  ["vishnu", createDefaultVishnuConfiguration],
] as const;

/**
 * The adjustments the customer reported doing nothing, and the joint each
 * one is supposed to move. A knee that bends moves the ankle; a torso
 * that leans moves the neck.
 */
const ADJUSTMENTS: ReadonlyArray<{
  label: string;
  joint: JointId;
  rotation: Vec3;
  moves: JointId;
}> = [
  { label: "bend the left knee", joint: "leg.left.shin", rotation: [1.1, 0, 0], moves: "leg.left.foot" },
  { label: "bend the right knee", joint: "leg.right.shin", rotation: [1.1, 0, 0], moves: "leg.right.foot" },
  { label: "raise the left thigh", joint: "leg.left.thigh", rotation: [-0.9, 0, 0], moves: "leg.left.shin" },
  { label: "lean the torso", joint: "spine", rotation: [0.5, 0, 0], moves: "neck" },
  { label: "twist the chest", joint: "chest", rotation: [0, 0.6, 0], moves: "head" },
  { label: "tip the pelvis", joint: "pelvis", rotation: [0, 0, 0.2], moves: "spine" },
  { label: "turn the head", joint: "neck", rotation: [0, 0.8, 0], moves: "head" },
];

describe("an adjustment reaches the statue without rebuilding it", () => {
  for (const [deity, make] of DEITIES) {
    for (const adjustment of ADJUSTMENTS) {
      it(`${deity}: ${adjustment.label}`, async () => {
        const config = make();
        const rig = await rigFor(config);
        expect(rig.pending, "every asset loaded").toEqual([]);

        // As the viewport does it: build once, then pose with whatever
        // the configuration currently says. No second buildRig.
        const pose = (jointOverrides: Record<string, Vec3>) => {
          poseRig(rig, {
            preset: config.pose.preset,
            jointOverrides,
          } as PoseConfiguration);
        };

        pose({});
        const before = jointAt(rig, adjustment.moves);

        pose({ [adjustment.joint]: adjustment.rotation });
        const after = jointAt(rig, adjustment.moves);

        expect(
          before.distanceTo(after),
          `${adjustment.label} moved ${adjustment.moves}`,
        ).toBeGreaterThan(0.01);

        // And it is reversible: letting the slider go puts it back.
        pose({});
        expect(jointAt(rig, adjustment.moves).distanceTo(before)).toBeLessThan(1e-6);
      });
    }
  }

  it("still stands on its base with a leg bent", async () => {
    const config = createDefaultGaneshaConfiguration();
    const rig = await rigFor(config);
    poseRig(rig, {
      preset: config.pose.preset,
      jointOverrides: { "leg.left.shin": [0.9, 0, 0] },
    } as PoseConfiguration);
    rig.root.updateWorldMatrix(true, true);

    // settleOnSupport runs inside poseRig, so a bent leg re-seats the
    // whole figure rather than sinking it through the lotus.
    const point = new THREE.Vector3();
    let lowest = Number.POSITIVE_INFINITY;
    for (const mesh of rig.bodyMeshes) {
      const position = mesh.geometry.getAttribute("position");
      mesh.updateWorldMatrix(true, false);
      for (let i = 0; i < position.count; i += 1) {
        point.fromBufferAttribute(position, i);
        if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
          (mesh as THREE.SkinnedMesh).applyBoneTransform(i, point);
        }
        point.applyMatrix4(mesh.matrixWorld);
        lowest = Math.min(lowest, rig.root.worldToLocal(point).y);
      }
    }
    expect(lowest).toBeCloseTo(rig.baseTop, 3);
  });

  it("without a pose argument, keeps applying the one it was built with", async () => {
    // The default is still the rig's own pose — buildRig's callers that
    // have no store to read from depend on it.
    const config = createDefaultShivaConfiguration();
    const rig = await rigFor(config);
    poseRig(rig);
    const first = jointAt(rig, "head").clone();
    poseRig(rig);
    expect(jointAt(rig, "head").distanceTo(first)).toBeLessThan(1e-9);
  });
});
