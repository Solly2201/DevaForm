/**
 * Vishnu's iconography: the four attributes, the crown, the garland, the
 * tilaka and the hair.
 *
 * Every one of these is a shape, and nothing here knows anything about
 * hands, poses, sockets or bodies. What each object IS gets built here;
 * how it is held, where it sits and what happens when a pose cannot hold
 * it are the manifest's and the resolver's business, exactly as they are
 * for Shiva's trishul. That separation is the thing being tested by
 * adding a deity at all — see packages/asset-system/src/manifests/vishnu.
 *
 * Everything below is drawn against references/ref_vishnu.png, and the
 * comments say which panel of it each decision came from.
 */
import * as THREE from "three";
import { lathe, mesh, taperedTube } from "../geometry";
import type { AttachmentGenerator, GeneratorContext, PartGenerator } from "./types";
import { walkSurface, type SurfaceWaypoint } from "./surfaceWalk";

type V3 = [number, number, number];

/** Matches the manifest's declared shaft radius — see GADA_SHAFT_RADIUS. */
const GADA_SHAFT_RADIUS = 0.009;

/**
 * Kaumodaki — the mace, HEAD DOWN.
 *
 * The reference's front view is unambiguous: the fluted golden ball rests
 * on the pedestal beside Vishnu's feet, the shaft rises from it, and the
 * front-right hand wraps the shaft near its top. A first version built it
 * the intuitive way — ball up, like a weapon at rest arms — and it read
 * as a lollipop in the fist. A mace at rest stands on its own weight.
 */
export const itemGada: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const stone = ctx.materials.fixed.nagamani;
  const group = new THREE.Group();
  // y = 0 is the grip. The shaft runs from the pommel just above the
  // fist down to the head standing on the ground.
  const HEAD_TOP = -0.36;
  // Tall enough that the full downward slide of the grip still ends on
  // shaft: the hand may travel 24 cm down it while the head grounds.
  const SHAFT_TOP = 0.27;

  group.add(
    new THREE.Mesh(
      taperedTube(
        [
          [0, SHAFT_TOP, 0],
          [0, HEAD_TOP / 2, 0],
          [0, HEAD_TOP + 0.01, 0],
        ],
        [GADA_SHAFT_RADIUS * 0.9, GADA_SHAFT_RADIUS * 1.1],
        18,
        10,
      ),
      metal,
    ),
  );
  // Pommel at the shaft's end.
  group.add(
    mesh(
      lathe([
        [0.008, SHAFT_TOP],
        [0.012, SHAFT_TOP + 0.012],
        [0.005, SHAFT_TOP + 0.026],
        [0, SHAFT_TOP + 0.032],
      ]),
      metal,
      {},
    ),
  );
  // Collars down the shaft, the way a ceremonial mace is banded.
  for (const at of [0.22, 0.52, 0.8]) {
    group.add(
      mesh(new THREE.TorusGeometry(GADA_SHAFT_RADIUS * 1.5, 0.0035, 8, 20), metal, {
        position: [0, SHAFT_TOP + (HEAD_TOP - SHAFT_TOP) * at, 0],
        rotation: [Math.PI / 2, 0, 0],
      }),
    );
  }

  // The head: a fluted bulb with a jewel band, standing on a short foot.
  // Built downward from the shaft's end; its foot is the lowest point of
  // the whole asset, which is what the grounded presentation rests on
  // the base.
  const head = new THREE.Group();
  head.position.y = HEAD_TOP;
  group.add(head);
  head.add(
    mesh(
      lathe([
        [0.006, 0],
        [0.02, -0.008],
        [0.04, -0.032],
        [0.046, -0.062],
        [0.038, -0.096],
        [0.02, -0.118],
        [0.012, -0.124],
      ]),
      metal,
      {},
    ),
  );
  // Gadrooning: the vertical flutes that make it Kaumodaki rather than a
  // doorknob — see the attribute panel of the reference.
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    head.add(
      new THREE.Mesh(
        taperedTube(
          [
            [Math.cos(angle) * 0.02, -0.012, Math.sin(angle) * 0.02],
            [Math.cos(angle) * 0.046, -0.062, Math.sin(angle) * 0.046],
            [Math.cos(angle) * 0.02, -0.114, Math.sin(angle) * 0.02],
          ],
          [0.004, 0.0035],
          10,
          6,
        ),
        metal,
      ),
    );
  }
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + 0.26;
    head.add(
      mesh(new THREE.SphereGeometry(0.0055, 10, 8), stone, {
        position: [Math.cos(angle) * 0.0455, -0.062, Math.sin(angle) * 0.0455],
        scale: [1, 1, 0.5],
        rotation: [0, -angle, 0],
      }),
    );
  }
  // The foot it stands on.
  head.add(
    mesh(lathe([[0.016, -0.138], [0.022, -0.13], [0.013, -0.122]]), metal, {}),
  );
  return group;
};

