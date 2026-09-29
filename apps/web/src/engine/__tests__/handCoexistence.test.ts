/**
 * A hand is not standing in another hand's attribute.
 *
 * WHY THIS IS A DIFFERENT QUESTION FROM EVERY OTHER GRIP TEST. `grip.test`
 * asks whether the hand holding a thing closes on it. `handReach` asks
 * whether the hand can get there at all. `gripChain` asks whether the
 * relationship is relational the whole way down. All three are about ONE
 * hand and the thing IN it, and all three passed while the parashu stood
 * through Ganesha's blessing palm — because the axe and the abhaya hand
 * belong to different arms, and nothing anywhere stated a relationship
 * between them.
 *
 * That is the gap the spatial-occupancy experiment named (§4.4): every
 * relationship the repository holds to account is X-versus-body or
 * X-versus-its-own-hand, and attribute-versus-anything-else had no
 * vocabulary at all. This is that vocabulary used for the case it was
 * built for — as VALIDATION. Nothing here places anything; the poses
 * place the arms, the presentations place the attributes, and this
 * measures what came out.
 *
 * WHAT IT MEASURES. Real geometry on both sides: the attribute's own
 * triangles, and the deformed skin (or built mesh) of every hand that is
 * not holding it, through `closestApproach`. Not bounding boxes — a box
 * around an axe contains most of the arm beside it — and not joint
 * positions, which say nothing about how big a fist is.
 *
 * WHAT IT REQUIRES. Daylight a sculptor could get a tool into. The
 * failures this was written against measured 2.3 mm (the axe through the
 * blessing palm) and 6.7 mm (the modak against the upper hand); the
 * poses that always read correctly measured past forty. Twelve
 * millimetres is set between those, low enough that a lotus stem passing
 * near a wrist is not called a defect and high enough that nothing can
 * touch.
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
  MUDRAS,
  POSE_PRESETS,
  SHIVA_POSE_PRESETS,
  VISHNU_POSE_PRESETS,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  posedWith,
  type ArmSlot,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, type CharacterRig } from "../rig";
import { ZoneMaterials } from "../materials";
import { deformedVertex } from "../skinning";
import { closestApproach } from "../spatial/occupancy";

/**
 * The daylight required between an attribute and a hand not holding it.
 *
 * See the header: chosen from the measured distribution, not from taste.
 */
const CLEAR_M = 0.012;

/**
 * How near `closestApproach` can still see. Beyond about two cells it
 * reports infinity, which for this question reads as "nowhere near" — and
 * that is the answer most pairs give.
 */
const CELL_M = 0.02;

async function rigFor(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  // Built twice: the first build starts the body's GLB arriving, and a
  // measurement taken on a rig that is still waiting for its mesh is a
  // measurement of a costume with nobody in it.
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rig = buildRig(config, materials);
  poseRig(rig, config.pose);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

/**
 * The flesh of one hand, in world space.
 *
 * A mesh body answers with the vertices its hand bones actually move; a
 * procedural one answers with the hand geometry hanging off its wrist.
 * Either way it is the surface that gets drawn, and in both cases what
 * the hand is HOLDING is excluded — an attribute is not part of the hand
 * and would otherwise report itself as touching every other one.
 */
function handSurface(rig: CharacterRig, slot: ArmSlot): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const skinned = rig.bodyMeshes.find((mesh) => (mesh as THREE.SkinnedMesh).isSkinnedMesh) as
    | THREE.SkinnedMesh
    | undefined;

  if (skinned) {
    const index = skinned.geometry.attributes.skinIndex;
    const weight = skinned.geometry.attributes.skinWeight;
    if (!index || !weight) return points;
    const wanted = new Set(
      skinned.skeleton.bones
        .map((bone, at) => [bone.name.replace(/^joint:/, "").replace(/_/g, "."), at] as const)
        .filter(([name]) => name.startsWith(`arm.${slot}.hand`))
        .map(([, at]) => at),
    );
    if (wanted.size === 0) return points;
    const target = new THREE.Vector3();
    for (let vertex = 0; vertex < index.count; vertex += 1) {
      let strongest = 0;
      for (let influence = 0; influence < 4; influence += 1) {
        if (wanted.has(index.getComponent(vertex, influence))) {
          strongest = Math.max(strongest, weight.getComponent(vertex, influence));
        }
      }
      // Mostly this hand's: a vertex the wrist and the forearm share is
      // as much arm as hand, and counting it widens the fist.
      if (strongest < 0.5) continue;
      deformedVertex(skinned, vertex, target);
      points.push(skinned.localToWorld(target.clone()));
    }
    return points;
  }

  const wrist = rig.joints.get(`arm.${slot}.hand`);
  if (!wrist) return points;
  wrist.traverse((node) => {
    // Everything under an attachment belongs to the attribute, not to
    // the hand — including the attachment's own children.
    let ancestor: THREE.Object3D | null = node;
    while (ancestor && ancestor !== wrist) {
      if (ancestor.name.startsWith("attachment:")) return;
      ancestor = ancestor.parent;
    }
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    mesh.updateWorldMatrix(true, false);
    const position = mesh.geometry.attributes.position;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      points.push(
        new THREE.Vector3().fromBufferAttribute(position, vertex).applyMatrix4(mesh.matrixWorld),
      );
    }
  });
  return points;
}

