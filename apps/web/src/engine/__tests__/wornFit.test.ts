/**
 * A worn thing is held to what its asset says it is.
 *
 * THE ASYMMETRY THIS CLOSES. A HELD item has always been able to state
 * its physics: `GripFrame` carries the origin that lands on the socket,
 * the axis up the channel, the roll about it, how far a hand may travel
 * along it, the RADIUS it presents where a fist closes, and which hand
 * state it asks for. A WORN item could state a socket and one scalar gap
 * — and that gap, `clearanceM`, was read by nothing at all: four assets
 * declared it and no validator or generator ever consulted it.
 *
 * So every physical fact about a worn object lived in generator code,
 * was reinvented per generator, and could not be contradicted. Measured,
 * on the shipped product, in this order:
 *
 *   • the kamarbandh seventy-nine millimetres inside two human torsos and
 *     correct on the third, because the only way to find its socket was a
 *     table describing one body;
 *   • the vaijayanti hanging down Vishnu's back and inside his dhoti,
 *     because its route — over the shoulders, how far it falls, what it
 *     is worn over — was a list of waypoints nobody could check;
 *   • `ornaments.ts` recording, above the single line that gets limb
 *     bands right, that it is "the fourth time the same sentence has had
 *     to be written down about this codebase: an ornament that goes round
 *     something is sized by what CONTAINS it".
 *
 * WHY THE KINDS ARE SEPARATE. Because for two classes the usual rule is
 * exactly backwards. A bangle WANTS a wrist inside it, and the question
 * is whether the hole admits one. An earring is SUPPOSED to be inside an
 * earlobe — measured, eighty-eight flesh vertices are within this one —
 * and a containment check that reports it is reporting a correctly made
 * earring. A tilaka must have no clearance at all.
 *
 * AND THE RING MACHINERY FINALLY HAS A CUSTOMER. `fitAnnulus` recovers a
 * hole from a mesh's own triangles and `passesThroughVoid` asks whether a
 * limb goes through it; both have been correct and unused since they were
 * written, and the experiment's own notes say "today this capability has
 * no shipped customer". These are the first assets to ask it anything.
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
  BODY_REGIONS,
  listAssets,
  regionOf,
  validateWornFit,
  type WornFit,
} from "@devaform/asset-system";
import {
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, type CharacterRig } from "../rig";
import { ZoneMaterials } from "../materials";
import { checkWornFit, probeFor, surfaceOf } from "../spatial/wornFitCheck";

async function rigFor(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rig = buildRig(config, materials);
  poseRig(rig, config.pose);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

/** Every built node whose asset declares a fit, with that fit. */
function declared(rig: CharacterRig): Array<{ id: string; fit: WornFit; node: THREE.Object3D }> {
  const byId = new Map<string, WornFit>();
  for (const asset of listAssets({})) {
    if (asset.fit) byId.set(asset.id, asset.fit);
  }
  const found: Array<{ id: string; fit: WornFit; node: THREE.Object3D }> = [];
  rig.root.traverse((node) => {
    const id = node.name.replace(/^(part|attachment):/, "");
    if (id === node.name) return;
    const fit = byId.get(id);
    if (!fit) return;
    // A part can be built once per limb; each copy is its own placement.
    found.push({ id, fit, node });
  });
  return found;
}

describe("the fit a worn asset declares is a sentence that can be false", () => {
  it("every declared fit is internally coherent", () => {
    const withFit = listAssets({}).filter((asset) => asset.fit);
    expect(withFit.length, "some assets describe what they are").toBeGreaterThan(4);
    for (const asset of withFit) {
      expect(validateWornFit(asset.fit!), `${asset.id}`).toEqual([]);
      expect(
        (BODY_REGIONS as readonly string[]).includes(regionOf(asset.fit!)),
        `${asset.id} names a region the vocabulary has`,
      ).toBe(true);
    }
  });

  /**
   * And the vocabulary stays short.
   *
   * Each kind costs a question the validator has to answer differently,
   * so a fifth or sixth one is a decision rather than a convenience. This
   * fails when the list grows, which is the point.
   */
  it("there are five kinds of relationship, and no more", () => {
    const kinds = new Set(listAssets({}).flatMap((asset) => (asset.fit ? [asset.fit.kind] : [])));
    for (const kind of kinds) {
      expect(
        ["encircles", "restsOn", "drapes", "appliedTo", "piercedThrough"],
        `unrecognised fit kind "${kind}"`,
      ).toContain(kind);
    }
  });
});

describe.each([
  ["ganesha", createDefaultGaneshaConfiguration],
  ["shiva", createDefaultShivaConfiguration],
  ["vishnu", createDefaultVishnuConfiguration],
] as const)("%s: what is built matches what was declared", (_label, make) => {
  it("every declared fit is honoured by the geometry", async () => {
    const { rig, materials } = await rigFor(make());
    try {
      const pieces = declared(rig);
      expect(pieces.length, "this figure wears something that describes itself").toBeGreaterThan(0);

      const complaints: string[] = [];
      for (const piece of pieces) {
        /**
         * The region is probed where the ORNAMENT is, in the frame of
         * whatever it is parented to — the limb's own bone. Asking the
         * static skeleton instead is the mistake that put the rear
         * bangles two centimetres off the arm's line and nine degrees out
         * of square, and it is the same mistake that put the kamarbandh
         * inside the torso.
         */
        const holder = piece.node.parent ?? piece.node;
        holder.updateWorldMatrix(true, false);
        const probe = probeFor(rig.body, regionOf(piece.fit), holder.matrixWorld);
        const report = checkWornFit(piece.fit, surfaceOf(piece.node), probe);
        for (const complaint of report.complaints) {
          complaints.push(`${piece.id}: ${complaint}`);
        }
      }
      expect(complaints, complaints.join("; ")).toEqual([]);
    } finally {
      materials.dispose();
    }
  }, 180_000);
});
