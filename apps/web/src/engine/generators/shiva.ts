/**
 * Shiva-specific generators: the divine human head, matted jata, crescent
 * moon, third eye, rudraksha mala, naga torque, trishul and damaru.
 *
 * Same rules as every other generator: geometry attaches to skeleton
 * joints, parts refine the sockets whose surface they own, ornaments drape
 * against the measured BodyProfile, and held items keep their grip point
 * at the local origin so the hand's item socket closes around them.
 */
import * as THREE from "three";
import { lathe, loft, mesh, taperedTube, type V3 } from "../geometry";
import {
  num,
  type AttachmentGenerator,
  type GeneratorContext,
  type JointedPart,
  type PartGenerator,
} from "./types";
import {
  DAMARU_WAIST_HALF,
  DAMARU_WAIST_RADIUS,
  TRISHUL_SHAFT_RADIUS,
  TRISHUL_TRAVEL,
} from "@devaform/asset-system";
import { REFERENCE_SKULL, handFit, headFit } from "./bodyProfile";
import { pushOutsideBody, walkSurface, type SurfaceWaypoint } from "./surfaceWalk";

// ---------------------------------------------------------------------------
// HEAD — serene divine face with human ears
// ---------------------------------------------------------------------------

export const shivaHead: PartGenerator = (ctx) => {
  const skin = ctx.materials.get("skin");
  const inner = ctx.materials.get("skinSecondary");
  const group = new THREE.Group();
  // Seated on the head joint; the athletic body's neck loft rises to meet
  // the jaw from below, so the head connects rather than floats.
  const SEAT = 0.008;
  group.position.y = SEAT;

  // Skull — ONE lofted volume whose sections carve the male silhouette:
  // narrow chin/jaw base, widening jaw, cheekbone line, temple/forehead,
  // rounded cranium. No ball cheeks, no cylinder face.
  group.add(
    mesh(
      loft(
        [
          { y: -0.048, rx: 0.026, rz: 0.032, z: 0.014 },
          { y: -0.028, rx: 0.04, rz: 0.048, z: 0.012 },
          { y: -0.004, rx: 0.052, rz: 0.06, z: 0.007 },
          { y: 0.024, rx: 0.059, rz: 0.066, z: 0.002 },
          { y: 0.052, rx: 0.06, rz: 0.068, z: -0.002 },
          { y: 0.082, rx: 0.053, rz: 0.061, z: -0.005 },
          { y: 0.106, rx: 0.036, rz: 0.044, z: -0.006 },
          { y: 0.12, rx: 0.012, rz: 0.016, z: -0.006 },
        ],
        30,
      ),
      skin,
    ),
  );
  // Chin — small definite boss at the jaw apex
  group.add(
    mesh(new THREE.SphereGeometry(0.014, 16, 12), skin, {
      position: [0, -0.051, 0.034],
      scale: [1.0, 0.78, 0.8],
    }),
  );
  // Mandible edges — the jawline silhouette from below the ears to the chin
  for (const side of [1, -1]) {
    group.add(
      new THREE.Mesh(
        taperedTube(
          [
            [side * 0.047, -0.014, 0.013],
            [side * 0.03, -0.038, 0.028],
            [side * 0.013, -0.049, 0.034],
          ],
          [0.0072, 0.0042],
          16,
          8,
        ),
        skin,
      ),
    );
  }
  // Cheekbone planes — flat, high
  for (const side of [1, -1]) {
    group.add(
      mesh(new THREE.SphereGeometry(0.026, 22, 16), skin, {
        position: [side * 0.036, 0.02, 0.038],
        scale: [0.85, 0.55, 0.5],
      }),
    );
  }
  // Brow ridge — restrained masculine bar over the eye line
  group.add(
    mesh(new THREE.CapsuleGeometry(0.0062, 0.05, 8, 12), skin, {
      position: [0, 0.038, 0.058],
      rotation: [0.3, 0, Math.PI / 2],
      scale: [1, 1, 0.5],
    }),
  );
  // Nose — narrow bridge with subtle wings
  group.add(
    new THREE.Mesh(
      taperedTube(
        [
          [0, 0.036, 0.057],
          [0, 0.012, 0.073],
          [0, -0.003, 0.079],
        ],
        [0.0088, 0.0062],
        16,
        10,
      ),
      skin,
    ),
  );
  for (const side of [1, -1]) {
    group.add(
      mesh(new THREE.SphereGeometry(0.0058, 12, 10), skin, {
        position: [side * 0.0088, -0.005, 0.069],
        scale: [1, 0.85, 0.9],
      }),
    );
  }
  // Restrained lips
  group.add(
    mesh(new THREE.CapsuleGeometry(0.0036, 0.015, 6, 10), inner, {
      position: [0, -0.021, 0.0595],
      rotation: [0.12, 0, Math.PI / 2],
      scale: [1, 1, 0.65],
    }),
  );
  group.add(
    mesh(new THREE.CapsuleGeometry(0.0042, 0.01, 6, 10), inner, {
      position: [0, -0.029, 0.0575],
      rotation: [-0.1, 0, Math.PI / 2],
      scale: [1, 1, 0.7],
    }),
  );
  // Ears with lobes, on the skull's side plane
  for (const side of [1, -1]) {
    group.add(
      mesh(new THREE.SphereGeometry(0.016, 16, 12), skin, {
        position: [side * 0.056, 0.012, 0.002],
        scale: [0.3, 1.1, 0.55],
      }),
    );
    group.add(
      mesh(new THREE.SphereGeometry(0.007, 12, 10), skin, {
        position: [side * 0.054, -0.012, 0.007],
        scale: [0.5, 1, 0.7],
      }),
    );
  }

  return [
    {
      joint: "head",
      object: group,
      // The head owns its brow, skull-top and earlobe surfaces: seat the
      // forehead (third eye / tikka), crown and ear sockets on the actual
      // generated geometry so ornaments originate from real anatomy.
      socketRefinements: [
        { id: "head.forehead", position: [0, 0.068, 0.062] },
        { id: "head.crown", position: [0, 0.126, -0.006] },
        { id: "head.leftEar", position: [0.056, -0.011, 0.008] },
        { id: "head.rightEar", position: [-0.056, -0.011, 0.008] },
      ],
    },
  ];
};

