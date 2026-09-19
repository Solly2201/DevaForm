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
import { lathe, loft, mesh, taperedTube } from "../geometry";
import type { AttachmentGenerator, GeneratorContext, PartGenerator } from "./types";
import type { BodyProfile } from "./bodyProfile";
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
 * WHAT WAS WRONG. A torus, a flat plate, eight box spokes and twenty-four
 * thin cones round the edge. Every one of those is the cheapest possible
 * answer to its part of the shape, and together they read as a gear: a
 * flat washer with saw teeth. It was also twice the size the reference
 * gives it, which is why it read as a shield rather than an attribute.
 *
 * WHAT IT IS NOW. The reference's attribute panel is a sacred disc built
 * in concentric terraces — a jewelled outer band, mouldings stepping in
 * toward a spoked wheel, a raised boss with a cabochon at its heart — and
 * ringed with broad FLAME petals, not teeth. Terraces rather than a plate
 * is the whole difference: they give the disc real thickness from the
 * side and a centre from the front, which is what makes a wheel look
 * struck rather than cut.
 *
 * Built in the XY plane so its face normal is +Z, which is what the
 * presentation's `facing: "front"` turns out of the statue, and wholly
 * above y = 0 so it rests on the fingertip the poise seat measures. No
 * decorative yaw: an empirical quarter-turn once compensated for whatever
 * spin the wrist solve left, and was wrong the moment the pose changed.
 */
