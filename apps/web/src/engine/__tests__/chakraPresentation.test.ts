/**
 * The discus is presented, not merely attached.
 *
 * Three claims, and each one is a way the Sudarshana has been wrong
 * before:
 *
 *  1. IT FACES THE STATUE'S FRONT. A wheel has a face and a murti shows
 *     it. `worldUpright` fixes two of the item's three degrees of freedom
 *     and leaves the spin about the vertical channel wherever the arm
 *     solve happened to put it — which for a shaft is nothing and for a
 *     discus is the difference between the attribute presenting itself
 *     and the attribute caught half-profile. `facing: "front"` spends
 *     that free spin deliberately, and this measures the result in WORLD
 *     space: the claim is about the statue's front, not the camera's, so
 *     it has to hold with no camera in the scene at all.
 *
 *  2. IT STANDS UPRIGHT. A discus lying flat, or tipped, reads as
 *     dropped.
 *
 *  3. IT TOUCHES THE FINGER IT IS BALANCED ON. The presentation once
 *     declared a six-millimetre grip radius so a fist would close on
 *     "a finger", and the Studio showed what that means — a hand shut on
 *     nothing beside a wheel floating over it. `poise` replaced the lie
 *     with a hand state the body can actually bake, and the contact is a
 *     number now rather than a hope.
 *
 * Measured on BOTH sides, because the hands are mirrored and the rig is
 * not: a spin correction that works on the right and inverts on the left
 * passes any test that only looks at one of them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

const PUBLIC_DIR = join(__dirname, "..", "..", "..", "public");
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", async () => {
  interface RealLoader {
    parse(data: ArrayBuffer, path: string, onLoad: (gltf: { scene: THREE.Group }) => void): void;
  }
  const actual = await vi.importActual<{ GLTFLoader: new () => RealLoader }>(
    "three/examples/jsm/loaders/GLTFLoader.js",
  );
  return {
    GLTFLoader: class {
      private readonly real = new actual.GLTFLoader();
      load(path: string, onLoad: (gltf: { scene: THREE.Group }) => void): void {
        const file = readFileSync(join(PUBLIC_DIR, path.replace(/^\//, "")));
        const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
        this.real.parse(buffer as ArrayBuffer, "", onLoad);
      }
    },
  };
});

import {
  VISHNU_POSE_PRESETS,
  createDefaultVishnuConfiguration,
  posedWith,
  type ArmSlot,
  type CharacterConfiguration,
  type SocketId,
} from "@devaform/character-schema";
import { buildRig, poseRig, type CharacterRig } from "../rig";
import { ZoneMaterials } from "../materials";
import { deformedVertex } from "../skinning";

const CHAKRA = "vishnu.attribute.chakra";

async function rigFor(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rig = buildRig(config, materials);
  poseRig(rig, config.pose);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

function find(rig: CharacterRig, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  rig.root.traverse((object) => {
    if (object.name === name) found = object;
  });
  return found;
}

/** The chakra in a named hand, or nothing. */
function chakraIn(config: CharacterConfiguration, slot: ArmSlot): CharacterConfiguration {
  return {
    ...config,
    attachments: [
      ...config.attachments.filter(
        (attachment) =>
          attachment.asset.assetId !== CHAKRA &&
          attachment.socket !== (`arm.${slot}.hand.item` as SocketId),
      ),
      { socket: `arm.${slot}.hand.item` as SocketId, asset: { assetId: CHAKRA, version: 1 } },
    ],
  };
}

/** The highest point of the flesh of one hand — the raised fingertip. */
function fingertipY(rig: CharacterRig, slot: ArmSlot): number | null {
  const skinned = rig.bodyMeshes.find((mesh) => (mesh as THREE.SkinnedMesh).isSkinnedMesh) as
    | THREE.SkinnedMesh
    | undefined;
  if (!skinned) return null;
  const index = skinned.geometry.attributes.skinIndex;
  const weight = skinned.geometry.attributes.skinWeight;
  if (!index || !weight) return null;
  const wanted = new Set(
    skinned.skeleton.bones
      .map((bone, at) => [bone.name.replace(/^joint:/, "").replace(/_/g, "."), at] as const)
      .filter(([name]) => name.startsWith(`arm.${slot}.hand.index`))
      .map(([, at]) => at),
  );
  if (wanted.size === 0) return null;
  const target = new THREE.Vector3();
  let highest: number | null = null;
  for (let vertex = 0; vertex < index.count; vertex += 1) {
    let strongest = 0;
    for (let influence = 0; influence < 4; influence += 1) {
      if (wanted.has(index.getComponent(vertex, influence))) {
        strongest = Math.max(strongest, weight.getComponent(vertex, influence));
      }
    }
    if (strongest < 0.5) continue;
    deformedVertex(skinned, vertex, target);
    const y = skinned.localToWorld(target.clone()).y;
    if (highest === null || y > highest) highest = y;
  }
  return highest;
}

describe("the Sudarshana is presented", () => {
  const poses = VISHNU_POSE_PRESETS.map((preset) => preset.id);
  const hands: ArmSlot[] = ["backRight", "backLeft"];

  for (const pose of poses) {
    for (const slot of hands) {
      it(`${pose} · ${slot}`, async () => {
        const config = chakraIn(posedWith(createDefaultVishnuConfiguration(), pose), slot);
        const { rig, materials } = await rigFor(config);
        try {
          const held = rig.resolved.attachments.find((a) => a.asset.id === CHAKRA);
          expect(held?.handSlot, "the discus is in the hand it was put in").toBe(slot);
          expect(held?.presentation.facing).toBe("front");

          const node = find(rig, `attachment:${CHAKRA}`);
          expect(node, "the discus is in the scene").not.toBeNull();
          node!.updateWorldMatrix(true, true);

          // 1. Its face looks out the statue's front. World +Z, and the
          //    only tolerance is the arm's own lean.
          const face = new THREE.Vector3(0, 0, 1).transformDirection(node!.matrixWorld);
          const degrees = (THREE.MathUtils.radToDeg(face.angleTo(new THREE.Vector3(0, 0, 1))));
          expect(
            Math.min(degrees, 180 - degrees),
            `the discus looks ${degrees.toFixed(1)}° off the front`,
          ).toBeLessThan(12);

          // 2. And it stands upright: its own axis is vertical, so the
          //    wheel is a wheel rather than a plate.
          const axis = new THREE.Vector3(0, 1, 0).transformDirection(node!.matrixWorld);
          const tilt = THREE.MathUtils.radToDeg(axis.angleTo(new THREE.Vector3(0, 1, 0)));
          expect(Math.min(tilt, 180 - tilt), `the discus is ${tilt.toFixed(1)}° off upright`).toBeLessThan(12);

          // 3. And it rests ON the finger.
          const tip = fingertipY(rig, slot);
          expect(tip, "the hand has an index finger to balance it on").not.toBeNull();
          const bottom = new THREE.Box3().setFromObject(node!).min.y;
          const gap = bottom - tip!;
          expect(gap, `the discus sits ${(gap * 1000).toFixed(1)} mm off the fingertip`).toBeLessThan(
            0.006,
          );
          expect(gap, "and not through it").toBeGreaterThan(-0.006);
        } finally {
          materials.dispose();
        }
      }, 60_000);
    }
  }
});