// ---------------------------------------------------------------------------
// JATA — matted locks coiled into the ascetic's crown
// ---------------------------------------------------------------------------

/**
 * The mane of matted hair.
 *
 * Built twice before. A few tubes hanging behind the ears read as strands
 * stuck to a head; an open shell that flared to the shoulders read as two
 * flat planks standing beside the face, because an open surface has no
 * thickness and its cut edge is a straight vertical line — exactly the
 * silhouette hair never has.
 *
 * So the mass is a CLOSED volume with an outer and an inner surface joined
 * at the rim, and how far it falls depends on the bearing: long down the
 * back, short where it comes forward past the ears, which is what gives a
 * head of hair its curved outline. Locks are laid over the volume, and a
 * few are brought forward over each shoulder, because hair falls where the
 * head is and not only behind it.
 *
 * Every dimension comes from the body wearing it: how wide a skull, how
 * broad a back. The same jata sits on a stylised figure and on a measured
 * human one without a constant changing.
 */
function hairMass(
  ctx: GeneratorContext,
  length: number,
): { geometry: THREE.BufferGeometry; top: number; fall: number; width: (t: number) => number } {
  const skull = ctx.body.headRadius;
  const shoulder = ctx.body.chestRadiusX;
  const top = ctx.body.headCenterY + skull * 0.5;
  // To the middle of the back, as the iconography shows.
  const fall = length * (skull * 1.5 + shoulder * 2.1);

  // The face stays clear: the volume spans everything but a frontal arc.
  const open = Math.PI * 0.34;
  const from = Math.PI / 2 + open;
  const span = Math.PI * 2 - open * 2;
  const rows = 22;
  const cols = 34;

  /** Half-width of the mass at depth t: hugs the skull, then broadens. */
  const width = (t: number): number =>
    skull * 1.07 + (Math.min(shoulder * 0.76, skull * 2.35) - skull * 1.07) *
      Math.min(1, Math.pow(t * 2.1, 1.15));

  /**
   * How far the hair falls on a given bearing. Full length down the back,
   * a quarter of it where the mass comes forward past the ear — a head of
   * hair is longest behind and shortest at the temples, and it is that
   * curve, not the length, that makes the outline read as hair.
   */
  const reach = (s: number): number => {
    const edge = Math.min(s, 1 - s) * 2; // 0 at the open edges, 1 at the back
    return 0.24 + 0.76 * Math.pow(Math.min(1, edge * 1.35), 0.85);
  };

  const positions: number[] = [];
  const indices: number[] = [];
  const surface = (inner: boolean) => {
    const base = positions.length / 3;
    for (let row = 0; row <= rows; row += 1) {
      const t = row / rows;
      for (let col = 0; col <= cols; col += 1) {
        const s = col / cols;
        const angle = from + s * span;
        // Matted hair is lumpy; the outer face carries it, the inner one
        // stays smooth because nobody sees inside a head of hair.
        const lump = inner
          ? 1
          : 1 + 0.045 * Math.cos(s * Math.PI * 9 + t * 4) + 0.028 * Math.cos(s * Math.PI * 17);
        // Thickness grows as the mass leaves the skull and has to hold
        // its own shape.
        const thickness = (0.1 + 0.16 * t) * skull;
        const r = width(t * reach(s)) * lump - (inner ? thickness : 0);
        const back = -skull * (0.3 + 1.35 * t * t);
        positions.push(
          Math.cos(angle) * r,
          top - t * fall * reach(s) + Math.sin(s * Math.PI) * skull * 0.25,
          Math.sin(angle) * r * 0.94 + back,
        );
      }
    }
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const a = base + row * (cols + 1) + col;
        const b = a + 1;
        const c = a + cols + 1;
        const d = c + 1;
        // The inner surface faces the other way.
        if (inner) indices.push(a, b, c, b, d, c);
        else indices.push(a, c, b, b, c, d);
      }
    }
  };
  surface(false);
  surface(true);

  // Stitch the two surfaces along every open edge, so the mass has a rim
  // rather than a paper edge you can see through.
  const ring = cols + 1;
  const outerAt = (row: number, col: number) => row * ring + col;
  const innerAt = (row: number, col: number) => (rows + 1) * ring + row * ring + col;
  for (let col = 0; col < cols; col += 1) {
    // the hem
    const a = outerAt(rows, col);
    const b = outerAt(rows, col + 1);
    const c = innerAt(rows, col);
    const d = innerAt(rows, col + 1);
    indices.push(a, b, c, b, d, c);
  }
  for (let row = 0; row < rows; row += 1) {
    // the two vertical edges beside the face
    const a = outerAt(row, 0);
    const b = outerAt(row + 1, 0);
    const c = innerAt(row, 0);
    const d = innerAt(row + 1, 0);
    indices.push(a, c, b, b, c, d);
    const e = outerAt(row, cols);
    const f = outerAt(row + 1, cols);
    const g = innerAt(row, cols);
    const h = innerAt(row + 1, cols);
    indices.push(e, f, g, f, h, g);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, top, fall, width };
}

