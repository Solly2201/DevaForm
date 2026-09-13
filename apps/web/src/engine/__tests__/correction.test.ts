/**
 * Regression tests for the visual/attachment correction pass:
 *
 * 1. Gesture mudras articulate the whole arm: Abhaya genuinely raises the
 *    hand, Varada lowers it — materially different joint chains, on any
 *    deity, through generic pose semantics.
 * 2. Earrings originate at the ear sockets their owner part refined —
 *    for Ganesha (ears part) and Shiva (head part) alike.
 * 3. The naga torque wraps the MEASURED neck radius (BodyProfile), so its
 *    coil tracks body proportions instead of one hardcoded neck.
 * 4. The kamarband wraps the dressed waist (hips/belly/garment), never
 *    disappearing inside the dhoti.
 * 5. Generic engine modules contain no deity string literals.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(): void {
      /* never resolves in tests */
    }
  },
}));
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import {
  HAND_FINGER_AXIS,
  HAND_PALM_AXIS,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  mudraArmRotations,
  type CharacterConfiguration,
  type MudraId,
} from "@devaform/character-schema";
import { buildRig } from "../rig";
import { applyGestureOrientations, applyPose } from "../pose";
import { loft } from "../geometry";
import { ZoneMaterials } from "../materials";
import { deriveBodyProfile } from "../generators";
import { useEditorStore } from "@/state/editorStore";

function worldOf(config: CharacterConfiguration, pick: (rig: ReturnType<typeof buildRig>) => THREE.Object3D | undefined) {
  const rig = buildRig(config, new ZoneMaterials());
  applyPose(rig.joints, config.pose);
  rig.root.updateWorldMatrix(true, true);
  const object = pick(rig);
  if (!object) return null;
  return object.getWorldPosition(new THREE.Vector3());
}

function bboxOf(config: CharacterConfiguration, name: string): THREE.Box3 | null {
  const rig = buildRig(config, new ZoneMaterials());
  applyPose(rig.joints, config.pose);
  rig.root.updateWorldMatrix(true, true);
  let target: THREE.Object3D | null = null;
  rig.root.traverse((o) => {
    if (o.name === name) target = o;
  });
  if (!target) return null;
  return new THREE.Box3().setFromObject(target);
}

