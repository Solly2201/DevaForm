/**
 * What is worn over a garment is not pierced by it.
 *
 * THE DEFECTS, all at one waist and all measured. A belt was built to
 * clear `dhotiRadius - pelvisHalfWidth`: two measurements of the BODY
 * standing in for the thickness of a GARMENT, because nothing could ask a
 * garment anything. Fifty-four vertices of the dhoti's own waist wrap
 * came through the gold by up to seven millimetres — a roll of red cloth
 * lying across the belt — and seven of the sash's did the same.
 *
 * And the skirt itself was cut too narrow for the body inside it. On the
 * stylised figure the thigh masses hang outboard of the pelvis: ninety
 * millimetres to the joint plus a seventy-five millimetre sphere, where
 * the pelvis is a hundred and fifty-two. The skirt's waist was cut to the
 * pelvis plus twelve, so a single facet of the hip came through the cloth
 * and read as a thirty-millimetre patch of skin on a red skirt, in every
 * rear-quarter view, with nothing actually misplaced behind it.
 *
 * WHAT IS HELD HERE. Two rules, and both are about containment rather
 * than about any particular number:
 *
 *   1. A body's declared wrap radius CONTAINS the legs it is drawn
 *      around. That is what `dhotiRadius` promises in its own doc
 *      comment, and it was flush to the millimetre.
 *   2. Nothing worn over the lower garment has the garment inside it.
 *
 * Both are measured against the geometry that is drawn, in the pose the
 * figure ships in.
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
import { buildRig, poseRig, settleOnSupport, type CharacterRig } from "../rig";
import { ZoneMaterials } from "../materials";
import { deformedVertex } from "../skinning";
import { skinDepthAt, skinFieldOf } from "../spatial/skinDepth";

async function rigFor(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rig = buildRig(config, materials);
  poseRig(rig, config.pose);
  settleOnSupport(rig);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

function meshesOf(rig: CharacterRig, id: string): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  rig.root.traverse((node) => {
    if (node.name !== `attachment:${id}` && node.name !== `part:${id}`) return;
    node.traverse((mesh) => {
      if (mesh instanceof THREE.Mesh) found.push(mesh);
    });
  });
  return found;
}

/** How deep any vertex of `probe` gets inside the solid `surface` encloses. */
function deepestInside(probe: readonly THREE.Mesh[], surface: readonly THREE.Mesh[]): number {
  if (probe.length === 0 || surface.length === 0) return 0;
  const field = skinFieldOf(surface, 0.01);
  const point = new THREE.Vector3();
  let deepest = 0;
  for (const mesh of probe) {
    const position = mesh.geometry.getAttribute("position");
    if (!position) continue;
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < position.count; i += 1) {
      deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
      const depth = skinDepthAt(field, point, 0.06);
      if (depth > deepest) deepest = depth;
    }
  }
  return deepest;
}

