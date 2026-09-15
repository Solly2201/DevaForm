/**
 * A layered lower garment fitted to a measured body.
 *
 * `references/ref3.png` shows three things worn together, not one: a cream
 * dhoti reaching the ankles, an animal hide slung over the hips and upper
 * thighs, and an ochre sash with a long panel hanging down the front. They
 * are one design decision — the layering is what makes it read as dress
 * rather than as a costume piece — so they are one garment, parameterised,
 * rather than three assets fighting over one slot.
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
import { clothWeave, hideMarkings } from "../textures";
import { num, type GeneratorContext, type PartGenerator } from "./types";
import type { JointId } from "@devaform/character-schema";
import type { BodyProfile } from "./bodyProfile";

/** Cloth sits this far off the skin — enough to read as fabric, not paint. */
const CLEARANCE = 0.008;

/**
 * How far the dhoti's folds stand out, as a fraction of its radius at the
 * hem. Named because two things need it: the column that has them, and
 * anything hanging on the column, which has to clear them. A pleat hung a
 * centimetre off a surface that gathers by rather more than a centimetre
 * comes through it in steps.
 */
const DHOTI_FOLDS = 0.2;

/**
 * One ring of a cloth sleeve.
 *
 * `rx`/`rz` are the half-widths, and `flat` is how much of the width is a
 * straight span rather than curve: the section is an ellipse swept along
 * that span, which is a rounded rectangle when `flat` is set and a plain
 * ellipse (the default) when it is not.
 *
 * It exists because a lower garment goes round TWO legs. An ellipse
 * through the same extents cuts the diagonals off, and the calves came
 * out through the back corners of a dhoti that measured wide enough and
 * deep enough at every cardinal point.
 */
interface ClothSection {
  y: number;
  rx: number;
  rz: number;
  z?: number;
  flat?: number;
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
/**
 * Where a section's outline is, a given fraction of the way round it.
 *
 * The section is an ellipse of half-widths `rx`/`rz` swept along a
 * straight span — an ellipse when `flat` is zero, a rounded rectangle
 * when it is not. The outline is walked by ARC LENGTH rather than by
 * bearing, so the columns are spread evenly along it.
 *
 * By bearing, they are not: the ends of a wide, shallow section subtend a
 * few degrees between them and take a few columns with them, so the cloth
 * rounded the outside of each leg in two or three facets. One of those
 * facets cut the chord inside the calf, and a patch of bare leg showed
 * through the side of a dhoti that measured wide enough everywhere.
 *
 * `u` runs from 0 at the +x extreme, the way round that +z is next, so a
 * section with no straight span is sampled exactly as an ellipse always
 * was.
 */
function outlineAt(
  u: number,
  rx: number,
  rz: number,
  flat: number,
): { x: number; z: number } {
  const span = Math.min(rx - 0.0005, Math.max(0, flat));
  const cap = rx - span;
  // In the space where the cap is a circle. Quarter-cap arc, straight run.
  const quarter = (Math.PI * cap) / 2;
  const run = 2 * span;
  const perimeter = 4 * quarter + 2 * run;
  let at = ((u % 1) + 1) % 1;
  at *= perimeter;
  let x: number;
  let z: number;
  if (at < quarter) {
    const psi = at / cap;
    x = span + cap * Math.cos(psi);
    z = cap * Math.sin(psi);
  } else if (at < quarter + run) {
    x = span - (at - quarter);
    z = cap;
  } else if (at < 3 * quarter + run) {
    const psi = (at - run) / cap;
    x = -span + cap * Math.cos(psi);
    z = cap * Math.sin(psi);
  } else if (at < 3 * quarter + 2 * run) {
    x = -span + (at - 3 * quarter - run);
    z = -cap;
  } else {
    const psi = (at - 2 * run) / cap;
    x = span + cap * Math.cos(psi);
    z = cap * Math.sin(psi);
  }
  return { x, z: (z / cap) * rz };
}

/**
 * Cloth gathers as it falls, and it gathers OUTWARD.
 *
 * The section a piece is built from is what the cloth has to contain, so
 * a fold that multiplied it by less than one pulled the surface inside
 * the limb: a tenth of the radius, at the hem, is a calf through the back
 * of the dhoti. `t` runs from the top of the piece to its hem, where
 * cloth hangs free and folds deepest.
 */
function foldAt(angle: number, t: number, folds: number): number {
  if (folds === 0) return 1;
  const wave = 0.55 * Math.cos(angle * 7 + 0.6) + 0.45 * Math.cos(angle * 11 + 2.1);
  return 1 + folds * t * (wave + 1) * 0.5;
}

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
  const flatCurve = curve((s) => s.flat ?? 0);