/**
 * Sudarshana Chakra — the discus, standing on a raised finger.
 *
 * The reference's grip close-up shows it VERTICAL, balanced on the
 * fingertip of a raised index, its plane across the viewer — a wheel
 * presented, not a weapon swung. The manifest declares a hold on a
 * finger's radius; the disc is built wholly above the grip point, so
 * nothing the hand does can put a finger through the blade.
 */
export const itemChakra: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const stone = ctx.materials.fixed.nagamani;
  const group = new THREE.Group();
  const disc = new THREE.Group();
  // Clear of the fingertips: the rim's lowest point grazes where a raised
  // fingertip ends, which is what "balanced on it" looks like.
  disc.position.y = 0.098;
  // STANDING and FACING: a torus built in the XY plane already stands
  // vertical when the presentation drives this asset's +Y up the hand's
  // channel, and its face normal is the asset's +Z — which is exactly
  // what the presentation's `facing: "front"` turns out the statue's
  // front. No decorative yaw here: an empirical quarter-turn used to
  // compensate for whatever spin the wrist solve left, and became wrong
  // the moment the pose changed.
  disc.rotation.y = 0;
  group.add(disc);

  const RADIUS = 0.054;
  // Rim.
  disc.add(mesh(new THREE.TorusGeometry(RADIUS * 0.84, 0.006, 10, 44), metal, {}));
  // Web.
  disc.add(
    mesh(new THREE.CylinderGeometry(RADIUS * 0.8, RADIUS * 0.8, 0.0035, 40), metal, {
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  // Flame points round the rim — the serration that reads "Sudarshana"
  // in the reference's attribute panel. Thin, and many.
  for (let i = 0; i < 24; i += 1) {
    const angle = (i / 24) * Math.PI * 2;
    disc.add(
      mesh(new THREE.ConeGeometry(0.0052, 0.017, 6), metal, {
        position: [Math.cos(angle) * (RADIUS * 0.93), Math.sin(angle) * (RADIUS * 0.93), 0],
        rotation: [0, 0, angle - Math.PI / 2],
        scale: [1, 1, 0.55],
      }),
    );
  }
  // Spokes.
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    disc.add(
      mesh(new THREE.BoxGeometry(RADIUS * 0.74, 0.0055, 0.005), metal, {
        position: [Math.cos(angle) * RADIUS * 0.37, Math.sin(angle) * RADIUS * 0.37, 0],
        rotation: [0, 0, angle],
      }),
    );
  }
  // Hub, jewelled on BOTH faces: a presented wheel is seen from either
  // side as the statue turns.
  disc.add(mesh(new THREE.SphereGeometry(0.012, 14, 12), metal, { scale: [1, 1, 0.55] }));
  for (const side of [1, -1] as const) {
    disc.add(
      mesh(new THREE.SphereGeometry(0.0058, 12, 10), stone, {
        position: [0, 0, side * 0.0068],
        scale: [1, 1, 0.5],
      }),
    );
  }
  return group;
};

/**
 * Panchajanya — the conch, apex up.
 *
 * The reference holds it in the palm with the spire rising and the lip
 * flaring low: a shell, not a vase. The silhouette that says "conch" is
 * the swollen body drawn to a curved point, with the spiral's ridges
 * showing — so those are built as actual ridges, not left to a texture.
 */
export const itemShankha: AttachmentGenerator = (ctx) => {
  const shell = ctx.materials.fixed.ivory;
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();

  // The body: an egg, fullest just below the middle, drawn up to a spire
  // that leans slightly — a straight-axis conch reads as a lamp finial.
  group.add(
    mesh(
      lathe([
        [0.004, -0.058],
        [0.02, -0.052],
        [0.03, -0.034],
        [0.033, -0.01],
        [0.028, 0.016],
        [0.018, 0.038],
        [0.009, 0.054],
        [0.003, 0.064],
      ]),
      shell,
      { rotation: [0, 0, 0.12] },
    ),
  );
  // The spiral's ridges: three whorls stepping toward the apex.
  for (const [y, radius, tilt] of [
    [0.012, 0.0295, 0.1],
    [0.032, 0.0215, 0.14],
    [0.048, 0.0135, 0.18],
  ] as const) {
    group.add(
      mesh(new THREE.TorusGeometry(radius, 0.0028, 8, 26), shell, {
        position: [Math.sin(0.12) * y * -1, y, 0],
        rotation: [Math.PI / 2, 0, tilt],
      }),
    );
  }
  // The lip: the flared opening low on one side.
  group.add(
    mesh(
      lathe([
        [0.016, -0.06],
        [0.028, -0.046],
        [0.03, -0.03],
        [0.023, -0.02],
      ]),
      shell,
      { position: [0.007, 0, 0.004], rotation: [0.12, 0, -0.2] },
    ),
  );
  // Gold at the apex — the mounted cap the reference shows.
  group.add(
    mesh(lathe([[0.006, 0.06], [0.008, 0.07], [0.003, 0.082], [0, 0.088]]), metal, {
      rotation: [0, 0, 0.12],
    }),
  );
  // And a slim band where a blown conch is bound.
  group.add(
    mesh(new THREE.TorusGeometry(0.0245, 0.003, 8, 24), metal, {
      position: [0, -0.026, 0],
      rotation: [Math.PI / 2, 0, 0.1],
    }),
  );
  return group;
};

/**
 * Padma — the lotus, pink, held by the stem.
 *
 * Two whorls of petals round a golden seed-cup: the inner rising, the
 * outer opened. Pink and green are the flower's own — see the fixed
 * materials — because a lotus that recolours with the dhoti border is
 * not a lotus.
 */
export const itemPadma: AttachmentGenerator = (ctx) => {
  const petal = ctx.materials.fixed.lotusPetal;
  const heart = ctx.materials.get("metal");
  const stem = ctx.materials.fixed.stem;
  const group = new THREE.Group();

  group.add(
    new THREE.Mesh(
      taperedTube(
        [
          [0, -0.055, 0],
          [0.004, 0, 0.002],
          [0.002, 0.05, 0],
        ],
        [0.0042, 0.0032],
        12,
        8,
      ),
      stem,
    ),
  );
  const bloom = new THREE.Group();
  bloom.position.y = 0.056;
  group.add(bloom);
  // Seed cup.
  bloom.add(mesh(lathe([[0.005, 0], [0.011, 0.006], [0.0095, 0.014]]), heart, {}));
  // Inner whorl: six petals, risen.
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    bloom.add(
      mesh(new THREE.SphereGeometry(0.013, 10, 8), petal, {
        position: [Math.cos(angle) * 0.009, 0.008, Math.sin(angle) * 0.009],
        scale: [0.42, 1.05, 0.16],
        rotation: [
          Math.sin(angle) * 0.5,
          -angle,
          -Math.cos(angle) * 0.5,
        ],
      }),
    );
  }
  // Outer whorl: eight petals, opened.
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 + 0.3;
    bloom.add(
      mesh(new THREE.SphereGeometry(0.015, 10, 8), petal, {
        position: [Math.cos(angle) * 0.014, 0.002, Math.sin(angle) * 0.014],
        scale: [0.46, 1.0, 0.15],
        rotation: [Math.sin(angle) * 1.0, -angle, -Math.cos(angle) * 1.0],
      }),
    );
  }
  return group;
};

