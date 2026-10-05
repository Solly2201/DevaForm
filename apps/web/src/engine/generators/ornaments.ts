/**
 * Ornament generators: crowns (attachments) and jewellery sets (parts that
 * distribute rings/bands across limb joints so they follow every pose).
 */
import * as THREE from "three";
import { ARM_SLOTS, activeArmSlots, getSocket, type JointId } from "@devaform/character-schema";
import { lathe, mesh, radialRing, taperedTube, type V3 } from "../geometry";
import { headFit } from "./bodyProfile";
import { surfaceRibbon, walkSurface, type SurfaceWaypoint } from "./surfaceWalk";
import { type AttachmentGenerator, type GeneratorContext, type PartGenerator } from "./types";

function gemStud(ctx: GeneratorContext, r: number): THREE.Mesh {
  return mesh(new THREE.SphereGeometry(r, 12, 10), ctx.materials.get("gem"));
}

// ---------------------------------------------------------------------------
// CROWNS
// ---------------------------------------------------------------------------

export const crownKirita: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();

  // Base band with bead ring
  group.add(
    mesh(
      lathe([
        [0.088, 0],
        [0.094, 0.012],
        [0.09, 0.03],
        [0.082, 0.042],
      ]),
      metal,
    ),
  );
  const beads = radialRing(14, 0.091, () => mesh(new THREE.SphereGeometry(0.007, 10, 8), metal), false);
  beads.position.y = 0.018;
  group.add(beads);

  // Tapering tiered cone
  group.add(
    mesh(
      lathe([
        [0.08, 0.042],
        [0.072, 0.075],
        [0.078, 0.08],
        [0.058, 0.115],
        [0.064, 0.12],
        [0.042, 0.155],
        [0.047, 0.159],
        [0.026, 0.19],
        [0.012, 0.208],
      ]),
      metal,
    ),
  );
  // Finial
  group.add(mesh(new THREE.SphereGeometry(0.014, 14, 12), metal, { position: [0, 0.216, 0] }));
  group.add(
    mesh(new THREE.ConeGeometry(0.007, 0.024, 10), metal, { position: [0, 0.238, 0] }),
  );
  // Front medallion + gems
  group.add(
    mesh(new THREE.SphereGeometry(0.02, 16, 12), metal, {
      position: [0, 0.05, 0.085],
      scale: [1, 1.25, 0.4],
    }),
  );
  const medGem = gemStud(ctx, 0.0105);
  medGem.position.set(0, 0.052, 0.096);
  medGem.scale.z = 0.5;
  group.add(medGem);
  const bandGems = radialRing(8, 0.088, () => {
    const gem = gemStud(ctx, 0.0065);
    gem.scale.z = 0.55;
    return gem;
  });
  bandGems.position.y = 0.024;
  group.add(bandGems);

  return group;
};

export const crownKaranda: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  group.add(
    mesh(
      lathe([
        [0.085, 0],
        [0.09, 0.01],
        [0.086, 0.028],
        [0.062, 0.05],
        [0.072, 0.056],
        [0.052, 0.082],
        [0.06, 0.087],
        [0.04, 0.112],
        [0.047, 0.116],
        [0.028, 0.14],
        [0.033, 0.143],
        [0.014, 0.162],
        [0.006, 0.17],
      ]),
      metal,
    ),
  );
  group.add(mesh(new THREE.SphereGeometry(0.011, 12, 10), metal, { position: [0, 0.176, 0] }));
  const gems = radialRing(6, 0.082, () => {
    const gem = gemStud(ctx, 0.006);
    gem.scale.z = 0.55;
    return gem;
  });
  gems.position.y = 0.016;
  group.add(gems);
  return group;
};