function jataMane(ctx: GeneratorContext, length: number): THREE.Group {
  const hair = ctx.materials.get("hair");
  const group = new THREE.Group();
  const skull = ctx.body.headRadius;
  const { geometry, top, fall, width } = hairMass(ctx, length);
  group.add(new THREE.Mesh(geometry, hair));

  const open = Math.PI * 0.34;
  const from = Math.PI / 2 + open;
  const span = Math.PI * 2 - open * 2;

  // Locks over the mass: thick where they leave the crown, tapering, each
  // with its own length and sway so the silhouette is not repeated.
  for (let i = 0; i < 18; i += 1) {
    const s = (i + 0.5) / 18;
    const angle = from + s * span;
    const wave = Math.sin(i * 2.399);
    const edge = Math.min(s, 1 - s) * 2;
    const own = (0.28 + 0.72 * Math.min(1, edge * 1.4)) * (0.55 + 0.5 * Math.abs(Math.sin(i * 1.7)));
    const len = fall * own;
    const path: V3[] = [
      [
        Math.cos(angle) * width(0.04) * 1.02,
        top - fall * 0.02,
        Math.sin(angle) * width(0.04) * 0.96 - skull * 0.3,
      ],
      [
        Math.cos(angle) * width(0.45) * 1.02,
        top - len * 0.48,
        Math.sin(angle) * width(0.45) * 0.96 - skull * 0.7 + wave * skull * 0.12,
      ],
      [
        Math.cos(angle) * width(0.9) * (0.96 + 0.08 * wave),
        top - len,
        Math.sin(angle) * width(0.9) * 0.92 - skull * 1.35 + wave * skull * 0.2,
      ],
    ];
    group.add(
      new THREE.Mesh(
        taperedTube(path, [skull * (0.3 + 0.08 * wave), skull * 0.1], 16, 8),
        hair,
      ),
    );
  }

  // Locks brought forward over each shoulder. Hair falls where the head
  // is, not only behind it, and this is what stops the mane reading as a
  // wig hung on the back of the skull. They start at the SIDE of the head,
  // not the front: hair frames a face, it does not hang over it.
  for (const side of [1, -1]) {
    for (const [turn, len, thick] of [
      [1.05, 0.62, 0.3],
      [1.32, 0.46, 0.24],
    ] as const) {
      const angle = Math.PI / 2 + side * turn;
      const near = width(0.08);
      const far = width(0.55);
      group.add(
        new THREE.Mesh(
          taperedTube(
            [
              [Math.cos(angle) * near, top - fall * 0.05, Math.sin(angle) * near * 0.94 - skull * 0.2],
              [
                Math.cos(angle) * far * 1.0,
                top - fall * len * 0.45,
                Math.sin(angle) * far * 0.8,
              ],
              [
                Math.cos(angle) * far * 0.9,
                top - fall * len,
                Math.sin(angle) * far * 0.7 + skull * 0.2,
              ],
            ],
            [skull * thick, skull * 0.09],
            16,
            8,
          ),
          hair,
        ),
      );
    }
  }
  return group;
}