export const itemChakra: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const stone = ctx.materials.fixed.nagamani;
  const gem = ctx.materials.get("gem");
  const group = new THREE.Group();

  // Sized off the reference's own front view, where the discus is about
  // two-thirds of the head's height across. The old 108 mm disc was wider
  // than Vishnu's face.
  const RIM = 0.036;
  const TIP = RIM * 1.3;
  const disc = new THREE.Group();
  // The lowest flame tip rests ON the fingertip — a millimetre and a half
  // of air, so the finger touches the disc rather than entering it.
  disc.position.y = TIP + 0.0015;
  group.add(disc);

  /**
   * The terraces.
   *
   * Each is a disc of its own radius and depth, centred on the plane, so
   * the steps read identically from both faces — a presented wheel is
   * seen from either side as the statue turns.
   */
  for (const [radius, depth] of [
    [RIM, 0.0055],
    [RIM * 0.83, 0.008],
    [RIM * 0.6, 0.0105],
  ] as const) {
    disc.add(
      mesh(new THREE.CylinderGeometry(radius, radius, depth, 52), metal, {
        rotation: [Math.PI / 2, 0, 0],
      }),
    );
  }
  // Mouldings: a fine torus crisping the edge of each terrace, so the
  // steps catch light instead of merging into one slab.
  for (const [radius, at] of [
    [RIM, 0.0028],
    [RIM * 0.83, 0.004],
    [RIM * 0.6, 0.0053],
  ] as const) {
    for (const side of [1, -1] as const) {
      disc.add(
        mesh(new THREE.TorusGeometry(radius, 0.0016, 8, 52), metal, {
          position: [0, 0, side * at],
        }),
      );
    }
  }

  // The jewelled outer band: cabochons set round the widest terrace, on
  // both faces, with beadwork between them.
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    for (const side of [1, -1] as const) {
      disc.add(
        mesh(new THREE.SphereGeometry(RIM * 0.09, 10, 8), gem, {
          position: [
            Math.cos(angle) * RIM * 0.915,
            Math.sin(angle) * RIM * 0.915,
            side * 0.0032,
          ],
          scale: [0.72, 1, 0.5],
          rotation: [0, 0, angle - Math.PI / 2],
        }),
      );
    }
  }
  for (let i = 0; i < 40; i += 1) {
    const angle = (i / 40) * Math.PI * 2;
    for (const side of [1, -1] as const) {
      disc.add(
        mesh(new THREE.SphereGeometry(RIM * 0.028, 6, 5), metal, {
          position: [
            Math.cos(angle) * RIM * 0.915,
            Math.sin(angle) * RIM * 0.915,
            side * 0.0038,
          ],
        }),
      );
    }
  }

  // The wheel: spokes that thicken outward, standing proud of the inner
  // terrace on both faces, meeting a collar at the hub.
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    for (const side of [1, -1] as const) {
      disc.add(
        new THREE.Mesh(
          taperedTube(
            [
              [Math.cos(angle) * RIM * 0.13, Math.sin(angle) * RIM * 0.13, side * 0.0055],
              [Math.cos(angle) * RIM * 0.36, Math.sin(angle) * RIM * 0.36, side * 0.0062],
              [Math.cos(angle) * RIM * 0.55, Math.sin(angle) * RIM * 0.55, side * 0.0058],
            ],
            [RIM * 0.035, RIM * 0.055],
            10,
            6,
          ),
          metal,
        ),
      );
    }
  }
  for (const side of [1, -1] as const) {
    disc.add(
      mesh(new THREE.TorusGeometry(RIM * 0.545, 0.0013, 8, 44), metal, {
        position: [0, 0, side * 0.006],
      }),
    );
  }

  // The hub: a raised boss with a beaded rim and a cabochon at its heart.
  for (const side of [1, -1] as const) {
    disc.add(
      mesh(
        lathe([
          [RIM * 0.26, 0],
          [RIM * 0.25, 0.004],
          [RIM * 0.18, 0.0075],
          [RIM * 0.1, 0.009],
        ]),
        metal,
        { rotation: [side * Math.PI * 0.5, 0, 0], scale: [1, side, 1] },
      ),
    );
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      disc.add(
        mesh(new THREE.SphereGeometry(RIM * 0.028, 6, 5), metal, {
          position: [Math.cos(angle) * RIM * 0.245, Math.sin(angle) * RIM * 0.245, side * 0.0052],
        }),
      );
    }
    disc.add(
      mesh(new THREE.SphereGeometry(RIM * 0.11, 14, 12), stone, {
        position: [0, 0, side * 0.0075],
        scale: [1, 1, 0.55],
      }),
    );
  }

  // The flames.
  //
  // Broad leaves that swell off the rim and draw to a point, all leaning
  // the same way — the turning fire of the reference's panel. Thin cones
  // here are what made the old disc a saw blade.
  const flame = (from: number, to: number, width: number, lean: number) => {
    const base = from;
    const path: [number, number, number][] = [];
    for (let step = 0; step <= 3; step += 1) {
      const t = step / 3;
      const radius = base + (to - base) * t;
      const angle = lean * t * t;
      path.push([Math.cos(angle) * radius, Math.sin(angle) * radius, 0]);
    }
    const leaf = new THREE.Mesh(taperedTube(path, [width, width * 0.06], 12, 8), metal);
    leaf.scale.z = 0.5;
    return leaf;
  };
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2;
    const big = new THREE.Group();
    big.rotation.z = angle;
    big.add(flame(RIM * 0.94, TIP, RIM * 0.115, 0.2));
    disc.add(big);
    // A smaller point between each pair, as the reference's rim has.
    const small = new THREE.Group();
    small.rotation.z = angle + Math.PI / 14;
    small.add(flame(RIM * 0.96, RIM * 1.13, RIM * 0.06, 0.16));
    disc.add(small);
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
 * Kirita mukuta — the crown, rebuilt against the head it is worn on.
 *
 * WHAT WAS WRONG. The first one was a band, a drum and a dome built as
 * circles of `headRadius × a fraction`, centred on the crown socket. Three
 * things follow from that and all three were visible in the Studio: a head
 * is not round, so the band cut the temples; a head is not centred on its
 * own socket, so the band sat through the forehead in front and hung in
 * the air behind, leaving the whole brow bare; and a fraction of a mean
 * radius is not a proportion, so the whole thing came out the size of a
 * cap. It read as a small pointed hat pushed to the back of the skull.
 *
 * WHAT IT IS NOW. The body measures its own skull — half-width and how far
 * the skin reaches front and back, at every height (see skullEnvelope) —
 * and the crown is built on that:
 *
 *   • a BAND seated above the ears and sized by the widest thing it
 *     passes, with a jewelled pendant descending onto the brow at the
 *     centre front, which is how the reference's lower rim meets the face;
 *   • a DRUM leaning outward and upward off it, ribbed down its face and
 *     scalloped at its rim — the broad jewelled fan of the front view;
 *   • a KUMBHA, the bellied pot the side view shows standing on the drum;
 *   • a FINIAL: collar, bud, neck, point.
 *
 * Heights come from the brow and the top of the skull; widths from the
 * skull's own silhouette; the ellipse the whole thing is turned on is the
 * one the head actually has. The only authored numbers are proportions,
 * read off `references/ref_vishnu.png`: the crown stands about two and a
 * half times the height of the brow-to-crown dome, and the drum is about
 * a third wider than the head.
 */