/** Band crown with a radiating fan plate behind (prabhaval-style). */
export const crownFan: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  group.add(
    mesh(
      lathe([
        [0.088, 0],
        [0.093, 0.012],
        [0.088, 0.034],
        [0.08, 0.045],
      ]),
      metal,
    ),
  );
  // Fan plate
  const fan = mesh(new THREE.CircleGeometry(0.115, 32, Math.PI * 0.15, Math.PI * 0.7), metal, {
    position: [0, 0.045, -0.02],
  });
  fan.material = metal;
  const fanBack = mesh(new THREE.CircleGeometry(0.115, 32, Math.PI * 0.15, Math.PI * 0.7), metal, {
    position: [0, 0.045, -0.022],
    rotation: [0, Math.PI, 0],
  });
  group.add(fan, fanBack);
  // Fan ribs
  for (let i = 0; i < 7; i++) {
    const angle = Math.PI * 0.2 + (i / 6) * Math.PI * 0.6;
    group.add(
      mesh(new THREE.CapsuleGeometry(0.0035, 0.1, 4, 8), metal, {
        position: [Math.cos(angle) * 0.062, 0.045 + Math.sin(angle) * 0.062, -0.018],
        rotation: [0, 0, angle - Math.PI / 2],
      }),
    );
  }
  const crest = gemStud(ctx, 0.009);
  crest.position.set(0, 0.05, 0.085);
  crest.scale.z = 0.5;
  group.add(crest);
  return group;
};

// ---------------------------------------------------------------------------
// NECKLACES / WAIST (attachments)
// ---------------------------------------------------------------------------

/**
 * Necklaces attach at the chest.necklace socket (chest joint + [0, 0.12,
 * 0.01]); the drape is fitted to the measured chest surface so beads lie
 * ON the torso rather than inside it, whatever the body variant.
 */
// Where that socket actually is comes from the body being worn — the
// stylised rig's numbers are its own, not every body's.

/** Torso surface z in necklace-socket-local coordinates, with clearance. */
export function chestZAtSocket(
  ctx: GeneratorContext,
  x: number,
  y: number,
  clearance: number,
): number {
  return (
    ctx.body.torsoSurfaceZAt(x, y + ctx.body.necklaceSocketY) -
    ctx.body.necklaceSocketZ +
    clearance
  );
}

/**
 * Haram — the collar, walked round the body that wears it.
 *
 * WHAT WAS WRONG. Half of this was measured and half was typed. The back
 * of the band wrapped a flattened circle of the measured neck radius;
 * the front dropped to a hardcoded `-0.052`, spread to a hardcoded
 * `±0.09`, and hung a pendant at a hardcoded `-0.098`. Those numbers are
 * true of exactly one torso — the one somebody had on screen when they
 * wrote them — and the registry puts this collar on three. Measured, it
 * sat a hundred and twelve millimetres inside Ganesha and forty-one
 * inside Vishnu: not a scale problem and not a clearance problem, but a
 * curve that was never expressed in the body's own coordinates at all.
 *
 * WHAT IT IS NOW. A ROUTE, exactly as the rudraksha mala and the serpent
 * already are: a bearing round the body and a height, walked onto
 * whatever surface the body reports, standing off it by the band's own
 * half-thickness. Everything that was a metre is now a fraction of a
 * measurement the body publishes, so the collar fits a thin ascetic and a
 * broad elephant-headed god by asking each of them where their skin is.
 *
 * It cannot end up inside one, because it is never expressed in a space
 * where inside is representable — which is the whole argument of
 * surfaceWalk, and this ornament was the one that was not taking it.
 */