export const shivaJata: PartGenerator = (ctx) => {
  const hair = ctx.materials.get("hair");
  const flowing = num(ctx, "flowing", 0);
  // The locks are drawn against a reference cranium; this body's own
  // skull says how much bigger or smaller it actually is, so the same
  // jata sits on a stylised head and on a measured human one.
  const fit = headFit(ctx.body);
  const seat = new THREE.Group();
  seat.position.y = ctx.body.headCenterY - REFERENCE_SKULL.centerY * fit;
  seat.scale.setScalar(fit);
  const group = new THREE.Group();
  seat.add(group);

  // Scalp cap following the cranium
  group.add(
    mesh(new THREE.SphereGeometry(0.067, 28, 20), hair, {
      position: [0, 0.055, -0.007],
      scale: [1.08, 1.02, 1.1],
    }),
  );
  // Hairline edge framing the forehead
  group.add(
    mesh(new THREE.TorusGeometry(0.05, 0.01, 10, 30), hair, {
      position: [0, 0.052, -0.004],
      rotation: [Math.PI / 2 - 0.32, 0, 0],
      scale: [1.1, 1.0, 1.08],
    }),
  );

  // Gathered matted strands — irregular tapered locks swept from the
  // hairline up into the gather point (golden-angle spacing, alternating
  // thickness, jittered heights: organic hair, not stacked rings).
  const gatherY = 0.152;
  for (let i = 0; i < 15; i++) {
    const angle = i * 2.61799 + 0.4;
    const cx = Math.cos(angle);
    const cz = Math.sin(angle);
    const r0 = 0.052 + 0.006 * Math.sin(i * 1.7);
    const y0 = 0.055 + 0.008 * Math.cos(i * 2.3);
    const thick = i % 2 === 0 ? 0.011 : 0.0085;
    group.add(
      new THREE.Mesh(
        taperedTube(
          [
            [cx * r0, y0, cz * r0 - 0.006],
            [cx * (r0 * 0.72), y0 + 0.045, cz * (r0 * 0.72) - 0.006],
            [cx * 0.022, 0.128, cz * 0.024 - 0.005],
            [cx * 0.01, gatherY, cz * 0.011 - 0.004],
          ],
          [thick, 0.005],
          18,
          8,
        ),
        hair,
      ),
    );
  }
  // Tie band at the gather
  group.add(
    mesh(new THREE.TorusGeometry(0.019, 0.005, 10, 22), hair, {
      position: [0, 0.156, -0.004],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  // Compact topknot with looping locks over it
  group.add(
    mesh(new THREE.SphereGeometry(0.023, 18, 14), hair, {
      position: [0, 0.18, -0.004],
      scale: [1, 1.15, 1],
    }),
  );
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.6;
    const cx = Math.cos(angle);
    const cz = Math.sin(angle);
    group.add(
      new THREE.Mesh(
        taperedTube(
          [
            [cx * 0.014, 0.162, cz * 0.015 - 0.004],
            [cx * 0.024, 0.185, cz * 0.025 - 0.004],
            [cx * 0.008, 0.203, cz * 0.009 - 0.004],
          ],
          [0.006, 0.003],
          12,
          7,
        ),
        hair,
      ),
    );
  }

  // Loose hair is its own mass, and it is built to the body rather than
  // to the jata's reference skull: how far hair falls is a fact about the
  // wearer's back, not about the hairpiece.
  const mane = flowing > 0 ? jataMane(ctx, flowing) : null;

  const parts: JointedPart[number][] = [];
  if (mane) parts.push({ joint: "head", object: mane });
  parts.push(
    {
      joint: "head",
      object: seat,
      // The jata owns the crescent's seat: tuck the moon socket beside the
      // gather, against the coiled locks.
      // In the jata's own frame, scaled onto whatever skull it landed on.
      socketRefinements: [
        {
          id: "head.moon",
          position: [0.034 * fit, seat.position.y + 0.166 * fit, 0.012 * fit],
        },
      ],
    },
  );
  return parts;
};

// ---------------------------------------------------------------------------
// TRIPUNDRA — three lines of ash across the brow
// ---------------------------------------------------------------------------

/**
 * The three horizontal bands of vibhuti that mark a devotee of Shiva, and
 * Shiva himself. They are ash on skin, so they are relief measured in
 * millimetres, curved to follow the brow they lie on rather than three
 * straight bars stuck to a forehead.
 *
 * Width comes from the head being worn, so the same mark fits a stylised
 * skull and a measured human one.
 */
export const ornamentTripundra: AttachmentGenerator = (ctx) => {
  const ash = ctx.materials.fixed.ivory;
  const group = new THREE.Group();
  const fit = headFit(ctx.body);
  const half = 0.032 * fit;
  for (const [index, lift] of [0.019, 0.007, -0.005].entries()) {
    // Each band is one smooth stroke, shorter than the one above it as
    // the brow narrows, and bowed so it lies along the forehead rather
    // than cutting across it.
    const reach = half * (1 - index * 0.09);
    const path: V3[] = [];
    for (let i = 0; i <= 8; i += 1) {
      const t = i / 8 - 0.5;
      path.push([t * 2 * reach, lift * fit, -Math.pow(Math.abs(t) * 2, 2) * 0.013 * fit]);
    }
    const band = new THREE.Mesh(taperedTube(path, [0.0038 * fit, 0.0038 * fit], 20, 8), ash);
    // Ash is a stroke of powder, not a rod: flatten it onto the skin.
    band.scale.set(1, 0.85, 0.4);
    group.add(band);
  }
  group.rotation.x = -0.18; // the forehead's upward tilt, as the third eye
  return group;
};

/**
 * The brow as the reference actually shows it: three bands of ash with the
 * vertical third eye set between them.
 *
 * They are one mark, not two ornaments competing for one socket. A
 * devotee draws the tripundra and the trinetra together, and splitting
 * them across two assets meant a customer could only ever have one —
 * which is not a customisation, it is a missing feature with a picker
 * attached.
 */
export const ornamentTrinetraTripundra: AttachmentGenerator = (ctx) => {
  const group = new THREE.Group();
  group.add(ornamentTripundra(ctx));
  const eye = ornamentThirdEye(ctx);
  // The eye sits in the gap the ash leaves: the bands run either side of
  // it, so it is lifted to the middle band's line rather than laid over
  // the lowest one.
  eye.position.y += 0.007 * headFit(ctx.body);
  group.add(eye);
  return group;
};

// ---------------------------------------------------------------------------
// CRESCENT MOON — seats on the jata's moon socket
// ---------------------------------------------------------------------------

export const ornamentCrescent: AttachmentGenerator = (ctx) => {
  // Drawn against the reference skull, worn on this one.
  const fit = headFit(ctx.body);
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  // Crescent arc with horns pointing upward, facing forward. The arc is
  // rotated so its gap sits at the top; tips are capped with spheres.
  const arc = Math.PI * 1.2;
  const phi = Math.PI / 2 - arc / 2 + Math.PI;
  const crescent = mesh(new THREE.TorusGeometry(0.017, 0.0038, 10, 30, arc), metal, {
    rotation: [0, 0, phi],
  });
  crescent.scale.z = 0.55;
  group.add(crescent);
  for (const end of [0, arc]) {
    group.add(
      mesh(new THREE.SphereGeometry(0.0028, 10, 8), metal, {
        position: [Math.cos(end + phi) * 0.017, Math.sin(end + phi) * 0.017, 0],
      }),
    );
  }
  // Angle the moon outward from the jata it seats on
  group.rotation.y = 0.25;
  group.scale.setScalar(fit);
  return group;
};

// ---------------------------------------------------------------------------
// THIRD EYE — vertical trinetra on the forehead socket
// ---------------------------------------------------------------------------

export const ornamentThirdEye: AttachmentGenerator = (ctx) => {
  const skin = ctx.materials.get("skin");
  const group = new THREE.Group();
  // Embedded in the brow: the socket is refined onto the forehead surface
  // by the head part; the eye itself is a shallow, lidded vertical almond
  // that follows the forehead plane (total relief under 5mm), not a jewel
  // resting on it.
  group.rotation.x = -0.18; // match the forehead's upward-facing tilt

  // Skin lids — vertical almond rims that blend into the brow
  for (const side of [1, -1] as const) {
    group.add(
      mesh(new THREE.CapsuleGeometry(0.0028, 0.02, 6, 10), skin, {
        position: [side * 0.0038, 0, 0.0012],
        rotation: [0, 0, side * 0.16],
        scale: [1, 1, 0.55],
      }),
    );
  }
  // Sliver of eye-white between the lids
  group.add(
    mesh(new THREE.SphereGeometry(0.0085, 16, 12), ctx.materials.fixed.eyeWhite, {
      position: [0, 0, 0.0004],
      scale: [0.34, 1.05, 0.16],
    }),
  );
  // Iris and pupil
  group.add(
    mesh(new THREE.SphereGeometry(0.0034, 12, 10), ctx.materials.fixed.iris, {
      position: [0, 0, 0.0022],
      scale: [0.75, 1, 0.4],
    }),
  );
  group.add(
    mesh(new THREE.SphereGeometry(0.0017, 10, 8), ctx.materials.fixed.eyeDark, {
      position: [0, 0, 0.0032],
      scale: [0.8, 1, 0.4],
    }),
  );
  return group;
};

// ---------------------------------------------------------------------------
// RUDRAKSHA MALA — bead strands draped on the measured chest
// ---------------------------------------------------------------------------

export const ornamentRudraksha: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const bead = ctx.materials.fixed.rudraksha;
  const group = new THREE.Group();
  const body = ctx.body;

  // A mala is a ROUTE over the body, exactly as the serpent is.
  //
  // It used to be a ring parameterised by angle, with the front half
  // switched onto the chest surface and the back half onto a circle
  // around the neck — and the seam between those two rules showed as a
  // gap with stray beads either side of it. A strand of beads is one
  // continuous path lying on a body, so it is authored as one: a bearing
  // and a height, walked over the surface the body reports, with the
  // clearance being the bead's own radius.
  const neckBase = body.necklaceSocketY + body.neckBaseOffsetY;
  const toSocket = (point: THREE.Vector3): V3 => [
    point.x,
    point.y - body.necklaceSocketY,
    point.z - body.necklaceSocketZ,
  ];

  for (const [drop, size] of [
    [body.neckRadius * 1.6, body.neckRadius * 0.17],
    [body.neckRadius * 2.8, body.neckRadius * 0.19],
  ] as const) {
    // Round the neck at the back, falling to its lowest at the front —
    // which is what a strand hung over a neck does under its own weight.
    const route: SurfaceWaypoint[] = [];
    const steps = 16;
    for (let i = 0; i <= steps; i += 1) {
      const bearing = (i / steps) * Math.PI * 2;
      // Bearings are measured FROM THE FRONT, so bearing 0 is the chest
      // and π is the nape. 1 at the front, 0 at the back — the other way
      // round hung the strand down the spine and left a ring at the
      // throat, which is not what a mala does.
      const front = (1 + Math.cos(bearing)) / 2;
      route.push({
        bearing,
        // Cubed, not merely bowed: a strand hangs from the BACK of a neck
        // and nearly all of its fall happens at the front. A gentler
        // curve leaves it halfway down at the sides, where the deltoids
        // are, and the mala stands out past the shoulders.
        y: neckBase + 0.004 - Math.pow(front, 3) * drop,
      });
    }
    const walk = walkSurface(body, route, size * 0.95, 160);
    const path = walk.points.map(toSocket);

    // Beads laid along the path at their own diameter, so the strand is
    // full whatever length this body's neck and chest give it.
    let travelled = 0;
    const spacing = size * 1.82;
    let next = spacing * 0.5;
    let index = 0;
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1] as V3;
      const b = path[i] as V3;
      const step = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      while (travelled + step >= next && step > 1e-9) {
        const t = (next - travelled) / step;
        group.add(
          mesh(new THREE.SphereGeometry(size, 12, 10), index % 9 === 0 ? metal : bead, {
            position: [
              a[0] + (b[0] - a[0]) * t,
              a[1] + (b[1] - a[1]) * t,
              a[2] + (b[2] - a[2]) * t,
            ],
            scale: [1, 0.88, 1],
          }),
        );
        index += 1;
        next += spacing;
      }
      travelled += step;
    }
  }

  // Central guru bead, hanging below the lower strand at the front.
  const guru = body.neckRadius * 0.26;
  const front = body.surfaceAt(0, neckBase - body.neckRadius * 2.8 - guru);
  group.add(
    mesh(new THREE.SphereGeometry(guru, 14, 12), bead, {
      position: [
        0,
        front.y - body.necklaceSocketY,
        front.z + guru * 0.7 - body.necklaceSocketZ,
      ],
    }),
  );
  return group;
};

