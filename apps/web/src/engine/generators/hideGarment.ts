/**
 * Shiva's hide wrap — a lower garment fitted to a measured body.
 *
 * The classic dhoti generator lathes one cylinder around the hips. On a
 * stylised body that reads as stylisation; against real anatomy it reads
 * as a barrel, and any pose that moves the legs drives them through it.
 *
 * This garment is built the way cloth is actually worn:
 *
 * - every surface is lofted from the body's OWN measurements (hips, waist,
 *   thigh, knee, calf) plus a declared cloth clearance, so the cloth sits
 *   on the body instead of enclosing it;
 * - it is split at the joints it crosses. The wrap rides the pelvis, the
 *   upper cloth rides each thigh, the lower cloth rides each shin — so
 *   when a leg folds, its cloth folds with it. No pose can push a leg out
 *   through this garment, because the leg is what carries it;
 * - the hide is slung over the hips as its own panel, torn at every edge:
 *   a skin is cut from an animal, not hemmed;
 * - the markings are painted into the mesh's vertex colours, which tint
 *   the customer's chosen garment colour rather than replacing it, so a
 *   hide stays a hide in any palette without needing a texture.
 *
 * Nothing here knows which deity wears it. A body that reports different
 * measurements gets a garment cut to them.
 */
import * as THREE from "three";
import { mesh } from "../geometry";
import { num, type JointedPart, type PartGenerator } from "./types";
import type { BodyProfile } from "./bodyProfile";

/** Cloth sits this far off the skin — enough to read as fabric, not paint. */
const CLEARANCE = 0.008;

/** One ring of a cloth sleeve: a height and an elliptical half-width. */
interface ClothSection {
  y: number;
  rx: number;
  rz: number;
  z?: number;
}

/**
 * Deterministic value noise. A hide's markings and its torn edge must be
 * irregular but identical on every rebuild, or the statue would shimmer
 * as the customer changed an unrelated option.
 */
