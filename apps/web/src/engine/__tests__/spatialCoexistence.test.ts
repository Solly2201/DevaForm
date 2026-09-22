/**
 * EXPERIMENT — spatial occupancy against the real statue.
 *
 * The placement systems stay in charge and untouched: the resolver
 * decides what an attribute is doing, walkSurface and the grip chain
 * decide where it goes. What is tested here is the one thing none of
 * them does — measuring the geometry that RESULTED, and holding it to
 * the declarations it was built from.
 *
 * Three questions, none answerable before this module existed:
 *
 *   1. Is a worn asset's built mesh actually clear of the measured body
 *      — asked generically, not by a bespoke loop per asset?
 *   2. Is an asset's material at the grip really the radius its
 *      presentation declares? (An asset once declared 6 mm so the fist
 *      would close photogenically, and held nothing.)
 *   3. Do two ornaments that are each guaranteed against the BODY keep
 *      any distance from EACH OTHER? Nothing anywhere states their
 *      mutual relationship.
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

import {
  ARM_SLOTS,
  createDefaultShivaConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import {
  DAMARU_WAIST_RADIUS,
  TRISHUL_SHAFT_RADIUS,
  TRISHUL_TRAVEL,
  type SpatialPrimitive,
} from "@devaform/asset-system";
import { buildRig, poseRig } from "../rig";
import { ZoneMaterials } from "../materials";
import { radialBand, surfacePoints } from "../spatial/derive";
import { closestApproach, passesThroughVoid } from "../spatial/occupancy";
import { worstTorsoPenetration } from "../spatial/bodyAdapter";

async function rigFor(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rig = buildRig(config, materials);
  poseRig(rig);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

function find(rig: Awaited<ReturnType<typeof rigFor>>["rig"], name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  rig.root.traverse((object) => {
    if (object.name === name) found = object;
  });
  return found;
}

describe("a worn asset against the measured body, generically", () => {
  it("the naga as built stands clear of the torso — and the same serpent pushed into the chest is caught", async () => {
    const { rig, materials } = await rigFor(createDefaultShivaConfiguration());
    expect(rig.pending).toEqual([]);
    const chest = rig.joints.get("chest")!;
    const naga = find(rig, "attachment:shiva.ornament.naga");
    expect(naga).not.toBeNull();
    // Chest-joint-local points: the frame surfaceAt answers in, and —
    // since serpent and socket both hang off the chest — pose-invariant.
    const points = surfacePoints(naga!, chest, 3);
    expect(points.length).toBeGreaterThan(200);

    // The walk plus pushOutsideBody built this clear of the profile; the
    // generic validator agrees, using no knowledge of HOW it was built.
    // (The reared head is allowed the same contact morphSafety allows.)
    const t0 = performance.now();
    const worst = worstTorsoPenetration(rig.body, points);
    const elapsed = performance.now() - t0;
    console.info(
      `[spatial] naga vs torso: worst ${(worst * 1000).toFixed(2)} mm inside ` +
        `(${points.length} samples in ${elapsed.toFixed(1)} ms)`,
    );
    expect(worst, `${(worst * 1000).toFixed(1)} mm buried`).toBeLessThan(0.006);

    // Now break it deliberately: the same cloud, each point moved 12 mm
    // inward along its own bearing — a serpent authored in world points
    // on a body it was not measured for, which is exactly the defect the
    // route representation was built to prevent. The validator must see
    // what the eye would.
    const buried = points.map((point) => {
      const centreZ =
        (rig.body.surfaceAt(0, point.y).z + rig.body.surfaceAt(Math.PI, point.y).z) / 2;
      const radial = Math.hypot(point.x, point.z - centreZ);
      if (radial < 1e-6) return point.clone();
      const scale = Math.max(0, (radial - 0.012) / radial);
      return new THREE.Vector3(point.x * scale, point.y, (point.z - centreZ) * scale + centreZ);
    });
    expect(worstTorsoPenetration(rig.body, buried)).toBeGreaterThan(0.005);
    materials.dispose();
  });
});

describe("declared grip geometry against built grip geometry", () => {
  it("the trishul's shaft is the thickness its presentation declares", async () => {
    const { rig, materials } = await rigFor(createDefaultShivaConfiguration());
    const staff = find(rig, "attachment:shiva.attribute.trishul");
    expect(staff).not.toBeNull();
    // The item's own frame IS its grip frame: origin at the grip, shaft
    // along +Y — the authoring rule the asset spec states. Measure the
    // material inside the band a hand can actually slide over.
    const points = surfacePoints(staff!, staff!, 1);
    const band = radialBand(
      points,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
      Math.min(0.1, TRISHUL_TRAVEL),
    );
    expect(band.samples).toBeGreaterThan(20);
    console.info(
      `[spatial] trishul shaft: declared ${(TRISHUL_SHAFT_RADIUS * 1000).toFixed(2)} mm, ` +
        `measured ${(band.maxRadius * 1000).toFixed(2)} mm over ${band.samples} samples`,
    );
    expect(
      Math.abs(band.maxRadius - TRISHUL_SHAFT_RADIUS),
      `declared ${TRISHUL_SHAFT_RADIUS * 1000} mm, measured ${(band.maxRadius * 1000).toFixed(2)} mm`,
    ).toBeLessThan(0.0015);
    materials.dispose();
  });

  it("the damaru's declaration understates its grip-band material — found, and by how much", async () => {
    // Not a manufactured failure: the damaru's waist cord (a torus at
    // ~9 mm) and the strikers' roots live inside the band the hand
    // closes over, while the presentation declares the 6.2 mm waist
    // alone. The fist closes on the declared number, so cord and knots
    // sit inside the closed fingers — absorbed today as "soft contact",
    // stated by nothing. This measurement is the first thing in the
    // repository that can SAY it, which is the experiment's point:
    // whether the gap is acceptable is a judgement, but it should be a
    // judgement about a number rather than about nothing.
    const { rig, materials } = await rigFor(createDefaultShivaConfiguration());
    const drum = find(rig, "attachment:shiva.attribute.damaru");
    expect(drum).not.toBeNull();
    const points = surfacePoints(drum!, drum!, 1);
    const band = radialBand(points, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0.006);
    expect(band.samples).toBeGreaterThan(20);
    console.info(
      `[spatial] damaru grip band: declared ${(DAMARU_WAIST_RADIUS * 1000).toFixed(2)} mm, ` +
        `measured ${(band.maxRadius * 1000).toFixed(2)} mm over ${band.samples} samples`,
    );
    expect(
      band.maxRadius,
      `declared ${DAMARU_WAIST_RADIUS * 1000} mm, measured ${(band.maxRadius * 1000).toFixed(2)} mm`,
    ).toBeGreaterThan(DAMARU_WAIST_RADIUS + 0.001);
    materials.dispose();
  });

  it("the shaft coexists with the channel a closed fist keeps open; an oversized one cannot", async () => {
    const { rig, materials } = await rigFor(createDefaultShivaConfiguration());
    const slot = ARM_SLOTS.find(
      (candidate) => rig.heldByHand[candidate]?.presentationId === "handheldShaft",
    );
    expect(slot).toBeDefined();
    const held = rig.heldByHand[slot!]!;
    // The fist's aperture as a VOID: the tube the closure leaves open,
    // its radius the declared grip radius plus the same flesh allowance
    // the finger-skin test grants. In the item's grip frame the channel
    // is +Y through the origin by construction.
    const fistVoid: Extract<SpatialPrimitive, { shape: "cylinder" }> = {
      shape: "cylinder",
      center: [0, 0, 0],
      axis: [0, 1, 0],
      radius: (held.radius ?? 0) + 0.004,
      halfHeight: 0.02,
    };
    const staff = find(rig, "attachment:shiva.attribute.trishul")!;
    const measured = radialBand(
      surfacePoints(staff, staff, 2),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
      0.1,
    );
    // The REAL shaft, at its MEASURED thickness, passes through.
    expect(
      passesThroughVoid(fistVoid, {
        shape: "capsule",
        start: [0, -0.15, 0],
        end: [0, 0.15, 0],
        radius: measured.maxRadius,
      }),
    ).toBe(true);
    // A shaft twice the declaration — the geometry a lying manifest
    // would ship — cannot occupy the same fist.
    expect(
      passesThroughVoid(fistVoid, {
        shape: "capsule",
        start: [0, -0.15, 0],
        end: [0, 0.15, 0],
        radius: 0.02,
      }),
    ).toBe(false);
    materials.dispose();
  });
});

describe("ornament against ornament — a question nothing else asks", () => {
  it("measures the serpent's distance to the rudraksha — and finds them touching", async () => {
    const { rig, materials } = await rigFor(createDefaultShivaConfiguration());
    const naga = find(rig, "attachment:shiva.ornament.naga");
    const mala = find(rig, "attachment:shiva.mala.rudraksha");
    expect(naga).not.toBeNull();
    expect(mala).not.toBeNull();
    const a = surfacePoints(naga!, rig.root, 2);
    const b = surfacePoints(mala!, rig.root, 2);
    const t0 = performance.now();
    const approach = closestApproach(a, b, 0.02);
    const elapsed = performance.now() - t0;
    // Each is held out of the BODY by its own mechanism; their mutual
    // clearance has never been stated anywhere. The first time the
    // question is asked, the answer is: they are in CONTACT — the
    // serpent's underside and the mala's upper strand pass within a
    // millimetre (surface samples cannot sign a penetration, so "within
    // a sample step" may be an overlap). Visually absorbed as beads
    // lying under a serpent; structurally, unknown until measured. The
    // assertion pins the finding, not a wish: if a later change parts
    // them or buries one in the other, this number is where it shows.
    expect(approach, `closest approach ${(approach * 1000).toFixed(2)} mm`).toBeLessThan(0.004);
    expect(approach).toBeGreaterThanOrEqual(0);
    console.info(
      `[spatial] naga↔rudraksha closest approach ${(approach * 1000).toFixed(2)} mm ` +
        `(${a.length}×${b.length} samples in ${elapsed.toFixed(0)} ms)`,
    );
    // Validation-tool cost, not frame cost — and it must stay that way.
    expect(elapsed).toBeLessThan(1000);
    materials.dispose();
  });
});

describe("the semantic layer is untouched", () => {
  it("the resolver, not the spatial layer, still decides how an attribute presents", async () => {
    // Same behaviour the presentation suite pins, re-asserted with the
    // spatial module loaded: a blessing hand releases the trishul and it
    // stands on the ground — a SEMANTIC choice. Nothing in engine/spatial
    // accepts a configuration, a pose or a registry; it can only measure
    // a placement someone else already made.
    const config = createDefaultShivaConfiguration();
    config.pose = { preset: "shiva.blessing", jointOverrides: {} } as CharacterConfiguration["pose"];
    const { rig, materials } = await rigFor(config);
    const trishul = rig.resolved.attachments.find((a) => a.asset.id === "shiva.attribute.trishul");
    expect(trishul?.presentation.id).toBe("grounded");
    const held = await rigFor(createDefaultShivaConfiguration());
    const heldTrishul = held.rig.resolved.attachments.find(
      (a) => a.asset.id === "shiva.attribute.trishul",
    );
    expect(heldTrishul?.presentation.id).toBe("handheldShaft");
    held.materials.dispose();
    materials.dispose();
  });
});
