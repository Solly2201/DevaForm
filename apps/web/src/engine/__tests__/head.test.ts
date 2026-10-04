/**
 * A head is covered, and a face can be read.
 *
 * Two defects a customer reported, and one cause between them: geometry
 * built against a measurement that was answering confidently about a part
 * of the body it could not see.
 *
 * TAKE THE CROWN OFF and the top half of the head was bald — "only the
 * side hair have been configured to exist". It was not a missing asset.
 * The measured skull envelope samples the head on a fixed pitch from the
 * head joint, so its last row lands five millimetres short of the real
 * crown with the skull still twenty-three millimetres wide, and the
 * sampler CLAMPED to that row. Everything that asked about the top of a
 * head was told the head had a flat lid two inches across. Vishnu's hair
 * built its topmost ring there, nothing capped it, and that open ring was
 * the hole. The fix is in `sampleSkullEnvelope`, where the head closes,
 * rather than in the hair — the crown reads the same surface.
 *
 * THE EYEBROWS "did not render". They were rendering. `mesh.scale` on a
 * part's child scales about the PART's origin, which for a brow is the
 * centre of the skull, so squashing the depth to flatten the band instead
 * moved it thirty-five millimetres backwards: measured, its front face
 * sat a tenth of a millimetre outside the skin and the rest was inside
 * the forehead.
 *
 * So this measures what a customer would be looking at — is the crown of
 * the head closed, does the hair sit on the head rather than through it,
 * is there a brow you can see — rather than that the generators were
 * called.
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
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
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

/** A named part's vertices, in the head joint's own space. */
function headLocal(rig: CharacterRig, assetId: string): THREE.Vector3[] {
  const head = rig.joints.get("head");
  expect(head, "the body has a head to measure against").toBeDefined();
  head!.updateWorldMatrix(true, false);
  const toHead = new THREE.Matrix4().copy(head!.matrixWorld).invert();
  let part: THREE.Object3D | null = null;
  rig.root.traverse((node) => {
    if (node.name === `part:${assetId}`) part = node;
  });
  expect(part, `${assetId} is in the scene`).not.toBeNull();
  const points: THREE.Vector3[] = [];
  (part as unknown as THREE.Object3D).traverse((node) => {
    const mesh = node as THREE.Mesh;
    const position = mesh.geometry?.getAttribute("position");
    if (!mesh.isMesh || !position) return;
    mesh.updateWorldMatrix(true, false);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      points.push(
        new THREE.Vector3()
          .fromBufferAttribute(position, vertex)
          .applyMatrix4(mesh.matrixWorld)
          .applyMatrix4(toHead),
      );
    }
  });
  return points;
}

function meshCount(rig: CharacterRig, assetId: string): number {
  let part: THREE.Object3D | null = null;
  rig.root.traverse((node) => {
    if (node.name === `part:${assetId}`) part = node;
  });
  let meshes = 0;
  (part as unknown as THREE.Object3D)?.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) meshes += 1;
  });
  return meshes;
}

describe("the measured skull closes where the head does", () => {
  it("has nothing to say above the crown, and says so", async () => {
    const { rig, materials } = await rigFor(createDefaultVishnuConfiguration());
    try {
      const body = rig.body;
      const top = body.skullAt(body.skullTopY);
      expect(
        top.halfWidth * 1000,
        "the section at the top of the head is a point, not a lid",
      ).toBeLessThan(1);
      // And it stays a point above it, rather than extruding the last
      // measured row upwards forever, which is what it used to do.
      expect(body.skullAt(body.skullTopY + 0.02).halfWidth * 1000).toBeLessThan(1);
      // While still describing a head below: a sampler that answered
      // zero everywhere would pass the two above and be useless.
      expect(body.skullAt(body.browY).halfWidth * 1000).toBeGreaterThan(20);
    } finally {
      materials.dispose();
    }
  }, 90_000);
});

