/**
 * Two relationships that can only be checked by measuring them.
 *
 * Both of these were reported as "it looks wrong" and both turned out to
 * be arithmetic: a disc presented in the wrong plane, and a band sitting
 * two centimetres off the limb it is worn on. A screenshot could show
 * that something was wrong; only a measurement could say what, and only
 * a measurement can keep it fixed.
 *
 * The body's GLB cannot be fetched in Node, so these use the STYLISED
 * bodies, where the geometry is generated. What they pin is the chain —
 * asset frame, socket channel, facing, limb direction — which is shared.
 */
import { describe, expect, it, vi } from "vitest";

// The body's GLB cannot be fetched in Node. Nothing here is about its
// geometry: the ornaments are generated, their measurements come from the
// manifest, and the joints come from the skeleton the body NAMES.
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(): void {}
  },
}));

import * as THREE from "three";
import {
  ARM_SLOTS,
  createDefaultVishnuConfiguration,
  getJoint,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { getAsset } from "@devaform/asset-system";
import { ZoneMaterials } from "../materials";
import { buildRig, poseRig, type CharacterRig } from "../rig";

function built(config: CharacterConfiguration): CharacterRig {
  const rig = buildRig(config, new ZoneMaterials());
  poseRig(rig);
  rig.root.updateWorldMatrix(true, true);
  return rig;
}

function find(rig: CharacterRig, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  rig.root.traverse((node) => {
    if (node.name === name) found = node;
  });
  return found;
}

describe("a presented wheel faces the devotee", () => {
  /**
   * The chakra is authored in the XY plane so its face normal is its own
   * +Z; the presentation carries its +Y up the hand's channel and spends
   * the free spin about that channel until the +Z looks out of the
   * statue. Three separate statements, and if any of them drifts the
   * disc is edge-on from the front — which is the difference between a
   * murti showing its wheel and a plate stuck to a hand.
   */
  it("stands vertical with its face out of the statue's front", () => {
    const rig = built(createDefaultVishnuConfiguration());
    const disc = find(rig, "attachment:vishnu.attribute.chakra");
    expect(disc, "the chakra is in the rig").not.toBeNull();
    disc!.updateWorldMatrix(true, false);

    const basis = new THREE.Matrix4().extractRotation(disc!.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).applyMatrix4(basis).normalize();
    const face = new THREE.Vector3(0, 0, 1).applyMatrix4(basis).normalize();

    // Vertical: the disc's own up runs up the world.
    expect(up.dot(new THREE.Vector3(0, 1, 0))).toBeGreaterThan(0.999);
    // Facing: its normal looks out the front, and is horizontal.
    expect(face.dot(new THREE.Vector3(0, 0, 1))).toBeGreaterThan(0.999);
    expect(Math.abs(face.y)).toBeLessThan(0.01);
  });

  it("is a disc in that plane, not a plate in another", () => {
    const rig = built(createDefaultVishnuConfiguration());
    const disc = find(rig, "attachment:vishnu.attribute.chakra")!;
    const box = new THREE.Box3().setFromObject(disc);
    const size = box.getSize(new THREE.Vector3());
    // Thin along the world Z — which is what "its face points at you"
    // means, measured rather than asserted.
    expect(size.z).toBeLessThan(size.x * 0.5);
    expect(size.z).toBeLessThan(size.y * 0.5);
    // And round in the plane it lies in.
    expect(Math.abs(size.x - size.y)).toBeLessThan(size.x * 0.12);
  });

  it("rests on the hand rather than in it", () => {
    const rig = built(createDefaultVishnuConfiguration());
    const disc = find(rig, "attachment:vishnu.attribute.chakra")!;
    const hand = rig.joints.get("arm.backRight.hand");
    expect(hand).toBeDefined();
    const box = new THREE.Box3().setFromObject(disc);
    const wrist = hand!.getWorldPosition(new THREE.Vector3());
    // Every part of the disc is above the wrist: a hand that closed on
    // it would be a hand with fingers through the blade.
    expect(box.min.y).toBeGreaterThan(wrist.y);
  });
});

describe("a band is worn on the limb, not through it", () => {
  /**
   * Two ways this goes wrong, and both did.
   *
   * A torus's major radius is the centre line of its tube, so a ring
   * built AT the limb's measured radius has half its thickness inside
   * the flesh. And a generator that asks the STYLISED joint table for
   * the limb's direction gets the right answer for the front arms and a
   * nine-degree error for the back ones — which put every rear band two
   * centimetres off the arm's own line, out of square, half buried.
   */
  const bandParts = ["part:ganesha.armlets.vanki", "part:ganesha.bracelets.kada"];

  it("sits square on the limb's own line, on every arm the body has", () => {
    const rig = built(createDefaultVishnuConfiguration());
    const rings: Array<{ joint: string; align: number; off: number }> = [];
    rig.root.traverse((node) => {
      if (!bandParts.includes(node.name)) return;
      const jointName = String(node.parent?.name ?? "").replace(/^joint:/, "");
      const joint = rig.joints.get(jointName as never);
      const childName = jointName.endsWith(".upper")
        ? jointName.replace(".upper", ".forearm")
        : jointName.replace(".forearm", ".hand");
      const child = rig.joints.get(childName as never);
      if (!joint || !child) return;
      node.updateWorldMatrix(true, false);
      const limb = child
        .getWorldPosition(new THREE.Vector3())
        .sub(joint.getWorldPosition(new THREE.Vector3()))
        .normalize();
      // The band's own axis is the group's +Y, which seatBand aimed.
      const axis = new THREE.Vector3(0, 1, 0)
        .applyMatrix4(new THREE.Matrix4().extractRotation(node.matrixWorld))
        .normalize();
      const centre = node.getWorldPosition(new THREE.Vector3());
      const from = joint.getWorldPosition(new THREE.Vector3());
      const offset = centre.clone().sub(from);
      const off = offset.clone().addScaledVector(limb, -offset.dot(limb)).length();
      rings.push({ joint: jointName, align: Math.abs(axis.dot(limb)), off });
    });

    expect(rings.length, "bands were found on the arms").toBeGreaterThanOrEqual(
      ARM_SLOTS.length,
    );
    for (const ring of rings) {
      expect(ring.align, `${ring.joint} band is square to the limb`).toBeGreaterThan(0.999);
      expect(ring.off, `${ring.joint} band is centred on the limb`).toBeLessThan(0.001);
    }
  });

  it("clears the skin it is worn on", () => {
    // The ornament declares its own inner radius through the measured
    // limb radius; what this pins is that the ring is sized from the
    // INSIDE, so the metal starts outside the flesh rather than at its
    // centre line.
    const body = getAsset("humanoid.body.human4");
    const profile = body?.bodyProfile?.base;
    expect(profile, "the four-armed body ships its measurements").toBeDefined();

    const rig = built(createDefaultVishnuConfiguration());
    for (const [part, limbRadius] of [
      ["part:ganesha.armlets.vanki", profile!.armBandRadius],
      ["part:ganesha.bracelets.kada", profile!.wristBandRadius],
    ] as const) {
      let checked = 0;
      rig.root.traverse((node) => {
        if (node.name !== part) return;
        const box = new THREE.Box3().setFromObject(node);
        const size = box.getSize(new THREE.Vector3());
        // The band's widest measure across is its outer diameter, and it
        // must be bigger than the limb it goes round.
        const across = Math.max(size.x, size.y, size.z);
        expect(across / 2, `${part} clears a ${limbRadius} m limb`).toBeGreaterThan(limbRadius);
        // …and not absurdly so: a band is jewellery, not a hoop.
        // The gem stud is in the bounds too, so this is a sanity bound
        // rather than a fit: a band, not a hoop hung on a shoulder.
        expect(across / 2).toBeLessThan(limbRadius * 1.9);
        checked += 1;
      });
      expect(checked, `${part} is worn somewhere`).toBeGreaterThan(0);
    }
  });

  it("asks the body's own skeleton for the limb, not the stylised table", () => {
    // The mesh body's back arms are its front arms MOVED; the stylised
    // rig's are mirrored. They disagree by nine degrees, and a generator
    // that reads the global table cannot know which body it is dressing.
    const four = getAsset("humanoid.body.human4");
    expect(four?.skeleton).toBe("human4");
    const stylised = getJoint("arm.backLeft.forearm").position;
    const measured = (four as { backArmRest?: Record<string, readonly number[]> })
      .backArmRest?.["arm.backLeft.forearm"];
    if (!measured) return; // older asset: nothing to disagree about
    const a = new THREE.Vector3(...stylised).normalize();
    const b = new THREE.Vector3(...(measured as [number, number, number])).normalize();
    expect(
      a.dot(b),
      "the two tables really do disagree — which is why the context carries one",
    ).toBeLessThan(0.999);
  });
});
