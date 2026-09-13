/**
 * Rig regression tests for the bugs fixed in the trunk/pose/feature pass:
 *
 * 1. taperedTube must produce outward-facing (positive signed volume)
 *    geometry — inverted winding made every tube (trunk, tusks, limbs)
 *    render see-through.
 * 2. The modular trunk must mount onto the trunk joint chain and drape
 *    forward of the torso instead of hanging inside it.
 * 3. integratedFeatures must suppress exactly the declared features —
 *    nothing more (the AI head keeps the modular trunk available).
 * 4. Statue-anchored sockets (base.platform) must ignore pose root offsets
 *    so companions stay on the base during seated/levitating poses.
 * 5. A hand releases its held item when the new mudra cannot perform the
 *    item's declared grip (no floating attributes).
 */
import { describe, expect, it, vi } from "vitest";

// GLTFLoader cannot fetch in Node; report every GLB as still loading so
// buildRig follows its normal "mesh not yet arrived" path.
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(): void {
      /* never resolves in tests */
    }
  },
}));
import * as THREE from "three";
import {
  POSE_PRESETS,
  SKELETON,
  createDefaultGaneshaConfiguration,
  getJoint,
  type CharacterConfiguration,
  type JointId,
} from "@devaform/character-schema";
import { taperedTube } from "../geometry";
import { buildRig } from "../rig";
import { applyPose } from "../pose";
import { ZoneMaterials } from "../materials";
import { deriveBodyProfile } from "../generators";
import { useEditorStore } from "@/state/editorStore";

function signedVolume(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const count = index ? index.count : pos.count;
  const at = (k: number) => (index ? index.getX(k) : k);
  let volume = 0;
  for (let i = 0; i + 2 < count; i += 3) {
    const a = at(i);
    const b = at(i + 1);
    const c = at(i + 2);
    volume +=
      (pos.getX(a) * (pos.getY(b) * pos.getZ(c) - pos.getZ(b) * pos.getY(c)) -
        pos.getY(a) * (pos.getX(b) * pos.getZ(c) - pos.getZ(b) * pos.getX(c)) +
        pos.getZ(a) * (pos.getX(b) * pos.getY(c) - pos.getY(b) * pos.getX(c))) /
      6;
  }
  return volume;
}

/** Procedural-only configuration (no GLB loads in Node). */
function proceduralConfig(): CharacterConfiguration {
  const config = createDefaultGaneshaConfiguration();
  config.parts.head = { assetId: "ganesha.head.classic", version: 3 };
  config.attachments = config.attachments.filter(
    (a) => a.socket !== "base.platform",
  );
  return config;
}

describe("taperedTube winding", () => {
  it("produces outward-facing triangles (positive signed volume)", () => {
    const straight = taperedTube(
      [
        [0, 0, 0],
        [0, -0.1, 0.02],
        [0, -0.2, 0.05],
      ],
      [0.05, 0.02],
    );
    expect(signedVolume(straight)).toBeGreaterThan(0);

    const curled = taperedTube(
      [
        [0, 0, 0],
        [0.02, -0.08, 0.03],
        [0.06, -0.14, 0.02],
        [0.09, -0.12, 0.01],
      ],
      (t) => 0.04 * (1 - 0.6 * t) * (1 + 0.02 * Math.sin(t * 20)),
    );
    expect(signedVolume(curled)).toBeGreaterThan(0);
  });
});