describe("gesture mudra arm semantics", () => {
  /**
   * Build Ganesha with one gesture selected and report what the devotee
   * would actually see: where the hand is, which way the palm faces, and
   * which way the fingers point — measured off the posed rig.
   */
  const gesture = (mudra: MudraId, preset = "standing", { presetLast = false } = {}) => {
    const store = useEditorStore.getState();
    store.newCharacter(createDefaultGaneshaConfiguration());
    if (presetLast) {
      // Choosing a pose clears joint overrides, so the arm comes from the
      // preset while the mudra stays selected — the fallback path.
      useEditorStore.getState().setMudra("frontRight", mudra);
      useEditorStore.getState().setPosePreset(preset);
    } else {
      useEditorStore.getState().setPosePreset(preset);
      useEditorStore.getState().setMudra("frontRight", mudra);
    }
    const config = useEditorStore.getState().config;
    const rig = buildRig(config, new ZoneMaterials());
    applyPose(rig.joints, config.pose);
    const applied = applyGestureOrientations(rig.joints, config.hands);
    rig.root.updateMatrixWorld(true);
    const hand = rig.joints.get("arm.frontRight.hand")!;
    const elbow = rig.joints.get("arm.frontRight.forearm")!;
    const shoulder = rig.joints.get("arm.frontRight.upper")!;
    const quaternion = hand.getWorldQuaternion(new THREE.Quaternion());
    return {
      applied,
      position: hand.getWorldPosition(new THREE.Vector3()),
      elbow: elbow.getWorldPosition(new THREE.Vector3()),
      shoulder: shoulder.getWorldPosition(new THREE.Vector3()),
      fingers: new THREE.Vector3(...HAND_FINGER_AXIS).applyQuaternion(quaternion),
      palm: new THREE.Vector3(...HAND_PALM_AXIS).applyQuaternion(quaternion),
    };
  };

  const handHeight = (mudra: MudraId): number => gesture(mudra).position.y;

  it("abhaya shows the palm to the devotee with fingers up", () => {
    const a = gesture("abhaya");
    expect(a.applied).toContain("arm.frontRight.hand");
    // Palm faces the viewer (+Z) and fingers point up (+Y).
    expect(a.palm.z).toBeGreaterThan(0.9);
    expect(a.fingers.y).toBeGreaterThan(0.9);
    // Raised to shoulder height or above.
    expect(a.position.y).toBeGreaterThan(a.shoulder.y);
    // Elbow bent, and hanging below the wrist — a tucked blessing arm.
    expect(a.elbow.y).toBeLessThan(a.position.y - 0.08);
    const upperArm = a.elbow.clone().sub(a.shoulder).normalize();
    const forearm = a.position.clone().sub(a.elbow).normalize();
    const elbowAngle = (Math.acos(upperArm.dot(forearm)) * 180) / Math.PI;
    expect(elbowAngle).toBeGreaterThan(60);
    expect(elbowAngle).toBeLessThan(150);
    // Clear of the torso: the classic body's half-width is ~0.20.
    expect(Math.abs(a.position.x)).toBeGreaterThan(0.24);
  });

  it("varada shows the palm low, fingers down", () => {
    const v = gesture("varada");
    expect(v.applied).toContain("arm.frontRight.hand");
    expect(v.palm.z).toBeGreaterThan(0.9);
    expect(v.fingers.y).toBeLessThan(-0.85);
    expect(v.position.y).toBeLessThan(v.shoulder.y);
  });

  it("selecting a gesture raises the arm even from a dancing pose", () => {
    const danced = gesture("abhaya", "dance");
    expect(danced.applied).toContain("arm.frontRight.hand");
    expect(danced.palm.z).toBeGreaterThan(0.9);
  });

  it("leaves the pose's own wrist alone when an arm cannot present the gesture", () => {
    // Dancing swings the right arm wide and clears the gesture's own arm
    // overrides; a raised palm is unreachable there, so the gesture
    // declines rather than snapping the wrist to a clamped angle.
    const danced = gesture("abhaya", "dance", { presetLast: true });
    expect(danced.applied).not.toContain("arm.frontRight.hand");
  });

  it("Ganesha's default blessing already presents a true abhaya", () => {
    // No mudra selection, no overrides — straight from the saved default.
    const config = createDefaultGaneshaConfiguration();
    const rig = buildRig(config, new ZoneMaterials());
    applyPose(rig.joints, config.pose);
    const applied = applyGestureOrientations(rig.joints, config.hands);
    rig.root.updateMatrixWorld(true);
    expect(applied).toContain("arm.frontRight.hand");
    const hand = rig.joints.get("arm.frontRight.hand")!;
    const q = hand.getWorldQuaternion(new THREE.Quaternion());
    expect(new THREE.Vector3(...HAND_PALM_AXIS).applyQuaternion(q).z).toBeGreaterThan(0.9);
    expect(new THREE.Vector3(...HAND_FINGER_AXIS).applyQuaternion(q).y).toBeGreaterThan(0.9);
  });

  it("abhaya and varada impose materially different arm chains", () => {
    const abhaya = mudraArmRotations("abhaya", "frontRight")!;
    const varada = mudraArmRotations("varada", "frontRight")!;
    expect(abhaya).toBeTruthy();
    expect(varada).toBeTruthy();
    // Not just a palm rotation: upper arm AND forearm must differ.
    for (const joint of ["arm.frontRight.upper", "arm.frontRight.forearm"] as const) {
      expect(abhaya[joint], joint).not.toEqual(varada[joint]);
    }
    // The wrist is never baked into the gesture — it is solved from the
    // gesture's palm/finger directions against the posed arm.
    expect(abhaya["arm.frontRight.hand"]).toBeUndefined();
    // Left arms mirror rather than copy.
    const left = mudraArmRotations("abhaya", "frontLeft")!;
    expect(left["arm.frontLeft.upper"]![1]).toBeCloseTo(-abhaya["arm.frontRight.upper"]![1]);
    // Grip mudras carry no arm pose — held-item arms belong to the preset.
    expect(mudraArmRotations("grip", "frontRight")).toBeNull();
    expect(mudraArmRotations("hold", "frontLeft")).toBeNull();
  });

  it("abhaya raises the hand clearly above varada (Ganesha, standing)", () => {
    const abhayaY = handHeight("abhaya");
    const varadaY = handHeight("varada");
    expect(abhayaY).toBeGreaterThan(varadaY + 0.12);
    // Abhaya reaches shoulder/chest height (shoulder line ≈ 0.9 world).
    expect(abhayaY).toBeGreaterThan(0.75);
    // Varada stays low — a giving hand near hip/thigh height.
    expect(varadaY).toBeLessThan(0.72);
  });

  it("the same semantics articulate Shiva's arms", () => {
    const store = useEditorStore.getState();
    store.newCharacter(createDefaultShivaConfiguration());
    useEditorStore.getState().setMudra("frontRight", "abhaya");
    const raised = worldOf(useEditorStore.getState().config, (rig) =>
      rig.joints.get("arm.frontRight.hand"),
    )!.y;
    useEditorStore.getState().setMudra("frontRight", "varada");
    const lowered = worldOf(useEditorStore.getState().config, (rig) =>
      rig.joints.get("arm.frontRight.hand"),
    )!.y;
    expect(raised).toBeGreaterThan(lowered + 0.12);
  });

  it("switching to a non-gesture mudra returns the arm to the preset", () => {
    const store = useEditorStore.getState();
    store.newCharacter(createDefaultGaneshaConfiguration());
    useEditorStore.getState().setPosePreset("standing");
    useEditorStore.getState().setMudra("frontRight", "abhaya");
    expect(
      Object.keys(useEditorStore.getState().config.pose.jointOverrides),
    ).toContain("arm.frontRight.forearm");
    useEditorStore.getState().setMudra("frontRight", "open");
    expect(useEditorStore.getState().config.pose.jointOverrides).toEqual({});
  });
});

