/**
 * Athletic (masculine human) body generator — "humanoid.athletic".
 *
 * Built SCULPTURALLY, not from unions of visible spheres: the torso and
 * neck are elliptical LOFTS — single smooth surfaces whose silhouette
 * carries the anatomy (shoulder breadth → ribcage → narrow waist → hips,
 * the male V-taper) — with only shallow surface forms (pecs, deltoids)
 * layered on top. Limbs are muscle-profiled tapered tubes.
 *
 * Articulation: the torso is split into a pelvis-owned lower loft and a
 * chest-owned upper loft that meet at the waist with matched sections, so
 * gentle spine/chest pose rotations stay watertight visually.
 *
 * Params (pure manifest data):
 *   form:     "athletic"  (also selects the matching BodyProfile branch)
 *   chest:    pectoral/ribcage development       (1 = classic)
 *   waist:    lower-torso girth                  (1 = classic)
 *   shoulder: shoulder breadth                   (1 = classic)
 *
 * IMPORTANT: the waist/chest/hip/neck volumes are mirrored by
 * deriveAthleticProfile (bodyProfile.ts) — keep them in sync.
 */
import * as THREE from "three";
import {
  ARM_SLOTS,
  activeArmSlots,
  type JointId,
} from "@devaform/character-schema";
import { loft, mesh, taperedTube, type V3 } from "../geometry";
import { num, type GeneratorContext, type PartGenerator } from "./types";
import { jointOffset, makeFoot } from "./body";

/** Muscle-profiled limb segment: subtle mid-bulge instead of joint balls. */
function muscleTube(
  material: THREE.Material,
  end: V3,
  r0: number,
  r1: number,
  bulge = 0.12,
  bulgeAt = 0.4,
): THREE.Mesh {
  const midpoint: V3 = [end[0] / 2, end[1] / 2, end[2] / 2];
  const profile = (t: number): number => {
    const base = r0 + (r1 - r0) * t;
    const swell = Math.exp(-(((t - bulgeAt) / 0.28) ** 2));
    return base * (1 + bulge * swell);
  };
  return new THREE.Mesh(taperedTube([[0, 0, 0], midpoint, end], profile, 20, 16), material);
}