describe.each([
  ["ganesha", createDefaultGaneshaConfiguration],
  ["shiva", createDefaultShivaConfiguration],
  ["vishnu", createDefaultVishnuConfiguration],
] as const)("%s", (_label, make) => {
  it("declares a wrap radius that contains the legs it is drawn around", async () => {
    const { rig, materials } = await rigFor(make());
    try {
      /**
       * The widest the figure's own legs and seat actually get, anywhere
       * between the waist seat and the knee — measured off the body that
       * is drawn, about the figure's own axis.
       */
      const pelvis = rig.joints.get("pelvis");
      expect(pelvis, "the figure has a pelvis").toBeTruthy();
      pelvis!.updateWorldMatrix(true, false);
      const pelvisWorld = new THREE.Vector3().setFromMatrixPosition(pelvis!.matrixWorld);
      const top = pelvisWorld.y + rig.body.waistSeatY;
      const bottom = top - 0.2;

      /**
       * The LEGS, and only the legs. Two other things are in this band
       * and neither is a skirt's business: a figure's hands, which reach
       * three hundred and sixty millimetres on Shiva, and — on a figure
       * built like this one — a belly that overhangs the tie. A dhoti is
       * knotted UNDER the belly and the belly hangs over it, which is how
       * it is worn and how the reference draws it.
       *
       * A vertex counts when the joint it is nearest to is part of a leg,
       * which works for a procedural body whose legs are their own meshes
       * and for a skinned one alike.
       */
      const jointOf = new Map<THREE.Object3D, string>();
      for (const [id, node] of rig.joints) jointOf.set(node, id);
      const legBones = new Set<string>();
      for (const [id] of rig.joints) if (id.startsWith("leg.")) legBones.add(id);

      const point = new THREE.Vector3();
      let widest = 0;
      for (const mesh of rig.bodyMeshes) {
        const position = mesh.geometry.getAttribute("position");
        if (!position) continue;
        mesh.updateWorldMatrix(true, false);

        // Which joint owns this mesh: a procedural body's legs are their
        // own objects under their own joints.
        let owner: THREE.Object3D | null = mesh;
        while (owner && !jointOf.has(owner)) owner = owner.parent;
        const ownedByALeg = owner ? legBones.has(jointOf.get(owner)!) : false;

        // A skinned body is one mesh, so the legs are a set of weights.
        const skinned = mesh as THREE.SkinnedMesh;
        const skinIndex = mesh.geometry.getAttribute("skinIndex");
        const skinWeight = mesh.geometry.getAttribute("skinWeight");
        const mine = new Set<number>();
        if (skinned.isSkinnedMesh && skinIndex && skinWeight) {
          skinned.skeleton.bones.forEach((bone, index) => {
            for (const id of legBones) if (bone.name === id || bone.name.endsWith(id)) mine.add(index);
          });
        }
        if (!ownedByALeg && mine.size === 0) continue;

        for (let i = 0; i < position.count; i += 1) {
          if (!ownedByALeg) {
            let weight = 0;
            for (let k = 0; k < 4; k += 1) {
              if (mine.has(skinIndex!.getComponent(i, k))) weight += skinWeight!.getComponent(i, k);
            }
            if (weight < 0.5) continue;
          }
          deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
          if (point.y < bottom || point.y > top) continue;
          rig.root.worldToLocal(point);
          widest = Math.max(widest, Math.hypot(point.x, point.z));
        }
      }
      expect(widest, "there are legs between the waist and the knee").toBeGreaterThan(0.05);
      /**
       * WITH AIR, and the amount is not arbitrary.
       *
       * Flush is not clear. Ganesha's legs reach 164.8 mm and the wrap
       * radius used to be 165.0 — two tenths of a millimetre, which the
       * naive form of this rule passes. Both surfaces are low-poly: the
       * skirt is sixteen segments round and the hip is a twenty-segment
       * sphere, so each is a polygon inscribed in its own circle. The
       * skirt's facets dip 3.2 mm inside its radius and the hip's bulge
       * to its own vertices, and where the two phases happen to meet, one
       * facet of hip stands through one facet of cloth. That is the patch
       * of skin a rear-quarter view showed on a red skirt.
       *
       * AS A FRACTION, because a sagitta scales with the radius it is
       * taken on. Three and a half percent is the two of them added at
       * these segment counts, and it is the same promise on a narrow
       * figure as on a broad one: a fixed six millimetres would be
       * generous on Ganesha and would fail Shiva's hide, which is a
       * finer mesh on a narrower body and has no such problem.
       *
       * If either piece gets smoother this can shrink, and the way to
       * find out is to lower it and see what appears.
       */
      const needed = widest * 0.035;
      expect(
        rig.body.dhotiRadius * 1000,
        `the declared wrap radius must clear legs that reach ${(widest * 1000).toFixed(1)}mm ` +
          `by at least ${(needed * 1000).toFixed(1)}mm, or a facet of one shows through a facet ` +
          `of the other`,
      ).toBeGreaterThan((widest + needed) * 1000);
    } finally {
      materials.dispose();
    }
  }, 300_000);

  it("has nothing of the lower garment inside what is worn over it", async () => {
    const { rig, materials } = await rigFor(make());
    try {
      const lower = rig.resolved;
      void lower;
      const cloth = [
        ...meshesOf(rig, "ganesha.garment.dhoti"),
        ...meshesOf(rig, "shiva.garment.tigerHide"),
        ...meshesOf(rig, "vishnu.garment.dhoti"),
      ];
      if (cloth.length === 0) return;
      const over: Array<[string, THREE.Mesh[]]> = [
        ["the belt", meshesOf(rig, "ganesha.waist.kamarband")],
        ["the sash", meshesOf(rig, "ganesha.garment.shawl")],
        ["the uttariya", meshesOf(rig, "shiva.garment.uttariya")],
      ];
      const complaints: string[] = [];
      for (const [name, worn] of over) {
        if (worn.length === 0) continue;
        const depth = deepestInside(cloth, worn) * 1000;
        // Cloth on cloth presses in a little and should: a sash lying
        // across a skirt is not a sash floating above one. Metal does
        // not, which is why the belt is held to the same small number
        // and passes it with nothing at all.
        if (depth > 5) {
          complaints.push(`the lower garment is ${depth.toFixed(1)}mm inside ${name}`);
        }
      }
      expect(complaints, complaints.join("; ")).toEqual([]);
    } finally {
      materials.dispose();
    }
  }, 600_000);
});