  const rings = (sections.length - 1) * perSpan;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;
    const y = yCurve.getPoint(t).y;
    const rx = Math.max(0.0005, rxCurve.getPoint(t).y);
    const rz = Math.max(0.0005, rzCurve.getPoint(t).y);
    const zOffset = zCurve.getPoint(t).y;
    const flat = flatCurve.getPoint(t).y;
    for (let column = 0; column < radial; column += 1) {
      const angle = (column / radial) * Math.PI * 2;
      const outline = outlineAt(column / radial, rx, rz, flat);
      const pleat = foldAt(angle, t, folds);
      positions.push(outline.x * pleat, y, outline.z * pleat + zOffset);
      // Round the piece and down it: a texture on cloth follows the cloth.
      uvs.push(column / radial, t);
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
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
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
    // Cells roughly 1.6 cm across: the reference's markings are small
    // dark spots scattered over the ochre, and cells half again that size
    // read as blurred continents rather than as a spotted skin. The cell
    // has to be the same size in BOTH directions or the rosettes come out
    // as streaks — which is what a flat angular scale did on a surface
    // whose circumference is three times its height.
    const radius = Math.max(0.016, Math.hypot(x, z));
    const u = (angle * radius) / 0.016 + seed * 7;
    const v = y / 0.016 + seed;
    const cell = smoothNoise(u, v);
    const fine = smoothNoise(u * 2.2 + 5.1, v * 2.2 + 1.3);
    // Soft-edged, and built from two scales at once.
    //
    // A hard threshold on a value-noise lattice draws its cell boundaries
    // instead of a spot: every marking came out as a rectangle with
    // corners, because that is the shape of the region where a bilinear
    // interpolant exceeds a constant. A smooth falloff has no edge to
    // show, and the second scale breaks up what is left of the grid.
    const field = cell * 0.72 + fine * 0.28;
    const edge = (lo: number, hi: number, at: number) => {
      const t = Math.min(1, Math.max(0, (at - lo) / (hi - lo)));
      return t * t * (3 - 2 * t);
    };
    const core = edge(0.6, 0.78, field);
    const ring = edge(0.5, 0.64, field) * (1 - core);
    // The ground varies with the markings, not independently of them: a
    // plain cream cloth asks for markings at zero, and a tenth of the
    // brightness in slow patches reads on cream as two grey stains down
    // the back of the dhoti.
    const ground = 1 - (0.015 + 0.085 * density) * smoothNoise(u * 0.7, v * 0.5);
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
 * The hide's fall down one leg.
 *
 * This was a cream sleeve per leg with the skin laid over it, and two
 * sleeves is a pair of trousers however they are coloured. A dhoti is one
 * draped mass and a hide is a single skin, so there is only the hide now:
 * it wraps the thigh, ends in a torn edge above the knee, and the leg
 * continues bare below it, which is what the references show.
 *
 * It still rides the thigh joint, so a folded leg carries its own cloth
 * and no pose can push a leg out through the garment.
 */
function legHide(
  body: BodyProfile,
  material: THREE.Material,
  seed: number,
  length: number,
): THREE.Mesh {
  const fit = (radius: number) => radius + CLEARANCE * 2.2;
  const top = fit(body.thighTopRadius);
  const mid = fit(body.thighMidRadius);
  // How far down the thigh the skin reaches before it is torn off.
  const fall = body.thighLength * (0.5 + 0.42 * Math.min(1, Math.max(0, length)));
  const sections: ClothSection[] = [
    { y: 0.032, rx: top * 1.1, rz: top * 1.13 },
    { y: -fall * 0.42, rx: mid * 1.26, rz: mid * 1.3 },
    { y: -fall * 0.84, rx: mid * 1.4, rz: mid * 1.45 },
    { y: -fall, rx: mid * 1.44, rz: mid * 1.49 },
  ];
  return clothPiece(sections, material, { seed, hem: 0.04, density: 1, folds: 0.07 });
}

/**
 * Cloth over one thigh, for a figure that has folded its legs.
 *
 * A wrapped column is a statement about two legs standing side by side;
 * fold them and the statement is false, so a seated figure was given the
 * hip wrap alone and sat in what read as underwear. Cloth does not
 * disappear when you sit down — it goes over the lap.
 *
 * It rides the thigh bone, so the drape follows whatever the pose does
 * with the leg, and it is sized from that thigh's own girths.
 */
function thighDrape(
  body: BodyProfile,
  material: THREE.Material,
  seed: number,
  reach: number,
): THREE.Mesh {
  // Close to the leg. Cloth wrapped round a thigh is a wrap, not a
  // trumpet: lofted out to half again the knee's girth it came out as two
  // cream flags standing off the lap.
  const fit = (radius: number) => radius + CLEARANCE * 1.8;
  const top = fit(body.thighTopRadius);
  const mid = fit(body.thighMidRadius);
  const knee = fit(body.kneeRadius);
  // Short of the knee. Carried past it, the cloth juts into the air where
  // the shin has already turned away, and an open tube end pointing at
  // the viewer reads as a sheet of paper rather than as a leg in cloth.
  const fall = body.thighLength * (0.62 + 0.14 * Math.min(1, Math.max(0, reach)));
  const sections: ClothSection[] = [
    { y: 0.03, rx: top * 1.02, rz: top * 1.05 },
    { y: -fall * 0.45, rx: mid * 1.06, rz: mid * 1.1 },
    { y: -fall * 0.85, rx: knee * 1.12, rz: knee * 1.16 },
    { y: -fall, rx: knee * 1.06, rz: knee * 1.1 },
  ];
  return clothPiece(sections, material, { seed, hem: 0.016, density: 0, folds: 0.07, radial: 30 });
}

/**
 * The cloth that falls from the waist between folded knees.
 *
 * A narrow fall, not an apron. Authored first as a panel the width of the
 * hips, it spread past the knees as two cream wings and ran through both
 * thighs on the way — because a seated figure's thighs come out of the
 * hips SIDEWAYS, and any cloth wide enough to cover them has to be on
 * them rather than hanging from the waist. The thighs carry their own
 * (see thighDrape); this is the piece that shows in the gap between them,
 * which is where a seated dhoti actually falls.
 */
function lapFall(body: BodyProfile, material: THREE.Material, side: 1 | -1): THREE.Mesh {
  const rows = 12;
  const cols = 8;
  const waistY = body.waistSeatY;
  const drop = body.thighLength * 0.66;
  const depth = (body.bellyRadiusZ + CLEARANCE * 2.4) * side;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const t = row / rows;
    const y = waistY - 0.012 - t * drop;
    for (let col = 0; col <= cols; col += 1) {
      const u = col / cols - 0.5;
      const width = 0.05 + 0.022 * t;
      // Gathered folds down its length, and it curls away as it falls.
      const curl = Math.cos(u * Math.PI) * 0.012 * (0.3 + t);
      const hem = t > 0.9 ? Math.abs(u) * 0.03 : 0;
      positions.push(u * width * 2, y + hem, depth * (0.9 + 0.5 * t) + curl * side);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const a = row * (cols + 1) + col;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d, a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  markHide(geometry, 9, 0);
  return new THREE.Mesh(geometry, material);
}

/**
 * A section of cloth that CONTAINS the legs at that height.
 *
 * Every dimension is the body's own measured leg extent plus cloth, so
 * the wrap fits the figure wearing it rather than a remembered one. Radii
 * were taken from a mean limb radius before, and a calf is not a
 * cylinder: both of them stood outside the dhoti from behind while it
 * looked perfectly fitted from the front.
 */
/**
 * Where the body actually is, front to back, at the hips.
 *
 * A ring centred on the pelvis JOINT is not centred on the body: this
 * figure's mass sits nearly three centimetres forward of it. Sized from a
 * half-depth and centred on the joint, a waist ring stands four
 * centimetres clear at the back and cuts a centimetre into the belly at
 * the front — which is what the hide was doing. The legs beneath report
 * their own fore-aft centre in this very frame, and the hips are directly
 * above them.
 */
function hipCentreZ(body: BodyProfile): number {
  const leg = body.legExtentAt(body.thighSeatY);
  return (leg.frontZ + leg.backZ) / 2;
}

function overHips(
  body: BodyProfile,
  y: number,
  slack: number,
  hipRx: number,
  hipRz: number,
): ClothSection {
  const leg = wrapSection(body, y, slack);
  return {
    ...leg,
    rx: Math.max(hipRx, leg.rx),
    rz: Math.max(hipRz, leg.rz),
  };
}

function wrapSection(body: BodyProfile, y: number, slack: number): ClothSection {
  const leg = body.legExtentAt(y);
  const depth = Math.max(leg.frontZ, -leg.backZ) + CLEARANCE * slack;
  return {
    y,
    rx: leg.halfWidth + CLEARANCE * slack,
    rz: depth,
    // The two legs are side by side, so the cloth spans between them: the
    // straight part is whatever the width has over the depth, and the
    // ends round off. Cloth hangs this way in any case — a dhoti is a
    // wrap, not a moulded tube — and it is what keeps the calves inside
    // it at the back corners.
    // Not `halfWidth - depth`: that makes the ends of the span circles of
    // the leg's own depth, and a leg is wider than it is deep, so the
    // cloth cut back inside the outer corners of the knees. The span runs
    // most of the way out and the caps only round it off.
    flat: Math.max(0, leg.halfWidth - depth * 0.78),
    // Cloth hangs round the legs, and the legs are not centred on the
    // pelvis joint: the section is offset to sit on them.
    z: (leg.frontZ + leg.backZ) / 2,
  };
}

/**
 * Read a list of sections at any height between them.
 *
 * A loft samples its sections at even steps, which is right when every
 * column ends at the same place. A piece whose lower edge has a SHAPE
 * does not: one bearing may stop at the hip while another reaches the
 * thigh, and each has to be given the section belonging to its own
 * height, or the short side is built at the long side's width and stands
 * off the body.
 */
function profileOf(sections: readonly ClothSection[]): (y: number) => ClothSection {
  const ordered = [...sections].sort((a, b) => b.y - a.y);
  return (y: number) => {
    if (y >= ordered[0]!.y) return ordered[0]!;
    const last = ordered[ordered.length - 1]!;
    if (y <= last.y) return last;
    let i = 0;
    while (i < ordered.length - 2 && ordered[i + 1]!.y > y) i += 1;
    const a = ordered[i]!;
    const b = ordered[i + 1]!;
    const t = (a.y - y) / Math.max(1e-9, a.y - b.y);
    const mix = (from: number, to: number) => from + (to - from) * t;
    return {
      y,
      rx: mix(a.rx, b.rx),
      rz: mix(a.rz, b.rz),
      flat: mix(a.flat ?? 0, b.flat ?? 0),
      z: mix(a.z ?? 0, b.z ?? 0),
    };
  };
}

/**
 * The hide: ONE closed skin round the hips, cut on the diagonal.
 *
 * It was a cloth tube with a separate curved sheet laid over its front,
 * and every render showed why that cannot work — the sheet covered about
 * three hundred degrees, so there was a hole at the back; it stood off
 * the waist because it flared away from the body; and its two ends met
 * the tube at a straight vertical cut that read as a notch chopped out of
 * the garment.
 *
 * A skin is one piece and it is closed round the wearer. What makes it a
 * hide rather than a skirt is its LOWER edge: slung high over one hip,
 * falling across the front, deepest over the opposite thigh, and torn. So
 * the surface goes all the way round, and each bearing is built down to
 * its own depth at the section belonging to the height it reaches.
 */
function hideWrap(
  body: BodyProfile,
  material: THREE.Material,
  waistY: number,
  fall: number,
  seed: number,
): THREE.Mesh {
  const seat = body.thighSeatY;
  const hipRx = body.pelvisHalfWidth + CLEARANCE * 2.4;
  const hipRz = body.bellyRadiusZ + CLEARANCE * 2.4;
  // The top edge goes under the kamarbandh, which is why it can be a
  // plain ring: the band is wound over it and there is no seam to see.
  const topY = waistY + 0.018;
  const deepestY = topY - fall;
  // Outside the cream cloth where they overlap: the hide is worn OVER the
  // dhoti, and the dhoti is already fitted to the legs.
  const centreZ = hipCentreZ(body);
  const profile = profileOf([
    { y: topY, rx: hipRx, rz: hipRz, z: centreZ },
    { y: waistY - 0.016, rx: hipRx * 1.02, rz: hipRz * 1.02, z: centreZ },
    overHips(body, seat - 0.01, 5, hipRx * 1.07, hipRz * 1.09),
    wrapSection(body, Math.min(seat - 0.02, deepestY + fall * 0.35), 5.4),
    wrapSection(body, deepestY, 5),
  ]);

  // Dense enough for the markings. They are vertex colours, so a spot
  // cannot be smaller than the triangles carrying it: at forty-four
  // columns the pattern came out as blurred continents however small the
  // cells were set.
  const RADIAL = 72;
  const ROWS = 26;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= ROWS; row += 1) {
    const t = row / ROWS;
    for (let column = 0; column < RADIAL; column += 1) {
      const angle = (column / RADIAL) * Math.PI * 2;
      // How far down this bearing carries: shallow over the left hip
      // where the skin is slung, deepest over the right thigh, the front
      // longer than the back, and torn all along it.
      const cut = 0.66 - 0.34 * Math.cos(angle) + 0.12 * Math.sin(angle);
      // Torn, not serrated. Per-column noise puts a full swing between
      // one column and the next, and forty-four of those round the hips
      // is a saw blade; a skin tears in long runs with small ones inside
      // them, so the irregularity is smooth and mostly low-frequency.
      const torn =
        (smoothNoise((column / RADIAL) * 5.3, seed) - 0.5) * 0.3 +
        (smoothNoise((column / RADIAL) * 18, seed + 4) - 0.5) * 0.12;
      const drop = Math.min(1.04, Math.max(0.2, cut + torn * t));
      const y = topY - t * fall * drop;
      const section = profile(y);
      const outline = outlineAt(column / RADIAL, section.rx, section.rz, section.flat ?? 0);
      const pleat = foldAt(angle, t * drop, 0.07);
      positions.push(outline.x * pleat, y, outline.z * pleat + (section.z ?? 0));
      uvs.push(column / RADIAL, t * drop);
    }
  }
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < RADIAL; column += 1) {
      const a = row * RADIAL + column;
      const b = row * RADIAL + ((column + 1) % RADIAL);
      const c = (row + 1) * RADIAL + column;
      const d = (row + 1) * RADIAL + ((column + 1) % RADIAL);
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  markHide(geometry, seed, 0);
  return new THREE.Mesh(geometry, material);
}

/**
 * The cream dhoti: ONE draped mass from the waist to the ankles.
 *
 * Built as two tubes first, one per leg, and it read as trousers — which
 * the reference is unambiguous about: `references/ref3.png` shows a single
 * wrapped column around both legs, hanging to just above the ankle, with a
 * hem that CURVES rather than cutting straight across, and a cascade of
 * pleats down the centre front. A surface of revolution with a level hem
 * is a lampshade; the curve of that hem is most of what says "cloth".
 *
 * A column only works while the legs are under it, which is why the POSE
 * says how the cloth is worn (PosePreset.garment) and this builds what it
 * asks for rather than guessing from the joint angles.
 */
function dhotiSections(body: BodyProfile, reach: number): ClothSection[] {
  const waistY = body.waistSeatY;
  const seat = body.thighSeatY;
  const hipRx = body.pelvisHalfWidth + CLEARANCE;
  const hipRz = body.bellyRadiusZ + CLEARANCE;
  const knee = seat - body.thighLength;
  const hem = knee - body.shinLength * reach;
  const around = (y: number, slack: number) => wrapSection(body, y, slack);
  return [
    // No z offset here: the column below it is centred on the LEGS, and
    // pulling its waist ring forward onto the body's own centre tips the
    // loft between them enough to uncover the outside of a thigh. The
    // hide and the band above are what needed centring.
    { y: waistY - 0.006, rx: hipRx * 0.95, rz: hipRz * 0.97 },
    // Where the legs begin, the cloth clears the legs — the pelvis is
    // narrower than the tops of the thighs beside it, and a ring sized
    // from the pelvis alone leaves the outside of each thigh standing
    // outside the cream. The hide covered that until the hide stopped
    // being a full tube, which is how it came to light.
    overHips(body, seat - 0.012, 3, hipRx * 1.05, hipRz * 1.08),
    // Below the hip the cloth follows the leg in rather than standing off
    // it. A constant allowance all the way down is what makes a dhoti
    // read as a drum: the silhouette leaves the hip and comes straight
    // down to the floor, because the legs happen to splay by about as
    // much as the cloth stands clear. Cloth hanging on a leg takes the
    // leg's own taper and gathers again at the hem.
    around(seat - body.thighLength * 0.45, 2.8),
    around(knee + body.shinLength * 0.06, 2.4),
    around((knee + hem) / 2, 1.9),
    around(hem, 2.2),
  ];
}

/**
 * Where a hanging piece sits: on the surface it hangs on, plus air.
 *
 * Every free-hanging piece of this garment used to be placed from the
 * BELLY radius, and the column it hangs over is fitted to the LEGS —
 * which are wider and deeper. So the sash and the pleated fall were built
 * inside the cloth they hang on, and came through it in slices wherever
 * the column happened to be narrower. A hanging piece asks the surface
 * where it is, exactly as an ornament asks the body.
 */
function onCloth(
  profile: (y: number) => ClothSection,
  y: number,
  bearing: number,
  clearance: number,
  /** Fraction of the radius the surface's own folds add here. */
  bulge = 0,
): { x: number; z: number } {
  const section = profile(y);
  // Hanging pieces are placed by BEARING — they hang where they are tied,
  // not a fraction of the way round the hem — so the outline is searched
  // for the point on that bearing rather than read off directly.
  let best = { x: section.rx, z: 0 };
  let bestOff = Infinity;
  const want = Math.atan2(Math.sin(bearing), Math.cos(bearing));
  for (let i = 0; i < 96; i += 1) {
    const point = outlineAt(i / 96, section.rx, section.rz, section.flat ?? 0);
    const off = Math.abs(
      Math.atan2(Math.sin(Math.atan2(point.z, point.x) - want), Math.cos(Math.atan2(point.z, point.x) - want)),
    );
    if (off < bestOff) {
      bestOff = off;
      best = point;
    }
  }
  const at = best;
  const length = Math.max(1e-6, Math.hypot(at.x, at.z));
  const out = 1 + bulge + clearance / length;
  return { x: at.x * out, z: at.z * out + (section.z ?? 0) };
}

function dhotiColumn(
  ctx: GeneratorContext,
  material: THREE.Material,
  reach: number,
): THREE.Mesh {
  const body = ctx.body;
  const sections = dhotiSections(body, reach);
  // Fine enough for the folds to survive being sampled. At forty-four
  // columns the deeper of the two fold frequencies lands on barely two
  // samples a cycle and washes out into a smooth tube.
  const RADIAL = 68;
  const geometry = sleeve(sections, RADIAL, 5, DHOTI_FOLDS);

  /**
   * Curve the hem.
   *
   * Cloth wrapped round two legs does not end on a level line: it rides up
   * between them and hangs lowest where the wrap falls. The last rings are
   * lifted by a function of the bearing, so the hem has a shape instead of
   * a horizontal cut.
   */
  const position = geometry.getAttribute("position");
  const rings = position.count / RADIAL;
  const lift = body.shinLength * 0.22;
  // The span the hem shape is drawn over: the lower third of the column.
  const FROM = Math.floor((rings - 1) * 0.62);
  const topOfSpan = position.getY(FROM * RADIAL);
  const hemY = position.getY((rings - 1) * RADIAL);
  const span = topOfSpan - hemY;
  for (let column = 0; column < RADIAL; column += 1) {
    const angle = (column / RADIAL) * Math.PI * 2;
    // Highest between the legs (front and back centre), lowest at the
    // sides, with one side carried a little lower than the other — a
    // wrapped garment is not symmetric and it is the asymmetry that reads.
    const between = Math.pow(Math.abs(Math.cos(angle)), 2.2);
    const sway = 0.16 * Math.sin(angle - 0.6);
    const rise = lift * (0.14 + 0.62 * between - sway);
    // A monotone remap of the span, not a per-ring nudge.
    //
    // Nudging each ring by a share of the rise made the rings CROSS where
    // the rise outran their spacing, and a surface folded through itself
    // culls into holes — which showed as the legs appearing through the
    // back of the dhoti, in a garment that measurably contained them.
    // Scaling the span cannot reorder it.
    const scale = span <= 1e-6 ? 1 : (span - rise) / span;
    for (let ring = FROM; ring < rings; ring += 1) {
      const index = ring * RADIAL + column;
      const y = position.getY(index);
      position.setY(index, hemY + rise + (y - hemY) * scale);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  markHide(geometry, 31, 0);
  return new THREE.Mesh(geometry, material);
}

/**
 * The cascade of pleats down the centre front of a wrapped dhoti.
 *
 * The one piece of this garment that hangs free, and therefore the piece
 * that says the cloth is cloth rather than a surface of revolution. The
 * reference shows it edged in the accent colour and falling nearly to the
 * hem.
 *
 * It hangs ON the column, so it is built from the column's own surface at
 * each height rather than from a remembered radius.
 */
function dhotiCascade(
  ctx: GeneratorContext,
  cloth: THREE.Material,
  edge: THREE.Material,
  reach: number,
): THREE.Group {
  const body = ctx.body;
  const group = new THREE.Group();
  const waistY = body.waistSeatY;
  const sections = dhotiSections(body, reach);
  const profile = profileOf(sections);
  // Where the column's folds are deepest, so a pleat hanging on it clears
  // them instead of coming through in steps.
  const columnTop = sections[0]!.y;
  const columnHem = sections[sections.length - 1]!.y;
  const gathered = (y: number) =>
    DHOTI_FOLDS *
    Math.min(1, Math.max(0, (columnTop - y) / Math.max(1e-6, columnTop - columnHem)));
  const drop = (body.thighLength + body.shinLength * reach) * 0.82;
  // Bearings just off the centre front, so the three pleats overlap the
  // way gathered cloth does instead of standing side by side.
  const panels: Array<readonly [number, number, number, THREE.Material]> = [
    [Math.PI * 0.5 - 0.22, 0.036, 0.96, cloth],
    [Math.PI * 0.5 - 0.02, 0.032, 1, cloth],
    [Math.PI * 0.5 + 0.2, 0.026, 0.86, edge],
  ];
  for (const [bearing, width, share, material] of panels) {
    const panel: ClothSection[] = [];
    // Thin and flush where it is tucked in, thickening as it falls free.
    //
    // The top of a pleat is under the waistband, and under the hide where
    // one is worn: a pleat that starts at its full thickness a centimetre
    // off the cloth pushes its corners out through the skin above it, as
    // two small notches either side of the clasp.
    for (const [t, widen, air, thick] of [
      [0, 1, 0, 0.003],
      [0.4, 1.2, 0.012, 0.009],
      [0.78, 1.12, 0.016, 0.008],
      [1, 0.9, 0.01, 0.006],
    ] as const) {
      const y = waistY - 0.012 - drop * share * t;
      const at = onCloth(profile, y, bearing, air, gathered(y));
      panel.push({ y, rx: width * widen, rz: thick, z: at.z });
    }
    // Every piece that wears a garment material carries vertex colours,
    // because those materials render them: a mesh without the attribute
    // comes out BLACK, which is what the pleat beside the sash was doing
    // — a hole cut through the dhoti in every three-quarter view.
    const pleat = sleeve(panel, 14, 4, 0.06);
    markHide(pleat, 3 + bearing * 7, 0);
    const piece = new THREE.Mesh(pleat, material);
    piece.position.x = onCloth(profile, waistY - 0.012, bearing, 0.004, gathered(waistY)).x;
    group.add(piece);
  }
  return group;
}

/**
 * The sash's end, falling from the tie at the hip.
 *
 * A ribbon rather than a lofted tube, because a tube carries ONE x for
 * its whole length and the column it falls over is not the same width at
 * the waist as it is at the thigh: placed at the waist's width it cut
 * into the leg, and placed at the widest it floated off the waist as a
 * rectangle halfway down the cloth. A ribbon has a spine, and the spine
 * is read off the surface at every height — including how far that
 * surface's own folds stand out there.
 */
function sashFall(
  body: BodyProfile,
  material: THREE.Material,
  reach: number,
  side: 1 | -1,
): THREE.Mesh {
  // Enough columns across to read as cloth: at six the curl below turns
  // into a crease every three centimetres and the sash reads as crumpled
  // paper.
  const rows = 22;
  const cols = 12;
  const waistY = body.waistSeatY;
  const sections = dhotiSections(body, reach);
  const profile = profileOf(sections);
  const columnTop = sections[0]!.y;
  const columnHem = sections[sections.length - 1]!.y;
  const gathered = (y: number) =>
    DHOTI_FOLDS *
    Math.min(1, Math.max(0, (columnTop - y) / Math.max(1e-6, columnTop - columnHem)));
  const drop = body.thighLength * 1.5;
  const bearing = side * (Math.PI * 0.5 - 0.5);
  // Across the bearing: the direction the ribbon's width runs in.
  const across = { x: -Math.sin(bearing), z: Math.cos(bearing) };
  const outward = { x: Math.cos(bearing), z: Math.sin(bearing) };
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const t = row / rows;
    const y = waistY - 0.014 - t * drop;
    const spine = onCloth(profile, y, bearing, 0.006 + 0.012 * t, gathered(y));
    // Widening as it falls, then drawn to a point at the end.
    const taper = t < 0.84 ? 1 : 1 - ((t - 0.84) / 0.16) ** 1.5 * 0.82;
    const width = (0.026 + 0.012 * t) * taper;
    for (let col = 0; col <= cols; col += 1) {
      const u = col / cols - 0.5;
      // A hanging strip curls around its own fall.
      const curl = Math.cos(u * Math.PI) * 0.006 * (0.35 + t);
      positions.push(
        spine.x + across.x * u * width * 2 + outward.x * curl,
        y,
        spine.z + across.z * u * width * 2 + outward.z * curl,
      );
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const a = row * (cols + 1) + col;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d, a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  markHide(geometry, 23, 0);
  return new THREE.Mesh(geometry, material);
}

export const humanoidHideWrap: PartGenerator = (ctx) => {
  const body = ctx.body;
  // The hide takes the accent colour with its markings tinted into the
  // mesh; the cloth under it takes the customer's garment colour plain.
  // The hide's markings are a TEXTURE now: rosettes on a few hundred
  // quads of cloth cannot be vertex colours, which is why every note
  // written about this garment called the pattern mottling.
  const hide = ctx.materials.getMapped("garmentAccent", hideMarkings());
  const cloth = ctx.materials.getMapped("garment", clothWeave());
  const sashMaterial = ctx.materials.get("garmentAccent");
  const metal = ctx.materials.get("metal");
  // 0 = hip wrap only; 1 = cloth carried down to the ankles.
  const length = num(ctx, "length", 1);
  // How much of each layer this garment wears. Defaults keep the original
  // hide-only wrap exactly as it was for anything already using it.
  const hideAmount = num(ctx, "hide", 1);
  const dhotiReach = num(ctx, "dhoti", 0);
  const drape = num(ctx, "drape", 0);

  const waistY = body.waistSeatY;
  const seat = body.thighSeatY;
  const hipRx = body.pelvisHalfWidth + CLEARANCE;
  const hipRz = body.bellyRadiusZ + CLEARANCE;

  // ---- the wrap over the hips, riding the pelvis ------------------------
  const wrap = new THREE.Group();
  // Seated poses fold the legs up in front of the hips, so the wrap is
  // short and the length goes onto the legs instead — which is how cloth
  // is actually gathered to sit down.
  // How far the skin comes down off the hips. Short: the reference shows
  // cream cloth from mid-thigh down, with the hide only over the hips and
  // the top of the thighs.
  // ONE skin, closed round the hips and cut on the diagonal. Seated poses
  // fold the legs up in front, so it is gathered short and the length
  // goes onto the legs instead — which is how cloth is actually gathered
  // to sit down.
  const fall = ctx.seated
    ? (waistY - seat) + 0.06
    : (waistY - seat) + body.thighLength * (dhotiReach > 0 ? 0.62 : 0.5);
  if (hideAmount > 0) wrap.add(hideWrap(body, hide, waistY, fall, 1));

  // ---- sash and clasp at the waist --------------------------------------
  // The cream cloth goes on FIRST, under everything: it is the layer the
  // reference shows reaching the ankles, and the hide is slung over it.
  if (dhotiReach > 0 && ctx.garment === "gathered") {
    // Folded legs: the cloth goes over the lap. A wrapped column is a
    // statement about two legs standing side by side, and fold them and
    // the statement is false — so the seated figure was given the hip
    // wrap alone and sat in what read as underwear. A panel falls from
    // the waist between the knees instead, front and back, and each thigh
    // carries its own cloth (below).
    wrap.add(lapFall(body, cloth, 1));
    wrap.add(lapFall(body, cloth, -1));
  } else if (dhotiReach > 0) {
    // How far down the shin the cloth reaches: all the way for a standing
    // figure, above the knee when the pose has a leg out.
    const reach = ctx.garment === "short" ? 0 : dhotiReach;
    wrap.add(dhotiColumn(ctx, cloth, reach));
    wrap.add(dhotiCascade(ctx, cloth, sashMaterial, reach));
    if (drape > 0 && !ctx.seated) wrap.add(sashFall(body, sashMaterial, reach, 1));
  }

  // The kamarbandh is CLOTH wound round the waist, not a metal hoop.
  // A torus reads as exactly that: a smooth ring of constant section
  // standing proud of the garment. A short wound sleeve with folds sits
  // on the cloth beneath it and reads as a sash.
  //
  // It is wound over whatever is worn under it, so it is sized from the
  // outermost of those rather than from the body: a band at the body's
  // own radius disappears under the hide, leaving the hide's top edge
  // showing as a cut line across the waist.
  const under = hideAmount > 0 ? 1.035 : 1;
  const waistZ = hipCentreZ(body);
  const sashRx = hipRx * 1.04 * under;
  const sashRz = hipRz * 1.05 * under;
  wrap.add(
    clothPiece(
      [
        // Barely tapered. A band that narrows towards its edges dips back
        // inside the hide it is wound over, and the two surfaces cross in
        // a pair of notches either side of the clasp.
        { y: waistY + 0.03, rx: sashRx * 0.98, rz: sashRz * 0.985, z: waistZ },
        { y: waistY + 0.012, rx: sashRx, rz: sashRz, z: waistZ },
        { y: waistY - 0.008, rx: sashRx * 0.995, rz: sashRz * 0.995, z: waistZ },
        { y: waistY - 0.026, rx: sashRx * 0.965, rz: sashRz * 0.97, z: waistZ },
      ],
      sashMaterial,
      { seed: 17, density: 0, folds: 0.05, radial: 40 },
    ),
  );
  // The clasp sits ON the band, at the band's own surface.
  wrap.add(
    mesh(new THREE.SphereGeometry(0.015, 14, 12), metal, {
      position: [0, waistY + 0.008, waistZ + sashRz * 1.01],
      scale: [1.3, 0.9, 0.5],
    }),
  );

  // The gathered fold that hangs at the front of a wrapped dhoti. It is
  // what separates a wrap from a tube, so it is the one piece allowed to
  // hang free — and it is shortened when seated, exactly as cloth is
  // gathered out of the way before sitting down.
  const foldDrop = ctx.seated ? 0.1 : 0.3;
  const fold = new THREE.Group();
  // When cream is worn the cascade above is the front fold; the hide only
  // draws its own when it is the outermost layer.
  const fanMaterial = hide;
  const fanDensity = 0.75;
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
    const piece = clothPiece(panel, fanMaterial, {
      seed: 5 + offset * 20,
      hem: 0.02,
      density: fanDensity,
      radial: 12,
    });
    piece.position.x = offset;
    piece.rotation.z = tilt;
    piece.scale.y = drop;
    fold.add(piece);
  }
  if (dhotiReach === 0) wrap.add(fold);

  // Seated poses fold the thighs up in front, so the skin is gathered
  // shorter — the same garment, worn the way you wear it to sit down.
  const reach = ctx.seated ? length * 0.35 : length;
  const parts: Array<{ joint: JointId; object: THREE.Object3D }> = [
    { joint: "pelvis", object: wrap },
  ];
  // Only when the skin IS the garment. Worn over a dhoti it would be a
  // second layer of hide down thighs the cream cloth already covers, and
  // the two torn hems crossing each other is what read as a notch chopped
  // out of the front.
  if (hideAmount > 0 && dhotiReach === 0) {
    parts.push({ joint: "leg.left.thigh", object: legHide(body, hide, 11, reach) });
    parts.push({ joint: "leg.right.thigh", object: legHide(body, hide, 23, reach) });
  }
  // Seated, the cream goes onto the thighs themselves — one piece per
  // thigh, riding the bone, so a folded leg carries its own cloth.
  if (dhotiReach > 0 && ctx.garment === "gathered") {
    parts.push({ joint: "leg.left.thigh", object: thighDrape(body, cloth, 5, dhotiReach) });
    parts.push({ joint: "leg.right.thigh", object: thighDrape(body, cloth, 19, dhotiReach) });
  }
  return parts;
};
