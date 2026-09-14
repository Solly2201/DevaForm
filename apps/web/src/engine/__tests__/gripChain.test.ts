/**
 * The grip chain, end to end.
 *
 *   attribute grip frame  ->  hand item socket  ->  hand grip channel  ->  world
 *
 * Every link is relational. An asset says which of its own axes runs up
 * the shaft; the socket runs up the hand's grip channel, because the hand
 * geometry said where that is; the solver turns the arm so that channel
 * points where the presentation says the item must be presented. Nothing
 * in the chain is a world-space correction.
 *
 * It used to end differently: every upright item had its world rotation
 * overwritten to identity after posing, which made the declared grip frame
 * decorative. Worse, WHICH path an item took was decided by whether the
 * body happened to be a mesh — an implementation accident presented as a
 * rule. These tests exist to stop either returning, and to show the chain
 * is not shaped around one weapon: a planted staff held in a fist and a
 * small drum held in a pinch come out right from the same mechanism, on a
 * mesh body and on a procedural one alike.
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
  createDefaultShivaConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { GROUND_SOCKET, getAsset } from "@devaform/asset-system";
import { buildRig, gripFrameTransform, handGripChannel, poseRig } from "../rig";
import { ZoneMaterials } from "../materials";

function humanShiva(): CharacterConfiguration {
  const config = createDefaultShivaConfiguration();
  config.parts.body = { assetId: "humanoid.body.human", version: 1 };
  return config;
}

function posedRig(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  const rig = buildRig(config, materials);
  poseRig(rig);
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
  it.each([
    ["a measured mesh hand", humanShiva],
    ["a procedural hand", createDefaultShivaConfiguration],
  ])("aims each item socket across the palm — %s", (_name, makeConfig) => {
    const { rig, materials } = posedRig(makeConfig());
    for (const slot of rig.resolved.armSlots) {
      const channel = handGripChannel(rig, slot);
      // A fist's hole runs ACROSS the hand, from the little finger toward
      // the thumb — never down the fingers, which is where an unaimed
      // socket's +Y points and which is how a shaft came to lie across a
      // hand instead of passing through it.
      expect(Math.abs(channel.x), `${slot} channel is lateral`).toBeGreaterThan(0.6);
      expect(Math.abs(channel.y), `${slot} channel is not along the fingers`).toBeLessThan(0.4);
    }
    materials.dispose();
  });

  it.each([
    ["a measured mesh hand", humanShiva],
    ["a procedural hand", createDefaultShivaConfiguration],
  ])("is chiral: the two hands mirror each other — %s", (_name, makeConfig) => {
    const { rig, materials } = posedRig(makeConfig());
    const left = handGripChannel(rig, "frontLeft");
    const right = handGripChannel(rig, "frontRight");
    expect(left.x).toBeCloseTo(-right.x, 4);
    expect(left.y).toBeCloseTo(right.y, 4);
    expect(left.z).toBeCloseTo(right.z, 4);
    materials.dispose();
  });
});

describe("presentation is solved, not overridden", () => {
  it.each([
    ["a measured mesh hand", humanShiva],
    ["a procedural hand", createDefaultShivaConfiguration],
  ])("presents a held attribute upright by turning the hand — %s", (_name, makeConfig) => {
    const { rig, materials } = posedRig(makeConfig());
    // There is one mechanism, and every hand uses it. No item anywhere in
    // the rig has its world rotation overwritten.
    expect(rig.held.length).toBeGreaterThan(0);

    for (const id of ["shiva.attribute.trishul", "shiva.attribute.damaru"]) {
      const object = find(rig, `attachment:${id}`);
      expect(object, id).not.toBeNull();
      const axis = presentedAxis(object as THREE.Object3D);
      expect(axis.angleTo(new THREE.Vector3(0, 1, 0)), `${id} presented axis`).toBeLessThan(0.25);
    }
    materials.dispose();
  });

  it("is not shaped around one weapon", () => {
    // A planted staff gripped in a fist and a small drum held in a pinch
    // share no generator, no hand state and no presentation beyond being
    // upright — and both come out right from the same mechanism.
    const { rig, materials } = posedRig(humanShiva());
    const staff = find(rig, "attachment:shiva.attribute.trishul") as THREE.Object3D;
    const drum = find(rig, "attachment:shiva.attribute.damaru") as THREE.Object3D;
    expect(staff.parent).not.toBe(drum.parent);
    expect(presentedAxis(staff).angleTo(presentedAxis(drum))).toBeLessThan(0.3);
    // ...and only the one whose weight is on the ground is planted.
    expect(rig.planted.map((p) => p.object)).toEqual([staff]);
    materials.dispose();
  });

  it("plants a staff on the base whatever the pose does to the hand", () => {
    const base = posedRig(humanShiva());
    const raised = posedRig({
      ...humanShiva(),
      pose: { preset: "shiva.standingStaff", jointOverrides: {} },
    } as CharacterConfiguration);
    const buttOf = (r: ReturnType<typeof posedRig>) => {
      const staff = find(r.rig, "attachment:shiva.attribute.trishul") as THREE.Object3D;
      return new THREE.Box3().setFromObject(staff).min.y;
    };
    // Two very different arm poses, one ground.
    expect(buttOf(base)).toBeCloseTo(buttOf(raised), 2);
    base.materials.dispose();
    raised.materials.dispose();
  });

  it("keeps the weapon one length whatever the arm does", () => {
    // A trishul has a length. It used to be told how high the hand was
    // and build a shaft to reach the ground from there, so the same
    // trident was a quarter of a metre longer beside a raised arm.
    const lengths = ["shiva.standing", "shiva.standingStaff", "shiva.meditation"].map(
      (preset) => {
        const { rig, materials } = posedRig({
          ...humanShiva(),
          pose: { preset, jointOverrides: {} },
        } as CharacterConfiguration);
        const staff = find(rig, "attachment:shiva.attribute.trishul") as THREE.Object3D;
        const box = new THREE.Box3().setFromObject(staff);
        materials.dispose();
        return box.max.y - box.min.y;
      },
    );
    for (const length of lengths) expect(length).toBeCloseTo(lengths[0] as number, 5);
  });
});

describe("a hand grips the shaft, never the head", () => {
  const TRISHUL = "attachment:shiva.attribute.trishul";

  it("keeps the whole trident head above the fist, in every pose", () => {
    // The grip anchor is a point ON THE SHAFT, and a planted staff slides
    // through the fist as the arm moves — so "above the hand" has to hold
    // across the whole range of that slide, not just where it starts.
    for (const preset of [null, "shiva.standing", "shiva.standingStaff", "shiva.meditation"]) {
      const config = humanShiva();
      config.pose = { preset, jointOverrides: {} } as CharacterConfiguration["pose"];
      const { rig, materials } = posedRig(config);
      const staff = find(rig, TRISHUL);
      expect(staff, `${preset}`).not.toBeNull();
      const socket = (staff as THREE.Object3D).parent as THREE.Object3D;
      const handY = socket.getWorldPosition(new THREE.Vector3()).y;
      // The head's own geometry: everything above the shaft's top.
      const head = (staff as THREE.Object3D).children.find((child) => child.type === "Group");
      expect(head, "trident head group").toBeDefined();
      const headBottom = new THREE.Box3().setFromObject(head as THREE.Object3D).min.y;
      expect(headBottom, `${preset}: head above the fist`).toBeGreaterThan(handY + 0.05);
      materials.dispose();
    }
  });

  it("never slides the hand further than the asset says there is shaft", () => {
    const config = humanShiva();
    config.pose = { preset: "shiva.standingStaff", jointOverrides: {} } as CharacterConfiguration["pose"];
    const { rig, materials } = posedRig(config);
    const planted = rig.planted[0]!;
    expect(planted.travel.up).toBeLessThan(Number.POSITIVE_INFINITY);
    // The asset declares its travel; the slide is bounded by it.
    const slide = planted.object.position.clone().sub(planted.rest).length();
    expect(slide).toBeLessThanOrEqual(Math.max(planted.travel.up, planted.travel.down) + 1e-6);
    materials.dispose();
  });

  it("declares a travel its own geometry honours", () => {
    // The manifest says how far a fist may slide; the generator builds
    // the trident above exactly that. Neither may drift.
    const asset = getAsset("shiva.attribute.trishul")!;
    const held = asset.presentations!.find((p) => p.mode === "handheld")!;
    const { rig, materials } = posedRig(humanShiva());
    const staff = find(rig, "attachment:shiva.attribute.trishul") as THREE.Object3D;
    const head = staff.children.find((child) => child.type === "Group") as THREE.Object3D;
    // The head's base, in the item's own local frame.
    expect(head.position.y).toBeGreaterThan(held.grip!.travel!.up as number);
    materials.dispose();
  });
});

describe("a hand that is blessing is not also gripping", () => {
  it("stands what it held, if standing is something that item can do", () => {
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
    expect((staff as THREE.Object3D).parent).toBe(rig.sockets.get(GROUND_SOCKET));
    expect(presentedAxis(staff as THREE.Object3D).angleTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(
      1e-4,
    );
    // The same ground a held staff stands on: grounded means one ground.
    const held = posedRig(humanShiva());
    const heldButt = new THREE.Box3()
      .setFromObject(find(held.rig, "attachment:shiva.attribute.trishul") as THREE.Object3D)
      .min.y;
    held.materials.dispose();
    expect(new THREE.Box3().setFromObject(staff as THREE.Object3D).min.y).toBeCloseTo(heldButt, 3);
    // ...and clear of the body rather than through it.
    expect(Math.abs((staff as THREE.Object3D).position.x)).toBeGreaterThan(rig.body.dhotiRadius);

    // What needed a hand under it has nowhere to be, and says so.
    expect(find(rig, "attachment:shiva.attribute.damaru")).toBeNull();
    expect(rig.warnings.join(" ")).toContain("cannot hold it");
    materials.dispose();
  });

  it("leaves an ordinary pose holding everything", () => {
    const { rig, materials } = posedRig(humanShiva());
    expect(rig.warnings).toEqual([]);
    expect(find(rig, "attachment:shiva.attribute.damaru")).not.toBeNull();
    expect(find(rig, "attachment:shiva.attribute.trishul")!.parent).not.toBe(
      rig.sockets.get(GROUND_SOCKET),
    );
    materials.dispose();
  });
});

describe("a hand closes on what it is actually holding", () => {
  it("passes the item's declared thickness to the hand that builds itself", () => {
    // A procedural hand is rebuilt per mudra, so it can be built AROUND
    // the object. Without the radius it closes to one diameter whatever
    // it holds, which is why fingers met a drum head as readily as a
    // staff's shaft.
    const config = createDefaultShivaConfiguration();
    const { rig, materials } = posedRig(config);
    const trishul = rig.resolved.attachments.find(
      (a) => a.asset.id === "shiva.attribute.trishul",
    )!;
    const damaru = rig.resolved.attachments.find(
      (a) => a.asset.id === "shiva.attribute.damaru",
    )!;
    expect(trishul.presentation.grip?.radius).toBeGreaterThan(0);
    expect(damaru.presentation.grip?.radius).toBeGreaterThan(0);
    // They are different objects and must not get the same fist.
    expect(trishul.presentation.grip!.radius).not.toBeCloseTo(
      damaru.presentation.grip!.radius as number,
      4,
    );
    materials.dispose();
  });
});
