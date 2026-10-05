/**
 * An ornament is drawn in the frame it is actually worn in.
 *
 * THE DEFECT. The kamarbandh sat SEVENTY-NINE MILLIMETRES inside both
 * human torsos and perfectly on Ganesha. That shape of result — right on
 * one body, deeply wrong on the others — is the signature of a generator
 * reading a table instead of the body in front of it, and that is what it
 * was: `waistKamarband` converted between chest space and socket space
 * using `getSocket("waist.ornament")`, which is the STYLISED skeleton's
 * seat. The comment above it said it read "from the skeleton this body
 * actually brought rather than from the stylised table". It did not.
 *
 * The two seats differ by exactly the error: the table puts the waist
 * forty millimetres above the pelvis joint and a hundred and twenty
 * forward, the measured human puts it ninety above and fifty-five
 * forward. Worn by Ganesha, who is the body the table describes, the belt
 * was correct; worn by anyone else it was built in a frame that body does
 * not have.
 *
 * So `GeneratorContext.socketOffset` exists, beside `jointOffset`, which
 * was added for the identical mistake about joints. This holds the
 * property that matters rather than the mechanism: an ornament that hangs
 * from a socket ends up outside the body, on EVERY body that can wear it.
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
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig } from "../rig";
import { insideSkin, skinDepthAt, skinFieldOf } from "../spatial/skinDepth";
import { ZoneMaterials } from "../materials";

const SUBJECTS = [
  { label: "shiva", make: createDefaultShivaConfiguration },
  { label: "vishnu", make: createDefaultVishnuConfiguration },
  { label: "ganesha", make: createDefaultGaneshaConfiguration },
] as const;

/** The kamarbandh is offered to every deity, which is what makes it the test. */
const BELT = "ganesha.waist.kamarband";

describe.each(SUBJECTS.map((subject) => [subject.label, subject] as const))(
  "%s: a waist ornament is worn on the waist, not in it",
  (_label, subject) => {
    it("sits outside the torso", async () => {
      const base = subject.make();
      const config: CharacterConfiguration = {
        ...base,
        attachments: [
          ...base.attachments.filter((attachment) => attachment.socket !== "waist.ornament"),
          { socket: "waist.ornament", asset: { assetId: BELT, version: 2 } },
        ],
      };
      const materials = new ZoneMaterials();
      buildRig(config, materials);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const rig = buildRig(config, materials);
      poseRig(rig, config.pose);
      rig.root.updateWorldMatrix(true, true);

      try {
        const chestY = rig.joints.get("chest")!.getWorldPosition(new THREE.Vector3()).y;
        let node: THREE.Object3D | null = null;
        rig.root.traverse((object) => {
          if (object.name === `attachment:${BELT}`) node = object;
        });
        expect(node, "the belt is in the scene").not.toBeNull();

        /**
         * MEASURED AGAINST THE SKIN THAT IS DRAWN, not against the torso
         * profile.
         *
         * This used to ask `body.surfaceAt` how deep each belt vertex
         * was. The belt rides at roughly two hundred millimetres below
         * the chest, which is BELOW the band that profile admits to
         * describing — `torsoBand` exists to say where it stops being
         * able to answer, and below it the profile keeps replying with
         * something that is not the body. Measured, the two instruments
         * disagreed by tens of millimetres at exactly this height: the
         * dhoti drawn over Shiva's hips is narrower than the profile
         * claims his torso is there, so a belt seated correctly ON the
         * cloth was reported twenty-six millimetres INSIDE him.
         *
         * `skinDepth` was built for this question — how far inside the
         * rendered, skinned, morphed triangles a point is, anywhere on
         * the figure — and it is the instrument that can answer it.
         */
        const bodyMeshes: THREE.Mesh[] = [];
        for (const mesh of rig.bodyMeshes) bodyMeshes.push(mesh);
        const field = skinFieldOf(bodyMeshes);

        let deepest = 0;
        let measured = 0;
        let where = "";
        (node as unknown as THREE.Object3D).traverse((child) => {
          const mesh = child as THREE.Mesh;
          const position = mesh.geometry?.getAttribute("position");
          if (!mesh.isMesh || !position) return;
          mesh.updateWorldMatrix(true, false);
          for (let i = 0; i < position.count; i += 5) {
            const point = new THREE.Vector3()
              .fromBufferAttribute(position, i)
              .applyMatrix4(mesh.matrixWorld);
            measured += 1;
            if (!insideSkin(field, point)) continue;
            const depth = skinDepthAt(field, point);
            if (depth > deepest) {
              deepest = depth;
              where = `${((point.y - chestY) * 1000).toFixed(0)}mm below the chest`;
            }
          }
        });

        expect(measured, "there was a belt to measure").toBeGreaterThan(50);
        /**
         * A few millimetres of bedding in is how a belt is worn; eighty is
         * a belt inside a body. The figure this replaced was 79.5 on Shiva
         * and 78.2 on Vishnu, against 0.0 on Ganesha.
         */
        expect(
          deepest * 1000,
          `${BELT} reaches ${(deepest * 1000).toFixed(1)}mm inside at ${where}`,
        ).toBeLessThan(6);
      } finally {
        materials.dispose();
      }
    }, 180_000);
  },
);
