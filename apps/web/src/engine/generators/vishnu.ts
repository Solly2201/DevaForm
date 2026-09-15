/**
 * Vishnu's iconography: the four attributes, the crown and the garland.
 *
 * Every one of these is a shape, and nothing here knows anything about
 * hands, poses, sockets or bodies. What each object IS gets built here;
 * how it is held, where it sits and what happens when a pose cannot hold
 * it are the manifest's and the resolver's business, exactly as they are
 * for Shiva's trishul. That separation is the thing being tested by
 * adding a deity at all — see packages/asset-system/src/manifests/vishnu.
 *
 * Reference: references/ref_vishnu.png.
 */
import * as THREE from "three";
import { lathe, mesh, taperedTube } from "../geometry";
import type { AttachmentGenerator, GeneratorContext } from "./types";
import { walkSurface, type SurfaceWaypoint } from "./surfaceWalk";

/** Matches the manifest's declared shaft radius — see GADA_SHAFT_RADIUS. */
const GADA_SHAFT_RADIUS = 0.009;
/** How far the butt of the mace is below the grip point. */
const GADA_BUTT_BELOW_GRIP = 0.46;
/** Where the head begins, clear of everywhere a fist can slide to. */
const GADA_HEAD_BASE = 0.06 + 0.07;

/**
 * Kaumodaki — the mace.
 *
 * A staff with a weight on the end of it, which is the same object the
 * trishul is as far as the hand is concerned: butt on the ground, grip on
 * the shaft, head well above every position the fist can reach.
 */
export const itemGada: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const stone = ctx.materials.fixed.nagamani;
  const group = new THREE.Group();
  const butt = -GADA_BUTT_BELOW_GRIP;

  group.add(
    new THREE.Mesh(
      taperedTube(
        [
          [0, butt + 0.01, 0],
          [0, (butt + GADA_HEAD_BASE) / 2, 0],
          [0, GADA_HEAD_BASE, 0],
        ],
        [GADA_SHAFT_RADIUS * 1.05, GADA_SHAFT_RADIUS * 0.92],
        18,
        10,
      ),
      metal,
    ),
  );
  // The foot it stands on.
  group.add(
    mesh(lathe([[0.016, butt], [0.019, butt + 0.012], [0.011, butt + 0.026]]), metal, {}),
  );
  // Collars up the shaft, the way a ceremonial mace is banded.
  for (const at of [0.2, 0.45, 0.72]) {
    group.add(
      mesh(new THREE.TorusGeometry(GADA_SHAFT_RADIUS * 1.5, 0.004, 8, 20), metal, {
        position: [0, butt + (GADA_HEAD_BASE - butt) * at, 0],
        rotation: [Math.PI / 2, 0, 0],
      }),
    );
  }

  // The head: a fluted bulb under a finial, its own size whatever the
  // shaft does.
  const head = new THREE.Group();
  head.position.y = GADA_HEAD_BASE;
  group.add(head);
  head.add(
    mesh(
      lathe([
        [0.012, 0],
        [0.034, 0.018],
        [0.042, 0.048],
        [0.036, 0.078],
        [0.018, 0.094],
        [0.006, 0.1],
      ]),
      metal,
      {},
    ),
  );
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    head.add(
      mesh(new THREE.SphereGeometry(0.006, 10, 8), stone, {
        position: [Math.cos(angle) * 0.038, 0.05, Math.sin(angle) * 0.038],
        scale: [1, 1, 0.5],
      }),
    );
  }
  head.add(
    mesh(lathe([[0.008, 0.1], [0.011, 0.112], [0.004, 0.128], [0, 0.134]]), metal, {}),
  );
  return group;
};

/**
 * Sudarshana Chakra — the discus.
 *
 * Poised above the hand rather than gripped: the manifest declares a hold
 * on a finger's radius, and the disc is built ABOVE the grip point, so
 * nothing the hand does can put a finger through the blade. A disc that
 * reads at statue distance has no handle, and pretending otherwise is how
 * a hand ends up inside one.
 */