/** An attribute's own surface, sampled evenly enough to be honest. */
function attributeSurface(node: THREE.Object3D): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  node.updateWorldMatrix(true, true);
  node.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    mesh.updateWorldMatrix(true, false);
    const position = mesh.geometry.attributes.position;
    // A thousand points on a shaft is far finer than the millimetre this
    // question is asked in; more of them only costs time.
    const step = Math.max(1, Math.floor(position.count / 1000));
    for (let vertex = 0; vertex < position.count; vertex += step) {
      points.push(
        new THREE.Vector3().fromBufferAttribute(position, vertex).applyMatrix4(mesh.matrixWorld),
      );
    }
  });
  return points;
}

interface Approach {
  attribute: string;
  heldBy: ArmSlot;
  hand: ArmSlot;
  metres: number;
}

/** Every attribute against every hand that is not holding it. */
function approaches(rig: CharacterRig): Approach[] {
  const hands = new Map<ArmSlot, THREE.Vector3[]>();
  for (const slot of ARM_SLOTS) {
    const surface = handSurface(rig, slot);
    if (surface.length > 0) hands.set(slot, surface);
  }

  const out: Approach[] = [];
  for (const attachment of rig.resolved.attachments) {
    if (!attachment.handSlot) continue;
    let node: THREE.Object3D | null = null;
    rig.root.traverse((object) => {
      if (object.name === `attachment:${attachment.asset.id}`) node = object;
    });
    if (node === null) continue;
    const surface = attributeSurface(node);
    if (surface.length === 0) continue;
    for (const [slot, flesh] of hands) {
      if (slot === attachment.handSlot) continue;
      out.push({
        attribute: attachment.asset.id,
        heldBy: attachment.handSlot,
        hand: slot,
        metres: closestApproach(surface, flesh, CELL_M),
      });
    }
  }
  return out;
}

const DEITIES = [
  {
    label: "ganesha",
    make: createDefaultGaneshaConfiguration,
    presets: POSE_PRESETS.map((preset) => preset.id),
  },
  {
    label: "shiva",
    make: createDefaultShivaConfiguration,
    presets: SHIVA_POSE_PRESETS.map((preset) => preset.id),
  },
  {
    label: "vishnu",
    make: createDefaultVishnuConfiguration,
    presets: VISHNU_POSE_PRESETS.map((preset) => preset.id),
  },
] as const;

describe("no hand stands in another hand's attribute", () => {
  /**
   * How many pairs each deity actually offered up.
   *
   * A pose may legitimately have nothing to measure — a blessing that
   * sets the trident down and shows two open palms holds nothing in a
   * second hand — so an empty result is not a failure per POSE. It is a
   * failure per deity: a run that found no pairs anywhere has stopped
   * measuring and would pass for the rest of time.
   */
  const pairsSeen = new Map<string, number>();

  for (const deity of DEITIES) {
    for (const preset of deity.presets) {
      it(`${deity.label} · ${preset}`, async () => {
        const config = deity.make();
        config.pose = { preset, jointOverrides: {} };
        const { rig, materials } = await rigFor(config);
        try {
          const found = approaches(rig);
          pairsSeen.set(deity.label, (pairsSeen.get(deity.label) ?? 0) + found.length);

          const tight = found
            .filter((approach) => approach.metres < CLEAR_M)
            .map(
              (approach) =>
                `${approach.attribute} in ${approach.heldBy} is ` +
                `${(approach.metres * 1000).toFixed(1)} mm from the ${approach.hand} hand`,
            );
          expect(tight, tight.join("; ")).toEqual([]);
        } finally {
          materials.dispose();
        }
      }, 60_000);
    }

    it(`${deity.label} · the measurement reached real pairs`, () => {
      expect(pairsSeen.get(deity.label) ?? 0).toBeGreaterThan(0);
    });
  }
});

/**
 * And the chosen mudra reaches the GEOMETRY, not just the resolution.
 *
 * The chain the brief asks for is UI option → semantic gesture →
 * resolved hand → pose → final geometry, and the resolver answers only
 * the middle of it. Ganesha's front right hand is the one that was
 * broken — its default pose declares a gesture for it — so it is the one
 * held to account here: six mudras, six distinct hands actually built.
 *
 * Distinctness is the claim that matters. A hand that resolves correctly
 * and then builds the same shape every time is the same dead control
 * wearing different words.
 */
describe("a chosen mudra reaches the built hand", () => {
  it("ganesha's blessing front right builds a different hand for every mudra", async () => {
    const shapes = new Map<string, string>();
    for (const mudra of MUDRAS) {
      const base = posedWith(createDefaultGaneshaConfiguration(), "blessing");
      const config: CharacterConfiguration = {
        ...base,
        hands: { ...base.hands, frontRight: { mudra } },
        // Empty-handed, so what is measured is the hand and not what the
        // resolver decided to put in it.
        attachments: base.attachments.filter((a) => !a.socket.startsWith("arm.")),
      };
      const { rig, materials } = await rigFor(config);
      try {
        expect(rig.hands.frontRight.mudra, `${mudra} survived resolution`).toBe(mudra);
        const points = handSurface(rig, "frontRight");
        expect(points.length, `${mudra} built a hand`).toBeGreaterThan(0);
        // Where the fingers actually ended up, to a tenth of a millimetre.
        const box = new THREE.Box3().setFromPoints(points);
        const wrist = rig.joints
          .get("arm.frontRight.hand")!
          .getWorldPosition(new THREE.Vector3());
        const shape = [box.min, box.max]
          .flatMap((corner) => corner.clone().sub(wrist).toArray())
          .map((n) => n.toFixed(4))
          .join(",");
        shapes.set(mudra, shape);
      } finally {
        materials.dispose();
      }
    }
    expect(new Set(shapes.values()).size, `distinct hands: ${[...shapes.keys()].join(", ")}`).toBe(
      MUDRAS.length,
    );
  }, 120_000);
});
