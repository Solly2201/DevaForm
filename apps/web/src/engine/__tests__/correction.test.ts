/**
 * Regression tests for the visual/attachment correction pass:
 *
 * 1. Gesture mudras articulate the whole arm: Abhaya genuinely raises the
 *    hand, Varada lowers it — materially different joint chains, on any
 *    deity, through generic pose semantics.
 * 2. Earrings originate at the ear sockets their owner part refined —
 *    for Ganesha (ears part) and Shiva (head part) alike.
 * 3. The naga is a walk over the body's OWN surface: it scales with the
 *    figure and its coil stays outside the skin while lying against it.
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
  SHIVA_POSE_PRESETS,
  createDefaultShivaConfiguration,
  mudraArmRotations,
  type CharacterConfiguration,
  type MudraId,
} from "@devaform/character-schema";
import { buildRig, poseRig } from "../rig";
import { solveHand } from "../handSolve";
import { applyGestureOrientations, applyPose } from "../pose";
import { loft } from "../geometry";
import { ZoneMaterials } from "../materials";
import { useEditorStore } from "@/state/editorStore";

function worldOf(config: CharacterConfiguration, pick: (rig: ReturnType<typeof buildRig>) => THREE.Object3D | undefined) {
  const rig = buildRig(config, new ZoneMaterials());
  // Measure what is RENDERED: the gesture and grip solves move the arm,
  // so a landmark read before them is a landmark nobody sees.
  poseRig(rig);
  rig.root.updateWorldMatrix(true, true);
  const object = pick(rig);
  if (!object) return null;
  return object.getWorldPosition(new THREE.Vector3());
}

function bboxOf(config: CharacterConfiguration, name: string): THREE.Box3 | null {
  const rig = buildRig(config, new ZoneMaterials());
  poseRig(rig);
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
    const applied = applyGestureOrientations(rig.joints, rig.hands)
      .filter((solution) => solution.applied)
      .map((solution) => `arm.${solution.slot}.hand`);
    rig.root.updateMatrixWorld(true);
    const hand = rig.joints.get("arm.frontRight.hand")!;
    const elbow = rig.joints.get("arm.frontRight.forearm")!;
    const shoulder = rig.joints.get("arm.frontRight.upper")!;
    const pelvis = rig.joints.get("pelvis")!;
    const quaternion = hand.getWorldQuaternion(new THREE.Quaternion());
    return {
      applied,
      position: hand.getWorldPosition(new THREE.Vector3()),
      elbow: elbow.getWorldPosition(new THREE.Vector3()),
      shoulder: shoulder.getWorldPosition(new THREE.Vector3()),
      pelvis: pelvis.getWorldPosition(new THREE.Vector3()),
      fingers: new THREE.Vector3(...HAND_FINGER_AXIS).applyQuaternion(quaternion),
      palm: new THREE.Vector3(...HAND_PALM_AXIS).applyQuaternion(quaternion),
    };
  };

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

  it("varada offers the palm low, fingers down — not dangling at the hip", () => {
    const v = gesture("varada");
    expect(v.applied).toContain("arm.frontRight.hand");
    expect(v.palm.z).toBeGreaterThan(0.9);
    expect(v.fingers.y).toBeLessThan(-0.85);
    // Rig-relative so future proportions stay legal: the hand sits below
    // the shoulder but well above the hip, held forward and clear of the
    // torso, with the elbow bent rather than straight.
    const pelvis = v.pelvis.y;
    const shoulder = v.shoulder.y;
    expect(v.position.y).toBeLessThan(shoulder);
    expect(v.position.y).toBeGreaterThan(pelvis + (shoulder - pelvis) * 0.5);
    expect(v.position.z).toBeGreaterThan(0.15);
    expect(Math.abs(v.position.x)).toBeGreaterThan(0.24);
    const upperArm = v.elbow.clone().sub(v.shoulder).normalize();
    const forearm = v.position.clone().sub(v.elbow).normalize();
    const elbowAngle = (Math.acos(upperArm.dot(forearm)) * 180) / Math.PI;
    expect(elbowAngle).toBeGreaterThan(25);
  });

  it("keeps abhaya and varada clearly apart without exaggerating the gap", () => {
    const a = gesture("abhaya");
    const v = gesture("varada");
    const gap = a.position.y - v.position.y;
    const torso = a.shoulder.y - a.pelvis.y;
    // Unmistakably different heights, but varada stays a raised gesture:
    // between a fifth and two thirds of the shoulder-to-hip span.
    expect(gap).toBeGreaterThan(torso * 0.2);
    expect(gap).toBeLessThan(torso * 0.67);
  });

  it("selecting a gesture raises the arm even from a dancing pose", () => {
    const danced = gesture("abhaya", "dance");
    expect(danced.applied).toContain("arm.frontRight.hand");
    expect(danced.palm.z).toBeGreaterThan(0.9);
  });

  it("carries a chosen gesture across a change of pose", () => {
    // Choosing a pose clears joint overrides — they were tweaks on the
    // previous preset. A gesture is not a tweak: a hand chosen to bless
    // goes on blessing, and its arm has to come with it. Without that the
    // mudra survived while its arm did not, and the blessing became an
    // open hand pointing at the floor.
    const danced = gesture("abhaya", "dance", { presetLast: true });
    expect(danced.applied).toContain("arm.frontRight.hand");
    expect(danced.palm.z).toBeGreaterThan(0.9);
    expect(danced.fingers.y).toBeGreaterThan(0.9);
  });

  it("puts the arm back when it genuinely cannot present the gesture", () => {
    // The solver is allowed to give up, and must leave no trace when it
    // does: a hand turned three-quarters of the way toward a blessing is
    // neither posed nor blessing. Asked here for something no arm can do
    // — a palm facing straight down while the fingers also point down.
    const config = createDefaultGaneshaConfiguration();
    const rig = buildRig(config, new ZoneMaterials());
    applyPose(rig.joints, config.pose);
    const hand = rig.joints.get("arm.frontRight.hand")!;
    const upper = rig.joints.get("arm.frontRight.upper")!;
    const forearm = rig.joints.get("arm.frontRight.forearm")!;
    const before = {
      hand: hand.quaternion.clone(),
      upper: upper.quaternion.clone(),
      forearm: forearm.quaternion.clone(),
    };
    // A tolerance nothing can satisfy, so the give-up path is exercised
    // deterministically rather than by hunting for an orientation this
    // particular arm happens not to reach.
    const target = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI,
    );
    const solution = solveHand(
      rig.joints,
      "frontRight",
      { kind: "orientation", world: target },
      { revertBeyond: -1 },
    );
    expect(solution?.applied).toBe(false);
    expect(hand.quaternion.angleTo(before.hand)).toBeLessThan(1e-6);
    expect(upper.quaternion.angleTo(before.upper)).toBeLessThan(1e-6);
    expect(forearm.quaternion.angleTo(before.forearm)).toBeLessThan(1e-6);
  });

  it("Ganesha's default blessing already presents a true abhaya", () => {
    // No mudra selection, no overrides — straight from the saved default.
    const config = createDefaultGaneshaConfiguration();
    const rig = buildRig(config, new ZoneMaterials());
    applyPose(rig.joints, config.pose);
    const applied = applyGestureOrientations(rig.joints, rig.hands)
      .filter((solution) => solution.applied)
      .map((solution) => `arm.${solution.slot}.hand`);
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
    const abhaya = gesture("abhaya");
    const varada = gesture("varada");
    // Landmark-relative, so a deity with different proportions still
    // satisfies it: abhaya rises above the shoulder, varada stays below.
    expect(abhaya.position.y).toBeGreaterThan(abhaya.shoulder.y);
    expect(varada.position.y).toBeLessThan(varada.shoulder.y);
    expect(abhaya.position.y).toBeGreaterThan(varada.position.y + 0.12);
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
    ["shiva", () => stylisedShiva()],
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

/**
 * Shiva on the superseded stylised body.
 *
 * Some invariants are about PROCEDURAL fitting — the bulk proportion
 * scaling primitives, a part refining a socket onto geometry it drew — and
 * a mesh body answers none of them: it ignores bulk by design (its girth
 * travels through morph targets) and its sockets are refined by SOCKET_
 * nodes in a GLB the unit-test loader never resolves. So these run on the
 * body that does the thing being tested. The mesh body's own fit is
 * covered in humanBase.test.ts, which reads the shipped file.
 */
