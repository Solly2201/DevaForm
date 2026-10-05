/**
 * A necklace is somewhere a customer can see it.
 *
 * THE DEFECT. Vishnu's vaijayanti was reported as "effectively never
 * visible", and every usual explanation was wrong. It was generated, on
 * the right socket, the right size, made of the right materials, outside
 * the skin, and it passed every fit check in the repository. What it was,
 * was in the wrong PLACE: its route put the lowest point of the loop at
 * bearing −3.14, which is the back of the figure rather than the belly
 * the comment above it claimed, so the garland hung down Vishnu's back
 * where its bottom was swallowed by the dhoti, and at the front it sat at
 * the collarbone under the gold kantha. Two small clusters of flowers
 * near the armpits were all that ever showed.
 *
 * Then the rebuild hid it a second way, and that one is worth a test of
 * its own: the fall was hung a bloom's breadth in front of the CHEST, in
 * the chest joint's frame — and that joint is a spine joint, twenty-eight
 * millimetres behind the body's centre line. The garland went back inside
 * the dhoti again. A number that looks like a clearance and is quoted in
 * the wrong frame is indistinguishable from a correct one until something
 * measures it.
 *
 * SO THIS MEASURES PLACEMENT, not existence. "The mesh is in the scene"
 * is what the old suite could say, and it was true the entire time the
 * ornament was invisible. What is asked here is where the geometry
 * actually is in world space: in front of the body rather than behind it,
 * clear of the garment worn under it, and long enough to be the thing the
 * reference draws.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { listAssets } from "@devaform/asset-system";

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
  SHIVA_POSE_PRESETS,
  VISHNU_POSE_PRESETS,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  posedWith,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, type CharacterRig } from "../rig";
import { ZoneMaterials } from "../materials";

async function rigFor(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rig = buildRig(config, materials);
  poseRig(rig, config.pose);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

/** Every vertex of a named node, in world metres. */
function worldPoints(rig: CharacterRig, name: string, stride = 1): THREE.Vector3[] {
  let node: THREE.Object3D | null = null;
  rig.root.traverse((object) => {
    if (object.name === name) node = object;
  });
  if (!node) return [];
  const points: THREE.Vector3[] = [];
  (node as THREE.Object3D).updateWorldMatrix(true, true);
  (node as THREE.Object3D).traverse((child) => {
    const mesh = child as THREE.Mesh;
    const position = mesh.geometry?.getAttribute("position");
    if (!mesh.isMesh || !position) return;
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < position.count; i += stride) {
      points.push(
        new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld),
      );
    }
  });
  return points;
}

/** The nearest point of a mesh cloud to a target, in metres. */
function nearest(cloud: readonly THREE.Vector3[], target: THREE.Vector3): number {
  let best = Infinity;
  for (const point of cloud) {
    const distance = point.distanceToSquared(target);
    if (distance < best) best = distance;
  }
  return Math.sqrt(best);
}

/** Where the torso's own front is, in WORLD metres, at a world height. */
function torsoFrontAt(rig: CharacterRig, worldY: number): number {
  const chest = rig.joints.get("chest")!;
  const seat = chest.getWorldPosition(new THREE.Vector3());
  return seat.z + rig.body.surfaceAt(0, worldY - seat.y).z;
}

/** What an asset says it is worn over, if it says anything. */
function declaredOver(id: string): readonly string[] | null {
  const asset = listAssets({}).find((candidate) => candidate.id === id);
  const fit = asset?.fit;
  if (!fit || fit.kind !== "drapes" || !fit.over) return null;
  return fit.over;
}

const SUBJECTS = [
  {
    label: "vishnu",
    make: createDefaultVishnuConfiguration,
    poses: VISHNU_POSE_PRESETS.map((preset) => preset.id),
    necklaces: ["vishnu.garland.vaijayanti", "ganesha.necklace.haram"],
    garment: "vishnu.garment.dhoti",
  },
  {
    label: "shiva",
    make: createDefaultShivaConfiguration,
    poses: SHIVA_POSE_PRESETS.map((preset) => preset.id),
    necklaces: ["shiva.mala.rudraksha", "shiva.ornament.naga"],
    garment: "shiva.garment.tigerHide",
  },
] as const;