// ---------------------------------------------------------------------------
// NAGA TORQUE — serpent coiled around the neck, hood raised
// ---------------------------------------------------------------------------

/**
 * A swept form with elliptical cross-sections, framed against a reference
 * up-vector rather than the curve's own Frenet frames.
 *
 * This exists because a cobra cannot be built out of tubes. Its hood IS
 * its neck, flattened — width and height vary independently along the
 * body, and the skull is a wedge that is wider than it is tall. A
 * circular-section tube cannot say that, and sticking scaled spheres onto
 * one says it badly: they arrive as fins and plates at the wrong angles.
 * Sections here carry a half-width and a half-height, so the neck can
 * spread into a hood and draw back into a head as one continuous surface.
 *
 * The frame is CARRIED along the curve from a starting up-vector, each
 * section's frame being the previous one leaned onto the new tangent.
 * That is what lets a cobra rear: a hood runs vertically, and a frame
 * rebuilt each section from a fixed world up would have nothing left to
 * cross with there. Carrying it also keeps the old guarantee — for a
 * curve that stays in one plane this is exactly a constant up — while
 * never twisting the way Frenet frames do.
 */
function sweptForm(
  points: readonly V3[],
  profile: (t: number) => { halfWidth: number; halfHeight: number; drop?: number },
  up: THREE.Vector3,
  along = 64,
  around = 20,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
    false,
    "catmullrom",
    0.5,
  );
  const positions: number[] = [];
  const indices: number[] = [];
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const lift = up.clone().normalize();
  const spare = new THREE.Vector3();
  for (let i = 0; i <= along; i += 1) {
    const t = i / along;
    const centre = curve.getPoint(t);
    curve.getTangent(t, tangent).normalize();
    // Lean the carried up-vector off the new tangent. Only if the curve
    // has turned a full right angle since the last section — which it
    // cannot, at this sampling — is there nothing left to lean.
    lift.addScaledVector(tangent, -lift.dot(tangent));
    if (lift.lengthSq() < 1e-10) {
      spare.set(0, 1, 0);
      if (Math.abs(tangent.y) > 0.9) spare.set(1, 0, 0);
      lift.copy(spare).addScaledVector(tangent, -spare.dot(tangent));
    }
    lift.normalize();
    side.crossVectors(tangent, lift).normalize();
    const { halfWidth, halfHeight, drop = 0 } = profile(t);
    centre.addScaledVector(lift, drop);
    for (let j = 0; j < around; j += 1) {
      const angle = (j / around) * Math.PI * 2;
      positions.push(
        centre.x + Math.cos(angle) * halfWidth * side.x + Math.sin(angle) * halfHeight * lift.x,
        centre.y + Math.cos(angle) * halfWidth * side.y + Math.sin(angle) * halfHeight * lift.y,
        centre.z + Math.cos(angle) * halfWidth * side.z + Math.sin(angle) * halfHeight * lift.z,
      );
    }
  }
  for (let i = 0; i < along; i += 1) {
    for (let j = 0; j < around; j += 1) {
      const a = i * around + j;
      const b = i * around + ((j + 1) % around);
      const c = (i + 1) * around + j;
      const d = (i + 1) * around + ((j + 1) % around);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export const ornamentNaga: AttachmentGenerator = (ctx) => {
  const scales = ctx.materials.fixed.serpent;
  const belly = ctx.materials.fixed.ivory;
  const group = new THREE.Group();
  const body = ctx.body;

  // The serpent is a ROUTE, not a list of points.
  //
  // Authored in the body's own surface coordinates — a bearing around it
  // and a height — and evaluated onto whatever body wears it, standing
  // off the skin by a fixed clearance. It cannot end up inside the chest,
  // because it is never expressed in a space where inside exists. What is
  // written here is only the journey: a tail lying on the right breast,
  // up to the base of the neck, once round behind it, and out at the left
  // shoulder where the head lifts.
  //
  // It is a serpent worn at the neck — the reference's naga torque — and
  // not a python draped over the ribs. A tail carried down to the navel
  // and a hood reared to eye height read as a costume rather than as an
  // ornament, whatever else is right about them.
  //
  // Bearings turn toward the figure's left, so the negative run from the
  // front is a wrap that goes right, behind, and back round to the front.
  // Thickness along the route: nothing at the tail tip, heaviest through
  // the wrap, drawn in again where the head takes over.
  // How thick the serpent is, scaled to the neck it is worn on. A girth
  // authored in absolute metres is a python on a slim body and a worm on
  // a broad one; a fraction of the wearer's own neck is a serpent on both.
  const thick = body.neckRadius * 0.32;
  // Every section of the hood and head below is a multiple of the
  // serpent's own girth, so a hood is always about twice as wide as the
  // body behind it whatever body the serpent is worn on.
  const g = thick;
  const girth = (t: number): number => {
    if (t < 0.26) return thick * (0.15 + (t / 0.26) * 0.65);
    if (t < 0.42) return thick * (0.8 + ((t - 0.26) / 0.16) * 0.2);
    if (t < 0.92) return thick;
    return thick * (1 - ((t - 0.92) / 0.08) * 0.06);
  };
  // The gap under the belly of the serpent. What the walk is given is
  // that gap PLUS the girth, so it is the scales that clear the skin.
  const GAP = 0.004;
  /**
   * Where the neck actually begins on THIS body, in the chest joint's
   * space. The route used to be written in absolute chest-local heights
   * taken from the stylised figure, and on a measured human those numbers
   * land three centimetres up the jaw: the coil came out over the ears
   * and the head reared beside the face. A torque is worn at the base of
   * a neck, so that is the landmark the route is written against.
   */
  const neckBase = body.necklaceSocketY + body.neckBaseOffsetY;
  const at = (below: number) => neckBase - below;
  // A TORQUE, which is what the reference shows: a ring round the neck
  // with the head lifted at the front, not a python crossing the chest.
  // An earlier route began low on the right breast and climbed, and read
  // as a strap worn over one shoulder.
  // Sitting ON the collarbones, encircling the very base of the neck —
  // which is where a torque rests. The neck base is the top of that
  // seat, not the middle of it, so the whole route rides below it by
  // about its own girth.
  const seat = thick * 1.1;
  const route: SurfaceWaypoint[] = [
    // Tail tucked at the front right, just under the collar…
    { bearing: -0.55, y: at(0.028 + seat) },
    { bearing: -0.95, y: at(0.012 + seat) },
    // …round behind the neck, riding a little higher…
    { bearing: -1.9, y: at(-0.006 + seat) },
    { bearing: -3.15, y: at(-0.01 + seat) },
    { bearing: -4.4, y: at(-0.006 + seat) },
    // …and out at the front left, where the head lifts.
    { bearing: -5.3, y: at(0.006 + seat) },
    { bearing: -5.75, y: at(0.014 + seat), lift: 0.006 },
  ];
  const walk = walkSurface(body, route, (t) => GAP + girth(t), 120);

  // The generator works in the necklace socket's space; the walk answers
  // in the chest joint's. The body knows the offset between them.
  const toSocket = (point: THREE.Vector3): V3 => [
    point.x,
    point.y - body.necklaceSocketY,
    point.z - body.necklaceSocketZ,
  ];
  const path = walk.points.map(toSocket);

  const toChest = { y: body.necklaceSocketY, z: body.necklaceSocketZ };
  const coil = sweptForm(
    path,
    (t) => ({ halfWidth: girth(t), halfHeight: girth(t) }),
    new THREE.Vector3(0, 1, 0),
    190,
    18,
  );
  // The walk holds the SPINE off the skin; the swept surface around it is
  // resampled through a spline that can cut a corner the walk did not.
  // This is the guarantee, applied to what is actually drawn.
  pushOutsideBody(coil, body, toChest, GAP * 0.5);
  group.add(new THREE.Mesh(coil, scales));

  // Hood and head are one swept piece, and it REARS.
  //
  // A cobra at rest on a shoulder does not lie along it pointing sideways
  // — it lifts. The route ends at the left shoulder and the sweep carries
  // on upward: the neck spreads into a hood that stands vertical and flat,
  // draws back in behind the skull, and the head levels off forward. The
  // hood is therefore wide across the figure and thin front-to-back, which
  // is what makes it read as a hood from the front rather than as a fin.
  const last = path.length - 1;
  const headBase = path[last] as V3;
  const hoodStart = path[Math.max(0, last - 14)] as V3;
  // The head leans out along the direction the route was already going,
  // away from the skin rather than back into the jaw.
  const heading = new THREE.Vector3(
    headBase[0] - (path[last - 6] as V3)[0],
    0,
    headBase[2] - (path[last - 6] as V3)[2],
  );
  if (heading.lengthSq() < 1e-9) heading.set(0, 0, 1);
  heading.normalize();
  const outward = walk.normals[last] ?? new THREE.Vector3(0, 0, 1);
  /**
   * The head CONTINUES THE JOURNEY the body was making, lifted a little
   * away from the skin.
   *
   * Pointing it outward from the chest instead was the mistake, and two
   * rounds of shrinking it did not help: a head aimed at the viewer is
   * seen end-on, so however well it is modelled it reads as a lump. A
   * serpent lying along a collarbone is seen in PROFILE, which is the one
   * view in which a snake's head is unmistakably a snake's head. So the
   * direction is the route's own tangent, with just enough outward lean
   * to clear the throat.
   */
  const reach = heading
    .clone()
    .addScaledVector(new THREE.Vector3(outward.x, 0, outward.z).normalize(), 0.8)
    .normalize();

  // The hood leans out as it rises, so it stands beside the head rather
  // than across it — and it rises by a fraction of the neck it is worn
  // on, not by a fixed 34 mm, which on a smaller head carried the skull
  // to ear height and made the serpent read as a growth on the jaw.
  // How far the head lifts off the shoulder. A cobra at rest on a
  // shoulder raises its head a little and looks forward; rearing it half
  // a neck's width carried the skull past the jaw and put a green lump
  // over the cheek.
  const RISE = body.neckRadius * 0.5;
  const hoodMid: V3 = [
    headBase[0] + reach.x * g * 1.2,
    headBase[1] + RISE * 0.46,
    headBase[2] + reach.z * g * 1.2,
  ];
  // Where the skull begins and where the snout ends: both level, so the
  // features below can be laid along a horizontal line.
  const skullBase: V3 = [
    headBase[0] + reach.x * g * 1.9,
    headBase[1] + RISE,
    headBase[2] + reach.z * g * 1.9,
  ];
  // The snout tips slightly DOWN from the skull: a reared cobra looks at
  // what is in front of it, and a head that levels off reads as a stick.
  const headTip: V3 = [
    skullBase[0] + reach.x * g * 2.5,
    skullBase[1] - g * 0.5,
    skullBase[2] + reach.z * g * 2.5,
  ];
  const skullMid: V3 = [
    (skullBase[0] + headTip[0]) / 2,
    (skullBase[1] + headTip[1]) / 2 + g * 0.2,
    (skullBase[2] + headTip[2]) / 2,
  ];
  const serpentHead = sweptForm(
    [hoodStart, headBase, hoodMid, skullBase, skullMid, headTip],
    (t) => {
      // Body girth, into the flare, into the hood, in behind the skull,
      // out over the skull, down to the snout.
      if (t < 0.16) return { halfWidth: g * 0.95, halfHeight: g * 0.95 };
      if (t < 0.34) {
        const k = (t - 0.16) / 0.18;
        return { halfWidth: g * (0.95 + k * 0.72), halfHeight: g * (0.95 - k * 0.36) };
      }
      if (t < 0.5) {
        // The hood at its widest: a plate, not a tube. Kept to a little
        // over half again the body's girth — a hood twice as wide reads
        // as a collar over the cheek rather than as a serpent.
        const k = (t - 0.34) / 0.16;
        return { halfWidth: g * (1.67 + k * 0.16), halfHeight: g * (0.59 - k * 0.07) };
      }
      if (t < 0.64) {
        const k = (t - 0.5) / 0.14;
        return { halfWidth: g * (1.83 - k * 0.9), halfHeight: g * (0.52 + k * 0.42) };
      }
      if (t < 0.86) {
        // The skull: a wedge, wider than it is tall.
        const k = (t - 0.64) / 0.22;
        return { halfWidth: g * (0.93 + k * 0.1), halfHeight: g * (0.9 - k * 0.06) };
      }
      const k = (t - 0.86) / 0.14;
      return { halfWidth: g * (1.03 - k * 0.63), halfHeight: g * (0.84 - k * 0.5) };
    },
    new THREE.Vector3(0, 1, 0),
    88,
    24,
  );
  // The hood and head are a form built off the end of the route rather
  // than a walk along it, so nothing about their control points keeps
  // them out of a shoulder. Measured, a tenth of the serpent's surface
  // was inside the figure. Pushed out here, by construction.
  pushOutsideBody(serpentHead, body, toChest, GAP * 0.5);
  group.add(new THREE.Mesh(serpentHead, scales));

  // Orientation of the head, used to place what sits on it. The skull
  // runs level, so this is the line the face is laid along.
  const facing = Math.atan2(headTip[2] - skullBase[2], headTip[0] - skullBase[0]);
  const along = (f: number, lift = 0): [number, number, number] => [
    skullBase[0] + (headTip[0] - skullBase[0]) * f,
    skullBase[1] + (headTip[1] - skullBase[1]) * f + lift,
    skullBase[2] + (headTip[2] - skullBase[2]) * f,
  ];
  const facingGroup = (f: number, lift = 0): THREE.Group => {
    const node = new THREE.Group();
    node.position.set(...along(f, lift));
    node.rotation.y = -facing;
    group.add(node);
    return node;
  };

  // The line of the mouth, set into the wedge rather than drawn on it.
  const mouth = facingGroup(0.66, -g * 0.38);
  mouth.add(
    mesh(new THREE.SphereGeometry(g * 0.71, 14, 8), ctx.materials.fixed.eyeDark, {
      position: [g * 0.11, 0, 0],
      scale: [1.5, 0.11, 1.05],
    }),
  );

  // Eyes: a hooded brow, and under it an eye small enough to be a glint.
  const eyes = facingGroup(0.54, g * 0.33);
  for (const side of [1, -1]) {
    eyes.add(
      mesh(new THREE.SphereGeometry(g * 0.47, 12, 8), scales, {
        position: [0, g * 0.22, side * g * 0.89],
        scale: [1.35, 0.38, 0.85],
      }),
    );
    eyes.add(
      mesh(new THREE.SphereGeometry(g * 0.17, 8, 6), ctx.materials.fixed.eyeDark, {
        position: [g * 0.09, -g * 0.14, side * g * 0.96],
        scale: [1, 0.72, 0.72],
      }),
    );
  }

  // The pale throat, under the jaw where a snake shows it.
  const throat = facingGroup(0.5, -g * 0.76);
  throat.add(
    mesh(new THREE.SphereGeometry(g * 0.64, 12, 10), belly, {
      rotation: [0, -facing, 0],
      scale: [1.7, 0.24, 0.75],
    }),
  );
  return group;
};

// ---------------------------------------------------------------------------
// TRISHUL — grip at origin, shaft along +Y, world-upright
// ---------------------------------------------------------------------------

/**
 * The trishul's own proportions, at the canonical 1 m figure scale.
 *
 * A weapon has a length. It used to be told how high the hand was and
 * build a shaft to reach the ground from there, which meant the same
 * trident was 0.87 m long beside a hanging arm and 1.11 m long beside a
 * raised one. The ground is not the object's business: the object is one
 * object, and the ENGINE slides it along its own axis until its butt meets
 * the base — which is what the declared grip travel is for.
 *
 * Measured against `references/ref3.png`: butt at the floor, tip clearly
 * above the crown, total a little over the figure's own height.
 */
/** Shaft below the natural grip — roughly where a hanging hand falls. */
export const TRISHUL_BUTT_BELOW_GRIP = 0.52;
/**
 * Where the trident begins, above the grip. Must clear the whole range a
 * fist can slide along (grip.travel.up), with room to spare, or a raised
 * arm carries the hand into the prongs. A test holds the geometry and the
 * manifest to each other.
 */
const TRISHUL_HEAD_BASE = TRISHUL_TRAVEL + 0.09;

export const itemTrishul: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();

  // A trishul is a planted staff, not a wand: its butt rests on the
  // ground and the hand grips the SHAFT, with the whole head above the
  // fist, wherever along the shaft the fist happens to be.
  const butt = -TRISHUL_BUTT_BELOW_GRIP;
  const headBase = TRISHUL_HEAD_BASE;

  // Tall shaft through the grip. Its girth is what the manifest says a
  // hand closes on, so the fist and the shaft cannot disagree.
  group.add(
    new THREE.Mesh(
      taperedTube(
        [
          [0, butt + 0.004, 0],
          [0, (butt + headBase) / 2, 0],
          [0, headBase, 0],
        ],
        [TRISHUL_SHAFT_RADIUS, TRISHUL_SHAFT_RADIUS * 0.85],
        16,
        10,
      ),
      metal,
    ),
  );
  group.add(mesh(new THREE.SphereGeometry(0.0095, 12, 10), metal, { position: [0, butt, 0] }));

  // The trident head keeps its own size whatever the shaft does.
  const head = new THREE.Group();
  head.position.y = headBase;
  group.add(head);
  // Collar under the head
  head.add(
    mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.016, 12), metal, {
      position: [0, 0, 0],
    }),
  );
  // Crossbar the prongs rise from
  head.add(
    mesh(new THREE.CapsuleGeometry(0.0042, 0.062, 6, 10), metal, {
      position: [0, 0.013, 0],
      rotation: [0, 0, Math.PI / 2],
    }),
  );
  // Center prong
  head.add(
    new THREE.Mesh(
      taperedTube(
        [
          [0, 0.013, 0],
          [0, 0.087, 0],
          [0, 0.142, 0],
        ],
        [0.0055, 0.0012],
        14,
        10,
      ),
      metal,
    ),
  );
  // Curved side prongs
  for (const side of [1, -1]) {
    head.add(
      new THREE.Mesh(
        taperedTube(
          [
            [side * 0.031, 0.009, 0],
            [side * 0.044, 0.057, 0],
            [side * 0.033, 0.109, 0],
            [side * 0.022, 0.129, 0],
          ],
          [0.005, 0.0012],
          18,
          8,
        ),
        metal,
      ),
    );
  }
  return group;
};

