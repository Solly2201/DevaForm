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
            const local = point.y - chestY;
            /**
             * Containment is the RADIAL question, and sound: the torso
             * surface is a star-shaped field about its own axis, so
             * "further from the axis than the skin is" is exactly
             * "outside the body".
             */
            const centreZ =
              (rig.body.surfaceAt(0, local).z + rig.body.surfaceAt(Math.PI, local).z) / 2;
            const bearing = Math.atan2(point.x, point.z - centreZ);
            const skin = rig.body.surfaceAt(bearing, local);
            const here = Math.hypot(point.x, point.z - centreZ);
            const there = Math.hypot(skin.x, skin.z - centreZ);
            measured += 1;
            if (there - here > deepest) {
              deepest = there - here;
              where = `${(local * 1000).toFixed(0)}mm up, ${((bearing * 180) / Math.PI).toFixed(0)}deg`;
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