describe("modular trunk mounting", () => {
  it("mounts trunk geometry on all three trunk joints and drapes in front of the torso", () => {
    const materials = new ZoneMaterials();
    const rig = buildRig(proceduralConfig(), materials);
    applyPose(rig.joints, { preset: "standing", jointOverrides: {} });
    rig.root.updateWorldMatrix(true, true);

    for (const jointId of ["trunkBase", "trunkMid", "trunkTip"] as JointId[]) {
      const joint = rig.joints.get(jointId);
      expect(joint, jointId).toBeDefined();
      let meshCount = 0;
      joint?.children.forEach((child) => {
        if (child.name.startsWith("part:ganesha.trunk")) {
          child.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) meshCount += 1;
          });
        }
      });
      expect(meshCount, `trunk meshes on ${jointId}`).toBeGreaterThan(0);
    }

    // The tip segment must reach forward of the belly front (~z 0.21) so
    // the trunk drapes over the torso instead of hanging inside it.
    const tip = rig.joints.get("trunkTip");
    const box = new THREE.Box3();
    tip?.children.forEach((child) => {
      if (child.name.startsWith("part:ganesha.trunk")) box.expandByObject(child);
    });
    expect(box.max.z).toBeGreaterThan(0.2);
    expect(rig.warnings).toEqual([]);
    materials.dispose();
  });
});

describe("integratedFeatures suppression", () => {
  it("suppresses exactly the declared features of the AI head", () => {
    const materials = new ZoneMaterials();
    const config = proceduralConfig();
    config.parts.head = { assetId: "ganesha.head.aidraft", version: 2 };
    const rig = buildRig(config, materials);

    const mountedParts = new Set<string>();
    rig.root.traverse((o) => {
      if (o.name.startsWith("part:")) mountedParts.add(o.name);
    });
    const has = (fragment: string) =>
      [...mountedParts].some((name) => name.includes(fragment));

    // Declared integrated: eyes, ears, tusks, crown — suppressed.
    expect(has("ganesha.eyes")).toBe(false);
    expect(has("ganesha.ears")).toBe(false);
    expect(has("ganesha.tusks")).toBe(false);
    let crownMounted = false;
    rig.root.traverse((o) => {
      if (o.name.startsWith("attachment:ganesha.crown")) crownMounted = true;
    });
    expect(crownMounted).toBe(false);

    // NOT declared integrated: the modular trunk stays available.
    expect(has("ganesha.trunk")).toBe(true);
    materials.dispose();
  });
});

describe("statue-anchored sockets", () => {
  it("keeps base.platform on the base through seated/levitating root offsets", () => {
    const materials = new ZoneMaterials();
    const rig = buildRig(proceduralConfig(), materials);
    const socket = rig.sockets.get("base.platform");
    expect(socket).toBeDefined();

    const worldY = (o: THREE.Object3D) => {
      rig.root.updateWorldMatrix(true, true);
      return o.getWorldPosition(new THREE.Vector3()).y;
    };
    applyPose(rig.joints, { preset: "standing", jointOverrides: {} });
    const standingY = worldY(socket!);
    applyPose(rig.joints, { preset: "meditation", jointOverrides: {} });
    const meditationY = worldY(socket!);
    expect(meditationY).toBeCloseTo(standingY, 5);
    materials.dispose();
  });
});

describe("pose presets", () => {
  it("stay within the skeleton's joint limits", () => {
    for (const preset of POSE_PRESETS) {
      for (const [jointId, rotation] of Object.entries(preset.joints)) {
        const def = getJoint(jointId as JointId);
        const axes = ["x", "y", "z"] as const;
        axes.forEach((axis, i) => {
          const range = def.limits?.[axis];
          if (!range || !rotation) return;
          expect(
            rotation[i],
            `${preset.id}.${jointId}.${axis}`,
          ).toBeGreaterThanOrEqual(range[0] - 1e-6);
          expect(rotation[i], `${preset.id}.${jointId}.${axis}`).toBeLessThanOrEqual(
            range[1] + 1e-6,
          );
        });
      }
    }
  });

  it("skeleton trunk chain sweeps forward for body clearance", () => {
    const base = SKELETON.find((j) => j.id === "trunkBase")!;
    const mid = SKELETON.find((j) => j.id === "trunkMid")!;
    const tip = SKELETON.find((j) => j.id === "trunkTip")!;
    expect(base.position[2]).toBeGreaterThan(0.08);
    expect(mid.position[2]).toBeGreaterThan(0.03);
    expect(tip.position[2]).toBeGreaterThan(0.03);
  });
});