// ---------------------------------------------------------------------------
// DAMARU — hourglass drum, gripped at the waist
// ---------------------------------------------------------------------------

export const itemDamaru: AttachmentGenerator = (ctx) => {
  // A damaru is turned from WOOD. It took the garment's accent colour,
  // which is the ochre of the sash, and an ochre hourglass with ivory
  // ends held out at arm's length reads as a goblet rather than a drum —
  // the reference shows dark wood with pale heads, and the difference is
  // what makes the shape legible at all.
  const wood = ctx.materials.fixed.rudraksha;
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  // A drum is held: it is sized to the hand holding it, not to the hand
  // it happened to be drawn for.
  const held = new THREE.Group();
  held.scale.setScalar(handFit(ctx.body));
  group.add(held);
  // Hourglass body — two shallow drums joined by a waist long enough to
  // be held. A waist of a few millimetres is a shape, not a handle: the
  // fingers have to close on SOMETHING, and if the heads flare inside the
  // hand they close through them instead.
  const waist = DAMARU_WAIST_RADIUS;
  const half = DAMARU_WAIST_HALF;
  // Wider heads on a longer body than it had. The waist is untouched —
  // it is the part the hand closes on and the manifest declares it — but
  // the drum it belongs to was the size of a bottle cork, and a small
  // object held at arm's length reads as a trinket whatever its shape.
  const headRadius = waist * 4.1;
  const headY = 0.047;
  held.add(
    mesh(
      lathe([
        [headRadius * 0.82, -headY],
        [headRadius, -headY * 0.88],
        [waist * 1.35, -half * 1.72],
        [waist, -half],
        [waist, half],
        [waist * 1.35, half * 1.72],
        [headRadius, headY * 0.88],
        [headRadius * 0.82, headY],
      ]),
      wood,
    ),
  );
  // Drum heads (hide membranes), slightly proud of the rim.
  for (const side of [1, -1]) {
    held.add(
      mesh(
        new THREE.CylinderGeometry(headRadius * 0.84, headRadius * 0.84, 0.0032, 20),
        ctx.materials.fixed.ivory,
        { position: [0, side * (headY - 0.0008), 0] },
      ),
    );
  }
  // Waist cord
  held.add(
    mesh(new THREE.TorusGeometry(0.0072, 0.0017, 8, 20), metal, {
      position: [0, 0, 0],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  // The two knotted strikers, hanging from the waist as cords do. Cord
  // and knot, not wire and bead: they are the same material as the drum.
  for (const side of [1, -1]) {
    const swing = side * 0.0165;
    held.add(
      new THREE.Mesh(
        taperedTube(
          [
            [side * 0.006, 0, 0.002],
            [swing * 1.15, -0.016, 0.008],
            [swing * 1.25, -0.032, 0.011],
          ],
          [0.0011, 0.0009],
          12,
          6,
        ),
        wood,
      ),
    );
    held.add(
      mesh(new THREE.SphereGeometry(0.0034, 10, 8), wood, {
        position: [swing * 1.25, -0.034, 0.011],
      }),
    );
  }
  return group;
};