export const necklaceHaram: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  const body = ctx.body;

  // Every dimension below is a fraction of the neck this collar is for.
  const neck = body.neckRadius;
  const neckBase = body.necklaceSocketY + body.neckBaseOffsetY;
  const toSocket = (point: THREE.Vector3): V3 => [
    point.x,
    point.y - body.necklaceSocketY,
    point.z - body.necklaceSocketZ,
  ];
  /**
   * WHERE THE NECK STOPS BEING A NECK, measured on this body.
   *
   * A collar wants the neck, and `surfaceAt` will happily describe the
   * shoulders if asked at the wrong height. Measured round the back arc,
   * every body here has the same shape to its answer: a plateau a little
   * wider than the neck, and below some height a sharp blow-out as the
   * torso arrives. Where that height IS differs enormously — twenty
   * millimetres under the socket for the human bodies, fifty for Ganesha,
   * whose neck is short and whose chest is half as wide again — so it is
   * found rather than guessed, by walking down until the answer stops
   * being neck-shaped.
   */
  const roundBack = (y: number) => {
    let most = 0;
    for (let i = 0; i < 32; i += 1) {
      const bearing = (i / 32) * Math.PI * 2;
      // The front arc is where the collar dips onto the chest on
      // purpose; it is the rest of the way round that has to be a neck.
      if (Math.cos(bearing) > 0.5) continue;
      const skin = body.surfaceAt(bearing, y);
      most = Math.max(most, Math.hypot(skin.x, skin.z - body.necklaceSocketZ));
    }
    return most;
  };
  const seat = (() => {
    // UPWARDS from under the socket to the first height that is still a
    // neck — not downwards from above it. Downwards, a body whose head is
    // wider than its neck (which is every elephant) fails the test on the
    // very first step and the collar is seated in the skull.
    const ceiling = neckBase + neck * 1.0;
    for (let y = neckBase - neck * 0.2; y < ceiling; y += neck * 0.04) {
      if (roundBack(y) <= neck * 1.35) return y;
    }
    return ceiling;
  })();
  /** How far the front of the collar falls below the nape. */
  const dip = neck * 1.15;
  /**
   * The band's own half-thickness.
   *
   * A fifth of the neck's radius made a gold rope eighteen millimetres
   * thick, and with the clearance under it the collar came out a hundred
   * and sixty-three millimetres across a neck that is ninety-six — half
   * of that was the ornament's own gauge. The reference sheet's kantha is
   * a flat plate, not a cable.
   */
  const band = neck * 0.13;

  /**
   * A closed route round the body, dipping toward the front.
   *
   * THE DIP IS WINDOWED, and sits where a collar sits.
   *
   * Spread round the whole circumference, as `front ** 1.6` spread it, the
   * route fell far enough at the SIDES to leave the neck and ride out
   * onto the trapezius — and the body widens fast there, from fifty-five
   * millimetres of half-width at the neck's base to a hundred and three
   * thirty millimetres below it. Measured, the result was a ring two
   * hundred and thirty-four millimetres across on a neck ninety-one
   * across: a flat gold yoke standing off the shoulders, which is what
   * the Studio showed and what the reference sheet's layered kantha is
   * not. It cleared the skin perfectly the whole way round. Fit is not
   * only clearance.
   *
   * So the fall is confined to the front arc, and the rest of the route
   * rides a quarter of a neck-radius higher, at the base of the neck
   * rather than on the shoulder.
   */
  const ring = (drop: number): SurfaceWaypoint[] => {
    const route: SurfaceWaypoint[] = [];
    const steps = 20;
    for (let i = 0; i <= steps; i += 1) {
      const bearing = (i / steps) * Math.PI * 2;
      // 1 dead ahead, 0 at the nape, and nothing outside the front arc.
      const ahead = Math.max(0, Math.cos(bearing));
      const window = Math.max(0, (ahead - 0.5) / 0.5);
      route.push({ bearing, y: seat - window ** 1.3 * drop });
    }
    return route;
  };

  /**
   * The turn onto the chest, as an allowance in millimetres.
   *
   * This used to be folded into a 1.7x multiple of the band, which tied
   * an allowance for the ROUTE's curvature to the ornament's gauge —
   * two unrelated things, so thinning the collar quietly thinned the
   * clearance it needed to turn. It is the corner the tube's inner wall
   * cuts, and the corner is the same size whatever is going round it.
   */
  const curve = neck * 0.08;
  // The spine stands off by MORE than the band's half-thickness, because
  // a tube is not its spine: where the route turns down onto the chest
  // the inner wall of the tube cuts the corner the spine takes, and a
  // clearance equal to the radius leaves that wall inside the skin. The
  // extra is the curvature's, not a fudge — measured at twelve
  // millimetres of penetration before it was added.
  /**
   * AND IT RINGS THE NECK.
   *
   * `walkSurface` walks the measured TORSO, and at the height a collar
   * sits the measured torso is already the trapezius: at some bearings
   * two thirds of the way round, the skin is seventy-seven millimetres
   * from the neck's axis rather than the neck's own forty-five. Walked
   * faithfully, the band went out along the top of each shoulder and
   * stopped — a pair of gold bars standing off the deltoids, which is
   * what the Studio showed from three-quarters however good the front
   * looked. It cleared the skin the whole way; it was not a collar.
   *
   * So outside the front arc the spine is pulled back onto the neck's own
   * cylinder, and across the front it is the walked chest surface, which
   * is where the dip has to follow real geometry. The bearing comes from
   * the point itself — in socket space the neck's axis is the origin — so
   * this does not depend on how `walkSurface` chose to space its samples.
   */
  /**
   * The cylinder the collar rings: the neck's own radius, or how wide
   * this body actually is round the back at the seat, whichever is more.
   * Shaved by a few per cent, because jewellery beds into flesh and the
   * fit validator says so in millimetres.
   */
  const onNeck = neck + band + curve * 0.5;
  /**
   * TIGHTER AT THE NAPE, where hair lies over it.
   *
   * A collar is not worn in isolation. Behind the neck this one shares
   * its space with a head of hair, and the reference's back view shows no
   * necklace there at all — the hair covers it. Held off the skin by its
   * full gauge the whole way round, it came through the hair instead: a
   * gold bar crossing the dark mass, which is the first thing Vishnu's
   * back view shows.
   *
   * So the stand-off is a function of where round the body it is. At the
   * front it is what it was, because that is where the collar is seen and
   * where it has to turn onto the chest. Round the nape it hugs, and what
   * shows there is hair.
   */
  const standOff = (t: number): number => {
    const nape = Math.max(0, -Math.cos(t * Math.PI * 2));
    return (band * 1.2 + curve) * (1 - 0.88 * nape ** 0.6);
  };
  const spine = walkSurface(body, ring(dip), standOff, 120).points.map(
    (point): V3 => {
      const seat = toSocket(point);
      const [x, y, z] = seat;
      const radius = Math.hypot(x, z);
      /**
       * Round the back, a RING — not the walk.
       *
       * `walkSurface` offsets its route horizontally, away from the
       * slice's centre, and over a shoulder the skin's own normal points
       * mostly upward. So on that ledge a horizontal offset does not lift
       * the band off the shoulder, it slides it sideways ALONG it, and
       * the further the route is pushed the further out it travels. That
       * is the pair of gold bars over the deltoids, and no amount of
       * tuning the clearance removes it, because the clearance is what
       * causes it.
       *
       * This does what can be done from here: the band is held OUT to at
       * least the neck's own girth, so it rings a neck rather than
       * tracing a collarbone, and it is never pulled in — an earlier
       * attempt interpolated towards the neck's radius and put the band
       * seven millimetres into a human trapezius and thirty into
       * Ganesha's chest. Replacing that radius wholesale with a single
       * ring is worse still: a neck is fifteen millimetres deep at the
       * nape and nearly sixty at the trapezius, and one number for both
       * is a hula hoop, which is what the side view showed.
       *
       * The rest belongs in `walkSurface`, which is where the horizontal
       * offset is. Left as it is, deliberately, rather than worked around
       * here a sixth time.
       */
      /**
       * And the ring it is held out to is tighter at the NAPE.
       *
       * This clamp is what stops the collar tracing a collarbone, and it
       * is also what made reducing the stand-off behind the neck do
       * nothing at all: whatever the walk asked for, every point was
       * pushed back out to the same ring. Behind the neck the ring is the
       * neck, because that is where hair lies over it.
       */
      const nape = Math.max(0, -Math.cos(Math.atan2(x, z)));
      const ring = onNeck - (onNeck - (neck + band * 0.15)) * nape ** 0.7;
      const scale = radius > 1e-6 ? Math.max(1, ring / radius) : 1;
      return [x * scale, y, z * scale];
    },
  );
  group.add(new THREE.Mesh(taperedTube(spine, [band, band], 52, 12), metal));

  // The fringe: beads on a second route under the first, and only where
  // the collar is on the chest rather than round the neck.
  const beadSize = neck * 0.16;
  const fringe = walkSurface(body, ring(dip + neck * 0.5), beadSize * 1.25, 120);
  for (let i = 0; i < fringe.points.length; i += 1) {
    const bearing = (i / (fringe.points.length - 1)) * Math.PI * 2;
    if (Math.cos(bearing) < 0.35) continue;
    if (i % 4 !== 0) continue;
    const at = toSocket(fringe.points[i] as THREE.Vector3);
    group.add(
      mesh(new THREE.SphereGeometry(beadSize, 10, 8), metal, { position: at }),
    );
  }

  // And the pendant, hanging at the front below the fringe.
  const pendantSize = neck * 0.34;
  const hang = walkSurface(
    body,
    [
      { bearing: -0.3, y: neckBase - dip - neck * 1.1 },
      { bearing: 0, y: neckBase - dip - neck * 1.15 },
      { bearing: 0.3, y: neckBase - dip - neck * 1.1 },
    ],
    pendantSize * 0.55,
    9,
  );
  const pendant = gemStud(ctx, pendantSize * 0.5);
  const hangAt = toSocket(hang.points[Math.floor(hang.points.length / 2)] as THREE.Vector3);
  pendant.position.set(hangAt[0], hangAt[1], hangAt[2]);
  pendant.scale.set(0.85, 1.2, 0.75);
  group.add(pendant);
  return group;
};