/**
 * Kirita mukuta — the crown, as the reference's own detail panel builds
 * it: a broad jewelled band gripping the brow, a fluted drum above it, a
 * taller domed tier, and a bud finial; a great red stone at the front of
 * the band and rosettes over the temples.
 */
export const ornamentKirita: AttachmentGenerator = (ctx: GeneratorContext) => {
  const metal = ctx.materials.get("metal");
  const stone = ctx.materials.fixed.nagamani;
  const gem = ctx.materials.get("gem");
  const group = new THREE.Group();
  const skull = ctx.body.headRadius;
  // The socket sits near the top of the skull; the band grips at the
  // brow, most of a radius lower. Sized by what CONTAINS the skull —
  // headRadius is a mean, and a band built at the mean cuts the temples.
  const seat = -skull * 0.72;
  const around = skull * 1.24;

  // --- the band ----------------------------------------------------------
  group.add(
    mesh(
      lathe([
        [around * 0.94, seat - skull * 0.12],
        [around * 1.03, seat],
        [around * 1.06, seat + skull * 0.2],
        [around * 1.0, seat + skull * 0.42],
      ]),
      metal,
      {},
    ),
  );
  // Bead rows top and bottom of the band.
  for (const at of [seat - skull * 0.08, seat + skull * 0.38]) {
    for (let i = 0; i < 26; i += 1) {
      const angle = (i / 26) * Math.PI * 2;
      group.add(
        mesh(new THREE.SphereGeometry(skull * 0.045, 8, 6), metal, {
          position: [Math.cos(angle) * around * 1.03, at, Math.sin(angle) * around * 1.03],
        }),
      );
    }
  }
  // Small stones round the band…
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2 + Math.PI / 10;
    group.add(
      mesh(new THREE.SphereGeometry(skull * 0.06, 10, 8), gem, {
        position: [
          Math.cos(angle) * around * 1.05,
          seat + skull * 0.18,
          Math.sin(angle) * around * 1.05,
        ],
        scale: [1, 1.2, 0.4],
        rotation: [0, -angle + Math.PI / 2, 0],
      }),
    );
  }
  // …and the great red stone at the front, in a gold bezel.
  group.add(
    mesh(new THREE.SphereGeometry(skull * 0.16, 14, 12), metal, {
      position: [0, seat + skull * 0.2, around * 1.0],
      scale: [1, 1.25, 0.42],
    }),
  );
  group.add(
    mesh(new THREE.SphereGeometry(skull * 0.11, 14, 12), stone, {
      position: [0, seat + skull * 0.21, around * 1.07],
      scale: [1, 1.3, 0.45],
    }),
  );
  // Rosettes over the temples — the winged discs of the reference.
  for (const side of [1, -1] as const) {
    const rosette = new THREE.Group();
    rosette.position.set(side * around * 1.04, seat + skull * 0.58, 0);
    rosette.rotation.z = side * -0.18;
    group.add(rosette);
    rosette.add(
      mesh(new THREE.TorusGeometry(skull * 0.3, skull * 0.055, 8, 24), metal, {
        rotation: [0, Math.PI / 2, 0],
      }),
    );
    rosette.add(
      mesh(new THREE.SphereGeometry(skull * 0.09, 10, 8), gem, {
        scale: [0.45, 1, 1],
      }),
    );
  }

  // --- the tiers ---------------------------------------------------------
  // First: a fluted drum.
  group.add(
    mesh(
      lathe([
        [around * 0.92, seat + skull * 0.42],
        [around * 1.02, seat + skull * 0.7],
        [around * 0.92, seat + skull * 1.16],
        [around * 0.72, seat + skull * 1.42],
      ]),
      metal,
      {},
    ),
  );
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2;
    group.add(
      new THREE.Mesh(
        taperedTube(
          [
            [Math.cos(angle) * around * 1.0, seat + skull * 0.52, Math.sin(angle) * around * 1.0],
            [Math.cos(angle) * around * 0.97, seat + skull * 0.94, Math.sin(angle) * around * 0.97],
            [Math.cos(angle) * around * 0.74, seat + skull * 1.38, Math.sin(angle) * around * 0.74],
          ],
          [skull * 0.05, skull * 0.028],
          10,
          6,
        ),
        metal,
      ),
    );
  }
  // A bead ring between the tiers.
  for (let i = 0; i < 20; i += 1) {
    const angle = (i / 20) * Math.PI * 2;
    group.add(
      mesh(new THREE.SphereGeometry(skull * 0.045, 8, 6), metal, {
        position: [
          Math.cos(angle) * around * 0.74,
          seat + skull * 1.44,
          Math.sin(angle) * around * 0.74,
        ],
      }),
    );
  }
  // Second: the taller dome, drawn to a waist.
  group.add(
    mesh(
      lathe([
        [around * 0.7, seat + skull * 1.44],
        [around * 0.66, seat + skull * 1.76],
        [around * 0.52, seat + skull * 2.2],
        [around * 0.34, seat + skull * 2.56],
        [around * 0.19, seat + skull * 2.78],
      ]),
      metal,
      {},
    ),
  );
  // Front stone on the dome too, smaller.
  group.add(
    mesh(new THREE.SphereGeometry(skull * 0.08, 12, 10), stone, {
      position: [0, seat + skull * 1.82, around * 0.64],
      scale: [1, 1.3, 0.45],
    }),
  );
  // Finial: neck, bud, tip.
  group.add(
    mesh(
      lathe([
        [around * 0.18, seat + skull * 2.78],
        [around * 0.12, seat + skull * 2.88],
        [around * 0.17, seat + skull * 3.04],
        [around * 0.1, seat + skull * 3.2],
        [0, seat + skull * 3.32],
      ]),
      metal,
      {},
    ),
  );
  return group;
};

