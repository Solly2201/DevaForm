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
 * IT SPINS FLAT. The discus is balanced on the raised fingertip and
 * turning, so its axis is vertical and its face is horizontal — see
 * references/vishnu.jpg, where the wheel reads as an ellipse above the
 * hand because that is what a spinning disc seen from below looks like.
 * It stood on its rim before, like a cartwheel, which is a wheel being
 * shown rather than a discus being held.
 *
 * The geometry does not know any of that. It is built in its own XY
 * plane with its face normal along +Z, and the PRESENTATION says which of
 * its axes runs up the grip channel — `axis: [0, 0, 1]`, the normal —
 * which is the same mechanism a trishul uses to say the opposite about
 * its shaft. Nothing here is rotated for the camera, and nothing is
 * rotated for a pose.
 *
 * What the generator owns is where its own origin is: the disc is lifted
 * half its own thickness along that axis, so the point that lands on the
 * fingertip is the centre of its underside — the point a spinning plate
 * actually touches a finger at. The thickness is the generator's to know;
 * the manifest states only the relationship.
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
  /** The deepest terrace — what the disc is thickest at its centre. */
  const CORE_DEPTH = 0.0105;
  const disc = new THREE.Group();
  // Lifted half its own thickness along its NORMAL, so the centre of its
  // underside is the asset's origin and therefore the point that lands on
  // the fingertip. A millimetre and a half of air, so the finger touches
  // the disc rather than entering it.
  disc.position.z = CORE_DEPTH / 2 + 0.0015;
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
   * A KIRITA NARROWS. That is the whole silhouette, and getting it
   * backwards is what made this crown read as a gold basket: the tower
   * widened as it rose, a quarter wider at the rim than at the band, and
   * a vessel that opens upward with a lid on it is a basket however it is
   * chased. The reference is unambiguous in every one of its four views —
   * the mukuta leaves the brow at its widest and draws in all the way to
   * the bud, and the only thing that reaches outward is the crest at the
   * bottom.
   *
   * So the tower TAPERS, and it is tall: a kirita's height is what
   * distinguishes a god's crown from a king's coronet, and this one
   * stands a little over a head above the brow.
   */
  const DRUM_TOP = SKULL_TOP + RISE * 1.25;
  const KUMBHA_TOP = DRUM_TOP + RISE * 0.52;
  const TIP = KUMBHA_TOP + RISE * 0.58;
  /** What the tower keeps of its width by the time it reaches the top. */
  const TAPER = 0.5;

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

  // --- the tower ------------------------------------------------------------
  // It leaves the band at very nearly the band's own width, holds that
  // for the first stretch, and then draws in — so the silhouette is a
  // shoulder rather than a straight cone. A cone from the brow to the bud
  // is a witch's hat; what the reference has is a tower with a waist.
  const drumAt = (t: number) => R * (1 - (1 - TAPER) * Math.pow(t, 1.45));
  const drumY = (t: number) => BAND_TOP + (DRUM_TOP - BAND_TOP) * t;
  group.add(
    mesh(
      loft(
        [
          ring(BAND_TOP - 0.001, R * 1.015),
          ring(drumY(0.3), drumAt(0.3)),
          ring(drumY(0.62), drumAt(0.62)),
          ring(drumY(0.88), drumAt(0.88)),
          ring(DRUM_TOP, drumAt(1)),
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
    const point = on(bearing, drumAt(0.42) * 1.01);
    group.add(
      mesh(new THREE.SphereGeometry(R * 0.085, 10, 8), gem, {
        position: [point[0], drumY(0.42), point[2]],
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
    const high = on(bearing, drumAt(1) * 1.005);
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
          ring(DRUM_TOP - RISE * 0.05, drumAt(1)),
          ring(DRUM_TOP - RISE * 0.02, drumAt(1) * 1.09),
          ring(DRUM_TOP, drumAt(1) * 1.04),
        ],
        44,
        3,
      ),
      metal,
      {},
    ),
  );
  /**
   * The crest, at the BAND.
   *
   * This used to ring the tower's top rim, and a ring of points around
   * the highest thing on a crown is a coronet whatever the points are
   * shaped like — it was the second half of why this read as a basket
   * with a lid. On a kirita the cut foliage rises from the BROW, fanning
   * out beside the head while the tower draws in above it, and the two
   * opposed movements are the whole gesture of the silhouette.
   *
   * LEAVES, not spikes: broad where they leave the band, drawn to a
   * point, and flattened radially so they read as foliage rather than as
   * horns. Leaning well out, because a crest that hugs the tower is
   * moulding rather than a crest.
   */
  const petal = (bearing: number, height: number, width: number, lean: number) => {
    const at = on(bearing, R * 1.03);
    const leaf = new THREE.Group();
    leaf.position.set(at[0], BAND_TOP - RISE * 0.02, at[2]);
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
  // Tallest at the front, where a devotee looks, and shortening round the
  // back: a crest of one height all the way round is a collar.
  for (let i = 0; i < 11; i += 1) {
    const bearing = (i / 11) * Math.PI * 2;
    // 1 at the front, 0 at the back.
    const forward = (Math.cos(bearing) + 1) / 2;
    const scale = 0.62 + forward * 0.55;
    group.add(petal(bearing, RISE * 0.86 * scale, R * 0.32, 0.72));
    group.add(petal(bearing + Math.PI / 11, RISE * 0.46 * scale, R * 0.2, 0.86));
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
        [0, -RISE * 0.02, 0],
        [0, RISE * 0.2, 0.002],
        [0, RISE * 0.74, 0],
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
  // No pendant below the band. There was one, descending onto the brow,
  // and it hung squarely over the tilaka — see `kiritaBandBottom`. A
  // crown ornament that covers the deity's own mark is an ornament in the
  // wrong place, however well it is made.

  // --- the kumbha ----------------------------------------------------------
  // Above the head the crown is its own object, so it turns on a circle:
  // an ellipse up here would read as a squashed pot from three-quarters.
  //
  // A BELLIED pot with a waist, not a dome. Two attempts at this tier came
  // back as a smooth cap on a cylinder and the whole crown read as a
  // European coronet; what makes the reference's silhouette Vaishnava is
  // that the tower keeps changing its mind — out at the belly, in at the
  // neck, out again at the bud.
  const potR = drumAt(1) * 1.16;
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
        [drumAt(1) * 1.04, DRUM_TOP - RISE * 0.02],
        [drumAt(1) * 0.98, DRUM_TOP + RISE * 0.02],
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
  /**
   * Nearly the whole forehead, which is what the reference shows and what
   * the crown's rim now leaves room for.
   *
   * It was built at two thirds of this and sat in the lower third of the
   * brow, because the crown's band came down over everything above it —
   * so the mark was drawn small enough to survive in the strip that was
   * left. With the rim at the hairline the strip is the forehead, and the
   * pundra rises the length of it.
   */
  const HEIGHT = skull * 0.92;

  for (const side of [1, -1] as const) {
    const path: V3[] = [];
    const STEPS = 10;
    for (let i = 0; i <= STEPS; i += 1) {
      const t = i / STEPS;
      const y = (t - 0.12) * HEIGHT;
      // A narrow U: together at the bottom, apart above.
      const spread = skull * (0.05 + 0.2 * Math.pow(t, 0.7));
      path.push([side * spread, y, RELIEF + curve(y)]);
    }
    const stroke = new THREE.Mesh(taperedTube(path, [0.0032, 0.0024], 12, 8), ivory);
    stroke.scale.z = 0.5;
    group.add(stroke);
  }
  // The srichurna: the red centre line, shorter, between them.
  const centre: V3[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const y = (t - 0.08) * HEIGHT * 0.78;
    centre.push([0, y, RELIEF + 0.0005 + curve(y)]);
  }
  const line = new THREE.Mesh(taperedTube(centre, [0.0028, 0.0018], 12, 8), red);
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
 *
 * ABOVE THE FOREHEAD, not on the brow. It sat on the brow, and the whole
 * forehead was gold: the urdhva pundra was built, placed on the measured
 * forehead and correct in every way except that nobody could see it,
 * because a band and a pendant were lying over it. The mark is the single
 * strongest thing on this face that says which deity it belongs to, and
 * the reference shows it in full with the crown's rim clear above it. So
 * the rim runs at the hairline and the forehead belongs to the tilaka.
 */
export function kiritaBandBottom(body: BodyProfile): number {
  const rise = Math.max(0.02, body.skullTopY - body.browY);
  return body.browY + rise * 0.46;
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

  /**
   * THE SCALP, not a curtain.
   *
   * This surface used to start at the crown's rim and sweep DOWNWARD over
   * the back half of the head, on the reasoning that anything above the
   * rim is hair inside the gold. True while the crown is on — and the
   * crown comes off: the Hair and Head panels let a customer take it
   * away, and what was left was a man bald from the hairline up with two
   * dark curtains hanging beside his ears.
   *
   * Hair covers the head. It runs from the APEX of the skull down, all
   * the way round, and where it stops at the bottom depends on which way
   * it is facing: at the back it reaches the nape, at the front it stops
   * at the hairline — which is the crown's own rim, so the two still meet
   * on one seam and nothing of the forehead is lost.
   */
  const APEX = body.skullTopY + skull * 0.02;
  const HAIRLINE = kiritaBandBottom(body);
  const NAPE = body.headCenterY - skull * 1.5;
  /** Where the hair's lower edge runs, at a bearing measured from the front. */
  const hemAt = (bearing: number) => {
    // 0 at the front, 1 at the back.
    const back = (1 - Math.cos(bearing)) / 2;
    // A hairline is not a straight cut across the brow: it comes down a
    // little at the centre and climbs at the temples. Small, but it is
    // the difference between a hairline and a headband.
    const peak = Math.max(0, Math.cos(bearing)) * skull * 0.035 * (1 - 2 * Math.abs(
      Math.sin(bearing),
    ) ** 1.5);
    return HAIRLINE - peak + (NAPE - HAIRLINE) * back;
  };
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
  // --- the shell ----------------------------------------------------------
  // All the way round. Zero is the FRONT, and the face is still left
  // open — not by cutting the sweep short, but because the hem reaches
  // the hairline there and goes no lower.
  const ROWS = 16;
  const COLUMNS = 40;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= ROWS; row += 1) {
    const t = row / ROWS;
    for (let column = 0; column <= COLUMNS; column += 1) {
      const bearing = (column / COLUMNS) * Math.PI * 2;
      const y = APEX + (hemAt(bearing) - APEX) * t;
      const ring = at(y);
      // A shallow wave round the head, so the surface has locks in it
      // rather than being a swim cap.
      const wave = Math.cos(bearing * 5) * skull * 0.035 * t;
      const out = thickness(t) + wave;
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
    // Off the hem, wherever the hem is at this bearing — so a lock beside
    // the ear starts at the ear and one at the back starts at the nape.
    const hem = hemAt(bearing);
    const ring = at(hem);
    const ox = Math.sin(bearing) * (ring.halfWidth + thickness(1));
    const oz = ring.centreZ + Math.cos(bearing) * (ring.halfDepth + thickness(1));
    const away = Math.sign(ox) || 1;
    const strands = new THREE.Group();
    for (const side of [-1, 0, 1] as const) {
      const path: V3[] = [];
      const STEPS = 9;
      // EACH STRAND ON ITS OWN WAVE. They used to share one, offset only
      // sideways, and three tubes moving in lockstep are one wide tube:
      // the fall read as a flat black plank hanging beside the face
      // rather than as hair. A lock's strands go roughly together and not
      // exactly together, and that difference is the whole of what makes
      // it look like hair.
      const own = phase + side * 0.9;
      for (let step = 0; step <= STEPS; step += 1) {
        const t = step / STEPS;
        // An S: out over the shoulder, back in below it, and a wave
        // across the whole fall. A lock that only goes down is a rope.
        const flare = Math.sin(t * Math.PI * 0.9) * skull * 0.5 * away;
        const sway = Math.sin(t * Math.PI * 1.9 + own) * skull * 0.46;
        path.push([
          ox + flare + sway + side * width * 0.7,
          hem - drop * t + Math.sin(t * Math.PI * 2.2 + own) * skull * 0.08,
          oz - skull * 0.55 * t * t + Math.cos(t * Math.PI * 1.5 + own) * skull * 0.22 * t,
        ]);
      }
      strands.add(
        new THREE.Mesh(taperedTube(path, [width, width * 0.3], 14, 9), hair),
      );
    }
    return strands;
  };

  // More of them, and each thinner: nine wide locks cover the same back
  // as fourteen narrow ones and read as a cape instead of as hair.
  const LOCKS = 14;
  for (let i = 0; i < LOCKS; i += 1) {
    const t = i / (LOCKS - 1);
    // Round the back half: the front of the hem is the hairline, and hair
    // does not fall from a hairline onto a face.
    const bearing = Math.PI * 0.5 + 0.08 + (Math.PI - 0.16) * t;
    group.add(
      lock(
        bearing,
        i * 1.31,
        skull * (3.1 + 1.1 * Math.sin(i * 0.9)),
        skull * (0.15 + 0.05 * Math.cos(i * 2.1)),
      ),
    );
  }
  // Two shorter locks forward of the ears, as the reference's face
  // close-up has them.
  for (const side of [1, -1] as const) {
    group.add(lock(side * Math.PI * 0.46, side * 0.7, skull * 1.6, skull * 0.1));
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