export const itemChakra: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const stone = ctx.materials.fixed.nagamani;
  const group = new THREE.Group();
  const disc = new THREE.Group();
  // Clear of the fingertips, standing on edge.
  disc.position.y = 0.055;
  disc.rotation.x = Math.PI / 2;
  group.add(disc);

  const RADIUS = 0.052;
  disc.add(
    mesh(new THREE.TorusGeometry(RADIUS * 0.82, 0.007, 10, 40), metal, {}),
  );
  disc.add(
    mesh(new THREE.CylinderGeometry(RADIUS * 0.78, RADIUS * 0.78, 0.004, 36), metal, {
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  // The flame points round the rim: the shape that makes a chakra a
  // chakra rather than a wheel.
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2;
    disc.add(
      mesh(new THREE.ConeGeometry(0.008, 0.018, 6), metal, {
        position: [Math.cos(angle) * (RADIUS * 0.9), Math.sin(angle) * (RADIUS * 0.9), 0],
        rotation: [0, 0, angle - Math.PI / 2],
      }),
    );
  }
  // Spokes and a jewelled hub.
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    disc.add(
      mesh(new THREE.BoxGeometry(RADIUS * 0.72, 0.006, 0.006), metal, {
        position: [Math.cos(angle) * RADIUS * 0.36, Math.sin(angle) * RADIUS * 0.36, 0],
        rotation: [0, 0, angle],
      }),
    );
  }
  disc.add(mesh(new THREE.SphereGeometry(0.011, 14, 12), metal, { scale: [1, 1, 0.6] }));
  disc.add(
    mesh(new THREE.SphereGeometry(0.006, 12, 10), stone, {
      position: [0, 0, 0.007],
      scale: [1, 1, 0.5],
    }),
  );
  return group;
};

/**
 * Panchajanya — the conch.
 *
 * Cradled, not gripped: a fist-sized body with the fingers round its
 * widest part, which is what the manifest's `hold` means. Built as a
 * tapering spiral so it reads as a shell from every side rather than as a
 * cone with a point.
 */
export const itemShankha: AttachmentGenerator = (ctx) => {
  const shell = ctx.materials.fixed.ivory;
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();

  // The body: a spiral drawn round the axis the hand closes on, widest at
  // the palm and tapering to the spire.
  const path: [number, number, number][] = [];
  const TURNS = 2.6;
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40;
    const angle = t * TURNS * Math.PI * 2;
    // Fat in the middle, drawn to a point at the top.
    const sweep = Math.sin(Math.min(1, t * 1.25) * Math.PI) * 0.012 * (1 - t * 0.5);
    path.push([Math.cos(angle) * sweep, -0.05 + t * 0.125, Math.sin(angle) * sweep]);
  }
  const body = new THREE.Mesh(
    taperedTube(path, [0.03, 0.004], 26, 12),
    shell,
  );
  group.add(body);
  // The lip of the opening, flared at the bottom.
  group.add(
    mesh(
      lathe([
        [0.018, -0.062],
        [0.03, -0.05],
        [0.031, -0.036],
        [0.024, -0.026],
      ]),
      shell,
      {},
    ),
  );
  // A gold band where a conch is bound for blowing.
  group.add(
    mesh(new THREE.TorusGeometry(0.026, 0.004, 8, 22), metal, {
      position: [0, -0.03, 0],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  return group;
};

/**
 * Padma — the lotus.
 *
 * Held by the stem, which is four millimetres thick: the thinnest thing
 * any hand in this repository takes, and therefore the clearest test of a
 * pinch. The flower is built above the fist for the same reason the
 * chakra is built above it.
 */
export const itemPadma: AttachmentGenerator = (ctx) => {
  const petal = ctx.materials.get("garmentAccent");
  const heart = ctx.materials.fixed.ivory;
  const stem = ctx.materials.fixed.serpent;
  const group = new THREE.Group();

  group.add(
    new THREE.Mesh(
      taperedTube(
        [
          [0, -0.05, 0],
          [0.004, 0.01, 0.002],
          [0, 0.07, 0],
        ],
        [0.004, 0.0035],
        12,
        8,
      ),
      stem,
    ),
  );

  const flower = new THREE.Group();
  flower.position.y = 0.072;
  group.add(flower);
  // Three rings of petals, each more open than the one inside it.
  for (const [count, tilt, length, lift] of [
    [8, 1.05, 0.036, 0],
    [7, 0.72, 0.03, 0.006],
    [5, 0.38, 0.022, 0.012],
  ] as const) {
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + (count % 2) * 0.3;
      const leaf = mesh(new THREE.SphereGeometry(length, 12, 8), petal, {
        position: [
          Math.cos(angle) * length * 0.62,
          lift + Math.cos(tilt) * length * 0.5,
          Math.sin(angle) * length * 0.62,
        ],
        scale: [0.42, 0.9, 0.22],
      });
      leaf.rotation.y = -angle;
      leaf.rotation.z = tilt;
      flower.add(leaf);
    }
  }
  flower.add(
    mesh(new THREE.CylinderGeometry(0.009, 0.007, 0.008, 14), heart, {
      position: [0, 0.014, 0],
    }),
  );
  return group;
};

/**
 * Kirita mukuta — the royal crown.
 *
 * Tall, layered and symmetrical, and seated on the cranium the body
 * measures for itself rather than on a remembered skull: the same
 * `headRadius` every other head ornament asks for.
 */
export const ornamentKirita: AttachmentGenerator = (ctx: GeneratorContext) => {
  const metal = ctx.materials.get("metal");
  const stone = ctx.materials.fixed.nagamani;
  const group = new THREE.Group();
  const skull = ctx.body.headRadius;

  // The band that sits on the head, and the tiers above it.
  group.add(
    mesh(
      lathe([
        [skull * 1.02, -0.004],
        [skull * 1.06, skull * 0.12],
        [skull * 1.0, skull * 0.3],
        [skull * 0.86, skull * 0.52],
        [skull * 0.7, skull * 0.78],
        [skull * 0.46, skull * 1.02],
        [skull * 0.26, skull * 1.22],
        [skull * 0.1, skull * 1.34],
        [0, skull * 1.4],
      ]),
      metal,
      {},
    ),
  );
  // Ribs up the cone, which is what keeps a tall crown from reading as a
  // funnel.
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    group.add(
      new THREE.Mesh(
        taperedTube(
          [
            [Math.cos(angle) * skull * 1.04, skull * 0.14, Math.sin(angle) * skull * 1.04],
            [Math.cos(angle) * skull * 0.72, skull * 0.72, Math.sin(angle) * skull * 0.72],
            [Math.cos(angle) * skull * 0.22, skull * 1.24, Math.sin(angle) * skull * 0.22],
          ],
          [skull * 0.055, skull * 0.02],
          10,
          6,
        ),
        metal,
      ),
    );
  }
  // Stones round the band, and one at the brow.
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    group.add(
      mesh(new THREE.SphereGeometry(skull * 0.07, 10, 8), stone, {
        position: [
          Math.cos(angle) * skull * 1.07,
          skull * 0.16,
          Math.sin(angle) * skull * 1.07,
        ],
        scale: [1, 1, 0.45],
        rotation: [0, -angle, 0],
      }),
    );
  }
  group.add(
    mesh(new THREE.SphereGeometry(skull * 0.12, 12, 10), stone, {
      position: [0, skull * 0.34, skull * 0.95],
      scale: [0.8, 1.2, 0.5],
    }),
  );
  return group;
};