function stylisedShiva(): CharacterConfiguration {
  const config = createDefaultShivaConfiguration();
  config.parts.body = { assetId: "shiva.body.classic", version: 1 };
  config.parts.head = { assetId: "shiva.head.classic", version: 1 };
  config.parts.eyes = { assetId: "shiva.eyes.serene", version: 1 };
  config.parts.hands = { assetId: "shiva.hands.classic", version: 1 };
  config.parts.lowerGarment = { assetId: "shiva.garment.dhoti", version: 2 };
  return config;
}

describe("naga lies on the body it is worn by", () => {
  const nagaConfig = (bulk: number): CharacterConfiguration => {
    const config = stylisedShiva();
    config.proportions.bulk = bulk;
    config.attachments = [
      ...config.attachments.filter((a) => a.socket !== "chest.necklace"),
      { socket: "chest.necklace", asset: { assetId: "shiva.ornament.naga", version: 1 } },
    ];
    return config;
  };
  const nagaWidth = (bulk: number): number => {
    const box = bboxOf(nagaConfig(bulk), "attachment:shiva.ornament.naga");
    expect(box).not.toBeNull();
    return box!.max.x - box!.min.x;
  };

  it("scales with the body it is worn by", () => {
    const slim = nagaWidth(0.8);
    const broad = nagaWidth(1.3);
    expect(broad).toBeGreaterThan(slim + 0.02);
  });

  /**
   * The serpent is authored as a walk over the body's own surface, so the
   * guarantee is a CLEARANCE, not a bounding box: every part of the coil
   * that lies against the figure is outside the skin and close to it.
   *
   * This is what a bounding-box test could never say. A coil can have
   * exactly the right width and still run through the sternum.
   *
   * Measured RADIALLY, on the bearing each point actually sits at. An
   * earlier version normalised the point against an ellipse and converted
   * back to metres using the smaller of the two radii — which under-reports
   * a clearance achieved across the wide axis by nearly half, and reported
   * a serpent sitting four millimetres off the skin as buried in it. The
   * surface answers by bearing and height; so does this.
   */
  const coilClearance = (config: CharacterConfiguration) => {
    const rig = buildRig(config, new ZoneMaterials());
    poseRig(rig);
    rig.root.updateWorldMatrix(true, true);
    let naga: THREE.Object3D | null = null;
    rig.root.traverse((o) => {
      if (o.name === "attachment:shiva.ornament.naga") naga = o;
    });
    expect(naga).not.toBeNull();
    const socket = (naga as unknown as THREE.Object3D).parent!;
    socket.updateWorldMatrix(true, false);
    const toSocket = new THREE.Matrix4().copy(socket.matrixWorld).invert();

    const body = rig.body;
    /**
     * HOW CLOSE, in euclidean millimetres rather than radially.
     *
     * This used to ask how far the point was from the axis compared with
     * the skin at the same HEIGHT, and count anything within fifty
     * millimetres as lying against the body. That reading is wrong for
     * exactly the thing the serpent now does: clearance is applied along
     * the surface's own normal, so over the sloped base of the neck a
     * point lifts upward as well as outward — to a height where the torso
     * is narrower, which inflates a radial gap while the real distance to
     * the skin is the clearance that was asked for.
     *
     * Measured both ways on the day this changed: the coil's nearest
     * approach went from four tenths of a millimetre to three, which is
     * the four-millimetre gap `ornamentNaga` asks for under the serpent's
     * belly finally being delivered. The old direction had the underside
     * resting in the skin.
     */
    const distanceToSkin = (target: THREE.Vector3): number => {
      const at = (bearing: number, height: number) => {
        const skin = body.surfaceAt(bearing, height);
        return new THREE.Vector3(skin.x, height, skin.z);
      };
      let best = Infinity;
      let bestBearing = 0;
      let bestY = target.y;
      for (let i = 0; i < 96; i += 1) {
        const bearing = (i / 96) * Math.PI * 2;
        for (let j = -8; j <= 8; j += 1) {
          const height = target.y + j * 0.016;
          const distance = at(bearing, height).distanceTo(target);
          if (distance < best) {
            best = distance;
            bestBearing = bearing;
            bestY = height;
          }
        }
      }
      for (let i = -5; i <= 5; i += 1) {
        for (let j = -5; j <= 5; j += 1) {
          const distance = at(
            bestBearing + (i / 5) * ((Math.PI * 2) / 96),
            bestY + (j / 5) * 0.016,
          ).distanceTo(target);
          if (distance < best) best = distance;
        }
      }
      return best;
    };

    let inside = 0;
    let total = 0;
    const near: number[] = [];
    const p = new THREE.Vector3();
    (naga as unknown as THREE.Object3D).traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.updateWorldMatrix(true, false);
      const local = new THREE.Matrix4().multiplyMatrices(toSocket, m.matrixWorld);
      const pos = m.geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i += 7) {
        p.fromBufferAttribute(pos, i).applyMatrix4(local);
        // Socket space -> the chest-joint space the surface answers in.
        const y = p.y + body.necklaceSocketY;
        const z = p.z + body.necklaceSocketZ;
        total += 1;
        // The reared hood stands off the shoulder on purpose; only the
        // part of the serpent lying along the figure is being judged.
        if (y > body.necklaceSocketY + 0.06) continue;
        // Which way round the body this point lies, and how far the skin
        // is in that direction. Bearings run from the front toward the
        // figure's left, which is the convention the surface uses.
        const centreZ = (body.surfaceAt(0, y).z + body.surfaceAt(Math.PI, y).z) / 2;
        const bearing = Math.atan2(p.x, z - centreZ);
        const skin = body.surfaceAt(bearing, y);
        const here = Math.hypot(p.x, z - centreZ);
        const there = Math.hypot(skin.x, skin.z - centreZ);
        const gap = here - there;
        // Containment stays RADIAL, which is sound: the torso surface is
        // a star-shaped field about its own axis, so "further from the
        // axis than the skin is" is exactly "outside the body".
        if (gap < -0.004) inside += 1;
        // Proximity is euclidean, for the reason above.
        near.push(distanceToSkin(new THREE.Vector3(p.x, y, z)));
      }
    });
    near.sort((a, b) => a - b);
    return {
      inside,
      total,
      nearest: near[0] ?? Infinity,
      median: near[Math.floor(near.length / 2)] ?? Infinity,
    };
  };

  it.each([
    ["stylised body", () => nagaConfig(1)],
    ["mesh body", () => {
      const config = createDefaultShivaConfiguration();
      config.attachments = [
        ...config.attachments.filter((a) => a.socket !== "chest.necklace"),
        { socket: "chest.necklace", asset: { assetId: "shiva.ornament.naga", version: 1 } },
      ];
      return config;
    }],
  ])("keeps its coil outside the skin, and against it — %s", (_name, makeConfig) => {
    const { inside, total, nearest, median } = coilClearance(makeConfig());
    expect(total).toBeGreaterThan(50);
    // Nothing of consequence buried in the chest...
    expect(inside / total).toBeLessThan(0.02);
    /**
     * ...and the coil is a coil, not a hoop floating clear of the body.
     *
     * Said as two numbers because one will not do it. The NEAREST
     * approach says the serpent rests on the figure at all — a hoop has
     * no contact anywhere. The MEDIAN says most of its length lies along
     * the body rather than standing off it — a serpent resting at one
     * point and sailing away from every other is still a hoop.
     *
     * Measured: nearest 3 mm, median 36 mm, on a serpent whose own body
     * is thirty millimetres thick and which asks for a four-millimetre
     * gap under it.
     */
    expect(nearest * 1000, `the coil rests on the body: nearest ${(nearest * 1000).toFixed(1)}mm`)
      .toBeLessThan(10);
    expect(median * 1000, `the coil lies along the body: median ${(median * 1000).toFixed(1)}mm`)
      .toBeLessThan(45);
  });

  /**
   * And it stays out of the head, in every pose.
   *
   * The coil is judged against the torso in the chest joint's own space,
   * which the serpent rides — so posing the spine cannot push it into the
   * chest, and that test says nothing about what the HEAD does. A head
   * turns and tips; a serpent worn at the throat and reared beside the jaw
   * is the one ornament that can end up inside a face.
   *
   * The skull is an ellipsoid the body measures for itself, so this is the
   * same question asked of a different surface.
   */
  it.each(SHIVA_POSE_PRESETS.map((preset) => preset.id))(
    "keeps the serpent out of the skull — %s",
    (presetId) => {
      const config = createDefaultShivaConfiguration();
      config.pose = { preset: presetId, jointOverrides: {} };
      const materials = new ZoneMaterials();
      const rig = buildRig(config, materials);
      poseRig(rig);
      rig.root.updateWorldMatrix(true, true);

      const head = rig.joints.get("head")!;
      head.updateWorldMatrix(true, false);
      const toHead = new THREE.Matrix4().copy(head.matrixWorld).invert();
      const body = rig.body;
      // The cranium, as the body measures it, minus a couple of
      // millimetres: skin touching skin is not an intersection.
      const radius = body.headRadius - 0.002;

      let naga: THREE.Object3D | null = null;
      rig.root.traverse((o) => {
        if (o.name === "attachment:shiva.ornament.naga") naga = o;
      });
      expect(naga, presetId).not.toBeNull();

      let inside = 0;
      let total = 0;
      const point = new THREE.Vector3();
      (naga as unknown as THREE.Object3D).traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.updateWorldMatrix(true, false);
        const local = new THREE.Matrix4().multiplyMatrices(toHead, m.matrixWorld);
        const position = m.geometry.getAttribute("position");
        for (let i = 0; i < position.count; i += 3) {
          point.fromBufferAttribute(position, i).applyMatrix4(local);
          total += 1;
          // The cranium is taller than it is wide; the measured radius is
          // its width, and the jaw hangs below its centre.
          const dx = point.x / radius;
          const dy = (point.y - body.headCenterY) / (radius * 1.45);
          const dz = (point.z - body.headCenterZ) / (radius * 1.15);
          if (dx * dx + dy * dy + dz * dz < 1) inside += 1;
        }
      });
      expect(total, presetId).toBeGreaterThan(100);
      expect(inside, `${presetId}: serpent vertices inside the skull`).toBe(0);
      materials.dispose();
    },
  );
});

