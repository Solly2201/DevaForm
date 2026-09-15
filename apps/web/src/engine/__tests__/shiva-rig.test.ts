/**
 * Shiva rig regression tests — the engine-level deity-agnostic proof:
 *
 * 1. The rig is built from Shiva's HUMANOID skeleton (no trunk joints or
 *    trunk sockets exist on it) purely from configuration data.
 * 2. Semantic attachments resolve: trishul/damaru mount inside hand item
 *    sockets, the crescent seats on the jata-refined head.moon socket, the
 *    third eye on the head-refined forehead socket.
 * 3. Grip coherence: switching a hand to a mudra that cannot perform the
 *    held attribute's grip releases the attribute (shared store logic).
 * 4. Ganesha regression: his default rig still builds with the trunk.
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
  HUMANOID_SKELETON,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  getPosePreset,
} from "@devaform/character-schema";
import { assertRigIntegrity, buildRig, poseRig } from "../rig";
import { ZoneMaterials } from "../materials";
import { resolveCharacterPresentation } from "@devaform/asset-system";
import { useEditorStore } from "@/state/editorStore";

function buildShivaRig(mutate?: (config: ReturnType<typeof createDefaultShivaConfiguration>) => void) {
  const config = createDefaultShivaConfiguration();
  mutate?.(config);
  const materials = new ZoneMaterials();
  const rig = buildRig(config, materials);
  poseRig(rig);
  rig.root.updateWorldMatrix(true, true);
  return { rig, config };
}

describe("shiva rig construction", () => {
  it("builds from the humanoid skeleton with no warnings", () => {
    const { rig } = buildShivaRig();
    expect(rig.warnings).toEqual([]);
    // The BODY is the anatomy: Shiva is built on the measured human mesh,
    // so the rig follows that skeleton rather than the deity's default.
    expect(rig.skeleton.id).toBe("human");
    assertRigIntegrity(rig);
  });

  it("has no trunk joints or trunk sockets", () => {
    const { rig } = buildShivaRig();
    expect(rig.joints.has("trunkBase")).toBe(false);
    expect(rig.joints.has("trunkTip")).toBe(false);
    expect(rig.sockets.has("trunk.tip")).toBe(false);
    // Ganesha regression: his rig keeps the trunk chain.
    const ganesha = createDefaultGaneshaConfiguration();
    ganesha.parts.head = { assetId: "ganesha.head.classic", version: 3 };
    ganesha.attachments = ganesha.attachments.filter((a) => a.socket !== "base.platform");
    const gRig = buildRig(ganesha, new ZoneMaterials());
    expect(gRig.joints.has("trunkTip")).toBe(true);
    expect(gRig.sockets.has("trunk.tip")).toBe(true);
    assertRigIntegrity(gRig);
  });

  it("renders real geometry for the jata", () => {
    const { rig } = buildShivaRig();
    // Only the jata: the head is not a part any more (the mesh body is one
    // continuous human, face and hands included) and the body itself is a
    // GLB the mocked loader never resolves here. Its geometry is checked
    // against the shipped file in humanBase.test.ts, which reads it.
    for (const prefix of ["part:shiva.jata"]) {
      const box = new THREE.Box3();
      let found = false;
      rig.root.traverse((o) => {
        if (o.name.startsWith(prefix)) {
          found = true;
          box.expandByObject(o);
        }
      });
      expect(found, prefix).toBe(true);
      expect(box.isEmpty(), prefix).toBe(false);
    }
  });
});

describe("shiva semantic attachments", () => {
  it("mounts trishul and damaru inside their hand item sockets", () => {
    const { rig } = buildShivaRig();
    for (const [socketId, assetId] of [
      ["arm.frontRight.hand.item", "shiva.attribute.trishul"],
      ["arm.frontLeft.hand.item", "shiva.attribute.damaru"],
    ] as const) {
      const socket = rig.sockets.get(socketId);
      expect(socket, socketId).toBeDefined();
      const mounted = socket?.children.find((c) => c.name === `attachment:${assetId}`);
      expect(mounted, `${assetId} in ${socketId}`).toBeDefined();
    }
  });

  it("keeps the trishul world-upright in every pose", () => {
    for (const presetId of ["shiva.standing", "shiva.tandava", "shiva.blessing"]) {
      expect(getPosePreset(presetId), presetId).toBeDefined();
      const { rig } = buildShivaRig((config) => {
        config.pose = { preset: presetId, jointOverrides: {} };
      });
      let trishul: THREE.Object3D | null = null;
      rig.root.traverse((o) => {
        if (o.name === "attachment:shiva.attribute.trishul") trishul = o;
      });
      expect(trishul, presetId).not.toBeNull();
      const worldQuat = new THREE.Quaternion();
      (trishul as unknown as THREE.Object3D).getWorldQuaternion(worldQuat);
      // Shaft (+Y) must still point straight up in world space.
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuat);
      expect(up.y, presetId).toBeGreaterThan(0.999);
    }
  });

  it("seats the crescent on the jata-refined moon socket", () => {
    const { rig } = buildShivaRig();
    const moon = rig.sockets.get("head.moon");
    expect(moon).toBeDefined();
    // The jata part refines the socket away from its schema default.
    const schemaDefault = HUMANOID_SKELETON.sockets.find((s) => s.id === "head.moon")!;
    expect(moon!.position.toArray()).not.toEqual([...schemaDefault.position]);
    const crescent = moon?.children.find(
      (c) => c.name === "attachment:shiva.crescent.chandra",
    );
    expect(crescent).toBeDefined();
  });

  it("seats the brow mark on the head-refined forehead socket", () => {
    // On the stylised head, which is the part that refines the socket
    // onto geometry it drew. The mesh body does the same through SOCKET_
    // nodes in its GLB — checked in humanBase.test.ts, which reads it.
    const { rig } = buildShivaRig((config) => {
      config.parts.head = { assetId: "shiva.head.classic", version: 1 };
    });
    const forehead = rig.sockets.get("head.forehead");
    const schemaDefault = HUMANOID_SKELETON.sockets.find((s) => s.id === "head.forehead")!;
    expect(forehead!.position.toArray()).not.toEqual([...schemaDefault.position]);
    const mark = forehead?.children.find(
      (c) => c.name === "attachment:shiva.forehead.trinetra",
    );
    expect(mark).toBeDefined();
  });

  it("wears the naga at the throat and the rudraksha below it", () => {
    // Two ornaments, two seats. The reference wears both, and one socket
    // holds one thing — so the mala has its own.
    const { rig } = buildShivaRig();
    const naga = rig.sockets
      .get("chest.necklace")
      ?.children.some((c) => c.name === "attachment:shiva.ornament.naga");
    const mala = rig.sockets
      .get("chest.mala")
      ?.children.some((c) => c.name === "attachment:shiva.mala.rudraksha");
    expect(naga, "naga at the collar").toBe(true);
    expect(mala, "rudraksha on the mala seat").toBe(true);
  });

  it("drapes the rudraksha mala in front of the measured chest", () => {
    const { rig } = buildShivaRig();
    let mala: THREE.Object3D | null = null;
    rig.root.traverse((o) => {
      if (o.name === "attachment:shiva.mala.rudraksha") mala = o;
    });
    expect(mala).not.toBeNull();
    const box = new THREE.Box3().setFromObject(mala as unknown as THREE.Object3D);
    expect(box.isEmpty()).toBe(false);
    // The strands must reach forward of the chest center (draped ON the
    // torso, not buried inside it).
    expect(box.max.z).toBeGreaterThan(0.05);
  });
});

describe("shiva grip coherence (store)", () => {
  it("keeps an attribute that can present itself another way", () => {
    const store = useEditorStore.getState();
    store.newCharacter(createDefaultShivaConfiguration());

    const held = () =>
      useEditorStore
        .getState()
        .config.attachments.find((a) => a.socket === "arm.frontRight.hand.item")?.asset.assetId;

    expect(held()).toBe("shiva.attribute.trishul");
    expect(useEditorStore.getState().config.hands.frontRight.mudra).toBe("grip");

    // A blessing hand cannot grip. The trishul is not thrown away for it:
    // it has a grounded presentation, so the configuration keeps it and
    // the resolver stands it beside the figure.
    useEditorStore.getState().setMudra("frontRight", "abhaya");
    expect(held()).toBe("shiva.attribute.trishul");
    const resolved = resolveCharacterPresentation(useEditorStore.getState().config);
    const trishul = resolved.attachments.find(
      (a) => a.asset.id === "shiva.attribute.trishul",
    );
    expect(trishul?.presentation.mode).toBe("grounded");
    expect(trishul?.handSlot).toBeUndefined();

    // Re-attaching auto-applies the hand state its preferred presentation
    // declares.
    useEditorStore.getState().setMudra("frontRight", "grip");
    useEditorStore.getState().setAttachment("arm.frontRight.hand.item", "shiva.attribute.trishul");
    expect(held()).toBe("shiva.attribute.trishul");
    expect(useEditorStore.getState().config.hands.frontRight.mudra).toBe("grip");
  });

  it("releases an attribute that has no other way to be present", () => {
    const store = useEditorStore.getState();
    store.newCharacter(createDefaultShivaConfiguration());
    const held = () =>
      useEditorStore
        .getState()
        .config.attachments.find((a) => a.socket === "arm.frontLeft.hand.item")?.asset.assetId;

    expect(held()).toBe("shiva.attribute.damaru");
    // A damaru can only be held. A gesture hand cannot hold it, and it
    // has nowhere else to be, so it leaves the configuration.
    useEditorStore.getState().setMudra("frontLeft", "varada");
    expect(held()).toBeUndefined();
  });
});