/**
 * Vaijayanti — the long forest garland.
 *
 * A ROUTE over the body's own surface, exactly as the rudraksha mala is:
 * flowers threaded along a path that is written in bearings and heights
 * and evaluated onto whatever chest is wearing it.
 */
export const ornamentVaijayanti: AttachmentGenerator = (ctx: GeneratorContext) => {
  const flower = ctx.materials.get("garmentAccent");
  const leaf = ctx.materials.fixed.ivory;
  const group = new THREE.Group();
  const body = ctx.body;
  const neckBase = body.necklaceSocketY + body.neckBaseOffsetY;

  // Down the chest, round the waist and back up: a garland that falls
  // past the knees is looped, not hung.
  const route: SurfaceWaypoint[] = [
    { bearing: -0.35, y: neckBase - 0.01 },
    { bearing: -0.9, y: neckBase - 0.09 },
    { bearing: -1.5, y: neckBase - 0.17 },
    { bearing: -3.14, y: neckBase - 0.21 },
    { bearing: -4.7, y: neckBase - 0.17 },
    { bearing: -5.4, y: neckBase - 0.09 },
    { bearing: -5.93, y: neckBase - 0.01 },
  ];
  const walk = walkSurface(body, route, () => 0.012, 96);
  const toSocket = (point: THREE.Vector3): [number, number, number] => [
    point.x,
    point.y - body.necklaceSocketY,
    point.z - body.necklaceSocketZ,
  ];
  const points = walk.points.map(toSocket);
  for (let i = 0; i < points.length; i += 3) {
    const at = points[i]!;
    const alternate = (i / 3) % 3 === 0;
    group.add(
      mesh(new THREE.SphereGeometry(alternate ? 0.011 : 0.008, 10, 8), alternate ? flower : leaf, {
        position: at,
        scale: alternate ? [1, 0.85, 1] : [0.8, 1.1, 0.8],
      }),
    );
  }
  return group;
};
