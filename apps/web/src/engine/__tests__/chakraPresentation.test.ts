/**
 * The discus is presented, not merely attached.
 *
 * Two claims about its ORIENTATION and one about its CONTACT, and each
 * one is a way the Sudarshana has been wrong before:
 *
 *  1. IT SPINS FLAT. The discus is balanced on a raised fingertip and
 *     turning, so its axis is vertical and its face is horizontal — see
 *     references/vishnu.jpg. It stood on its rim before, like a
 *     cartwheel: a wheel being shown rather than a discus being held.
 *     Measured in WORLD space, because the claim is about the statue and
 *     not about where anybody is standing; it has to hold with no camera
 *     in the scene at all, and therefore through any orbit.
 *
 *  2. ITS FACE IS LEVEL. A disc tipped off its axis reads as dropped
 *     rather than spun.
 *
 *  3. IT TOUCHES THE FINGER IT IS BALANCED ON. The presentation once
 *     declared a six-millimetre grip radius so a fist would close on
 *     "a finger", and the Studio showed what that means — a hand shut on
 *     nothing beside a wheel floating over it. `poise` replaced the lie
 *     with a hand state the body can actually bake, and the contact is a
 *     number now rather than a hope.
 *
 * Measured on BOTH sides, because the hands are mirrored and the rig is
 * not: an orientation that works on the right and inverts on the left
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
          // The normal runs up the channel; nothing spends the free spin.
          expect(held?.presentation.grip?.axis).toEqual([0, 0, 1]);
          expect(held?.presentation.facing ?? "free").toBe("free");

          const node = find(rig, `attachment:${CHAKRA}`);
          expect(node, "the discus is in the scene").not.toBeNull();
          node!.updateWorldMatrix(true, true);

          // 1. Its axis — the disc's own normal, asset-local +Z — stands
          //    vertical, so the disc lies flat and spins about it.
          const spin = new THREE.Vector3(0, 0, 1).transformDirection(node!.matrixWorld);
          const off = THREE.MathUtils.radToDeg(spin.angleTo(new THREE.Vector3(0, 1, 0)));
          expect(
            Math.min(off, 180 - off),
            `the discus spins ${off.toFixed(1)}° off vertical`,
          ).toBeLessThan(12);

          // 2. And its face is level: the disc's own in-plane directions
          //    stay horizontal, which is the same claim from the other
          //    side and catches a disc rolled onto its edge.
          for (const local of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)]) {
            const across = local.clone().transformDirection(node!.matrixWorld);
            const fromLevel = Math.abs(90 - THREE.MathUtils.radToDeg(
              across.angleTo(new THREE.Vector3(0, 1, 0)),
            ));
            expect(fromLevel, `the disc's face is ${fromLevel.toFixed(1)}° off level`).toBeLessThan(12);
          }

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