export const necklaceMala: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const gem = ctx.materials.get("gem");
  const group = new THREE.Group();
  const neckR = ctx.body.neckRadius + 0.006;
  const collarY = ctx.body.neckBaseOffsetY;
  // Two strands: the back half hugs the neck base, the front half drapes
  // down and is lifted onto the measured chest surface.
  for (const [drop, spread, size] of [
    [0.05, 0.008, 0.0085],
    [0.085, 0.018, 0.0095],
  ] as const) {
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const frontness = Math.max(0, Math.sin(angle));
      const x = Math.cos(angle) * (neckR + frontness * spread);
      const y = collarY + 0.008 - frontness * (drop + collarY);
      const zNeck = Math.sin(angle) * neckR * 0.7;
      const z =
        frontness > 0.05
          ? Math.max(zNeck, chestZAtSocket(ctx, x, y, 0.007))
          : zNeck;
      group.add(
        mesh(new THREE.SphereGeometry(size, 10, 8), i % 5 === 0 ? gem : metal, {
          position: [x, y, z],
        }),
      );
    }
  }
  return group;
};

export const tikkaChandra: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  // Crescent above the tilak area
  group.add(
    mesh(new THREE.TorusGeometry(0.024, 0.0045, 10, 24, Math.PI), metal, {
      position: [0, 0.052, 0.022],
      rotation: [0.35, 0, 0],
    }),
  );
  // Hanging chain of small beads down the brow
  for (let i = 0; i < 3; i++) {
    group.add(
      mesh(new THREE.SphereGeometry(0.0038, 8, 6), metal, {
        position: [0, 0.042 - i * 0.011, 0.028 + i * 0.003],
      }),
    );
  }
  const drop = gemStud(ctx, 0.0075);
  drop.position.set(0, 0.006, 0.038);
  drop.scale.z = 0.6;
  group.add(drop);
  return group;
};