describe("earrings hang from refined ear sockets", () => {
  it.each([
    ["ganesha", () => {
      const config = createDefaultGaneshaConfiguration();
      config.parts.head = { assetId: "ganesha.head.classic", version: 3 };
      config.attachments = config.attachments.filter((a) => a.socket !== "base.platform");
      return config;
    }],
    ["shiva", () => createDefaultShivaConfiguration()],
  ] as const)("%s", (_deity, makeConfig) => {
    const config = makeConfig();
    const rig = buildRig(config, new ZoneMaterials());
    for (const socketId of ["head.leftEar", "head.rightEar"] as const) {
      const socket = rig.sockets.get(socketId);
      expect(socket, socketId).toBeDefined();
      // The ear-owning part refined the socket off its schema default…
      const schemaDefault = rig.skeleton.sockets.find((s) => s.id === socketId)!;
      expect(socket!.position.toArray(), socketId).not.toEqual([...schemaDefault.position]);
      // …and the earring is mounted ON the socket.
      const mounted = socket!.children.some((c) =>
        c.name.startsWith("part:ganesha.earrings"),
      );
      expect(mounted, `${socketId} earring`).toBe(true);
    }
  });
});

describe("naga torque wraps the measured neck", () => {
  const nagaWidth = (bulk: number): number => {
    const config = createDefaultShivaConfiguration();
    config.proportions.bulk = bulk;
    config.attachments = [
      ...config.attachments.filter((a) => a.socket !== "chest.necklace"),
      { socket: "chest.necklace", asset: { assetId: "shiva.ornament.naga", version: 1 } },
    ];
    const box = bboxOf(config, "attachment:shiva.ornament.naga");
    expect(box).not.toBeNull();
    return box!.max.x - box!.min.x;
  };

  it("coil width tracks the body's neck radius", () => {
    const slim = nagaWidth(0.8);
    const broad = nagaWidth(1.3);
    expect(broad).toBeGreaterThan(slim + 0.02);
    // And stays a collar, not a floating hoop: bounded by neck + hood.
    const profile = deriveBodyProfile(
      { form: "athletic", chest: 1, waist: 1, shoulder: 1 },
      { height: 1, bulk: 1 },
    );
    const width = nagaWidth(1);
    expect(width).toBeGreaterThan(2 * profile.neckRadius);
    expect(width).toBeLessThan(2 * profile.neckRadius + 0.09);
  });
});