/**
 * The urdhva pundra — Vishnu's own tilaka.
 *
 * Two ivory strokes rising from the bridge of the nose in a narrow U,
 * with the red srichurna between them: the mark the reference's face
 * close-up leads with, and the single strongest thing on this face that
 * says WHICH deity it belongs to. Built flat, facing +Z — the socket is
 * turned onto the forehead's own measured normal, so the plane of this
 * mark IS the plane of the brow.
 */
export const ornamentTilaka: AttachmentGenerator = (ctx) => {
  const ivory = ctx.materials.fixed.ivory;
  const red = ctx.materials.fixed.tilak;
  const group = new THREE.Group();
  const skull = ctx.body.headRadius;
  const curve = (y: number) => -(y * y) / (2 * skull);
  const RELIEF = 0.0018;
  const HEIGHT = skull * 0.62;

  for (const side of [1, -1] as const) {
    const path: V3[] = [];
    const STEPS = 10;
    for (let i = 0; i <= STEPS; i += 1) {
      const t = i / STEPS;
      const y = (t - 0.35) * HEIGHT;
      // A narrow U: together at the bottom, apart above.
      const spread = skull * (0.05 + 0.17 * Math.pow(t, 0.7));
      path.push([side * spread, y, RELIEF + curve(y)]);
    }
    const stroke = new THREE.Mesh(taperedTube(path, [0.0024, 0.0018], 12, 8), ivory);
    stroke.scale.z = 0.5;
    group.add(stroke);
  }
  // The srichurna: the red centre line, shorter, between them.
  const centre: V3[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const y = (t - 0.3) * HEIGHT * 0.8;
    centre.push([0, y, RELIEF + 0.0005 + curve(y)]);
  }
  const line = new THREE.Mesh(taperedTube(centre, [0.0022, 0.0014], 12, 8), red);
  line.scale.z = 0.5;
  group.add(line);
  return group;
};