/** How wide an object gets, counting only vertices inside a height band. */
function widthWithin(
  config: CharacterConfiguration,
  name: string,
  band: THREE.Box3,
  posed = true,
): number {
  const rig = buildRig(config, new ZoneMaterials());
  if (posed) poseRig(rig);
  rig.root.updateWorldMatrix(true, true);
  let low = Infinity;
  let high = -Infinity;
  rig.root.traverse((node) => {
    let owner: THREE.Object3D | null = node;
    let label = "";
    while (owner && owner !== rig.root) {
      if (typeof owner.name === "string" && owner.name.length > 0) {
        label = owner.name;
        break;
      }
      owner = owner.parent;
    }
    if (label !== name) return;
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute("position");
    if (!position) return;
    mesh.updateWorldMatrix(true, false);
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      if (point.y < band.min.y || point.y > band.max.y) continue;
      low = Math.min(low, point.x);
      high = Math.max(high, point.x);
    }
  });
  return Number.isFinite(low) ? high - low : 0;
}

describe("kamarband wraps the dressed waist", () => {
  const beltWidth = (bulk: number): number => {
    const config = stylisedShiva();
    config.proportions.bulk = bulk;
    config.attachments = [
      ...config.attachments,
      { socket: "waist.ornament", asset: { assetId: "ganesha.waist.kamarband", version: 2 } },
    ];
    const box = bboxOf(config, "attachment:ganesha.waist.kamarband");
    expect(box).not.toBeNull();
    return box!.max.x - box!.min.x;
  };

  it("sits outside the skirt it is tied on, and scales with the body", () => {
    /**
     * MEASURED AGAINST THE CLOTH, not against `dhotiRadius`.
     *
     * This asserted `width > 2 * dhotiRadius` — the belt had to be wider
     * than the garment's DECLARED wrap radius. That radius is a floor:
     * what a dhoti needs at the HIPS so it clears the legs inside it. The
     * belt is tied above the hips, where the skirt is legitimately
     * narrower, so holding the belt to the hip number is holding it to a
     * figure it is not touching — and it is what kept the belt standing
     * off the cloth in every showcase capture.
     *
     * The honest form of the same rule is the one the eye applies: the
     * gold is outside the red. So the skirt is measured where the belt
     * actually sits, and the belt has to be outside THAT.
     */
    const config = stylisedShiva();
    config.attachments = [
      ...config.attachments,
      { socket: "waist.ornament", asset: { assetId: "ganesha.waist.kamarband", version: 2 } },
    ];
    // The BAND, not the group: the tassels hang four centimetres below
    // it, and a flared skirt is wider down there than anywhere the band
    // touches. Comparing those two is comparing different heights.
    const belt = bboxOf(config, "kamarband.band");
    const skirt = bboxOf(config, "part:shiva.garment.dhoti");
    expect(belt, "the belt was built").not.toBeNull();
    expect(skirt, "the skirt under it was built").not.toBeNull();

    const beltWidthAt = belt!.max.x - belt!.min.x;
    // The skirt's width in the belt's own height band — a tapered skirt
    // measured at its hem says nothing about the waist it is tied at.
    const band = new THREE.Box3(
      new THREE.Vector3(-Infinity, belt!.min.y, -Infinity),
      new THREE.Vector3(Infinity, belt!.max.y, Infinity),
    );
    const skirtThere = widthWithin(config, "part:shiva.garment.dhoti", band);
    expect(
      beltWidthAt,
      `the belt (${(beltWidthAt * 1000).toFixed(1)} mm across) is inside the skirt ` +
        `(${(skirtThere * 1000).toFixed(1)} mm) it is tied on`,
    ).toBeGreaterThan(skirtThere);
    // …but still a fitted band, not a hoop in space. Four centimetres of
    // total width, which is two of standoff on each side.
    expect(
      beltWidthAt,
      `the belt stands ${(((beltWidthAt - skirtThere) / 2) * 1000).toFixed(1)} mm off the skirt`,
    ).toBeLessThan(skirtThere + 0.04);
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