describe("kamarband wraps the dressed waist", () => {
  const beltWidth = (bulk: number): number => {
    const config = createDefaultShivaConfiguration();
    config.proportions.bulk = bulk;
    config.attachments = [
      ...config.attachments,
      { socket: "waist.ornament", asset: { assetId: "ganesha.waist.kamarband", version: 2 } },
    ];
    const box = bboxOf(config, "attachment:ganesha.waist.kamarband");
    expect(box).not.toBeNull();
    return box!.max.x - box!.min.x;
  };

  it("sits outside the skirt's wrap radius and scales with the body", () => {
    const profile = deriveBodyProfile(
      { form: "athletic", chest: 1, waist: 1, shoulder: 1 },
      { height: 1, bulk: 1 },
    );
    const width = beltWidth(1);
    // Never swallowed by the dhoti…
    expect(width).toBeGreaterThan(2 * profile.dhotiRadius);
    // …but still a fitted band, not a hoop in space.
    expect(width).toBeLessThan(2 * profile.dhotiRadius + 0.08);
    expect(beltWidth(1.3)).toBeGreaterThan(beltWidth(0.8) + 0.02);
  });
});

describe("loft winding", () => {
  it("produces outward-facing triangles (positive signed volume)", () => {
    const geometry = loft([
      { y: -0.1, rx: 0.05, rz: 0.04, z: 0.01 },
      { y: 0, rx: 0.09, rz: 0.06 },
      { y: 0.1, rx: 0.04, rz: 0.03, z: -0.01 },
    ]);
    const pos = geometry.getAttribute("position");
    const index = geometry.getIndex()!;
    let volume = 0;
    for (let i = 0; i + 2 < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      volume +=
        (pos.getX(a) * (pos.getY(b) * pos.getZ(c) - pos.getZ(b) * pos.getY(c)) -
          pos.getY(a) * (pos.getX(b) * pos.getZ(c) - pos.getZ(b) * pos.getX(c)) +
          pos.getZ(a) * (pos.getX(b) * pos.getY(c) - pos.getY(b) * pos.getX(c))) /
        6;
    }
    expect(volume).toBeGreaterThan(0);
  });
});

describe("generic engine purity", () => {
  it("generic modules contain no deity string literals", () => {
    const engineDir = join(__dirname, "..");
    for (const file of [
      "rig.ts",
      "pose.ts",
      "materials.ts",
      "skinning.ts",
      "printExport.ts",
      "glbCache.ts",
      "CharacterRoot.tsx",
      "generators/bodyProfile.ts",
      "generators/types.ts",
      join("..", "state", "editorStore.ts"),
    ]) {
      const source = readFileSync(join(engineDir, file), "utf8");
      expect(source, file).not.toMatch(/["'`](ganesha|shiva|krishna|durga)["'`]/i);
      // Nor may it recognize a deity, body kind or authoring tool by name.
      expect(source, file).not.toMatch(/\b(makehuman|mixamo|humanBase)\b/i);
    }
  });
});