/**
 * Kamarbandh — a belt that follows the waist it is worn on.
 *
 * WHAT WAS WRONG. A torus, scaled on one axis: a circle of the hips'
 * half-width, stretched until its FRONT reached the belly. A torso is not
 * an ellipse centred on its own axis — a belly protrudes forward and the
 * spine does not protrude back — so stretching symmetrically to clear the
 * front pushed the back of the ring out behind the body by exactly as
 * much as the belly stuck out in front. Measured on Ganesha: fifteen
 * millimetres of belt inside him at the sides, forty standing off at the
 * back. The reference asks for one thing of this ornament — "kamarbandh
 * follows waist surface, proper fit, no floating" — and a scaled circle
 * cannot do it on any body with a front.
 *
 * WHAT IT IS NOW. A ribbon walked round the measured waist, like every
 * other wrapped thing here. The belt is worn OVER the dressed waist, so
 * the clearance it asks for is the cloth's: a slim body in a full dhoti
 * still wears its belt outside the skirt, never inside it.
 */
export const waistKamarband: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  const body = ctx.body;

  /**
   * This socket's own place in the chest's frame, read from the skeleton
   * this body actually brought rather than from the stylised table.
   *
   * That is what this sentence has always said, and `getSocket` IS the
   * stylised table — so the belt was built from the one body the table
   * describes and worn by every other. The table seats the waist forty
   * millimetres above the pelvis joint and a hundred and twenty forward;
   * the measured human seats it ninety above and fifty-five forward.
   * Measured, the belt came out SEVENTY-NINE MILLIMETRES inside both
   * human torsos while sitting correctly on Ganesha, who is the body the
   * table is for.
   */
  const socket = ctx.socketOffset("waist.ornament");
  const spine = ctx.jointOffset("spine");
  const chest = ctx.jointOffset("chest");
  const toChest = {
    y: socket[1] - spine[1] - chest[1],
    z: socket[2] - spine[2] - chest[2],
  };
  const toSocket = (point: THREE.Vector3): V3 => [
    point.x,
    point.y - toChest.y,
    point.z - toChest.z,
  ];

  // Worn over the cloth: whatever the skirt wraps to, the belt clears it.
  const overCloth = Math.max(0, body.dhotiRadius - body.pelvisHalfWidth) + 0.006;
  const beltY = toChest.y + 0.015;
  const halfWidth = body.neckRadius * 0.42;
  const thickness = body.neckRadius * 0.22;

  const ring: SurfaceWaypoint[] = [];
  for (let i = 0; i <= 24; i += 1) {
    const bearing = (i / 24) * Math.PI * 2;
    ring.push({ bearing, y: beltY });
  }
  const belt = surfaceRibbon(body, ring, {
    halfWidth,
    thickness,
    clearance: overCloth,
    samples: 120,
  });
  // Into the socket's own frame, where the rig will place it.
  const position = belt.getAttribute("position");
  for (let i = 0; i < position.count; i += 1) {
    position.setY(i, position.getY(i) - toChest.y);
    position.setZ(i, position.getZ(i) - toChest.z);
  }
  belt.computeVertexNormals();
  group.add(new THREE.Mesh(belt, metal));

  // Tassels hanging at the front, seated on the same surface the belt is.
  const hang = walkSurface(
    body,
    [
      { bearing: -0.34, y: beltY - 0.012 },
      { bearing: 0, y: beltY - 0.014 },
      { bearing: 0.34, y: beltY - 0.012 },
    ],
    overCloth + thickness,
    5,
  );
  for (const index of [0, 2, 4]) {
    const seat = toSocket(hang.points[index] as THREE.Vector3);
    group.add(
      mesh(new THREE.CapsuleGeometry(0.005, 0.03, 4, 8), metal, { position: seat }),
    );
    const drop = gemStud(ctx, 0.007);
    drop.position.set(seat[0], seat[1] - 0.028, seat[2]);
    group.add(drop);
  }
  return group;
};