function noise(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** Smoothed version of the same field, for markings that vary gently. */
function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const ease = (t: number) => t * t * (3 - 2 * t);
  const u = ease(x - ix);
  const v = ease(y - iy);
  const a = noise(ix, iy);
  const b = noise(ix + 1, iy);
  const c = noise(ix, iy + 1);
  const d = noise(ix + 1, iy + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/**
 * An open sleeve of cloth around a limb or a hip, given top-down.
 *
 * Not the shared loft(): cloth has no end caps — you can see up inside a
 * hem — and that helper closes both ends and assumes ascending sections.
 * Winding here is outward whichever way the sections run.
 */
function sleeve(
  sections: readonly ClothSection[],
  radial: number,
  perSpan: number,
  /**
   * Vertical folds, deepening toward the hem. Cloth gathers; a surface of
   * revolution without this reads as a moulded tube however well it fits.
   */
  folds = 0,
): THREE.BufferGeometry {
  const curve = (pick: (s: ClothSection) => number) =>
    new THREE.CatmullRomCurve3(
      sections.map((section, i) => new THREE.Vector3(i, pick(section), 0)),
      false,
      "catmullrom",
      0.5,
    );
  const yCurve = curve((s) => s.y);
  const rxCurve = curve((s) => s.rx);
  const rzCurve = curve((s) => s.rz);
  const zCurve = curve((s) => s.z ?? 0);

  const rings = (sections.length - 1) * perSpan;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;
    const y = yCurve.getPoint(t).y;
    const rx = Math.max(0.0005, rxCurve.getPoint(t).y);
    const rz = Math.max(0.0005, rzCurve.getPoint(t).y);
    const zOffset = zCurve.getPoint(t).y;
    for (let column = 0; column < radial; column += 1) {
      const angle = (column / radial) * Math.PI * 2;
      // Folds run down the cloth, deepest at the hem where it hangs free,
      // and irregular so they do not read as fluting.
      const pleat =
        folds === 0
          ? 1
          : 1 +
            folds *
              t *
              (0.55 * Math.cos(angle * 7 + 0.6) + 0.45 * Math.cos(angle * 11 + 2.1));
      positions.push(Math.cos(angle) * rx * pleat, y, Math.sin(angle) * rz * pleat + zOffset);
    }
  }
  // Sections run downward, so the ring order is reversed relative to an
  // ascending loft: wind accordingly and the outside faces out.
  for (let ring = 0; ring < rings; ring += 1) {
    for (let column = 0; column < radial; column += 1) {
      const a = ring * radial + column;
      const b = ring * radial + ((column + 1) % radial);
      const c = (ring + 1) * radial + column;
      const d = (ring + 1) * radial + ((column + 1) % radial);
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Paint hide markings into a piece's vertex colours: dark rosettes over a
 * lighter ground, the way a spotted skin reads at statue scale. A tint of
 * 1 leaves the customer's garment colour untouched.
 *
 * `density` scales how much of the surface the markings claim, so the
 * wrapped cloth can stay quiet while the hide panel carries the pattern.
 */
function markHide(geometry: THREE.BufferGeometry, seed: number, density = 1): void {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    // Cylindrical coordinates keep the pattern continuous round the seam.
    const angle = Math.atan2(z, x);
    // Cells roughly 2 cm across: big enough to read as markings on a
    // statue, small enough not to look like a pattern swatch.
    const u = (angle / (Math.PI * 2) + 1) * 22 + seed;
    const v = y * 70 + seed;
    const cell = smoothNoise(u, v);
    const fine = smoothNoise(u * 2.2 + 5.1, v * 2.2 + 1.3);
    // A rosette is a dark ring with a lighter middle, not a blob.
    const core = cell > 0.72 ? 1 : 0;
    const ring = cell > 0.56 && cell <= 0.76 && fine > 0.34 ? 1 : 0;
    const ground = 1 - 0.1 * smoothNoise(u * 0.7, v * 0.5);
    const tint = ground - density * (0.62 * ring + 0.3 * core);
    // Markings are browner than the ground, not merely darker.
    colors[i * 3] = tint;
    colors[i * 3 + 1] = tint * (0.92 - 0.12 * density * ring);
    colors[i * 3 + 2] = tint * (0.74 - 0.2 * density * ring);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/**
 * Pull a piece's last rings into a torn edge. The sleeve is a regular
 * grid, so the ragged edge is made by moving the final rings rather than
 * by cutting triangles out of them.
 */
function ragHem(geometry: THREE.BufferGeometry, radial: number, depth: number): void {
  const position = geometry.getAttribute("position");
  const rings = position.count / radial;
  for (let column = 0; column < radial; column += 1) {
    const bite =
      depth * (0.2 + 0.5 * noise(column * 1.7, 3.3) + 0.3 * noise(column * 0.41, 8.7));
    for (let ring = rings - 2; ring < rings; ring += 1) {
      const index = ring * radial + column;
      position.setY(index, position.getY(index) + bite * (ring === rings - 1 ? 1 : 0.4));
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** A sleeve of cloth, marked and optionally torn at its hem. */
function clothPiece(
  sections: readonly ClothSection[],
  material: THREE.Material,
  { seed = 0, hem = 0, density = 1, radial = 30, folds = 0 } = {},
): THREE.Mesh {
  const geometry = sleeve(sections, radial, 4, folds);
  if (hem > 0) ragHem(geometry, radial, hem);
  markHide(geometry, seed, density);
  return new THREE.Mesh(geometry, material);
}

/**
 * The cloth around one leg, in two pieces: one on the thigh, one on the
 * shin. Splitting at the knee is what lets the garment survive a fold —
 * each piece is carried by the bone beneath it, so no pose can push a leg
 * out through its own cloth.
 */
function legCloth(
  body: BodyProfile,
  material: THREE.Material,
  seed: number,
  length: number,
): { thigh: THREE.Mesh; shin: THREE.Mesh | null } {
  const fit = (radius: number) => radius + CLEARANCE;
  const top = fit(body.thighTopRadius);
  const mid = fit(body.thighMidRadius);
  const knee = fit(body.kneeRadius);
  // Cloth hangs away from the leg rather than sleeving it: the dhoti is
  // draped, and a wrap that follows every contour reads as a legging.
  const thighSections: ClothSection[] = [
    { y: 0.03, rx: top * 1.06, rz: top * 1.08 },
    { y: -body.thighLength * 0.4, rx: mid * 1.14, rz: mid * 1.18 },
    { y: -body.thighLength * 0.82, rx: knee * 1.42, rz: knee * 1.48 },
    // Reaches well past the knee: when the leg folds, the two pieces must
    // still overlap on the OUTSIDE of the bend, where they separate most.
    { y: -body.thighLength * 1.18, rx: knee * 1.5, rz: knee * 1.56 },
  ];
  const thigh = clothPiece(thighSections, material, {
    seed,
    hem: 0.01,
    density: 0,
    folds: 0.08,
  });

  if (length < 0.55) return { thigh, shin: null };
  const calf = fit(body.calfRadius);
  const ankle = fit(body.ankleBandRadius);
  // Down to the ankle, as the reference shows, gathering in as it falls
  // so the hem is a cuff of cloth rather than a flare.
  const drop = body.shinLength * 0.94 * Math.min(1, (length - 0.4) * 1.7);
  const shinSections: ClothSection[] = [
    { y: 0.075, rx: knee * 1.46, rz: knee * 1.52 },
    { y: -drop * 0.38, rx: calf * 1.24, rz: calf * 1.3 },
    { y: -drop * 0.78, rx: calf * 1.12, rz: calf * 1.18 },
    { y: -drop, rx: ankle * 1.62, rz: ankle * 1.68 },
  ];
  return {
    thigh,
    shin: clothPiece(shinSections, material, {
      seed: seed + 7,
      hem: 0.015,
      density: 0,
      folds: 0.07,
    }),
  };
}

/**
 * The hide worn OVER the cloth on the upper leg: a short wrap with a torn
 * lower edge, sitting proud of the cream beneath it so the two layers
 * read as two layers.
 */
function hideOverThigh(body: BodyProfile, material: THREE.Material, seed: number): THREE.Mesh {
  const fit = (radius: number) => radius + CLEARANCE * 2.6;
  const top = fit(body.thighTopRadius);
  const mid = fit(body.thighMidRadius);
  const sections: ClothSection[] = [
    { y: 0.028, rx: top * 1.12, rz: top * 1.14 },
    { y: -body.thighLength * 0.3, rx: mid * 1.32, rz: mid * 1.36 },
    { y: -body.thighLength * 0.62, rx: mid * 1.44, rz: mid * 1.48 },
  ];
  return clothPiece(sections, material, { seed, hem: 0.032, density: 1, folds: 0.06 });
}

/**
 * The hide itself: a panel of skin slung over the hips and torn at its
 * lower edge. This is the piece that says whose garment this is, so it
 * carries the markings at full strength while the wrapped cloth stays
 * quiet underneath.
 */
function hidePanel(body: BodyProfile, material: THREE.Material, waistY: number): THREE.Mesh {
  const rows = 14;
  const cols = 22;
  // Slung from the left hip, across the front, round to the right.
  const from = -Math.PI * 0.06;
  const span = Math.PI * 1.1;
  const rx = body.pelvisHalfWidth + CLEARANCE * 2.8;
  const rz = body.bellyRadiusZ + CLEARANCE * 2.8;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const t = row / rows;
    for (let col = 0; col <= cols; col += 1) {
      const s = col / cols;
      const angle = from + s * span;
      // The skin hangs lowest where it is slung, and its lower edge is
      // torn rather than cut straight.
      const hang = 0.11 + 0.17 * Math.pow(Math.sin(s * Math.PI), 1.3);
      const tear = t > 0.75 ? (noise(col * 2.7, 1.9) - 0.5) * 0.055 : 0;
      const flare = 1 + 0.17 * t;
      positions.push(
        Math.cos(angle) * rx * flare,
        waistY - 0.012 - t * hang + tear * t,
        Math.sin(angle) * rz * flare,
      );
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const a = row * (cols + 1) + col;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  markHide(geometry, 3, 1);
  return new THREE.Mesh(geometry, material);
}

export const humanoidHideWrap: PartGenerator = (ctx) => {
  const body = ctx.body;
  // Two materials, two layers: plain cloth underneath, patterned hide
  // over it. Both follow the palette the customer chose, so the hide is
  // the accent colour with its markings tinted into the mesh.
  const cloth = ctx.materials.get("garment");
  const hide = ctx.materials.getPatterned("garmentAccent");
  const sashMaterial = ctx.materials.get("garmentAccent");
  const metal = ctx.materials.get("metal");
  // 0 = hip wrap only; 1 = cloth carried down to the ankles.
  const length = num(ctx, "length", 1);

  const waistY = body.waistSeatY;
  const seat = body.thighSeatY;
  const hipRx = body.pelvisHalfWidth + CLEARANCE;
  const hipRz = body.bellyRadiusZ + CLEARANCE;

  // ---- the wrap over the hips, riding the pelvis ------------------------
  const wrap = new THREE.Group();
  // Seated poses fold the legs up in front of the hips, so the wrap is
  // short and the length goes onto the legs instead — which is how cloth
  // is actually gathered to sit down.
  const skirt = ctx.seated ? 0.06 : 0.15;
  const wrapSections: ClothSection[] = [
    { y: waistY + 0.012, rx: hipRx * 0.88, rz: hipRz * 0.9 },
    { y: waistY - 0.016, rx: hipRx * 0.97, rz: hipRz * 0.98 },
    { y: seat - 0.01, rx: hipRx * 1.06, rz: hipRz * 1.08 },
    { y: seat - skirt, rx: hipRx * 1.12, rz: hipRz * 1.14 },
  ];
  // Cloth first, hide over it: two layers, as the reference wears them.
  wrap.add(clothPiece(wrapSections, cloth, { seed: 1, hem: 0.014, density: 0, folds: 0.05 }));
  wrap.add(hidePanel(body, hide, waistY));

  // ---- sash and clasp at the waist --------------------------------------
  const sashRx = hipRx * 0.9;
  const sashRz = hipRz * 0.92;
  wrap.add(
    mesh(new THREE.TorusGeometry(sashRx, 0.0105, 10, 44), sashMaterial, {
      position: [0, waistY, 0],
      rotation: [Math.PI / 2, 0, 0],
      scale: [1, 1, sashRz / sashRx],
    }),
  );
  wrap.add(
    mesh(new THREE.SphereGeometry(0.015, 14, 12), metal, {
      position: [0, waistY, sashRz * 1.04],
      scale: [1.3, 0.9, 0.55],
    }),
  );
  // The tied end, falling at the left hip.
  wrap.add(
    mesh(new THREE.ConeGeometry(0.014, 0.08, 10), sashMaterial, {
      position: [sashRx * 0.82, waistY - 0.035, sashRz * 0.5],
      rotation: [0.2, 0, 0.14],
    }),
  );

  // The gathered fold that hangs at the front of a wrapped dhoti. It is
  // what separates a wrap from a tube, so it is the one piece allowed to
  // hang free — and it is shortened when seated, exactly as cloth is
  // gathered out of the way before sitting down.
  const foldDrop = ctx.seated ? 0.1 : 0.3;
  const fold = new THREE.Group();
  for (const [offset, width, drop, tilt] of [
    [-0.022, 0.032, 1, 0.03],
    [0.012, 0.028, 0.88, -0.04],
    [0.036, 0.022, 0.72, -0.09],
  ] as const) {
    const panel: ClothSection[] = [
      { y: waistY - 0.01, rx: width, rz: 0.006, z: hipRz * 0.86 },
      { y: waistY - foldDrop * 0.45, rx: width * 1.15, rz: 0.008, z: hipRz * 0.92 },
      { y: waistY - foldDrop, rx: width * 1.05, rz: 0.007, z: hipRz * 0.86 },
    ];
    const piece = clothPiece(panel, hide, { seed: 5 + offset * 20, hem: 0.02, density: 0.75, radial: 12 });
    piece.position.x = offset;
    piece.rotation.z = tilt;
    piece.scale.y = drop;
    fold.add(piece);
  }
  wrap.add(fold);

  const left = legCloth(body, cloth, 11, ctx.seated ? 0.5 : length);
  const right = legCloth(body, cloth, 23, ctx.seated ? 0.5 : length);

  const pieces: Array<JointedPart[number]> = [
    { joint: "pelvis", object: wrap },
    { joint: "leg.left.thigh", object: left.thigh },
    { joint: "leg.right.thigh", object: right.thigh },
    { joint: "leg.left.thigh", object: hideOverThigh(body, hide, 31) },
    { joint: "leg.right.thigh", object: hideOverThigh(body, hide, 43) },
  ];
  if (left.shin) pieces.push({ joint: "leg.left.shin", object: left.shin });
  if (right.shin) pieces.push({ joint: "leg.right.shin", object: right.shin });
  return pieces;
};
