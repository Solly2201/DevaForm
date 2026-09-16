/**
 * A mark worn on a face sits ON the face.
 *
 * The third eye is a relief a few millimetres deep on a forehead that
 * slopes back about ten degrees, and for a long time it was neither on
 * nor off: built centred on the plane z = 0 with the socket pointing
 * straight ahead, half of it was inside the skull and what showed was a
 * slot cut into the brow. Both ornaments that go there carried their own
 * hand-guessed `rotation.x = -0.18` to work around it — two guesses about
 * a body that measures its own surface.
 *
 * So the body ships the forehead's normal, the rig turns the socket onto
 * it, and this holds the result to the two things that can go wrong: the
 * mark must not be inside the head, and it must not be floating off it.
 *
 * Measured RADIALLY from the head's own measured centre, which is honest
 * for a brow: the skull is convex there, so "further from the centre than
 * the skin is" and "outside the skin" are the same statement. It is not
 * honest anywhere concave, which is why this only looks at the forehead.
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

import { createDefaultShivaConfiguration } from "@devaform/character-schema";
import { getAsset } from "@devaform/asset-system";
import { buildRig, poseRig, rigMorphInfluences } from "../rig";
import { ZoneMaterials } from "../materials";
import { applyMorphInfluences, deformedVertex } from "../skinning";

const MARK = "shiva.forehead.trinetra";

/** Every morph the body offers, one at a time, plus what Shiva ships. */
function morphCases(): { name: string; morphs: Record<string, number> }[] {
  const body = getAsset("humanoid.body.human")!;
  const shape = (body.morphTargets ?? []).filter((target) => !/^(grip|cradle)/.test(target));
  return [
    { name: "default", morphs: createDefaultShivaConfiguration().morphs },
    { name: "none", morphs: {} },
    ...shape.map((target) => ({ name: target, morphs: { [target]: 1 } })),
  ];
}

describe("a mark worn on a face sits on it", () => {
  it.each(morphCases().map((c) => c.name))("%s", async (name) => {
    const config = {
      ...createDefaultShivaConfiguration(),
      morphs: morphCases().find((c) => c.name === name)!.morphs,
    };
    const materials = new ZoneMaterials();
    // Twice, with a turn of the event loop between: the body is a GLB and
    // the first build is the one that asks for it.
    buildRig(config, materials);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const rig = buildRig(config, materials);
    applyMorphInfluences(rig.root, rigMorphInfluences(rig, config.morphs));
    poseRig(rig);
    rig.root.updateWorldMatrix(true, true);

    const body = rig.bodyMeshes.find(
      (mesh) => (mesh as THREE.SkinnedMesh).isSkinnedMesh,
    ) as THREE.SkinnedMesh | undefined;
    expect(body, "the mesh body is loaded").toBeDefined();

    let mark: THREE.Object3D | undefined;
    rig.root.traverse((object) => {
      if (object.name === `attachment:${MARK}`) mark = object;
    });
    expect(mark, "the forehead mark is in the scene").toBeDefined();

    // The head's own centre, from the measurement the body ships, in the
    // head joint's space — not the joint, which is at the base of the
    // skull and behind it.
    const head = rig.joints.get("head")!;
    const measured = rig.bodyAsset?.bodyProfile?.base;
    expect(measured, "the body reports its own head").toBeDefined();
    const centre = new THREE.Vector3(0, measured!.headCenterY, measured!.headCenterZ);
    head.localToWorld(centre);

    // The skin of the brow, as points with their own outward directions.
    //
    // Judged against the NEAREST SKIN POINT, not against whichever skin
    // point happens to lie in the same direction from the head's centre.
    // The second is what a first version did and it is not a measurement
    // of anything: a mark vertex an inch from the brow ridge matches the
    // ridge's direction, the ridge sticks out further than the flat of
    // the forehead, and a mark lying correctly on the flat is reported as
    // five millimetres inside the skull. Which is exactly how a metric
    // that cannot be seen disagrees with a render that can.
    const skin: { at: THREE.Vector3; out: THREE.Vector3 }[] = [];
    const point = new THREE.Vector3();
    const positions = body!.geometry.attributes.position!;
    for (let v = 0; v < positions.count; v += 1) {
      deformedVertex(body!, v, point);
      body!.localToWorld(point);
      const offset = point.clone().sub(centre);
      const radius = offset.length();
      if (radius > measured!.headRadius * 1.9) continue;
      const out = offset.clone().divideScalar(radius);
      if (out.z < 0.25 || Math.abs(out.x) > 0.55) continue;
      skin.push({ at: point.clone(), out });
    }
    expect(skin.length, "forehead vertices found").toBeGreaterThan(40);

    let deepest = 0;
    let highest = 0;
    let where = "";
    mark!.updateWorldMatrix(true, true);
    mark!.traverse((object) => {
      const piece = object as THREE.Mesh;
      if (!piece.isMesh) return;
      const attribute = piece.geometry.getAttribute("position");
      for (let v = 0; v < attribute.count; v += 1) {
        point.fromBufferAttribute(attribute, v);
        piece.localToWorld(point);
        // Against a LOCAL PATCH of skin, not one vertex of it. The head
        // mesh's vertices are five to eight millimetres apart, so the
        // nearest one is usually off to the side, and on a curved surface
        // a sideways offset measured along that vertex's own outward
        // direction reads as depth. Eight of them, averaged, is a plane —
        // and a plane is what "on the skin" means.
        const near = skin
          .map((sample) => ({ sample, d: sample.at.distanceToSquared(point) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, 8)
          .map((entry) => entry.sample);
        const middle = new THREE.Vector3();
        const facing = new THREE.Vector3();
        for (const sample of near) {
          middle.add(sample.at);
          facing.add(sample.out);
        }
        middle.multiplyScalar(1 / near.length);
        facing.normalize();
        const proud = point.clone().sub(middle).dot(facing);
        if (proud < deepest) {
          where =
            `${piece.name || piece.geometry.type} at ` +
            `${point.toArray().map((n) => n.toFixed(3)).join(",")}`;
        }
        deepest = Math.min(deepest, proud);
        highest = Math.max(highest, proud);
      }
    });

    // Not inside the head.
    //
    // Three and a half millimetres of give, and the reason is worth
    // stating rather than rounding off: the socket is one point with one
    // normal, so everything worn on it lies on a PLANE, and a brow is not
    // one. The ash's inner ends run over the brow ridge, which stands a
    // couple of millimetres proud of that plane, and they sink by about
    // that much. Fixing it properly means a measured head surface —
    // bearing and height, as the torso already ships — that a face mark
    // could be projected onto vertex by vertex. Until there is one, this
    // is the honest bound: it passes what the plane can achieve, and it
    // still fails the thing it was written for, which was half a third
    // eye inside a skull.
    expect(deepest, `${name}: the mark reaches ${(-deepest * 1000).toFixed(1)} mm into the head — ${where}`)
      .toBeGreaterThan(-0.0035);
    // And not floating off it. A third eye is a relief, not a jewel on a
    // stalk: a centimetre proud of a forehead is a different object.
    expect(highest, `${name}: the mark stands ${(highest * 1000).toFixed(1)} mm off the brow`)
      .toBeLessThan(0.008);
    materials.dispose();
  });
});
