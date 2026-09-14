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
import { chestZAtSocket } from "./ornaments";
import { REFERENCE_SKULL, handFit, headFit } from "./bodyProfile";

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
 * A few tubes hanging behind the ears read as strands stuck to a head.
 * What the iconography shows is mass: a body of hair falling from the
 * crown, spreading over the shoulders and down the back, with individual
 * locks catching the light on top of it. So the mass is built first, as a
 * shell that follows the skull and then flares to the shoulders of the
 * body actually wearing it, and the locks are laid over that.
 *
 * Sized from the body, not from the jata's reference skull: how far hair
 * falls is a fact about the wearer's back, not about the hairpiece.
 */
function jataMane(ctx: GeneratorContext, length: number): THREE.Group {
  const hair = ctx.materials.get("hair");
  const group = new THREE.Group();
  const skull = ctx.body.headRadius;
  const shoulder = ctx.body.chestRadiusX;
  const top = ctx.body.headCenterY + skull * 0.35;
  // Down to the middle of the back, as the iconography shows.
  const fall = length * (skull * 1.4 + shoulder * 2.3);

  // The face stays clear: the shell spans everything but a frontal arc.
  const open = Math.PI * 0.38;
  const from = Math.PI / 2 + open;
  const span = Math.PI * 2 - open * 2;
  const rows = 16;
  const cols = 26;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const t = row / rows;
    // Hugs the skull, flares across the shoulders, then gathers again.
    const width =
      skull * 1.04 + (shoulder * 0.92 - skull * 1.04) * Math.min(1, Math.pow(t * 2.4, 1.2));
    const taper = 1 - 0.22 * Math.pow(Math.max(0, t - 0.5) / 0.5, 2);
    for (let col = 0; col <= cols; col += 1) {
      const s = col / cols;
      const angle = from + s * span;
      // Matted hair is lumpy: vary the surface so it is not a helmet.
      const lump = 1 + 0.05 * Math.cos(s * Math.PI * 9 + t * 4) + 0.03 * Math.cos(s * Math.PI * 17);
      const r = width * taper * lump;
      // The mass sits behind the head and leans further back as it falls.
      const back = -0.012 - 0.055 * t * t;
      // Hair does not end in a straight line: the mass frays where it
      // stops, by a different amount around the head.
      const fray =
        t > 0.82
          ? (Math.cos(s * Math.PI * 6.3) * 0.4 + Math.cos(s * Math.PI * 13.1) * 0.6) * 0.035
          : 0;
      positions.push(
        Math.cos(angle) * r,
        top - t * fall + Math.sin(s * Math.PI) * 0.01 + fray * ((t - 0.82) / 0.18),
        Math.sin(angle) * r * 0.92 + back,
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
  const shell = new THREE.BufferGeometry();
  shell.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  shell.setIndex(indices);
  shell.computeVertexNormals();
  const mass = new THREE.Mesh(shell, hair);
  mass.material = hair;
  group.add(mass);

  // Locks over the mass: thick where they leave the crown, tapering, each
  // with its own length and sway so the silhouette is not repeated.
  for (let i = 0; i < 16; i += 1) {
    const s = (i + 0.5) / 16;
    const angle = from + s * span;
    const wave = Math.sin(i * 2.399);
    const len = fall * (0.5 + 0.55 * Math.abs(Math.sin(i * 1.7)));
    const outer = skull * 1.06;
    const wide = skull * 1.04 + (shoulder * 0.66 - skull * 1.04) * 0.8;
    const path: V3[] = [
      [Math.cos(angle) * outer * 0.9, top - fall * 0.02, Math.sin(angle) * outer * 0.85 - 0.014],
      [
        Math.cos(angle) * wide * 0.98,
        top - len * 0.45,
        Math.sin(angle) * wide * 0.9 - 0.03 + wave * 0.006,
      ],
      [
        Math.cos(angle) * wide * (0.92 + 0.08 * wave),
        top - len,
        Math.sin(angle) * wide * 0.86 - 0.05 + wave * 0.01,
      ],
    ];
    group.add(
      new THREE.Mesh(taperedTube(path, [0.014 + 0.004 * wave, 0.0045], 16, 8), hair),
    );
  }

  // Locks brought forward over each shoulder. Hair falls where the head
  // is, not only behind it, and this is what stops the mane reading as a
  // wig hung on the back of the skull.
  for (const side of [1, -1]) {
    // At the sides of the head, not the front: hair frames a face, it
    // does not hang over it.
    for (const [turn, len, thick] of [
      [1.12, 0.72, 0.0125],
      [1.36, 0.55, 0.0105],
    ] as const) {
      const angle = Math.PI / 2 + side * turn;
      const outer = skull * 1.04;
      const wide = skull * 1.02 + (shoulder * 0.72 - skull * 1.02) * 0.85;
      group.add(
        new THREE.Mesh(
          taperedTube(
            [
              [Math.cos(angle) * outer, top - fall * 0.03, Math.sin(angle) * outer * 0.9 - 0.008],
              [
                Math.cos(angle) * wide * 1.02,
                top - fall * len * 0.45,
                Math.sin(angle) * wide * 0.86 + 0.004,
              ],
              [
                Math.cos(angle) * wide * 0.94,
                top - fall * len,
                Math.sin(angle) * wide * 0.8 + 0.012,
              ],
            ],
            [thick, 0.0042],
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
  // Strand collar wraps the measured neck; the front drapes onto the chest.
  const neckR = ctx.body.neckRadius + 0.005;
  const collarY = ctx.body.neckBaseOffsetY;
  for (const [drop, spread, size] of [
    [0.055, 0.01, 0.008],
    [0.095, 0.02, 0.009],
  ] as const) {
    // A bead is a real seed of a real size, so the strand carries as many
    // as its own length holds — measured along the path it actually
    // follows, which on a slim neck is mostly the drop, not the circle.
    const at = (angle: number): [number, number, number] => {
      const frontness = Math.max(0, Math.sin(angle));
      const x = Math.cos(angle) * (neckR + frontness * spread);
      const y = collarY + 0.008 - frontness * (drop + collarY);
      const zNeck = Math.sin(angle) * neckR * 0.7;
      const z = frontness > 0.05 ? Math.max(zNeck, chestZAtSocket(ctx, x, y, 0.007)) : zNeck;
      return [x, y, z];
    };
    let strand = 0;
    let previous = at(0);
    for (let step = 1; step <= 180; step += 1) {
      const point = at((step / 180) * Math.PI * 2);
      strand += Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2]);
      previous = point;
    }
    const count = Math.min(64, Math.max(16, Math.round(strand / (size * 1.9))));
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const [x, y, z] = at(angle);
      // Rudraksha seeds with occasional gold spacers
      group.add(
        mesh(new THREE.SphereGeometry(size, 10, 8), i % 9 === 0 ? metal : bead, {
          position: [x, y, z],
          scale: [1, 0.88, 1],
        }),
      );
    }
  }
  // Central guru bead
  const gy = -0.1;
  group.add(
    mesh(new THREE.SphereGeometry(0.012, 12, 10), bead, {
      position: [0, gy, chestZAtSocket(ctx, 0, gy, 0.009)],
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
 * The frame is built from a fixed up-vector, so it never twists the way
 * Frenet frames do where a curve changes plane.
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
  const lift = new THREE.Vector3();
  for (let i = 0; i <= along; i += 1) {
    const t = i / along;
    const centre = curve.getPoint(t);
    curve.getTangent(t, tangent).normalize();
    side.crossVectors(tangent, up).normalize();
    lift.crossVectors(side, tangent).normalize();
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

  // One animal, not a ring with a head glued to it. A single curve runs
  // from the tail lying on the chest, once round the measured neck, and
  // out into the head — and its thickness varies along the way a snake's
  // does: nothing at the tail tip, heaviest through the coil, drawn in
  // again behind the skull. It is all in the necklace socket's space, so
  // it wraps the neck this body actually has.
  const neckR = ctx.body.neckRadius + 0.007;
  const collarY = ctx.body.neckBaseOffsetY;
  // The socket sits forward of the neck axis; pull the coil back onto it.
  const zBias = -0.01;

  /** A point on the neck column at `turn` radians (+Z is the front). */
  const onNeck = (turn: number, y: number, out = 0): V3 => [
    Math.cos(turn) * (neckR + out),
    y,
    Math.sin(turn) * (neckR + out) + zBias,
  ];

  // Just over one turn, entering at the front-right and leaving at the
  // front-left, rising a little as it goes — a coil, not a ring.
  const start = Math.PI * 0.16;
  const turns = Math.PI * 2.28;
  const exit = start + turns;

  const path: V3[] = [];
  // Tail, lying down the chest and thinning to nothing.
  path.push([-0.062, -0.128, chestZAtSocket(ctx, -0.062, -0.128, 0.003)]);
  path.push([-0.05, -0.092, chestZAtSocket(ctx, -0.05, -0.092, 0.004)]);
  path.push([-0.035, -0.055, chestZAtSocket(ctx, -0.035, -0.055, 0.006)]);
  path.push([-0.026, -0.03, chestZAtSocket(ctx, -0.026, -0.03, 0.008)]);
  // Onto the neck and round it.
  const samples = 26;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    path.push(onNeck(start + t * turns, collarY - 0.02 + t * 0.026, t * 0.002));
  }
  // Out of the coil and forward, so the head rests over the collarbone
  // looking out — not reaching up beside the jaw. The body stops where
  // the hood begins; the two are swept together below.
  path.push(onNeck(exit + 0.24, collarY - 0.002, 0.003));
  const headBase = onNeck(exit + 0.6, collarY + 0.008, 0.012);

  // Thickness along that curve.
  const girth = (t: number): number => {
    if (t < 0.2) return 0.0018 + (t / 0.2) * 0.0072;
    if (t < 0.34) return 0.009 + ((t - 0.34) / 0.14 + 1) * 0.0024;
    if (t < 0.8) return 0.0114;
    // Draws in behind the skull, then swells again into the hood: the
    // shape a cobra makes when it rears, rather than a uniform hose.
    return 0.0114 - ((t - 0.8) / 0.2) * 0.0016;
  };
  group.add(new THREE.Mesh(taperedTube(path, girth, 190, 18), scales));

  // Hood and head are one piece, swept: the neck spreads flat into the
  // hood, draws back in, swells into a wedge of a skull and narrows to a
  // snout. A cobra is that shape; nothing stuck onto a tube is.
  const headTip: V3 = [headBase[0] * 0.64, headBase[1] - 0.001, headBase[2] + 0.062];
  const hoodStart = onNeck(exit + 0.22, collarY - 0.004, 0.004);
  const headMid: V3 = [
    headBase[0] * 0.82 + headTip[0] * 0.18,
    headBase[1] + 0.003,
    headBase[2] * 0.82 + headTip[2] * 0.18,
  ];
  const crownPoint: V3 = [
    headBase[0] * 0.4 + headTip[0] * 0.6,
    headBase[1] + 0.002,
    headBase[2] * 0.4 + headTip[2] * 0.6,
  ];
  const serpentHead = sweptForm(
    [hoodStart, headBase, headMid, crownPoint, headTip],
    (t) => {
      // t runs neck -> hood -> skull -> snout.
      if (t < 0.12) return { halfWidth: 0.0098, halfHeight: 0.0098 };
      if (t < 0.34) {
        const k = (t - 0.12) / 0.22;
        return { halfWidth: 0.0098 + k * 0.0142, halfHeight: 0.0098 - k * 0.0034 };
      }
      if (t < 0.52) {
        const k = (t - 0.34) / 0.18;
        return { halfWidth: 0.024 - k * 0.0118, halfHeight: 0.0064 + k * 0.0026 };
      }
      if (t < 0.78) {
        const k = (t - 0.52) / 0.26;
        // The skull: wider than it is tall, and flat underneath.
        return { halfWidth: 0.0122 + k * 0.0022, halfHeight: 0.009 + k * 0.0008, drop: -k * 0.001 };
      }
      const k = (t - 0.78) / 0.22;
      return {
        halfWidth: 0.0144 - k * 0.0106,
        halfHeight: 0.0098 - k * 0.0072,
        drop: -0.001 - k * 0.0018,
      };
    },
    new THREE.Vector3(0, 1, 0),
    72,
    22,
  );
  group.add(new THREE.Mesh(serpentHead, scales));

  // Orientation of the head, used to place what sits on it.
  const facing = Math.atan2(headTip[2] - headBase[2], headTip[0] - headBase[0]);
  const along = (f: number, lift = 0): [number, number, number] => [
    headBase[0] + (headTip[0] - headBase[0]) * f,
    headBase[1] + (headTip[1] - headBase[1]) * f + lift,
    headBase[2] + (headTip[2] - headBase[2]) * f,
  ];
  const facingGroup = (f: number, lift = 0): THREE.Group => {
    const node = new THREE.Group();
    node.position.set(...along(f, lift));
    node.rotation.y = -facing;
    group.add(node);
    return node;
  };

  // The line of the mouth, set into the wedge rather than drawn on it.
  const mouth = facingGroup(0.66, -0.0036);
  mouth.add(
    mesh(new THREE.SphereGeometry(0.0062, 14, 8), ctx.materials.fixed.eyeDark, {
      position: [0.001, 0, 0],
      scale: [1.5, 0.12, 1.05],
    }),
  );

  // Eyes: a hooded brow, and under it an eye small enough to be a glint.
  const eyes = facingGroup(0.58, 0.0036);
  for (const side of [1, -1]) {
    eyes.add(
      mesh(new THREE.SphereGeometry(0.0042, 12, 8), scales, {
        position: [0, 0.0018, side * 0.0088],
        scale: [1.35, 0.4, 0.85],
      }),
    );
    eyes.add(
      mesh(new THREE.SphereGeometry(0.0016, 8, 6), ctx.materials.fixed.eyeDark, {
        position: [0.0008, -0.0011, side * 0.0094],
        scale: [1, 0.75, 0.75],
      }),
    );
  }

  // The pale throat, under the jaw where a snake shows it.
  const throat = facingGroup(0.5, -0.0085);
  throat.add(
    mesh(new THREE.SphereGeometry(0.0058, 12, 10), belly, {
      rotation: [0, -facing, 0],
      scale: [1.7, 0.26, 0.75],
    }),
  );
  return group;
};

// ---------------------------------------------------------------------------
// TRISHUL — grip at origin, shaft along +Y, world-upright
// ---------------------------------------------------------------------------

export const itemTrishul: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();

  // A trishul is a planted staff, not a wand: its butt rests on the
  // ground and its head clears the figure, with the hand gripping
  // somewhere along the shaft. When the engine tells us how high above
  // the base this hand is (see ItemPresentation.grounded), the shaft is
  // built to that length; without it the classic proportions stand.
  const butt = ctx.reach !== undefined ? -ctx.reach : -0.304;
  const headBase = ctx.reach !== undefined ? ctx.reach * 0.78 : 0.243;

  // Tall shaft through the grip
  group.add(
    new THREE.Mesh(
      taperedTube(
        [
          [0, butt + 0.004, 0],
          [0, (butt + headBase) / 2, 0],
          [0, headBase, 0],
        ],
        [0.0086, 0.0072],
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
  const wood = ctx.materials.get("garmentAccent");
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  // A drum is held: it is sized to the hand holding it, not to the hand
  // it happened to be drawn for.
  const held = new THREE.Group();
  held.scale.setScalar(handFit(ctx.body));
  group.add(held);
  // Hourglass body — two shallow drums meeting at the waist the fist
  // closes on. Sized like the instrument it is: a span of a hand, not a
  // shield, and narrow enough at the middle for fingers to meet round it.
  held.add(
    mesh(
      lathe([
        [0.0185, -0.033],
        [0.0225, -0.029],
        [0.0062, -0.0025],
        [0.0062, 0.0025],
        [0.0225, 0.029],
        [0.0185, 0.033],
      ]),
      wood,
    ),
  );
  // Drum heads (hide membranes), slightly proud of the rim.
  for (const side of [1, -1]) {
    held.add(
      mesh(new THREE.CylinderGeometry(0.0208, 0.0208, 0.0032, 20), ctx.materials.fixed.ivory, {
        position: [0, side * 0.0325, 0],
      }),
    );
  }
  // Waist cord
  held.add(
    mesh(new THREE.TorusGeometry(0.0072, 0.0019, 8, 20), metal, {
      position: [0, 0, 0],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  // The two knotted strikers, hanging from the waist as cords do.
  for (const side of [1, -1]) {
    const swing = side * 0.0165;
    held.add(
      new THREE.Mesh(
        taperedTube(
          [
            [side * 0.006, 0, 0.002],
            [swing * 1.15, -0.012, 0.008],
            [swing * 1.25, -0.026, 0.011],
          ],
          [0.0011, 0.0009],
          12,
          6,
        ),
        metal,
      ),
    );
    held.add(
      mesh(new THREE.SphereGeometry(0.0031, 10, 8), metal, {
        position: [swing * 1.25, -0.028, 0.011],
      }),
    );
  }
  return group;
};
