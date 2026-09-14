/**
 * The grip chain, end to end.
 *
 *   attribute grip frame  ->  hand item socket  ->  hand grip channel  ->  world
 *
 * Each link is relational. An asset says which of its own axes runs up the
 * shaft; the socket runs up the hand's grip channel; the solver turns the
 * arm so that channel points where the item must be presented. Nothing in
 * that chain is a world-space correction.
 *
 * It used to end differently: every upright item had its world rotation
 * overwritten to identity after posing, which made the declared grip frame
 * decorative — GripMetadata's own documentation said so. These tests exist
 * to stop that returning, and to show the chain is not shaped around one
 * weapon: a planted staff held in a fist and a small drum held in a pinch
 * come out right from the same mechanism, and an asset authored along any
 * axis at all is carried onto the channel by its declaration alone.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(): void {
      /* never resolves in tests */
    }
  },
}));
import * as THREE from "three";
import {
  HAND_THUMB_AXIS,
  createDefaultShivaConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { alignUprightAttachments, buildRig, gripFrameTransform } from "../rig";
import { applyGripOrientations, applyPose } from "../pose";
import { ZoneMaterials } from "../materials";

function humanShiva(): CharacterConfiguration {
  const config = createDefaultShivaConfiguration();
  config.parts.body = { assetId: "humanoid.body.human", version: 1 };
  return config;
}

function posedRig(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  const rig = buildRig(config, materials);
  applyPose(rig.joints, config.pose);
  applyGripOrientations(rig.joints, rig.held);
  alignUprightAttachments(rig);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

function find(rig: ReturnType<typeof buildRig>, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  rig.root.traverse((o) => {
    if (o.name === name) found = o;
  });
  return found;
}

/** Which way the item's own shaft points, in the world. */
function presentedAxis(object: THREE.Object3D): THREE.Vector3 {
  return new THREE.Vector3(0, 1, 0)
    .applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();
}

describe("the grip frame reaches the socket", () => {
  it("carries any authored axis onto the socket's channel", () => {
    // The whole point of a declared grip frame: an artist delivers a mesh
    // in whatever orientation suits the sculpt, and says which way is up
    // the shaft. Every one of these must land on the same channel.
    for (const axis of [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 1],
      [0, -1, 0],
      [0.577, 0.577, 0.577],
    ] as const) {
      const { quaternion } = gripFrameTransform({ axis });
      const landed = new THREE.Vector3(...axis).normalize().applyQuaternion(quaternion);
      expect(landed.angleTo(new THREE.Vector3(0, 1, 0)), `axis ${axis}`).toBeLessThan(1e-6);
    }
  });

  it("puts the declared grip origin exactly on the socket", () => {
    const { position, quaternion } = gripFrameTransform({
      origin: [0, 0.4, 0],
      axis: [0, 1, 0],
    });
    const gripPoint = new THREE.Vector3(0, 0.4, 0).applyQuaternion(quaternion).add(position);
    expect(gripPoint.length()).toBeLessThan(1e-6);
  });
});

describe("the socket runs up the hand's own channel", () => {
  it("aims each hand item socket along that hand's thumb", () => {
    const { rig, materials } = posedRig(humanShiva());
    for (const slot of rig.skeleton.armSlots) {
      const socket = rig.sockets.get(`arm.${slot}.hand.item`);
      expect(socket, slot).toBeDefined();

      // The socket's +Y, expressed in the hand's frame, is the channel.
      const channel = new THREE.Vector3(0, 1, 0).applyQuaternion(socket!.quaternion);
      const mirror = slot.endsWith("Left") ? -1 : 1;
      const thumb = new THREE.Vector3(
        HAND_THUMB_AXIS[0] * mirror,
        HAND_THUMB_AXIS[1],
        HAND_THUMB_AXIS[2],
      ).normalize();
      // The body measured its own thumbs, so the match is close but not
      // exact — a real hand's thumb is not on a cardinal axis.
      expect(channel.angleTo(thumb), `${slot} channel vs thumb`).toBeLessThan(0.8);
    }
    materials.dispose();
  });

  it("is chiral: the two hands' channels are mirror images", () => {
    const { rig, materials } = posedRig(humanShiva());
    const channelOf = (slot: "frontLeft" | "frontRight") =>
      new THREE.Vector3(0, 1, 0).applyQuaternion(rig.sockets.get(`arm.${slot}.hand.item`)!.quaternion);
    const left = channelOf("frontLeft");
    const right = channelOf("frontRight");
    expect(left.x).toBeCloseTo(-right.x, 4);
    expect(left.y).toBeCloseTo(right.y, 4);
    expect(left.z).toBeCloseTo(right.z, 4);
    materials.dispose();
  });
});

describe("presentation is solved, not overridden", () => {
  it("presents a held attribute upright with no world override", () => {
    const { rig, materials } = posedRig(humanShiva());
    // Nothing on this body needs its world rotation overwritten: every
    // hand here is a modelled hand the solver can aim.
    expect(rig.worldAlignedAttachments).toHaveLength(0);
    expect(rig.held.length).toBeGreaterThan(0);

    for (const id of ["shiva.attribute.trishul", "shiva.attribute.damaru"]) {
      const object = find(rig, `attachment:${id}`);
      expect(object, id).not.toBeNull();
      const axis = presentedAxis(object!);
      expect(axis.angleTo(new THREE.Vector3(0, 1, 0)), `${id} presented axis`).toBeLessThan(0.25);
    }
    materials.dispose();
  });

  it("is not shaped around one weapon", () => {
    // A planted staff gripped in a fist and a small drum held in a pinch
    // share no generator, no mudra and no presentation flags beyond
    // "upright" — and both come out right from the same mechanism.
    const { rig, materials } = posedRig(humanShiva());
    const staff = find(rig, "attachment:shiva.attribute.trishul")!;
    const drum = find(rig, "attachment:shiva.attribute.damaru")!;
    expect(staff.parent).not.toBe(drum.parent);
    expect(presentedAxis(staff).angleTo(presentedAxis(drum))).toBeLessThan(0.3);
    // ...and only the planted one is planted.
    expect(rig.groundedAttachments.map((g) => g.object)).toEqual([staff]);
    materials.dispose();
  });

  it("plants a staff on the base whatever the pose does to the hand", () => {
    const base = posedRig(humanShiva());
    const raised = posedRig({
      ...humanShiva(),
      pose: { preset: "blessing", jointOverrides: {} },
    } as CharacterConfiguration);
    const buttOf = (r: ReturnType<typeof posedRig>) => {
      const staff = find(r.rig, "attachment:shiva.attribute.trishul")!;
      return new THREE.Box3().setFromObject(staff).min.y;
    };
    // Two very different arm poses, one ground.
    expect(buttOf(base)).toBeCloseTo(buttOf(raised), 2);
    base.materials.dispose();
    raised.materials.dispose();
  });
});

describe("a hand that cannot be aimed still presents its item", () => {
  it("falls back to the world, and says so", () => {
    // Ganesha's hands are rebuilt per mudra with the grip channel baked
    // into geometry, so the wrist cannot be aimed without carrying the
    // fist off the axis its fingers closed around. Those items keep the
    // world override — recorded as a named fallback rather than applied
    // to everything, which is what used to make the frame decorative.
    const config = createDefaultShivaConfiguration(); // procedural body
    const { rig, materials } = posedRig(config);
    expect(rig.held).toHaveLength(0);
    expect(rig.worldAlignedAttachments.length).toBeGreaterThan(0);
    for (const object of rig.worldAlignedAttachments) {
      expect(presentedAxis(object).angleTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-4);
    }
    materials.dispose();
  });
});

describe("a hand grips the shaft, never the head", () => {
  const TRISHUL = "attachment:shiva.attribute.trishul";

  it("keeps the whole trident head above the fist, in every pose", () => {
    // The grip anchor is a point ON THE SHAFT, and a planted staff slides
    // through the fist as the arm moves — so "above the hand" has to hold
    // across the whole range of that slide, not just where it starts.
    for (const preset of [null, "shiva.standingStaff", "shiva.meditation"]) {
      const config = humanShiva();
      config.pose = { preset, jointOverrides: {} } as CharacterConfiguration["pose"];
      const { rig, materials } = posedRig(config);
      const staff = find(rig, TRISHUL);
      expect(staff, `${preset}`).not.toBeNull();
      const socket = staff!.parent!;
      const handY = socket.getWorldPosition(new THREE.Vector3()).y;
      // The head's own geometry: everything above the shaft's top.
      const head = staff!.children.find((child) => child.type === "Group");
      expect(head, "trident head group").toBeDefined();
      const headBottom = new THREE.Box3().setFromObject(head!).min.y;
      expect(headBottom, `${preset}: head above the fist`).toBeGreaterThan(handY + 0.05);
      materials.dispose();
    }
  });

  it("never slides the hand further than the asset says there is shaft", () => {
    const config = humanShiva();
    config.pose = { preset: "shiva.standingStaff", jointOverrides: {} } as CharacterConfiguration["pose"];
    const { rig, materials } = posedRig(config);
    const planted = rig.groundedAttachments[0]!;
    expect(planted.travel.up).toBeLessThan(Number.POSITIVE_INFINITY);
    // The asset declares its travel; the slide is bounded by it.
    const slide = planted.object.position.length();
    expect(slide).toBeLessThanOrEqual(Math.max(planted.travel.up, planted.travel.down) + 1e-6);
    materials.dispose();
  });
});

describe("a hand that is blessing is not also gripping", () => {
  it("releases what it held, and plants it if it stands", () => {
    const config = humanShiva();
    config.pose = { preset: "shiva.blessing", jointOverrides: {} } as CharacterConfiguration["pose"];
    const { rig, materials } = posedRig(config);

    // The pose says both front hands are gesturing; the configuration
    // still says they grip. The pose wins, and the rig agrees with the
    // wrist solver because both read the same resolved hands.
    expect(rig.hands.frontRight.mudra).toBe("abhaya");
    expect(rig.hands.frontLeft.mudra).toBe("varada");
    expect(rig.held).toHaveLength(0);

    // The staff was standing on the ground before the hand let go, so it
    // goes on standing — beside the figure, upright, butt on the base.
    const staff = find(rig, "attachment:shiva.attribute.trishul");
    expect(staff).not.toBeNull();
    expect(staff!.parent).toBe(rig.root);
    expect(presentedAxis(staff!).angleTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-4);
    // The same ground a held staff stands on: grounded means one ground.
    const held = posedRig(humanShiva());
    const heldButt = new THREE.Box3()
      .setFromObject(find(held.rig, "attachment:shiva.attribute.trishul")!)
      .min.y;
    held.materials.dispose();
    expect(new THREE.Box3().setFromObject(staff!).min.y).toBeCloseTo(heldButt, 3);
    // ...and clear of the body rather than through it.
    expect(Math.abs(staff!.position.x)).toBeGreaterThan(rig.body.dhotiRadius);

    // What needed a palm under it has nowhere to be, and says so.
    expect(find(rig, "attachment:shiva.attribute.damaru")).toBeNull();
    expect(rig.warnings.join(" ")).toContain("cannot hold it");
    materials.dispose();
  });

  it("leaves an ordinary pose holding everything", () => {
    const { rig, materials } = posedRig(humanShiva());
    expect(rig.warnings).toEqual([]);
    expect(find(rig, "attachment:shiva.attribute.damaru")).not.toBeNull();
    expect(find(rig, "attachment:shiva.attribute.trishul")!.parent).not.toBe(rig.root);
    materials.dispose();
  });
});