/**
 * Vishnu's hair: long, dark, falling behind the shoulders.
 *
 * The reference's back view shows loose waves to the mid-back under the
 * crown — none of Shiva's piled jata. A close cap over the measured
 * skull, a visible hairline round the face, and long locks down the
 * back. The crown covers the top; what this asset owns is the sides, the
 * nape and the fall.
 */
export const featureHairFlowing: PartGenerator = (ctx) => {
  const hair = ctx.materials.get("hair");
  const group = new THREE.Group();
  const skull = ctx.body.headRadius;
  const centre = new THREE.Vector3(0, ctx.body.headCenterY, ctx.body.headCenterZ);

  // The cap: a shell over the back three-quarters of the skull.
  // The cap, as explicit tufts on MY OWN bearings rather than a sphere
  // sweep: two attempts at phiStart arithmetic each draped hair over the
  // brow like a helmet brim, because a sweep's zero is the geometry's
  // convention and these angles are mine. Bearing 0 is the front;
  // everything here sits from the temples round the back.
  for (const row of [
    { y: 0.28, r: 0.94, size: 0.32, from: 0.62, count: 7 },
    { y: 0.2, r: 0.98, size: 0.36, from: 0.56, count: 8 },
  ]) {
    for (let i = 0; i < row.count; i += 1) {
      const t = row.count === 1 ? 0.5 : i / (row.count - 1);
      const bearing = Math.PI * (row.from + (2 - 2 * row.from) * t);
      group.add(
        mesh(new THREE.SphereGeometry(skull * row.size, 12, 10), hair, {
          position: [
            centre.x + Math.sin(bearing) * skull * row.r,
            centre.y + skull * row.y,
            centre.z + Math.cos(bearing) * skull * row.r,
          ],
          scale: [1, 1.15, 1],
        }),
      );
    }
  }

  // The fall: locks from the nape, curving out over the shoulders and
  // down the back. Deterministic variation — no randomness, the same
  // statue every time.
  const LOCKS = 11;
  for (let i = 0; i < LOCKS; i += 1) {
    const t = i / (LOCKS - 1);
    const angle = Math.PI * (0.6 + 0.8 * t); // round the back of the skull
    const sway = Math.sin(i * 2.4) * 0.008;
    const x0 = Math.cos(angle) * skull * 0.92;
    const z0 = centre.z + Math.sin(angle) * -skull * 0.92;
    const drop = 0.16 + 0.05 * Math.sin(i * 1.7 + 1);
    const path: V3[] = [
      [x0, centre.y + skull * 0.25, z0],
      [x0 * 1.25 + sway, centre.y - skull * 0.6, z0 - skull * 0.35],
      [x0 * 1.1 + sway * 2, centre.y - skull * 0.6 - drop * 0.55, z0 - skull * 0.5],
      [x0 * 0.85, centre.y - skull * 0.6 - drop, z0 - skull * 0.42],
    ];
    group.add(new THREE.Mesh(taperedTube(path, [skull * 0.16, skull * 0.05], 12, 7), hair));
  }
  return [{ joint: "head", object: group }];
};