// ---------------------------------------------------------------------------
// JEWELLERY SETS (parts — follow their joints)
// ---------------------------------------------------------------------------

/** Air between a band and the skin it is worn on, metres. */
const BAND_CLEARANCE = 0.0015;

/**
 * A band worn round a limb of a measured radius.
 *
 * SIZED FROM THE INSIDE. A torus's major radius is the centre line of
 * its own tube, so a ring built AT the limb's radius has half its
 * thickness inside the limb — five and a half millimetres of gold buried
 * in a wrist, on every band ornament in this product, on every deity.
 * The measurement says where the skin is; the ring is placed so its
 * inner surface clears it.
 *
 * This is the fourth time the same sentence has had to be written down
 * about this codebase: an ornament that goes round something is sized by
 * what CONTAINS it. A radius that contains the limb still has to contain
 * the ornament's own body.
 */
function bandRing(ctx: GeneratorContext, limbRadius: number, width: number, withGem = false): THREE.Group {
  const g = new THREE.Group();
  const inner = limbRadius + BAND_CLEARANCE;
  // A vanki is a BAND: wide across the limb and thin off it. Built as a
  // torus it was a doughnut — as thick as it was wide — so on a
  // thirty-four millimetre arm it stood a centimetre proud all round and
  // read as a hoop hung on the shoulder rather than an armlet worn on it.
  const thickness = Math.max(0.0022, width * 0.42);
  const half = width;
  g.add(
    mesh(
      lathe([
        [inner, -half],
        [inner + thickness, -half * 0.72],
        [inner + thickness, half * 0.72],
        [inner, half],
      ], 30),
      ctx.materials.get("metal"),
      {},
    ),
  );
  if (withGem) {
    const gem = gemStud(ctx, thickness * 1.9);
    gem.position.set(0, 0, inner + thickness * 0.6);
    g.add(gem);
  }
  return g;
}

/**
 * Where a band sits on a limb, and which way that limb actually runs.
 *
 * A limb is not a plumb line: a forearm leaves its joint at four degrees
 * off vertical and a thigh at more. A ring laid flat at a measured
 * HEIGHT therefore sits beside the bone rather than round it, and tilts
 * across the limb instead of square to it — which is a millimetre and a
 * half of error on a wrist, all of it spent on the side the clearance
 * was meant for.
 *
 * The body measures the height; the skeleton knows the direction; this
 * puts the two together. Nothing is authored.
 */
