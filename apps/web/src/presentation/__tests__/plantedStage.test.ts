/**
 * The statue is planted; the stage is what moves.
 *
 * The Studio used to stand the figure in a photograph shown in screen
 * space. That is correct for exactly one camera position — the one the
 * photograph was taken from — so the painted floor kept the hero angle's
 * perspective while the base standing on it took the perspective of
 * wherever the customer had orbited to, and the figure read as sliding
 * across a picture. The fix is a coordinate-space one: the room is
 * GEOMETRY, anchored to the presentation's own pivot, and the camera
 * orbits. Nothing translates the character to fake a camera move.
 *
 * What a unit test can hold is the OWNERSHIP — that the character is a
 * pure function of its configuration and cannot be reached by anything
 * on the stage, and that the stage is closed in every direction so there
 * is nothing to rotate into. That the planting survives a real orbit in
 * a real browser is measured by scripts/qa-orbit.mjs, which reports the
 * root and the lowest point of the posed body at every azimuth.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(): void {}
  },
}));

import * as THREE from "three";
import {
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { DEITIES, PRESENTATIONS, getPresentation } from "@devaform/asset-system";
import { ZoneMaterials } from "@/engine/materials";
import { buildRig, poseRig } from "@/engine/rig";

/** Where the figure stands, and what its lowest point touches. */
function planted(config: CharacterConfiguration): { root: number[]; lowest: number } {
  const rig = buildRig(config, new ZoneMaterials());
  poseRig(rig);
  rig.root.updateWorldMatrix(true, true);
  const root = rig.joints.get("root")!.getWorldPosition(new THREE.Vector3());
  const box = new THREE.Box3();
  for (const mesh of rig.bodyMeshes) box.expandByObject(mesh);
  return {
    root: [root.x, root.y, root.z].map((n) => Number(n.toFixed(6))),
    lowest: Number((box.isEmpty() ? rig.baseTop : box.min.y).toFixed(6)),
  };
}

describe("the character is a function of its configuration and nothing else", () => {
  it.each([
    ["ganesha", createDefaultGaneshaConfiguration],
    ["shiva", createDefaultShivaConfiguration],
    ["vishnu", createDefaultVishnuConfiguration],
  ])("%s stands in the same place every time it is built", (_name, make) => {
    const first = planted(make());
    const again = planted(make());
    expect(again).toEqual(first);
  });

  it("is built without ever being shown a stage", () => {
    // The signature IS the guarantee: a function that cannot see the
    // camera cannot be moved by it. If a presentation argument ever
    // appears here, something on the stage has gained the ability to
    // translate the figure.
    expect(buildRig.length).toBe(2);
    const config = createDefaultVishnuConfiguration() as unknown as Record<string, unknown>;
    for (const presentationKey of ["camera", "environment", "backdrop", "pivot", "lighting"]) {
      expect(config[presentationKey], `a character carries no ${presentationKey}`).toBeUndefined();
    }
  });

  it("keeps the stage's own vocabulary out of the character's", () => {
    const stage = getPresentation("vishnu") as unknown as Record<string, unknown>;
    for (const characterKey of ["parts", "attachments", "morphs", "materials", "pose", "hands"]) {
      expect(stage[characterKey], `a stage carries no ${characterKey}`).toBeUndefined();
    }
  });
});

describe("the stage is a room, and a room is closed", () => {
  it.each(PRESENTATIONS.map((stage) => stage.id))("%s declares where it turns", (id) => {
    const stage = PRESENTATIONS.find((entry) => entry.id === id)!;
    expect(stage.pivot).toHaveLength(3);
    for (const axis of stage.pivot) expect(Number.isFinite(axis)).toBe(true);
  });

  it.each(PRESENTATIONS.filter((s) => s.environment).map((s) => s.id))(
    "%s has no direction that is void",
    (id) => {
      const environment = PRESENTATIONS.find((entry) => entry.id === id)!.environment!;
      // A wall at least as far out as the floor, and tall enough that the
      // orbit's own upper bound cannot see over it. Anything less is an
      // angle at which the customer rotates into black — which is what
      // the screen-space backdrop did, and what fading it past an azimuth
      // was an attempt to hide.
      expect(environment.wall.radius).toBeGreaterThanOrEqual(environment.floorRadius);
      expect(environment.wall.height).toBeGreaterThan(environment.columns.height);
      // The colonnade stands on the floor, inside the wall.
      expect(environment.columns.radius).toBeLessThan(environment.wall.radius);
      expect(environment.columns.radius).toBeLessThan(environment.floorRadius);
      // And the figure stands inside the colonnade, on its own circle.
      expect(environment.mandala.radius).toBeLessThan(environment.columns.radius);
      expect(environment.lamps.radius).toBeLessThan(environment.columns.radius);
      expect(environment.lamps.radius).toBeGreaterThan(environment.mandala.radius);
    },
  );

  it("gives every deity a room, and the same one unless it asks for another", () => {
    for (const deity of DEITIES) {
      const stage = getPresentation(deity.id);
      expect(stage.environment, `${deity.id} stands somewhere`).toBeDefined();
      expect(stage.pivot).toEqual([0, 0, 0]);
    }
  });

  it("orbits around the figure rather than beside it", () => {
    // The camera's target and the stage's pivot are the same point: the
    // difference between "the statue turns" and "the statue swings".
    for (const stage of PRESENTATIONS) {
      const [px, , pz] = stage.pivot;
      const [tx, , tz] = stage.camera.target;
      expect(Math.hypot(tx - px, tz - pz)).toBeLessThan(0.001);
    }
  });
});