export const athleticBody: PartGenerator = (ctx) => {
  const skin = ctx.materials.get("skin");
  const chest = num(ctx, "chest", 1);
  const waist = num(ctx, "waist", 1);
  const shoulder = num(ctx, "shoulder", 1);
  const bulk = ctx.proportions.bulk;
  const armSlots = activeArmSlots(ctx.arms);

  const parts: Array<{ joint: JointId; object: THREE.Object3D }> = [];
  const bx = (v: number) => v * bulk;

  // ---- LOWER TORSO (pelvis joint): crotch → hips → waist ---------------
  // Top section matches the chest loft's bottom section (same world height:
  // pelvis+0.14 == chest−0.12) so the two sweeps read as one body.
  const waistRx = 0.093 * waist;
  parts.push({
    joint: "pelvis",
    object: mesh(
      loft(
        [
          { y: -0.085, rx: bx(0.072), rz: bx(0.06), z: 0.002 },
          { y: -0.04, rx: bx(0.105), rz: bx(0.075), z: 0.002 },
          { y: 0.02, rx: bx(0.108), rz: bx(0.076), z: 0.004 },
          { y: 0.08, rx: bx(waistRx + 0.006), rz: bx(0.07), z: 0.006 },
          { y: 0.14, rx: bx(waistRx), rz: bx(0.068), z: 0.006 },
        ],
        30,
      ),
      skin,
    ),
  });

  // ---- UPPER TORSO (chest joint): waist → ribcage → shoulders ----------
  parts.push({
    joint: "chest",
    object: mesh(
      loft(
        [
          { y: -0.125, rx: bx(waistRx), rz: bx(0.068), z: 0.006 },
          { y: -0.06, rx: bx(0.104 + 0.008 * chest), rz: bx(0.076), z: 0.008 },
          { y: 0.0, rx: bx(0.124 + 0.01 * chest), rz: bx(0.083), z: 0.01 },
          { y: 0.06, rx: bx(0.14 * shoulder), rz: bx(0.086), z: 0.011 },
          { y: 0.1, rx: bx(0.148 * shoulder), rz: bx(0.079), z: 0.005 },
          { y: 0.135, rx: bx(0.125 * shoulder), rz: bx(0.068), z: 0.0 },
          { y: 0.162, rx: bx(0.055), rz: bx(0.052), z: -0.002 },
        ],
        30,
      ),
      skin,
    ),
  });

  // Pectorals — shallow surface mounds on the loft, not spheres
  for (const side of [1, -1]) {
    parts.push({
      joint: "chest",
      object: mesh(new THREE.SphereGeometry(0.046, 22, 16), skin, {
        position: [side * bx(0.054), 0.05, bx(0.072)],
        scale: [1.3, 0.9 * chest, 0.22],
      }),
    });
  }
  // Deltoids — elongated caps blending the torso edge into the upper arm
  for (const side of [1, -1]) {
    parts.push({
      joint: "chest",
      object: mesh(new THREE.SphereGeometry(0.05, 24, 18), skin, {
        position: [side * bx(0.167 * shoulder), 0.1, 0],
        scale: [0.92, 1.28, 0.95],
      }),
    });
  }
  // Trapezius wedges softening the shoulder-top → neck transition
  for (const side of [1, -1]) {
    parts.push({
      joint: "chest",
      object: new THREE.Mesh(
        taperedTube(
          [
            [side * 0.02, 0.168, -0.01],
            [side * bx(0.08), 0.148, -0.006],
            [side * bx(0.14 * shoulder), 0.118, 0],
          ],
          [0.026, 0.016],
          16,
          10,
        ),
        skin,
      ),
    });
  }

  // ---- NECK (neck joint): one tapered organic column -------------------
  // Base matches the torso's top section; the crown tucks under the jaw.
  parts.push({
    joint: "neck",
    object: mesh(
      loft(
        [
          { y: -0.01, rx: bx(0.052), rz: bx(0.05), z: -0.002 },
          { y: 0.035, rx: bx(0.041), rz: bx(0.04), z: -0.001 },
          { y: 0.08, rx: bx(0.037), rz: bx(0.037), z: 0 },
          { y: 0.125, rx: bx(0.038), rz: bx(0.039), z: 0 },
        ],
        22,
      ),
      skin,
    ),
  });

  // ---- ARMS -------------------------------------------------------------
  for (const slot of ARM_SLOTS) {
    if (!armSlots.includes(slot)) continue;
    const upperEnd = jointOffset(`arm.${slot}.forearm`);
    const forearmEnd = jointOffset(`arm.${slot}.hand`);
    parts.push({
      joint: `arm.${slot}.upper`,
      object: muscleTube(skin, upperEnd, 0.034 * bulk, 0.026 * bulk, 0.16, 0.38),
    });
    parts.push({
      joint: `arm.${slot}.forearm`,
      object: (() => {
        const g = new THREE.Group();
        g.add(
          mesh(new THREE.SphereGeometry(0.027 * bulk, 14, 12), skin, {
            scale: [0.95, 1.1, 0.95],
          }),
        );
        g.add(muscleTube(skin, forearmEnd, 0.026 * bulk, 0.019 * bulk, 0.14, 0.3));
        return g;
      })(),
    });
    parts.push({
      joint: `arm.${slot}.hand`,
      object: mesh(new THREE.SphereGeometry(0.021 * bulk, 14, 10), skin, {
        position: [0, 0.002, 0],
        scale: [0.95, 1.05, 0.9],
      }),
    });
  }

  // ---- LEGS -------------------------------------------------------------
  for (const slot of ["left", "right"] as const) {
    const thighEnd = jointOffset(`leg.${slot}.shin`);
    const shinEnd = jointOffset(`leg.${slot}.foot`);
    parts.push({
      joint: `leg.${slot}.thigh`,
      object: muscleTube(skin, thighEnd, 0.048 * bulk, 0.038 * bulk, 0.08, 0.3),
    });
    parts.push({
      joint: `leg.${slot}.shin`,
      object: (() => {
        const g = new THREE.Group();
        g.add(
          mesh(new THREE.SphereGeometry(0.04 * bulk, 16, 12), skin, {
            scale: [0.95, 1.05, 0.95],
          }),
        );
        g.add(muscleTube(skin, shinEnd, 0.036 * bulk, 0.024 * bulk, 0.2, 0.32));
        return g;
      })(),
    });
    parts.push({ joint: `leg.${slot}.foot`, object: makeFoot(ctx as GeneratorContext) });
  }

  return parts;
};