function bandFrame(
  ctx: GeneratorContext,
  child: JointId,
  offsetY: number,
): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  // THIS body's skeleton, not the stylised table: the four-armed mesh's
  // second pair is its first pair moved, and its joints do not agree
  // with the stylised rig's mirrored back arms. Asking the global table
  // put every rear band two centimetres off the arm's own line and nine
  // degrees out of square — which is a bangle through a wrist.
  const axis = new THREE.Vector3(...ctx.jointOffset(child)).normalize();
  const along = Math.abs(axis.y) > 1e-6 ? offsetY / axis.y : offsetY;
  return {
    position: axis.clone().multiplyScalar(along),
    // The ring's own up is the limb's own direction.
    quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis),
  };
}

/** Seat a band on the limb its joint leads to. */
function seatBand(
  ctx: GeneratorContext,
  band: THREE.Group,
  child: JointId,
  offsetY: number,
): THREE.Group {
  const frame = bandFrame(ctx, child, offsetY);
  band.position.copy(frame.position);
  band.quaternion.copy(frame.quaternion);
  return band;
}

/**
 * Kundala earrings — mounted ON the ear sockets, which the ear-owning
 * part (Ganesha's ears, Shiva's head) refines onto its actual earlobes.
 * The rings therefore originate at the ear of whichever head wears them;
 * no per-deity placement exists here.
 */
export const earringsKundala: PartGenerator = (ctx) => {
  // Hoops are drawn against the reference skull; a smaller head wears
  // smaller kundala rather than the same rings sticking out sideways.
  const fit = headFit(ctx.body);
  const earring = (side: 1 | -1): THREE.Object3D => {
    const g = new THREE.Group();
    g.scale.setScalar(fit);
    g.add(
      mesh(new THREE.TorusGeometry(0.018, 0.005, 10, 22), ctx.materials.get("metal"), {
        position: [0, -0.014, 0.002],
        rotation: [0, side * 0.45, 0],
      }),
    );
    const drop = gemStud(ctx, 0.007);
    drop.position.set(0, -0.037, 0.002);
    g.add(drop);
    return g;
  };
  return [
    { socket: "head.leftEar", object: earring(1) },
    { socket: "head.rightEar", object: earring(-1) },
  ];
};

export const armletsVanki: PartGenerator = (ctx) => {
  const parts: Array<{ joint: JointId; object: THREE.Object3D }> = [];
  for (const slot of ARM_SLOTS) {
    if (!activeArmSlots(ctx.arms).includes(slot)) continue;
    // Seat and girth come from the body being worn, not from this
    // generator: the same vanki fits a heavy build and a lean human.
    const band = bandRing(ctx, ctx.body.armBandRadius, 0.0065, true);
    seatBand(ctx, band, `arm.${slot}.forearm`, ctx.body.armBandOffsetY);
    parts.push({ joint: `arm.${slot}.upper`, object: band });
  }
  return parts;
};

export const braceletsKada: PartGenerator = (ctx) => {
  const parts: Array<{ joint: JointId; object: THREE.Object3D }> = [];
  for (const slot of ARM_SLOTS) {
    if (!activeArmSlots(ctx.arms).includes(slot)) continue;
    // A bangle sits on the distal FOREARM: it must not rotate with the
    // wrist, or strong hand poses (dance gestures) drive it through the
    // palm. The forearm→hand joint offset is 0.14, so the band rests just
    // above the wrist line.
    const band = bandRing(ctx, ctx.body.wristBandRadius, 0.0055);
    seatBand(ctx, band, `arm.${slot}.hand`, ctx.body.wristBandOffsetY);
    parts.push({ joint: `arm.${slot}.forearm`, object: band });
  }
  return parts;
};

export const ankletsPayal: PartGenerator = (ctx) => {
  const parts: Array<{ joint: JointId; object: THREE.Object3D }> = [];
  for (const slot of ["left", "right"] as const) {
    const band = bandRing(ctx, ctx.body.ankleBandRadius, 0.006);
    band.position.y = ctx.body.ankleBandOffsetY;
    // The foot's own joint has no child to aim at; an anklet sits square
    // on the ankle, which the foot joint already is.
    // Tiny bells, hung off the band's own outside rather than the
    // limb's — they belong to the anklet, not to the leg.
    const hang = ctx.body.ankleBandRadius + BAND_CLEARANCE + 0.006;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      band.add(
        mesh(new THREE.SphereGeometry(0.0045, 8, 6), ctx.materials.get("metal"), {
          position: [Math.cos(angle) * hang, -0.008, Math.sin(angle) * hang],
        }),
      );
    }
    parts.push({ joint: `leg.${slot}.foot`, object: band });
  }
  return parts;
};