describe("body-fit attachment system", () => {
  const proportions = { height: 1, bulk: 1 };

  it("derives distinct torso measurements per body variant", () => {
    const slender = deriveBodyProfile({ belly: 0.45 }, proportions);
    const classic = deriveBodyProfile({ belly: 1 }, proportions);
    const mahodara = deriveBodyProfile({ belly: 1.35 }, proportions);
    expect(slender.bellyFrontZ).toBeLessThan(classic.bellyFrontZ);
    expect(classic.bellyFrontZ).toBeLessThan(mahodara.bellyFrontZ);
    // Chest surface queries stay on the front of the volume.
    expect(classic.chestSurfaceZAt(0, 0.045)).toBeGreaterThan(0.1);
    expect(classic.torsoBackZAt(0, 0.045)).toBeLessThan(-0.1);
  });

  it("drapes the trunk against the configured body's belly", () => {
    const materials = new ZoneMaterials();
    const tipFrontZ = (bodyId: string, version: number) => {
      const config = proceduralConfig();
      config.parts.body = { assetId: bodyId, version };
      const rig = buildRig(config, materials);
      applyPose(rig.joints, { preset: "standing", jointOverrides: {} });
      rig.root.updateWorldMatrix(true, true);
      const box = new THREE.Box3();
      rig.joints.get("trunkTip")?.children.forEach((child) => {
        if (child.name.startsWith("part:ganesha.trunk")) box.expandByObject(child);
      });
      return box.max.z;
    };
    const slender = tipFrontZ("ganesha.body.slender", 2);
    const classic = tipFrontZ("ganesha.body.classic", 2);
    const mahodara = tipFrontZ("ganesha.body.mahodara", 1);
    // Clearance-only: a deeper belly pushes the drape outward…
    expect(mahodara - classic).toBeGreaterThan(0.012);
    // …but a slimmer body never pulls the authored curve inward.
    expect(slender).toBeCloseTo(classic, 3);
    materials.dispose();
  });

  it("refines trunk.tip onto the generated trunk tip, mirrored per curl", () => {
    const materials = new ZoneMaterials();
    const socketLocal = (trunkId: string) => {
      const config = proceduralConfig();
      config.parts.trunk = { assetId: trunkId, version: 1 };
      const rig = buildRig(config, materials);
      const socket = rig.sockets.get("trunk.tip")!;
      return socket.position.clone();
    };
    const left = socketLocal("ganesha.trunk.leftCurl");
    const right = socketLocal("ganesha.trunk.rightCurl");
    // The refined socket sits out at the curl (not the static schema spot)
    expect(left.x).toBeGreaterThan(0.05);
    expect(right.x).toBeLessThan(-0.05);
    expect(left.z).toBeGreaterThan(0.03);
    materials.dispose();
  });

  it("keeps a trunk-tip attachment on the refined socket", () => {
    const materials = new ZoneMaterials();
    const config = proceduralConfig();
    config.attachments = [
      ...config.attachments,
      { socket: "trunk.tip", asset: { assetId: "ganesha.item.modak", version: 2 } },
    ];
    const rig = buildRig(config, materials);
    rig.root.updateWorldMatrix(true, true);
    const socket = rig.sockets.get("trunk.tip")!;
    let attachment: THREE.Object3D | null = null;
    socket.traverse((o) => {
      if (o.name.startsWith("attachment:ganesha.item.modak")) attachment = o;
    });
    expect(attachment).not.toBeNull();
    const socketWorld = socket.getWorldPosition(new THREE.Vector3());
    const itemWorld = (attachment as unknown as THREE.Object3D).getWorldPosition(
      new THREE.Vector3(),
    );
    // Held offering stays within grip range of its socket, not floating.
    expect(itemWorld.distanceTo(socketWorld)).toBeLessThan(0.06);
    materials.dispose();
  });
});

