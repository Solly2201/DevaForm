/**
 * A hand closes on what it holds.
 *
 * This measures the DEFORMED SKIN of every finger against the object's
 * own axis and radius — the geometry the renderer draws, not the joint
 * angles some solver asked for. Two things have to be true of a hand
 * holding a shaft, and both are visible in a render:
 *
 *   1. the fingers come round it — some part of each finger reaches the
 *      surface, or the hand is merely laid over the thing;
 *   2. no finger is buried in it — flesh presses on a surface, it does
 *      not pass through it.
 *
 * Those are stated as distances from the object's axis, which is a
 * measurement a cylinder makes honest: for a cylinder, "distance to the
 * axis" IS the containment test, and the attributes this applies to all
 * declare a radius at the grip precisely because they are cylindrical
 * where the hand closes. The test deliberately does not run on anything
 * else — a cheap proxy that cannot tell wrapping from penetrating is
 * worse than no test, because it passes for the wrong reason.
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
  ARM_SLOTS,
  SHIVA_POSE_PRESETS,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  type ArmSlot,
} from "@devaform/character-schema";
import { buildRig, poseRig, type CharacterRig } from "../rig";
import { ZoneMaterials } from "../materials";
import { deformedVertex } from "../skinning";

const FINGERS = ["index", "middle", "ring", "little"] as const;
const SEGMENTS = ["01", "02", "03"] as const;
const WRAPPING = ["02", "03"] as const;

async function rigFor(config: Parameters<typeof buildRig>[0]) {
  const materials = new ZoneMaterials();
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rig = buildRig(config, materials);
  poseRig(rig);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

/** Every finger's skin, as distances from the held object's axis. */
function fingerSkin(
  rig: CharacterRig,
  slot: ArmSlot,
  straight: number | undefined,
): Record<string, { min: number; max: number }> | null {
  const body = rig.bodyMeshes.find(
    (mesh) => (mesh as THREE.SkinnedMesh).isSkinnedMesh,
  ) as THREE.SkinnedMesh | undefined;
  const socket = rig.sockets.get(`arm.${slot}.hand.item`);
  if (!body || !socket) return null;
  socket.updateWorldMatrix(true, true);
  // The OBJECT's axis, not the socket's. An attribute may declare its own
  // grip origin and roll, and `gripFrameTransform` applies those to the
  // attachment — so a damaru's waist is not necessarily on the channel
  // the hand closed around, and measuring the socket would be measuring
  // a line with nothing on it.
  const held = socket.children.find((child) => child.name.startsWith("attachment:")) ?? socket;
  const origin = held.getWorldPosition(new THREE.Vector3());
  const axis = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(held.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();
  // ONLY where the object is actually a cylinder of the radius it
  // declared. A damaru is an hourglass: its waist is six millimetres and
  // its heads are thirty, and a finger lying against a head is nowhere
  // near six millimetres from the axis while being in perfect contact
  // with the drum. The presentation already says how long the cylindrical
  // part is — `travel` is how far the hand may slide along it — so that
  // is the window, and outside it this measures nothing.
  const window = straight ?? 0.015;
  const offset = new THREE.Vector3();
  const target = new THREE.Vector3();
  /** Distance from the object's axis, or null outside its straight part. */
  const distance = (point: THREE.Vector3): number | null => {
    offset.copy(point).sub(origin);
    if (Math.abs(offset.dot(axis)) > window) return null;
    return offset.addScaledVector(axis, -offset.dot(axis)).length();
  };

  const index = body.geometry.attributes.skinIndex;
  const weight = body.geometry.attributes.skinWeight;
  const bones = body.skeleton.bones;
  const boneOf = (name: string): number =>
    bones.findIndex((bone) => bone.name.replace(/^joint:/, "").replace(/_/g, ".") === name);

  const measure = (finger: string, segments: readonly string[]) => {
    const wanted = new Set(
      segments
        .map((segment) => boneOf(`arm.${slot}.hand.${finger}.${segment}`))
        .filter((bone) => bone >= 0),
    );
    if (wanted.size === 0) return null;
    let min = Infinity;
    let max = 0;
    for (let vertex = 0; vertex < index.count; vertex += 1) {
      let strongest = 0;
      for (let slotIndex = 0; slotIndex < 4; slotIndex += 1) {
        if (wanted.has(index.getComponent(vertex, slotIndex))) {
          strongest = Math.max(strongest, weight.getComponent(vertex, slotIndex));
        }
      }
      if (strongest < 0.6) continue;
      deformedVertex(body, vertex, target);
      body.localToWorld(target);
      const d = distance(target);
      if (d === null) continue;
      min = Math.min(min, d);
      max = Math.max(max, d);
    }
    return { min, max };
  };

  const out: Record<string, { min: number; max: number }> = {};
  for (const finger of FINGERS) {
    // Reach is measured on the whole finger; penetration only on the two
    // phalanges that come ROUND the object. The proximal one's skin is
    // continuous with the palm — an object lying on the palm is a few
    // millimetres from it whatever the hand is doing — so counting it as
    // penetration is counting the contact patch as a defect.
    const whole = measure(finger, SEGMENTS);
    const wrapping = measure(finger, WRAPPING);
    if (!whole || !wrapping) return null;
    if (!Number.isFinite(whole.min)) continue;
    out[finger] = { min: wrapping.min, max: whole.max };
  }
  return out;
}

describe("a hand closes on what it holds", () => {
  it.each(SHIVA_POSE_PRESETS.map((preset) => preset.id))("%s", async (presetId) => {
    const { rig, materials } = await rigFor({
      ...createDefaultShivaConfiguration(),
      pose: { preset: presetId, jointOverrides: {} },
    });
    expect(rig.pending, `${presetId}: every asset loaded`).toEqual([]);

    for (const slot of ARM_SLOTS) {
      const held = rig.heldByHand[slot];
      if (!held?.radius) continue;
      const skin = fingerSkin(rig, slot, held.straight);
      if (!skin) continue;
      const surface = held.radius;
      for (const finger of FINGERS) {
        const measured = skin[finger];
        if (!measured) continue;
        const { min, max } = measured;
        // Round it. The furthest this finger's skin gets from the axis
        // has to be at least the object's own radius, or the finger is
        // not on the far side of anything — it is lying across it.
        expect(
          max,
          `${presetId}: the ${slot} ${finger} never reaches round a ${(surface * 1000).toFixed(1)} mm object`,
        ).toBeGreaterThan(surface);
        // And not through it. Flesh presses in; four millimetres of press
        // on a statue is contact, and more than that is a finger inside
        // the thing it is holding.
        expect(
          min,
          `${presetId}: the ${slot} ${finger} is ${((surface - min) * 1000).toFixed(1)} mm inside what it holds`,
        ).toBeGreaterThan(surface - 0.004);
      }
    }
    materials.dispose();
  });

  it("leaves a body whose hands are geometry alone", async () => {
    // Ganesha's hands are built closed by their own generator, around the
    // same declared radius. There is nothing to morph and nothing to
    // solve, and the engine must not pretend otherwise.
    const { rig, materials } = await rigFor(createDefaultGaneshaConfiguration());
    const body = rig.bodyAsset;
    expect(body?.morphTargets ?? []).not.toContain("gripFrontRight");
    expect(rig.warnings).toEqual([]);
    materials.dispose();
  });
});