export const ornamentKirita: AttachmentGenerator = (ctx: GeneratorContext) => {
  const metal = ctx.materials.get("metal");
  const stone = ctx.materials.fixed.nagamani;
  const gem = ctx.materials.get("gem");
  const group = new THREE.Group();
  const body = ctx.body;

  // --- the head, in the crown socket's own space --------------------------
  // The socket is the crown's origin; the skull is measured from the head
  // joint. One conversion, here, rather than a guess per tier.
  const section = (y: number) => {
    const measured = body.skullAt(y + body.crownSocketY);
    const front = measured.frontZ - body.crownSocketZ;
    const back = measured.backZ - body.crownSocketZ;
    return {
      halfWidth: measured.halfWidth,
      halfDepth: (front - back) / 2,
      centreZ: (front + back) / 2,
    };
  };
  const BROW = body.browY - body.crownSocketY;
  const SKULL_TOP = body.skullTopY - body.crownSocketY;
  /** The height the whole crown is proportioned in: brow to crown of head. */
  const RISE = Math.max(0.02, SKULL_TOP - BROW);

  // The band sits just ABOVE the ears — that is where a kirita's lower rim
  // runs, with the ear and its kundala left clear below it — and it must
  // CONTAIN everything it passes, which is the recurring lesson of every
  // band ornament in this codebase.
  const BAND_BOTTOM = kiritaBandBottom(body) - body.crownSocketY;
  const BAND_TOP = BROW + RISE * 0.43;
  let seatWidth = 0;
  let seatDepth = 0;
  let seatZ = 0;
  for (let step = 0; step <= 6; step += 1) {
    const at = section(BAND_BOTTOM + ((BAND_TOP - BAND_BOTTOM) * step) / 6);
    if (at.halfWidth > seatWidth) seatWidth = at.halfWidth;
    if (at.halfDepth > seatDepth) {
      seatDepth = at.halfDepth;
      seatZ = at.centreZ;
    }
  }
  /**
   * The crown is a RIGID object: one ellipse, one axis, all the way up.
   *
   * Following the skull's own centre line upward would shear the tiers
   * backward as the cranium leans away, which is a hat melting rather
   * than a crown standing. The band contains the head where it grips;
   * above that the head is simply inside.
   */
  const GAP = 0.0035;
  const R = seatWidth + GAP;
  // How much deeper than wide. Damped: the measured depth includes the
  // brow's own forward reach, and growing THAT with every flare makes a
  // crown that reads well from the front and like a bonnet from the side.
  const aspect = 1 + (seatDepth / seatWidth - 1) * 0.72;
  /** One ring of the crown. Width and depth flare at different rates. */
  const ring = (y: number, radius: number) => ({
    y,
    rx: radius,
    rz: (R + (radius - R) * 0.62) * aspect,
    z: seatZ,
  });
  /** A point on a ring, at a bearing measured from the front. */
  const on = (bearing: number, radius: number): V3 => {
    const shape = ring(0, radius);
    return [Math.sin(bearing) * shape.rx, 0, seatZ + Math.cos(bearing) * shape.rz];
  };

  /**
   * The tiers, as fractions of the brow-to-crown rise.
   *
   * The DRUM's own height is the number that decides whether this reads
   * as a kirita or as a coronet. Two passes at it were half as tall as
   * they were wide and both came back from the Studio looking like a
   * European crown with a knob on; the reference's drum is nearly as tall
   * as it is broad, and the flare is modest — a quarter wider than the
   * head, not half again.
   */
  const DRUM_TOP = SKULL_TOP + RISE * 0.72;
  const KUMBHA_TOP = DRUM_TOP + RISE * 0.72;
  const TIP = KUMBHA_TOP + RISE * 0.62;
  /** The drum's widest, about a quarter wider than the skull. */
  const FLARE = 1.18;

  // --- the band -----------------------------------------------------------
  group.add(
    mesh(
      loft(
        [
          ring(BAND_BOTTOM - 0.003, R * 0.96),
          ring(BAND_BOTTOM, R),
          ring(BAND_BOTTOM + (BAND_TOP - BAND_BOTTOM) * 0.5, R * 1.035),
          ring(BAND_TOP, R * 1.02),
        ],
        44,
        4,
      ),
      metal,
      {},
    ),
  );
  // Bead rows along both edges of the band.
  for (const [at, radius] of [
    [BAND_BOTTOM + 0.0015, R * 1.005],
    [BAND_TOP - 0.002, R * 1.03],
  ] as const) {
    for (let i = 0; i < 34; i += 1) {
      const bearing = (i / 34) * Math.PI * 2;
      const point = on(bearing, radius);
      group.add(
        mesh(new THREE.SphereGeometry(R * 0.035, 8, 6), metal, {
          position: [point[0], at, point[2]],
        }),
      );
    }
  }
  // Cabochons round the band — and none at the front, where the brow
  // ornament goes.
  for (let i = 1; i < 12; i += 1) {
    const bearing = (i / 12) * Math.PI * 2;
    const point = on(bearing, R * 1.035);
    group.add(
      mesh(new THREE.SphereGeometry(R * 0.075, 10, 8), gem, {
        position: [
          point[0],
          BAND_BOTTOM + (BAND_TOP - BAND_BOTTOM) * 0.5,
          point[2],
        ],
        scale: [1, 1.25, 0.42],
        rotation: [0, -bearing, 0],
      }),
    );
  }

  // --- the drum: the broad leaning fan -------------------------------------
  // Concave, not conical. A straight taper reads as a bucket; what makes
  // this shape a kirita is that it LEAVES the head slowly and then opens,
  // so the silhouette swings outward toward the rim.
  const drumAt = (t: number) => R * (1 + (FLARE - 1) * t * t);
  const drumY = (t: number) => BAND_TOP + (DRUM_TOP - BAND_TOP) * t;
  group.add(
    mesh(
      loft(
        [
          ring(BAND_TOP - 0.001, R * 1.015),
          ring(drumY(0.3), drumAt(0.3)),
          ring(drumY(0.62), drumAt(0.62)),
          ring(drumY(0.88), drumAt(0.88)),
          ring(DRUM_TOP, R * FLARE),
        ],
        44,
        5,
      ),
      metal,
      {},
    ),
  );
  // Cabochons across the drum's face, as the reference's own crown detail
  // sets them.
  for (let i = 0; i < 8; i += 1) {
    const bearing = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const point = on(bearing, drumAt(0.5) * 1.01);
    group.add(
      mesh(new THREE.SphereGeometry(R * 0.085, 10, 8), gem, {
        position: [point[0], drumY(0.5), point[2]],
        scale: [1, 1.3, 0.4],
        rotation: [0, -bearing, 0],
      }),
    );
  }
  // Ribs down the drum — the fluting that keeps a broad gold surface from
  // reading as a bell.
  for (let i = 0; i < 20; i += 1) {
    const bearing = (i / 20) * Math.PI * 2;
    const low = on(bearing, R * 1.03);
    const mid = on(bearing, drumAt(0.55) * 1.01);
    const high = on(bearing, R * FLARE * 1.005);
    group.add(
      new THREE.Mesh(
        taperedTube(
          [
            [low[0], BAND_TOP + 0.001, low[2]],
            [mid[0], drumY(0.55), mid[2]],
            [high[0], DRUM_TOP - 0.001, high[2]],
          ],
          [R * 0.055, R * 0.04],
          10,
          6,
        ),
        metal,
      ),
    );
  }
  // A moulding where the drum's rim turns — the line the petals rise from.
  group.add(
    mesh(
      loft(
        [
          ring(DRUM_TOP - RISE * 0.05, R * FLARE),
          ring(DRUM_TOP - RISE * 0.02, R * FLARE * 1.045),
          ring(DRUM_TOP, R * FLARE * 1.02),
        ],
        44,
        3,
      ),
      metal,
      {},
    ),
  );
  /**
   * The crested rim.
   *
   * LEAVES, not spikes. A cone standing on a rim is a paper crown, and
   * the first two attempts at this edge were exactly that — the Studio
   * showed a coronet. What the reference has is a cut edge: broad petals,
   * wide where they leave the drum, drawn to a point, and flattened
   * radially so they read as foliage rather than as horns.
   */
  const petal = (bearing: number, height: number, width: number, lean: number) => {
    const at = on(bearing, R * FLARE * 1.01);
    const leaf = new THREE.Group();
    leaf.position.set(at[0], DRUM_TOP - RISE * 0.03, at[2]);
    leaf.rotation.y = -bearing;
    leaf.rotation.x = -lean;
    // A LATHED silhouette, because the silhouette is the whole point: a
    // tapered tube balloons at its base and caps its tip with a dome, and
    // eleven of those round the rim read as thorns — which is what two
    // passes at this edge came back from the Studio looking like.
    const blade = mesh(
      lathe(
        [
          [width * 0.98, 0],
          [width, height * 0.22],
          [width * 0.78, height * 0.52],
          [width * 0.42, height * 0.78],
          [width * 0.14, height * 0.94],
          [0, height],
        ],
        14,
      ),
      metal,
      {},
    );
    leaf.add(blade);
    leaf.scale.z = 0.28;
    return leaf;
  };
  for (let i = 0; i < 11; i += 1) {
    const bearing = (i / 11) * Math.PI * 2;
    group.add(petal(bearing, RISE * 0.27, R * 0.34, 0.12));
    group.add(petal(bearing + Math.PI / 11, RISE * 0.14, R * 0.2, 0.18));
  }

  // --- the brow ornament ---------------------------------------------------
  // The pointed shield over the brow with its red cabochon, and the
  // pendant that descends from it onto the forehead: the one piece of
  // this crown a devotee looks straight at. Flat AGAINST the crown, not
  // standing off it — a cone on the forehead is a party hat.
  const frontZ = seatZ + ring(0, R).rz;
  const brow = new THREE.Group();
  brow.position.set(0, BAND_BOTTOM, frontZ * 1.01);
  brow.rotation.x = -0.24;
  group.add(brow);
  const shield = new THREE.Mesh(
    taperedTube(
      [
        [0, -RISE * 0.1, 0],
        [0, RISE * 0.16, 0.002],
        [0, RISE * 0.72, 0],
      ],
      [R * 0.4, R * 0.02],
      12,
      9,
    ),
    metal,
  );
  shield.scale.z = 0.36;
  brow.add(shield);
  brow.add(
    mesh(new THREE.SphereGeometry(R * 0.2, 14, 12), metal, {
      position: [0, RISE * 0.17, 0.003],
      scale: [1, 1.25, 0.36],
    }),
  );
  brow.add(
    mesh(new THREE.SphereGeometry(R * 0.13, 14, 12), stone, {
      position: [0, RISE * 0.17, 0.006],
      scale: [1, 1.3, 0.42],
    }),
  );
  // The pendant, hanging below the band onto the brow itself.
  brow.add(
    mesh(new THREE.SphereGeometry(R * 0.11, 12, 10), metal, {
      position: [0, -RISE * 0.13, 0.001],
      scale: [1, 1.2, 0.4],
    }),
  );
  brow.add(
    mesh(new THREE.SphereGeometry(R * 0.065, 12, 10), gem, {
      position: [0, -RISE * 0.13, 0.004],
      scale: [1, 1.2, 0.45],
    }),
  );

  // --- the kumbha ----------------------------------------------------------
  // Above the head the crown is its own object, so it turns on a circle:
  // an ellipse up here would read as a squashed pot from three-quarters.
  //
  // A BELLIED pot with a waist, not a dome. Two attempts at this tier came
  // back as a smooth cap on a cylinder and the whole crown read as a
  // European coronet; what makes the reference's silhouette Vaishnava is
  // that the tower keeps changing its mind — out at the belly, in at the
  // neck, out again at the bud.
  const potR = R * FLARE * 0.72;
  // ON the drum, not inside it. Sunk to the rim the pot was completely
  // hidden behind its own lid and the crown read as drum → cap → finial,
  // with the middle tier missing.
  const potBase = DRUM_TOP + RISE * 0.09;
  const potSpan = KUMBHA_TOP - potBase;
  // The lid: the drum's mouth closed from its rim to the pot's foot, so
  // nothing looks down a well from three-quarters.
  group.add(
    mesh(
      lathe([
        [R * FLARE * 1.02, DRUM_TOP - RISE * 0.02],
        [R * FLARE * 0.94, DRUM_TOP + RISE * 0.02],
        [potR * 0.9, potBase],
        [potR * 0.78, potBase + RISE * 0.02],
      ]),
      metal,
      { position: [0, 0, seatZ] },
    ),
  );
  group.add(
    mesh(
      lathe([
        [potR * 0.76, potBase],
        [potR * 0.95, potBase + potSpan * 0.2],
        [potR, potBase + potSpan * 0.42],
        [potR * 0.88, potBase + potSpan * 0.62],
        [potR * 0.58, potBase + potSpan * 0.82],
        [potR * 0.46, KUMBHA_TOP],
      ]),
      metal,
      { position: [0, 0, seatZ] },
    ),
  );
  // Flutes over the pot's belly — the chased gold of the reference.
  for (let i = 0; i < 16; i += 1) {
    const bearing = (i / 16) * Math.PI * 2;
    const dx = Math.sin(bearing);
    const dz = Math.cos(bearing);
    group.add(
      new THREE.Mesh(
        taperedTube(
          [
            [dx * potR * 0.78, potBase + potSpan * 0.06, seatZ + dz * potR * 0.78],
            [dx * potR * 1.0, potBase + potSpan * 0.42, seatZ + dz * potR * 1.0],
            [dx * potR * 0.6, potBase + potSpan * 0.8, seatZ + dz * potR * 0.6],
          ],
          [R * 0.04, R * 0.028],
          10,
          6,
        ),
        metal,
      ),
    );
  }
  // Bead collars at the pot's foot and its neck.
  for (const [at, radius, count] of [
    [potBase + potSpan * 0.06, potR * 0.8, 20],
    [KUMBHA_TOP, potR * 0.48, 16],
  ] as const) {
    for (let i = 0; i < count; i += 1) {
      const bearing = (i / count) * Math.PI * 2;
      group.add(
        mesh(new THREE.SphereGeometry(R * 0.04, 8, 6), metal, {
          position: [Math.sin(bearing) * radius, at, seatZ + Math.cos(bearing) * radius],
        }),
      );
    }
  }
  // A stone on the belly of the pot, smaller than the brow's.
  group.add(
    mesh(new THREE.SphereGeometry(R * 0.1, 12, 10), stone, {
      position: [0, potBase + potSpan * 0.42, seatZ + potR * 0.96],
      scale: [1, 1.3, 0.45],
    }),
  );

  // --- the finial ----------------------------------------------------------
  // Collar, neck, bud, point — four separated things, because a single
  // smooth taper is a knob and this is the top of a tower.
  const span = TIP - KUMBHA_TOP;
  group.add(
    mesh(
      lathe([
        [potR * 0.46, KUMBHA_TOP - 0.001],
        [potR * 0.66, KUMBHA_TOP + span * 0.07],
        [potR * 0.62, KUMBHA_TOP + span * 0.14],
        [potR * 0.3, KUMBHA_TOP + span * 0.24],
        [potR * 0.26, KUMBHA_TOP + span * 0.36],
        [potR * 0.48, KUMBHA_TOP + span * 0.5],
        [potR * 0.44, KUMBHA_TOP + span * 0.6],
        [potR * 0.18, KUMBHA_TOP + span * 0.7],
        [potR * 0.22, KUMBHA_TOP + span * 0.8],
        [potR * 0.09, KUMBHA_TOP + span * 0.9],
        [0, TIP],
      ]),
      metal,
      { position: [0, 0, seatZ] },
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
 * Where the kirita's lower rim runs, on any head.
 *
 * Said once, because two things need it: the crown, which seats its band
 * there, and the hair, which has to come out from UNDER it. When each of
 * them worked it out separately the hair was a guess at where a crown it
 * knows nothing about might be — and it guessed wrong, which is why it
 * showed through the gold.
 */
export function kiritaBandBottom(body: BodyProfile): number {
  const rise = Math.max(0.02, body.skullTopY - body.browY);
  return body.browY + rise * 0.02;
}

/**
 * Vishnu's hair: long, dark, falling behind the shoulders.
 *
 * WHAT WAS WRONG. Rows of spheres over the skull and a fan of tapered
 * tubes below it. Spheres read as bubbles — a row of them is a row of
 * bubbles, not a head of hair — and a tapered tube is a rope: perfectly
 * round, perfectly straight, perfectly rigid. The Studio showed exactly
 * that: black bobbles under the crown and stiff strips hanging off them,
 * with the topmost bobbles standing proud of the kirita's band.
 *
 * WHAT IT IS NOW.
 *
 *   • A SHELL over the back of the skull — one continuous surface swept
 *     on the body's own measured skull, open at the face, thin where the
 *     crown presses on it and thickening as it falls clear. A surface
 *     has a silhouette; a heap of spheres has a lumpy outline.
 *   • LOCKS that wave. Each is a group of strands sharing one path, the
 *     path itself curving out over the shoulder and back in, and the
 *     whole lock flattened across so its section is a lock's rather than
 *     a rope's.
 *
 * Nothing here is random: the same statue every time.
 */
export const featureHairFlowing: PartGenerator = (ctx) => {
  const hair = ctx.materials.get("hair");
  const group = new THREE.Group();
  const body = ctx.body;
  const skull = body.headRadius;

  /** The skull at a height, as the hair has to lie on it. */
  const at = (y: number) => {
    const measured = body.skullAt(y);
    return {
      halfWidth: measured.halfWidth,
      centreZ: (measured.frontZ + measured.backZ) / 2,
      halfDepth: (measured.frontZ - measured.backZ) / 2,
    };
  };

  // Under the crown at the top, and clear of it below. The band's own
  // rim is the seam; hair above it is hair inside the gold.
  const TOP = kiritaBandBottom(body) - skull * 0.03;
  const NAPE = body.headCenterY - skull * 1.5;
  /**
   * How far the hair stands off the skull at a height.
   *
   * Thin under the crown, where a band is pressing on it; full below,
   * where it is only hair; and drawn back in at the very bottom so the
   * shell's own rim tucks under the locks instead of ending on a
   * straight cut across the back.
   */
  const thickness = (t: number) =>
    skull * (0.02 + 0.42 * Math.sin(Math.min(1, t * 1.18) * Math.PI * 0.62));
  /**
   * Which bearings the hair covers. Zero is the FRONT, and the face is
   * left open — a sweep's own zero is the geometry's convention, and two
   * earlier attempts at phiStart arithmetic draped hair over the brow
   * like a helmet brim.
   */
  const FROM = Math.PI * 0.5;
  const TO = Math.PI * 1.5;

  // --- the shell ----------------------------------------------------------
  const ROWS = 14;
  const COLUMNS = 26;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= ROWS; row += 1) {
    const t = row / ROWS;
    const y = TOP + (NAPE - TOP) * t;
    const ring = at(y);
    const stand = thickness(t);
    for (let column = 0; column <= COLUMNS; column += 1) {
      const bearing = FROM + ((TO - FROM) * column) / COLUMNS;
      // A shallow wave round the head, so the surface has locks in it
      // rather than being a swim cap.
      const wave = Math.cos(bearing * 5) * skull * 0.035 * t;
      const out = stand + wave;
      positions.push(
        Math.sin(bearing) * (ring.halfWidth + out),
        y,
        ring.centreZ + Math.cos(bearing) * (ring.halfDepth + out),
      );
    }
  }
  const stride = COLUMNS + 1;
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const a = row * stride + column;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  shell.setIndex(indices);
  shell.computeVertexNormals();
  // Seen from inside as well: the customer turns the statue, and the
  // parting at the back of an open shell shows its own underside.
  group.add(new THREE.Mesh(shell, hair));

  // --- the fall -----------------------------------------------------------
  /**
   * One lock: a few strands on a shared path, waved down the back and
   * flattened across.
   */
  const lock = (bearing: number, phase: number, drop: number, width: number) => {
    const ring = at(NAPE);
    const ox = Math.sin(bearing) * (ring.halfWidth + thickness(1));
    const oz = ring.centreZ + Math.cos(bearing) * (ring.halfDepth + thickness(1));
    const away = Math.sign(ox) || 1;
    const strands = new THREE.Group();
    for (const side of [-1, 0, 1] as const) {
      const path: V3[] = [];
      const STEPS = 7;
      for (let step = 0; step <= STEPS; step += 1) {
        const t = step / STEPS;
        // An S: out over the shoulder, back in below it, and a wave
        // across the whole fall. A lock that only goes down is a rope.
        const flare = Math.sin(t * Math.PI * 0.9) * skull * 0.5 * away;
        const sway = Math.sin(t * Math.PI * 1.9 + phase) * skull * 0.3;
        path.push([
          ox + flare + sway + side * width * 0.8,
          NAPE - drop * t + Math.sin(t * Math.PI * 2.2 + phase) * skull * 0.05,
          oz - skull * 0.55 * t * t + Math.cos(t * Math.PI * 1.5 + phase) * skull * 0.16 * t,
        ]);
      }
      strands.add(
        new THREE.Mesh(taperedTube(path, [width, width * 0.35], 14, 9), hair),
      );
    }
    return strands;
  };

  const LOCKS = 9;
  for (let i = 0; i < LOCKS; i += 1) {
    const t = i / (LOCKS - 1);
    const bearing = FROM + 0.1 + (TO - FROM - 0.2) * t;
    group.add(
      lock(
        bearing,
        i * 1.7,
        skull * (3.2 + 1.0 * Math.sin(i * 1.3)),
        skull * (0.26 + 0.07 * Math.cos(i * 2.1)),
      ),
    );
  }
  // Two shorter locks forward of the ears, as the reference's face
  // close-up has them.
  for (const side of [1, -1] as const) {
    group.add(lock(side * Math.PI * 0.46, side * 0.7, skull * 1.6, skull * 0.16));
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