describe.each(SUBJECTS.map((subject) => [subject.label, subject] as const))(
  "%s: what is worn at the neck is worn where it can be seen",
  (_label, subject) => {
    it("every necklace is built, and in front of the figure rather than behind it", async () => {
      const { rig, materials } = await rigFor(subject.make());
      try {
        for (const id of subject.necklaces) {
          const points = worldPoints(rig, `attachment:${id}`, 3);
          expect(points.length, `${id} built geometry`).toBeGreaterThan(50);

          /**
           * IN FRONT, which "it exists" cannot tell you.
           *
           * The garland that started this hung down the BACK: it had
           * hundreds of vertices, all of them outside the skin, and a
           * customer looking at the statue saw none of them. So the
           * question is how much of it is forward of the body's own
           * front — where a necklace is worn and where the hero camera
           * looks.
           */
          const ahead = points.filter(
            (point) => point.z > torsoFrontAt(rig, point.y) - 0.02,
          ).length;
          expect(
            ahead / points.length,
            `${id}: only ${((ahead / points.length) * 100).toFixed(0)}% of it is on the front of the figure`,
          ).toBeGreaterThan(0.25);
        }
      } finally {
        materials.dispose();
      }
    }, 180_000);

    /**
     * AND CLEAR OF WHAT IS WORN UNDER IT.
     *
     * The layering, measured rather than declared. A necklace long enough
     * to reach the waist meets the lower garment there, and "inside the
     * dhoti" is how the vaijayanti spent its whole life — once by hanging
     * down the back into it, and once by being hung in the chest joint's
     * frame, which is a spine joint and sits behind the body's middle.
     */
    it("hangs clear of the lower garment rather than inside it", async () => {
      const { rig, materials } = await rigFor(subject.make());
      try {
        const cloth = worldPoints(rig, `part:${subject.garment}`, 7);
        expect(cloth.length, "the lower garment is in the scene").toBeGreaterThan(100);
        for (const id of subject.necklaces) {
          /**
           * AND THE LIST COMES FROM THE ASSET WHERE THE ASSET STATES IT.
           *
           * A `drapes` fit names what it is worn over. If that list were
           * only a comment this test would keep checking the garment it
           * was written against while the declaration drifted, which is
           * exactly how `clearanceM` came to be declared by four assets
           * and read by none. So anything the asset names is checked
           * here too, and the subject's garment is required to be in the
           * list: a declaration that forgets the dhoti fails rather than
           * quietly narrowing what is tested.
           */
          const declared = declaredOver(id);
          if (declared) {
            expect(declared, `${id} says what it is worn over`).toContain(subject.garment);
            for (const under of declared) {
              if (under === subject.garment) continue;
              const beneath = worldPoints(rig, `attachment:${under}`, 7).concat(
                worldPoints(rig, `part:${under}`, 7),
              );
              if (beneath.length < 50) continue;
              const mine = worldPoints(rig, `attachment:${id}`, 11);
              const overlap = mine.filter(
                (point) => point.y < Math.max(...beneath.map((b) => b.y)),
              );
              if (overlap.length === 0) continue;
              let closest = Infinity;
              for (const point of overlap) closest = Math.min(closest, nearest(beneath, point));
              expect(
                closest * 1000,
                `${id}: it says it is worn over ${under} and comes within ${(closest * 1000).toFixed(1)}mm of it`,
              ).toBeGreaterThan(0.5);
            }
          }
          const points = worldPoints(rig, `attachment:${id}`, 11);
          // Only where the two actually meet: a collar that stops at the
          // collarbone has nothing to say about a dhoti.
          const low = points.filter((point) => point.y < Math.max(...cloth.map((c) => c.y)));
          if (low.length === 0) continue;
          let worst = Infinity;
          for (const point of low) worst = Math.min(worst, nearest(cloth, point));
          expect(
            worst * 1000,
            `${id}: its nearest approach to the garment is ${(worst * 1000).toFixed(1)}mm`,
          ).toBeGreaterThan(1);
        }
      } finally {
        materials.dispose();
      }
    }, 180_000);

    it("stays put when the pose changes", async () => {
      for (const pose of subject.poses) {
        const { rig, materials } = await rigFor(posedWith(subject.make(), pose));
        try {
          for (const id of subject.necklaces) {
            const points = worldPoints(rig, `attachment:${id}`, 9);
            expect(points.length, `${id} survives ${pose}`).toBeGreaterThan(20);
            const ahead = points.filter(
              (point) => point.z > torsoFrontAt(rig, point.y) - 0.02,
            ).length;
            expect(ahead / points.length, `${id} in ${pose}`).toBeGreaterThan(0.2);
          }
        } finally {
          materials.dispose();
        }
      }
    }, 300_000);
  },
);

describe("the vaijayanti is the garland the reference draws", () => {
  /**
   * A vanamala, not a collar.
   *
   * The sheet shows it leaving both shoulders and falling to the middle
   * of the thigh — the most prominent ornament on the figure in all four
   * views. What was there reached the waist and stopped, which is a
   * different ornament wearing the same name.
   */
  it("reaches from the shoulders to the thigh", async () => {
    const { rig, materials } = await rigFor(createDefaultVishnuConfiguration());
    try {
      const points = worldPoints(rig, "attachment:vishnu.garland.vaijayanti", 3);
      expect(points.length).toBeGreaterThan(200);
      const top = Math.max(...points.map((p) => p.y));
      const bottom = Math.min(...points.map((p) => p.y));
      const shoulder = rig.joints.get("chest")!.getWorldPosition(new THREE.Vector3()).y;
      const knee = rig.joints.get("leg.left.shin")!.getWorldPosition(new THREE.Vector3()).y;

      expect(top, "it is worn at the shoulders").toBeGreaterThan(shoulder);
      // Below the hips and above the knee: the thigh, as the sheet has it.
      expect(bottom, `it falls to ${(bottom * 1000).toFixed(0)}mm`).toBeLessThan(
        shoulder - 0.25,
      );
      expect(bottom, "and not past the knee").toBeGreaterThan(knee - 0.02);
    } finally {
      materials.dispose();
    }
  }, 180_000);
});