/**
 * Vaijayanti — the long garland, white and pink.
 *
 * The reference's garland is jasmine-white with bands of pink, falling
 * past the waist. Blooms with volume, threaded on a route walked over
 * the measured torso — flattened petals rendered as painted dashes, and
 * a row of plain beads reads as a third mala.
 */
export const ornamentVaijayanti: AttachmentGenerator = (ctx: GeneratorContext) => {
  const white = ctx.materials.fixed.ivory;
  const pink = ctx.materials.fixed.lotusPetal;
  const leaf = ctx.materials.fixed.stem;
  const group = new THREE.Group();
  const body = ctx.body;
  const neckBase = body.necklaceSocketY + body.neckBaseOffsetY;

  // Down the chest, round low over the belly, and back up.
  const route: SurfaceWaypoint[] = [
    { bearing: -0.35, y: neckBase - 0.01 },
    { bearing: -0.8, y: neckBase - 0.1 },
    { bearing: -1.35, y: neckBase - 0.2 },
    { bearing: -3.14, y: neckBase - 0.27 },
    { bearing: -4.85, y: neckBase - 0.2 },
    { bearing: -5.5, y: neckBase - 0.1 },
    { bearing: -5.93, y: neckBase - 0.01 },
  ];
  const walk = walkSurface(body, route, () => 0.011, 110);
  const toSocket = (point: THREE.Vector3): V3 => [
    point.x,
    point.y - body.necklaceSocketY,
    point.z - body.necklaceSocketZ,
  ];
  const points = walk.points.map(toSocket);

  const PETALS = 5;
  for (let i = 0; i < points.length; i += 3) {
    const at = points[i]!;
    const step = Math.floor(i / 3);
    // Bands: two white blooms, one pink, a leaf — repeating.
    const kind = step % 4;
    if (kind === 3) {
      group.add(
        mesh(new THREE.SphereGeometry(0.006, 8, 6), leaf, {
          position: at,
          scale: [0.7, 1.5, 0.5],
          rotation: [0, (i * 0.7) % Math.PI, 0.4],
        }),
      );
      continue;
    }
    const material = kind === 2 ? pink : white;
    const head = new THREE.Group();
    head.position.set(at[0], at[1], at[2]);
    head.rotation.set(0.5, (i * 1.1) % Math.PI, 0);
    for (let petal = 0; petal < PETALS; petal += 1) {
      const angle = (petal / PETALS) * Math.PI * 2;
      head.add(
        mesh(new THREE.SphereGeometry(0.006, 8, 6), material, {
          position: [Math.cos(angle) * 0.006, 0, Math.sin(angle) * 0.006],
          scale: [1.15, 0.8, 1],
          rotation: [0, -angle, 0],
        }),
      );
    }
    head.add(
      mesh(new THREE.SphereGeometry(0.004, 8, 6), kind === 2 ? white : pink, {
        position: [0, 0.003, 0],
      }),
    );
    group.add(head);
  }
  return group;
};
