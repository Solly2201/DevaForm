/**
 * Worn things sit ON the body.
 *
 * The references ask for this in so many words — "necklace/naga fits neck
 * surface", "kamarbandh follows waist surface", "proper fit (no
 * floating)", "no floating ornaments" — and until now the repository
 * could check none of it. What it had was `worstTorsoPenetration`, which
 * answers half the question for one asset at a time, and a habit of
 * discovering the other half in a screenshot.
 *
 * Measured, on the day this was written, every ornament in the product
 * was wrong in one of two ways:
 *
 *   ganesha.necklace.haram      112 mm INSIDE the chest
 *   ganesha.garment.shawl        72 mm through the shoulders
 *   ganesha.waist.kamarband      15 mm in at the sides, 40 mm off at the back
 *   shiva.mala.rudraksha          9 mm in
 *   vishnu + haram               41 mm in
 *
 * Each had a different cause and none of them was scale. The collar and
 * the sash were half-measured and half-TYPED — routes whose middles came
 * from the body and whose ends came from whoever had a figure on screen
 * that day. The belt was a circle stretched on one axis until its front
 * cleared a belly, which pushes its back out behind the spine by exactly
 * as much. The mala's beads were seated at nineteen twentieths of their
 * own radius.
 *
 * This is VALIDATION, which is where the spatial-occupancy experiment
 * left the boundary: it measures a placement the generators made and
 * never makes one. What it protects is that an ornament is expressed in
 * the body's own coordinates — because something that is, cannot end up
 * inside, and something that is not will eventually be put on a body
 * nobody checked it against.
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
  POSE_PRESETS,
  SHIVA_POSE_PRESETS,
  VISHNU_POSE_PRESETS,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  posedWith,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, type CharacterRig } from "../rig";
import { ZoneMaterials } from "../materials";
import { wearableFit, wearableSurface } from "../spatial/wearableFit";

/**
 * How far a worn thing may press into the skin, metres.
 *
 * Not zero. Jewellery rests ON flesh and a few millimetres of overlap is
 * how a collar sits rather than hovers; the figures this replaced were
 * fifteen to a hundred and twelve. Eight millimetres on a metre-tall
 * statue is a seat, and anything past it is a mistake somebody will see.
 */
const MAY_PRESS_M = 0.008;

/**
 * And how far it may stand off before it is not being worn.
 *
 * Generous, because this is one number over very different shapes: a
 * serpent's hood legitimately rears away from the neck it rings, and a
 * mala's lower loop hangs in the air below the sternum. What it catches
 * is an ornament that has come away from the figure ALTOGETHER, which is
 * what "no floating ornaments" is actually about.
 */
const MUST_TOUCH_M = 0.02;

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

const DEITIES = [
  {
    label: "ganesha",
    make: createDefaultGaneshaConfiguration,
    poses: POSE_PRESETS.map((preset) => preset.id),
  },
  {
    label: "shiva",
    make: createDefaultShivaConfiguration,
    poses: SHIVA_POSE_PRESETS.map((preset) => preset.id),
  },
  {
    label: "vishnu",
    make: createDefaultVishnuConfiguration,
    poses: VISHNU_POSE_PRESETS.map((preset) => preset.id),
  },
] as const;

describe("a worn ornament sits on the body", () => {
  let measured = 0;

  for (const deity of DEITIES) {
    for (const pose of deity.poses) {
      it(`${deity.label} · ${pose}`, async () => {
        const { rig, materials } = await rigFor(posedWith(deity.make(), pose));
        try {
          const chest = rig.joints.get("chest");
          expect(chest, "the body has a chest to measure against").toBeDefined();

          const complaints: string[] = [];
          for (const attachment of rig.resolved.attachments) {
            /**
             * What the figure WEARS, which the presentation already says.
             *
             * Held items are a hand's business and handCoexistence
             * measures those. A GROUNDED item is neither: a trishul
             * standing beside a seated Shiva is correctly two hundred
             * millimetres from his chest, and a rule about ornaments
             * touching the body has nothing to say about it.
             */
            if (attachment.presentation.mode !== "wearable") continue;
            const node = find(rig, `attachment:${attachment.asset.id}`);
            if (!node) continue;
            const fit = wearableFit(rig.body, wearableSurface(node, chest!));
            // Nothing in the band the torso model describes: a crown, a
            // forehead mark, an anklet. Not this test's business.
            if (fit.samples === 0) continue;
            measured += 1;

            if (fit.penetration > MAY_PRESS_M) {
              complaints.push(
                `${attachment.asset.id} reaches ${(fit.penetration * 1000).toFixed(1)} mm inside`,
              );
            }
            if (fit.contact > MUST_TOUCH_M) {
              complaints.push(
                `${attachment.asset.id} never comes closer than ${(fit.contact * 1000).toFixed(1)} mm`,
              );
            }
          }
          expect(complaints, complaints.join("; ")).toEqual([]);
        } finally {
          materials.dispose();
        }
      }, 90_000);
    }
  }

  /**
   * And the measurement reached something.
   *
   * Every number above is conditional on finding ornaments in the torso
   * band. A refactor that renamed a socket, or a profile that stopped
   * reporting a chest, would make this file pass by looking at nothing.
   */
  it("the measurement found ornaments to measure", () => {
    expect(measured).toBeGreaterThan(8);
  });
});