describe("relational attachment invariants", () => {
  it("keeps trunk variants distinct: long visibly longer than short", () => {
    const materials = new ZoneMaterials();
    const tipLowY = (trunkId: string) => {
      const config = proceduralConfig();
      config.parts.trunk = { assetId: trunkId, version: 1 };
      const rig = buildRig(config, materials);
      applyPose(rig.joints, { preset: "standing", jointOverrides: {} });
      rig.root.updateWorldMatrix(true, true);
      const box = new THREE.Box3();
      rig.joints.get("trunkTip")?.children.forEach((child) => {
        if (child.name.startsWith("part:ganesha.trunk")) box.expandByObject(child);
      });
      return box.min.y;
    };
    const long = tipLowY("ganesha.trunk.long");
    const short = tipLowY("ganesha.trunk.short");
    expect(short - long).toBeGreaterThan(0.08);
    materials.dispose();
  });

  it("aligns a held item's grip origin with the hand's refined grip socket", () => {
    const materials = new ZoneMaterials();
    const config = proceduralConfig();
    config.hands.frontLeft = { mudra: "grip" };
    config.attachments = config.attachments
      .filter((a) => a.socket !== "arm.frontLeft.hand.item")
      .concat([
        {
          socket: "arm.frontLeft.hand.item",
          asset: { assetId: "ganesha.item.axe", version: 2 },
        },
      ]);
    const rig = buildRig(config, materials);
    applyPose(rig.joints, { preset: "standing", jointOverrides: {} });
    rig.root.updateWorldMatrix(true, true);
    const socket = rig.sockets.get("arm.frontLeft.hand.item")!;
    // Hands part refined the socket to the fist's grip point.
    expect(socket.position.y).toBeCloseTo(-0.052, 3);
    let item: THREE.Object3D | null = null;
    socket.traverse((o) => {
      if (o.name.startsWith("attachment:ganesha.item.axe")) item = o;
    });
    expect(item).not.toBeNull();
    const socketWorld = socket.getWorldPosition(new THREE.Vector3());
    const itemWorld = (item as unknown as THREE.Object3D).getWorldPosition(
      new THREE.Vector3(),
    );
    // Grip point (item origin) coincides with the grip socket.
    expect(itemWorld.distanceTo(socketWorld)).toBeLessThan(0.005);
    materials.dispose();
  });

  it("keeps bracelets on the forearm so hand poses cannot drag them through the palm", () => {
    const materials = new ZoneMaterials();
    const rig = buildRig(proceduralConfig(), materials);
    let onForearm = 0;
    let onHand = 0;
    rig.joints.forEach((joint, id) => {
      joint.children.forEach((child) => {
        if (!child.name.startsWith("part:ganesha.bracelets")) return;
        if (id.endsWith(".forearm")) onForearm += 1;
        if (id.endsWith(".hand")) onHand += 1;
      });
    });
    expect(onForearm).toBeGreaterThan(0);
    expect(onHand).toBe(0);
    materials.dispose();
  });

  it("keeps engine placement code free of asset-id conditionals", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(__dirname, "..");
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== "__tests__") scan(path);
        else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
          const src = readFileSync(path, "utf8");
          if (/\.(assetId|id)\s*===\s*["']/.test(src)) offenders.push(entry.name);
        }
      }
    };
    scan(root);
    expect(offenders).toEqual([]);
  });
});

describe("hand/attribute coherence", () => {
  it("releases a held item when the mudra can no longer grip it", () => {
    const heldInFrontLeft = () =>
      useEditorStore
        .getState()
        .config.attachments.find((a) => a.socket === "arm.frontLeft.hand.item")
        ?.asset.assetId;

    const store = useEditorStore.getState();
    store.newCharacter();
    store.setAttachment("arm.frontLeft.hand.item", "ganesha.item.axe");
    expect(useEditorStore.getState().config.hands.frontLeft.mudra).toBe("grip");
    expect(heldInFrontLeft()).toBe("ganesha.item.axe");

    // Compatible change: same grip → item stays.
    useEditorStore.getState().setMudra("frontLeft", "grip");
    expect(heldInFrontLeft()).toBe("ganesha.item.axe");

    // Incompatible change: abhaya cannot hold a shaft → item released.
    useEditorStore.getState().setMudra("frontLeft", "abhaya");
    expect(heldInFrontLeft()).toBeUndefined();
  });
});