describe("Vishnu's hair covers his head", () => {
  const HAIR = "vishnu.hair.flowing";

  it("closes over the crown instead of ending in a ring", async () => {
    const { rig, materials } = await rigFor(createDefaultVishnuConfiguration());
    try {
      const points = headLocal(rig, HAIR);
      const top = Math.max(...points.map((p) => p.y));
      expect(
        (top - rig.body.skullTopY) * 1000,
        "the hair reaches over the top of the skull",
      ).toBeGreaterThan(0);

      /**
       * THE HOLE, as a number.
       *
       * Above the top of the skull there has to be hair ON THE CENTRE
       * LINE — that is the whole claim, and what makes it the hole's
       * opposite. Before this the topmost row was a RING twenty-three
       * millimetres in radius with nothing inside it: plenty of hair
       * above the skull, none of it over the middle of the head, which
       * is exactly what a customer saw when they took the crown off.
       *
       * Deliberately not "the crown comes to a point". This skull is
       * blunt — the measurement has it forty-six millimetres across less
       * than three below its top — and a head of hair on a blunt head is
       * blunt. Pinning a point would be pinning a shape nobody asked for
       * over the property that was broken.
       */
      const axis = rig.body.skullAt(rig.body.skullTopY).frontZ;
      const above = points.filter((p) => p.y > rig.body.skullTopY);
      expect(above.length, "there is hair above the skull at all").toBeGreaterThan(10);
      const nearest = Math.min(...above.map((p) => Math.hypot(p.x, p.z - axis)));
      expect(nearest * 1000, "and some of it is over the middle of the head").toBeLessThan(3);
    } finally {
      materials.dispose();
    }
  }, 90_000);

  it("sits on the skull rather than through it", async () => {
    const { rig, materials } = await rigFor(createDefaultVishnuConfiguration());
    try {
      const body = rig.body;
      let deepest = 0;
      let measured = 0;
      for (const point of headLocal(rig, HAIR)) {
        // Only where the measurement describes a head. Below the head
        // joint the envelope clamps to its first row, and a validator
        // that reports confidently about geometry it cannot see is worse
        // than no validator: see spatial/wearableFit's torsoBand.
        if (point.y < 0 || point.y > body.skullTopY) continue;
        const section = body.skullAt(point.y);
        if (section.halfWidth < 1e-4) continue;
        const centreZ = (section.frontZ + section.backZ) / 2;
        const halfDepth = (section.frontZ - section.backZ) / 2;
        const normalised = Math.hypot(
          point.x / section.halfWidth,
          (point.z - centreZ) / Math.max(1e-6, halfDepth),
        );
        measured += 1;
        if (normalised < 1) {
          deepest = Math.max(deepest, (1 - normalised) * section.halfWidth);
        }
      }
      expect(measured, "there was hair on the skull to measure").toBeGreaterThan(500);
      // A hair's breadth of bedding in is how hair sits; a centimetre is
      // scalp coming through it.
      expect(deepest * 1000).toBeLessThan(3);
    } finally {
      materials.dispose();
    }
  }, 90_000);

  /**
   * ONE MASS, NOT A CAP WITH THREADS TIED TO IT.
   *
   * The hair was a dome over the back of the skull plus fourteen locks of
   * three tubes hung off its rim — forty-three meshes, and in the Studio
   * it read as exactly what it was: a smooth helmet ending on a hard
   * edge, ropes dangling below it, and the blue of the neck showing
   * between them. Separate surfaces are what made the gaps, so the thing
   * to hold is that the hair is ONE surface with the locks carved into
   * it. It is also forty-two fewer draw calls.
   */
  it("is a single surface", async () => {
    const { rig, materials } = await rigFor(createDefaultVishnuConfiguration());
    try {
      expect(meshCount(rig, HAIR)).toBe(1);
    } finally {
      materials.dispose();
    }
  }, 90_000);
});

describe("a brow can be seen from the hero camera", () => {
  const SUBJECTS = [
    { label: "vishnu", make: createDefaultVishnuConfiguration },
    { label: "shiva", make: createDefaultShivaConfiguration },
  ] as const;

  for (const subject of SUBJECTS) {
    it(`${subject.label} wears one that reads, and sits on the face`, async () => {
      const config = subject.make();
      const brows = config.parts.brows;
      expect(brows, "the face arrives wearing a brow").toBeDefined();
      const { rig, materials } = await rigFor(config);
      try {
        const points = headLocal(rig, brows!.assetId);
        const low = Math.min(...points.map((p) => p.y));
        const high = Math.max(...points.map((p) => p.y));
        /**
         * Four millimetres on a statue a metre tall is about three pixels
         * at the distance the Studio opens at. The version this replaced
         * measured two and a tenth, which is nothing — and that, rather
         * than any material or visibility problem, is the whole of why
         * the brows "did not render".
         */
        expect((high - low) * 1000, "tall enough to see").toBeGreaterThan(4);
        // And not a stripe: a brow is a brow at arm's length too.
        expect((high - low) * 1000).toBeLessThan(10);

        /**
         * And PROUD of the skin. Flattened by `mesh.scale` about the
         * part's origin, the band's front face sat a tenth of a
         * millimetre outside the skin with everything else buried in the
         * forehead.
         */
        const skin = rig.body.skullAt((high + low) / 2).frontZ;
        const front = Math.max(...points.filter((p) => Math.abs(p.x) < 0.01).map((p) => p.z));
        expect((front - skin) * 1000, "standing out from the face").toBeGreaterThan(1.5);
      } finally {
        materials.dispose();
      }
    }, 90_000);
  }
});
