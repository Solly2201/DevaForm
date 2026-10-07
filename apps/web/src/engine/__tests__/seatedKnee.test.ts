/**
 * How much of a seated knee is outside the cloth, in millimetres.
 *
 * `seatedLap` asks whether the wrap follows the measured lap at all,
 * which is what stopped Royal Ease being a drum. It does not ask HOW FAR
 * the legs come through it, and that is the number a customer actually
 * looks at: the defect that started this work was knees reading as bare
 * nubs stuck on the sides of a cylinder.
 *
 * Some exposure is the pose. `shapeToLap` stops enclosing a hand's width
 * below the waist on purpose — "a raised knee is meant to come through
 * the cloth; that is what the pose is" — and the attempt to contain the
 * drawn-up knee produced a garment as wide as the knees for its whole
 * height, with the kamarbandh riding out on it as a flat gold plate.
 * That is a recorded dead end, not an unexplored option.
 *
 * So this pins the amount rather than forbidding it. Measured on the
 * production geometry, from the front and both sides at twenty-four
 * bearings, below the waist seat so that an elbow cannot be mistaken for
 * a knee — the first version of this measurement took the garment's whole
 * height and reported a hundred and forty-four millimetres of "exposed
 * body" at ninety degrees, which was Ganesha's elbow.
 */
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () =>
  import("./glbLoader").then((module) => module.diskLoader()),
);

import {
  createDefaultGaneshaConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport } from "../rig";
import { ZoneMaterials } from "../materials";
import { deformedVertex } from "../skinning";

const BINS = 24;

async function build(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  let rig = buildRig(config, materials);
  for (let attempt = 0; attempt < 6 && rig.pending.length > 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    rig = buildRig(config, materials);
  }
  poseRig(rig, config.pose);
  settleOnSupport(rig);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

/** Every vertex of the matching parts, in the pelvis's own frame. */
function pointsOf(rig: ReturnType<typeof buildRig>, match: (name: string) => boolean) {
  const pelvis = rig.joints.get("pelvis");
  const out: THREE.Vector3[] = [];
  if (!pelvis) return out;
  const point = new THREE.Vector3();
  rig.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    let owner: THREE.Object3D | null = node;
    let mine = false;
    while (owner && owner !== rig.root) {
      if (match(owner.name)) mine = true;
      owner = owner.parent;
    }
    if (!mine) return;
    const attribute = mesh.geometry.getAttribute("position");
    if (!attribute) return;
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < attribute.count; i += 1) {
      deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
      pelvis.worldToLocal(point);
      out.push(point.clone());
    }
  });
  return out;
}

const binOf = (p: THREE.Vector3) => {
  const turn = Math.PI * 2;
  const bearing = ((Math.atan2(p.x, p.z) % turn) + turn) % turn;
  return Math.round((bearing / turn) * BINS) % BINS;
};

/** The furthest any part of the body stands outside the wrap, in mm. */
async function exposure(preset: string): Promise<{ worst: number; where: string }> {
  const base = createDefaultGaneshaConfiguration();
  const { rig, materials } = await build({ ...base, pose: { ...base.pose, preset } });
  try {
    const body = pointsOf(rig, (name) => name.startsWith("part:") && name.includes("body"));
    const cloth = pointsOf(rig, (name) => name.includes("garment"));
    if (body.length === 0 || cloth.length === 0) return { worst: 0, where: "nothing to measure" };

    const low = Math.min(...cloth.map((p) => p.y)) - 0.005;
    // Below the belt, where the legs are and the arms are not.
    const high = rig.body.waistSeatY;
    const inBand = (p: THREE.Vector3) => p.y >= low && p.y <= high;

    const skin = new Array<number>(BINS).fill(0);
    const wrap = new Array<number>(BINS).fill(0);
    for (const p of body) {
      if (!inBand(p)) continue;
      const b = binOf(p);
      skin[b] = Math.max(skin[b] ?? 0, Math.hypot(p.x, p.z));
    }
    for (const p of cloth) {
      if (!inBand(p)) continue;
      const b = binOf(p);
      wrap[b] = Math.max(wrap[b] ?? 0, Math.hypot(p.x, p.z));
    }
    let worst = 0;
    let where = "nowhere";
    for (let b = 0; b < BINS; b += 1) {
      if ((skin[b] ?? 0) <= 0) continue;
      const over = ((skin[b] ?? 0) - (wrap[b] ?? 0)) * 1000;
      if (over > worst) {
        worst = over;
        where = `${Math.round((b / BINS) * 360)}°`;
      }
    }
    return { worst, where };
  } finally {
    materials.dispose();
  }
}

describe("a seated knee shows, and only as much as the pose asks for", () => {
  /**
   * THIRTY-FIVE MILLIMETRES, against a knee of fifty-four.
   *
   * Measured today: Royal Ease exposes 27 mm at its worst bearing and
   * meditation 16 mm — the outer part of the knee, which is what a seated
   * murti looks like. Half the knee is the line. Past it the cloth has
   * stopped following the lap and the figure is back to bare masses
   * beside a wrap, which is the defect this whole area was rebuilt for.
   */
  it.each(["royal", "meditation"])("%s", async (preset) => {
    const { worst, where } = await exposure(preset);
    expect(
      worst,
      `${preset}: the body stands ${worst.toFixed(0)} mm outside the wrap at ${where}`,
    ).toBeLessThan(35);
  }, 600_000);

  /**
   * AND A RAISED LEG IS BARE, which is the other half of the same claim.
   *
   * `dance` declares `garment: "short"` precisely because a leg has left
   * the lap, and a measurement that called that a defect would be asking
   * the product to hide the pose. Measured at 99 mm, and it should be:
   * if this ever fell to nothing, the short wrap would have gone back to
   * being a hoop the raised thigh sweeps through.
   */
  it("dance", async () => {
    const { worst, where } = await exposure("dance");
    expect(
      worst,
      `dance: the raised leg stands ${worst.toFixed(0)} mm clear of the wrap at ${where}`,
    ).toBeGreaterThan(40);
  }, 600_000);
});
