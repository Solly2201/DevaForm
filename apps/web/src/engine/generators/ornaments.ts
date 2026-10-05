/**
 * Ornament generators: crowns (attachments) and jewellery sets (parts that
 * distribute rings/bands across limb joints so they follow every pose).
 */
import * as THREE from "three";
import { ARM_SLOTS, activeArmSlots, type JointId } from "@devaform/character-schema";
import { closedBand, lathe, mesh, radialRing, taperedTube, type V3 } from "../geometry";
import { headFit } from "./bodyProfile";
import { surfaceRibbon, walkSurface, type SurfaceWaypoint } from "./surfaceWalk";
import { type AttachmentGenerator, type GeneratorContext, type PartGenerator } from "./types";

function gemStud(ctx: GeneratorContext, r: number): THREE.Mesh {
  return mesh(new THREE.SphereGeometry(r, 12, 10), ctx.materials.get("gem"));
}

// ---------------------------------------------------------------------------
// CROWNS
// ---------------------------------------------------------------------------

/**
 * Drop a crown until its band meets the head.
 *
 * Every crown in this file is drawn against a reference skull and scaled
 * by `headFit`, which gets the SIZE right and says nothing about where
 * the head is wide enough to hold it. A band of fixed radius round a
 * cranium that is narrower at that height simply never touches: measured,
 * all five of Ganesha's crowns stood six to eleven millimetres clear of
 * his head, and a crown resting on nothing is the first thing an eye
 * picks out.
 *
 * So the band is seated where the head is actually that wide. The socket
 * is the crown's origin and `headEnvelopeAt` answers in the head's frame,
 * hence the one conversion through `crownSocketY`. Searching downward,
 * because a crown settles onto a head rather than rising off it, and
 * stopping at the socket itself — below that is a brow, and a crown that
 * keeps sliding until it finds something is a crown over the eyes.
 */
function seatOnHead(ctx: GeneratorContext, group: THREE.Group, bandRadius: number): void {
  const body = ctx.body;
  /**
   * A CROWN IS SIZED BY THE HEAD WHERE IT SITS, not by the head's widest
   * point.
   *
   * `headFit` divides the head's own radius by the reference skull's, and
   * that radius comes from the WIDEST section of the whole head part. On
   * Ganesha's sculpted head the widest section is the jaw and cheeks at a
   * hundred and forty-eight millimetres, while the dome where a band
   * actually rides is a hundred and twenty-three. Scaled by the first,
   * every one of his crowns came out ten millimetres too big for the
   * place it sits, and no amount of lowering it could make it touch —
   * which is exactly what the measurement said: six to eleven millimetres
   * clear, on all five.
   *
   * So the band is scaled to the cranium at the crown socket. The tower
   * above it comes down with it, which is right: a smaller head wears a
   * smaller crown, not the same crown perched higher.
   */
  const atSocket = body.headEnvelopeAt(body.crownSocketY).halfWidth;
  if (atSocket > 0) {
    const previous = group.scale.x || 1;
    // A hair's clearance so the band grips rather than shares a surface.
    const wanted = (atSocket + 0.0015) / bandRadius;
    // Bounded against the old answer, so a degenerate measurement cannot
    // produce a crown the size of a ring or of the room.
    const scale = Math.min(Math.max(wanted, previous * 0.6), previous * 1.4);
    group.scale.setScalar(scale);
  }
  const scale = group.scale.x || 1;
  const want = bandRadius * scale;
  const STEP = 0.002;
  for (let drop = 0; drop <= 0.05; drop += STEP) {
    const headLocal = -drop + body.crownSocketY;
    if (body.headEnvelopeAt(headLocal).halfWidth >= want) {
      group.position.y -= drop;
      return;
    }
  }
  // Nothing on this head is ever that wide — leave it where the socket
  // put it rather than sliding it down the face looking for contact.
}

export const crownKirita: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  /**
   * SIZED TO THE HEAD IT IS WORN ON.
   *
   * Every dimension below is drawn against the reference skull, which is
   * what `headFit` exists to convert — the kundala have scaled with it
   * since they were written. A crown did not, and on a stylised head
   * whose own part draws a cranium nearly twice the reference the band
   * sat entirely inside the skull: only the cone above it was visible.
   */
  group.scale.setScalar(headFit(ctx.body));

  // Base band with bead ring
  group.add(
    mesh(
      closedBand(
        [
          [0.088, 0],
          [0.094, 0.012],
          [0.09, 0.03],
          [0.082, 0.042],
        ],
        0.076,
      ),
      metal,
    ),
  );
  const beads = radialRing(14, 0.091, () => mesh(new THREE.SphereGeometry(0.007, 10, 8), metal), false);
  beads.position.y = 0.018;
  group.add(beads);

  // Tapering tiered cone
  group.add(
    mesh(
      closedBand(
        [
          [0.08, 0.042],
          [0.072, 0.075],
          [0.078, 0.08],
          [0.058, 0.115],
          [0.064, 0.12],
          [0.042, 0.155],
          [0.047, 0.159],
          [0.026, 0.19],
          [0.012, 0.208],
        ],
        0.0075,
      ),
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


  seatOnHead(ctx, group, 0.088);
  return group;
};

/**
 * The circlet: a crown with no tower at all.
 *
 * The reference sheet asks for a SIMPLE one beside the tall ones, and the
 * thing that makes it simple is not a shortened kirita — a tower with its
 * top cut off reads as a crown somebody broke. What it is instead is a
 * complete object at a different scale: a jewelled band with its own
 * crest, finished at the brow.
 *
 * It is the one crown here that leaves the whole head visible, which is
 * the reason to have it: a customer who wants the hair, the tilaka and
 * the face to carry the figure has nothing else to choose.
 */
export const crownCirclet: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  // Sized to the head it is worn on — see crownKirita.
  group.scale.setScalar(headFit(ctx.body));

  // The band: slightly convex, so a highlight runs round it rather than
  // sitting flat as it does on a cylinder.
  group.add(
    mesh(
      closedBand(
        [
          [0.086, 0],
          [0.093, 0.009],
          [0.095, 0.021],
          [0.091, 0.033],
          [0.085, 0.039],
        ],
        0.079,
      ),
      metal,
    ),
  );
  // Bead rims top and bottom. Two rows is what keeps a plain band from
  // reading as a washer.
  for (const [at, radius, size] of [
    [0.004, 0.0905, 0.0042],
    [0.0355, 0.0885, 0.0038],
  ] as const) {
    const beads = radialRing(26, radius, () =>
      mesh(new THREE.SphereGeometry(size, 8, 6), metal),
    );
    beads.position.y = at;
    group.add(beads);
  }
  // Cabochons round the band, with none at the front where the crest is.
  for (let i = 1; i < 10; i += 1) {
    const bearing = (i / 10) * Math.PI * 2;
    const gem = gemStud(ctx, 0.0068);
    gem.scale.set(1, 1.3, 0.5);
    gem.position.set(Math.sin(bearing) * 0.0935, 0.02, Math.cos(bearing) * 0.0935);
    gem.rotation.y = bearing;
    group.add(gem);
  }

  /**
   * A TREFOIL AT THE BROW, which is what finishes it.
   *
   * Without a crest the band is jewellery rather than a crown. Three
   * leaves, the centre one taller, is the smallest arrangement that still
   * reads as a crest from across a room — and it keeps the silhouette low
   * enough that this stays the simple option.
   */
  const leaf = (bearing: number, height: number, width: number) => {
    const blade = mesh(
      lathe(
        [
          [width, 0],
          [width * 0.92, height * 0.36],
          [width * 0.6, height * 0.68],
          [width * 0.22, height * 0.9],
          [0, height],
        ],
        12,
      ),
      metal,
    );
    const holder = new THREE.Group();
    holder.position.set(Math.sin(bearing) * 0.088, 0.032, Math.cos(bearing) * 0.088);
    holder.rotation.y = -bearing;
    holder.rotation.x = -0.2;
    holder.scale.z = 0.3;
    holder.add(blade);
    return holder;
  };
  group.add(leaf(0, 0.044, 0.019));
  group.add(leaf(-0.42, 0.028, 0.014));
  group.add(leaf(0.42, 0.028, 0.014));
  const centre = gemStud(ctx, 0.0085);
  centre.position.set(0, 0.044, 0.093);
  centre.scale.z = 0.5;
  group.add(centre);


  seatOnHead(ctx, group, 0.086);
  return group;
};

/**
 * The temple crown: a vimana worn on the head.
 *
 * The reference sheet's fifth headwear is "Temple Style", and the thing
 * that distinguishes a south-Indian temple tower from the crowns beside
 * it is that it STEPS. A kirita tapers smoothly and a karanda stacks
 * domes; a vimana is storeys, each one set back from the one below with a
 * cornice overhanging it, so the silhouette is a staircase and the
 * shadows under the cornices are what you read it by.
 *
 * Making it a fourth smooth taper with different numbers would have been
 * padding the count. The step is the whole design.
 */
export const crownGopuram: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  // Sized to the head it is worn on — see crownKirita.
  group.scale.setScalar(headFit(ctx.body));

  // The base band, which is also the tower's plinth.
  group.add(
    mesh(
      closedBand(
        [
          [0.087, 0],
          [0.094, 0.01],
          [0.094, 0.026],
          [0.088, 0.036],
        ],
        0.08,
      ),
      metal,
    ),
  );
  const rim = radialRing(24, 0.0905, () =>
    mesh(new THREE.SphereGeometry(0.004, 8, 6), metal),
  );
  rim.position.y = 0.005;
  group.add(rim);

  /**
   * Four storeys. Each is a short wall drawn in from the one below, with
   * a cornice that oversails it — which is the overhang that casts the
   * line of shadow the whole shape depends on.
   */
  const STOREYS = [
    { base: 0.036, height: 0.034, radius: 0.082 },
    { base: 0.07, height: 0.03, radius: 0.069 },
    { base: 0.1, height: 0.026, radius: 0.056 },
    { base: 0.126, height: 0.022, radius: 0.043 },
  ] as const;
  for (const storey of STOREYS) {
    const top = storey.base + storey.height;
    group.add(
      mesh(
        lathe([
          [storey.radius, storey.base],
          [storey.radius * 0.97, storey.base + storey.height * 0.62],
          // The cornice: out, then a flat soffit, then back in.
          [storey.radius * 1.1, storey.base + storey.height * 0.72],
          [storey.radius * 1.1, storey.base + storey.height * 0.86],
          [storey.radius * 0.93, top],
        ]),
        metal,
      ),
    );
    // A gem on the storey's front face, the way a vimana carries a
    // deity niche on each tier.
    const niche = gemStud(ctx, 0.0055);
    niche.position.set(0, storey.base + storey.height * 0.34, storey.radius * 0.99);
    niche.scale.z = 0.5;
    group.add(niche);
  }

  // The kalasha: the pot and bud that finishes every temple tower.
  const top = 0.148;
  group.add(
    mesh(
      lathe([
        [0.036, top],
        [0.03, top + 0.006],
        [0.024, top + 0.012],
        [0.03, top + 0.024],
        [0.022, top + 0.036],
        [0.011, top + 0.046],
      ]),
      metal,
    ),
  );
  group.add(
    mesh(new THREE.SphereGeometry(0.0105, 12, 10), metal, { position: [0, top + 0.052, 0] }),
  );
  group.add(
    mesh(new THREE.ConeGeometry(0.0055, 0.018, 10), metal, {
      position: [0, top + 0.067, 0],
    }),
  );


  seatOnHead(ctx, group, 0.087);
  return group;
};

export const crownKaranda: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  /**
   * SIZED TO THE HEAD IT IS WORN ON.
   *
   * Every dimension below is drawn against the reference skull, which is
   * what `headFit` exists to convert — the kundala have scaled with it
   * since they were written. A crown did not, and on a stylised head
   * whose own part draws a cranium nearly twice the reference the band
   * sat entirely inside the skull: only the cone above it was visible.
   */
  group.scale.setScalar(headFit(ctx.body));
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

  seatOnHead(ctx, group, 0.085);
  return group;
};

/** Band crown with a radiating fan plate behind (prabhaval-style). */
export const crownFan: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  /**
   * SIZED TO THE HEAD IT IS WORN ON.
   *
   * Every dimension below is drawn against the reference skull, which is
   * what `headFit` exists to convert — the kundala have scaled with it
   * since they were written. A crown did not, and on a stylised head
   * whose own part draws a cranium nearly twice the reference the band
   * sat entirely inside the skull: only the cone above it was visible.
   */
  group.scale.setScalar(headFit(ctx.body));
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

  seatOnHead(ctx, group, 0.088);
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
  const inChest = ctx.socketInFrame("waist.ornament", "chest");
  const socket = ctx.socketOffset("waist.ornament");
  const toChest = inChest
    ? { y: inChest[1], z: inChest[2] }
    : // Only if the skeleton has no chest to speak of — the figure then
      // has no torso frame and the socket's own offset is the best that
      // can be said about where the waist is.
      { y: socket[1], z: socket[2] };
  const toSocket = (point: THREE.Vector3): V3 => [
    point.x,
    point.y - toChest.y,
    point.z - toChest.z,
  ];

  /**
   * Fifteen millimetres above the waist ornament's own socket, and NOT
   * at the garment's tie height.
   *
   * Anchoring it to `waistSeatY` was tried: it is where the dhoti ties
   * and it looked like the honest answer. It puts the belt BELOW the
   * band `BodyProfile.surfaceAt` describes, and below that band the
   * profile keeps answering with a neck-sized cylinder — so the ribbon
   * was walked onto a surface narrower than the torso and came out
   * twenty-five millimetres inside Shiva. See `torsoBand`, which exists
   * to say where the profile stops being able to answer.
   */
  const beltY = toChest.y + 0.015;
  /**
   * Worn over the cloth — and the cloth is ASKED, not inferred.
   *
   * It used to be `dhotiRadius - pelvisHalfWidth`, two measurements of the
   * BODY standing in for the thickness of a GARMENT. Measured on Ganesha,
   * fifty-four vertices of the dhoti's own waist wrap came through the
   * gold by up to seven millimetres: a roll of red cloth lying across the
   * belt, plainly visible from behind.
   *
   * And it was not a tuning error. `dhotiRadius` is the wrap radius a
   * garment NEEDS in order to clear the hips — a floor — and the dhoti's
   * waist band is a torus whose tube puts it fourteen millimetres past
   * that floor. No measurement of a body predicts a garment's styling.
   *
   * PER BEARING, which is what made the difference. A belt clears what is
   * under IT at each point of its circle, not the worst thing anywhere on
   * the circle: Ganesha's sash crosses it at one point, and taking the
   * global maximum bulged the entire circumference forty-five millimetres
   * to clear that one crossing — a flat gold disc rather than a band.
   *
   * THE FLOOR STAYS, and not for the reason it was first written. It was
   * kept as a safety net for a garment the measurement had not seen, and
   * removing it put the belt twenty-five millimetres INSIDE Shiva.
   * Measured, the cause is not the garment at all: the belt rides at
   * chest-local −165 mm, which is BELOW the band `BodyProfile.surfaceAt`
   * describes, and below that band the profile keeps answering with
   * something narrower than the torso. The floor has been standing in for
   * that error. It is a real term until the profile can answer there —
   * see `torsoBand`, and `bodySurface.test`, which holds the profile only
   * over the band it admits to.
   */
  /**
   * A BELT IS SIZED BY THE WAIST IT WRAPS, not by the neck.
   *
   * These were fractions of `neckRadius`, which is a reasonable stand-in
   * for "how big is this figure" until a figure has a thick neck and a
   * broad waist in different proportions. Ganesha's neck is seventy-two
   * millimetres, so his belt came out ninety-one millimetres tall -- a
   * gold tray rather than a band.
   */
  const halfWidth = body.dhotiRadius * 0.1;
  const thickness = body.dhotiRadius * 0.045;

  const overCloth = (bearing: number) => {
    /**
     * SEATED ON WHICHEVER IS WIDER: the cloth, or the body under it.
     *
     * Three corrections live here, all measured off showcase captures in
     * which the belt read as a gold flange standing further out than
     * Ganesha's own belly — eighty millimetres of air between the gold
     * and the red.
     *
     * OVER THE LOWER GARMENT ONLY. The uttariya's tail crosses the waist
     * and falls ACROSS a belt, not under it. Pooling both garments into
     * one radius made the belt clear the sash as well, all the way round,
     * for a crossing that lies on top of it anyway.
     *
     * ACROSS THE BAND THE BELT OCCUPIES. A belt is centimetres tall and
     * the skirt under it is not a cylinder; asked only at its centre
     * line, the band cleared the cloth there and was swallowed by the
     * flare below it.
     *
     * AND NO BODY-DERIVED FLOOR. There used to be a
     * `dhotiRadius - pelvisHalfWidth` term maxed in — two measurements of
     * the BODY standing in for a garment's thickness — kept as a safety
     * net for cloth the measurement could not see. It is no longer needed
     * for that (see `wornOffsetAt`, which now answers for socket-mounted
     * garments too) and it was twenty millimetres of the flange. What
     * actually stops the belt sinking into a figure is the clamp below,
     * which is about the SKIN and says so.
     */
    let measured: number | null = null;
    for (const offset of [-halfWidth, 0, halfWidth]) {
      const here = ctx.wornOffsetAt("chest", beltY + offset, bearing, ["lowerGarment"]);
      if (here === null) continue;
      measured = measured === null ? here : Math.max(measured, here);
    }
    /**
     * Never inside the skin. `wornOffsetAt` is signed so that a belt can
     * sit ON cloth the profile over-reports; clamped here so it can never
     * sit IN a body the profile under-reports. Measured on Vishnu without
     * this: fourteen millimetres into the torso. A bare waist, with no
     * cloth to measure at all, lands on the skin plus the six.
     */
    return Math.max(0, measured ?? 0) + 0.006;
  };
  const ring: SurfaceWaypoint[] = [];
  for (let i = 0; i <= 24; i += 1) {
    const bearing = (i / 24) * Math.PI * 2;
    ring.push({ bearing, y: beltY });
  }
  const belt = surfaceRibbon(body, ring, {
    halfWidth,
    thickness,
    // The ring spans the whole circle, so its walk parameter is the
    // bearing as a fraction of it.
    clearance: (t: number) => overCloth(t * Math.PI * 2),
    samples: 120,
    // A belt's width runs up the figure, not across the hip it rides.
    upright: true,
  });
  // Into the socket's own frame, where the rig will place it.
  const position = belt.getAttribute("position");
  for (let i = 0; i < position.count; i += 1) {
    position.setY(i, position.getY(i) - toChest.y);
    position.setZ(i, position.getZ(i) - toChest.z);
  }
  belt.computeVertexNormals();
  /**
   * Named, because the band and the things hanging off it are different
   * objects answering to different rules and a measurement has to be able
   * to tell them apart. The tassels drop four centimetres below the band;
   * a check that took the whole group's extent compared the band against
   * the skirt where the TASSELS are, which on a flared skirt is wider
   * than anywhere the band touches.
   */
  const band = new THREE.Mesh(belt, metal);
  band.name = "kamarband.band";
  group.add(band);

  // Tassels hanging at the front, seated on the same surface the belt is.
  /**
   * THE TASSELS ASK ABOUT THEIR OWN BEARING.
   *
   * They hang across a sixty-nine hundredths of a radian arc at the
   * FRONT, and `walkSurface` hands its callback the walk's own parameter
   * — nought to one across that short arc. Feeding that straight to a
   * function keyed by bearing fraction read the clearance from all the
   * way round the figure: the middle tassel, at the front, was seated on
   * the forty-one millimetres of cloth measured at Ganesha's BACK and
   * stood two hundred and thirty-six millimetres out where the dhoti it
   * hangs on is a hundred and eighty-seven. That spike is the flange in
   * the showcase captures — the band itself was never more than a
   * centimetre or so off.
   */
  const HANG_FROM = -0.34;
  const HANG_TO = 0.34;
  const hang = walkSurface(
    body,
    [
      { bearing: HANG_FROM, y: beltY - 0.012 },
      { bearing: 0, y: beltY - 0.014 },
      { bearing: HANG_TO, y: beltY - 0.012 },
    ],
    (t) => overCloth(HANG_FROM + t * (HANG_TO - HANG_FROM)) + thickness,
    5,
  );
  const tassels = new THREE.Group();
  tassels.name = "kamarband.tassels";
  for (const index of [0, 2, 4]) {
    const seat = toSocket(hang.points[index] as THREE.Vector3);
    tassels.add(
      mesh(new THREE.CapsuleGeometry(0.005, 0.03, 4, 8), metal, { position: seat }),
    );
    const drop = gemStud(ctx, 0.007);
    drop.position.set(seat[0], seat[1] - 0.028, seat[2]);
    tassels.add(drop);
  }
  group.add(tassels);
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
  /**
   * AND THE PROFILE CLOSES, because a band is a solid.
   *
   * `lathe` revolves a polyline and does not join its ends, so a profile
   * that runs from the inner edge out over the crown and back to the
   * inner edge produces a shell with NO INNER WALL — a C-section open
   * toward the limb. Every band ornament in the product was built that
   * way: vanki, kada, payal, on every deity.
   *
   * It is two defects at once. Drawn with front faces only, the hole has
   * nothing in it, so where the limb does not fill the ring the eye
   * looks straight through the gold and the open edge reads as a cut.
   * And a surface with no inner wall has no thickness, which is not a
   * thing that can be printed.
   *
   * Returning to the start point closes it. The inner wall lands at the
   * same radius the hole was already sized to, so nothing moves and
   * nothing grows: what changes is that the ring now has an inside.
   */
  g.add(
    mesh(
      lathe([
        [inner, -half],
        [inner + thickness, -half * 0.72],
        [inner + thickness, half * 0.72],
        [inner, half],
        [inner, -half],
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

/**
 * Seat a band a FRACTION of the way down the limb it is worn on.
 *
 * WHY A FRACTION AND NOT THE BODY'S OFFSET. `armBandOffsetY` is measured
 * at thirty-four percent of the upper arm, on the human base, from the
 * skin that ONE BONE drives. Both halves of that are right for what it
 * answers — how thick is the arm where an armlet sits — and neither
 * knows what else is in the way. At thirty-four percent the figure also
 * contains the deltoid, the chest, and on a four-armed deity the SECOND
 * upper arm, none of which belong to the bone that was measured.
 *
 * Measured on the shipped statues, a ring of the declared radius swept
 * round the upper arm at ten-millimetre stations:
 *
 *   Vishnu, front arm   inside the figure to station 80, clear from 90
 *   Vishnu, rear arm    inside to 40, clear from 50
 *   Shiva               inside to 60, clear from 70
 *
 * and the attribution says what it was inside: of the one hundred and
 * ninety-one vertices of Vishnu's front-left armlet that were in the
 * figure, eighty-nine were inside the REAR LEFT ARM and nineteen inside
 * the chest. It was never a question of the band's size — its hole is
 * four millimetres wider than the arm it goes round.
 *
 * So the seat is the first station the geometry allows, stated as a
 * fraction of the limb's own length so that it means the same thing on
 * an arm of any size. A limb tapers, so a hole sized higher up is still
 * wide enough lower down.
 */
function seatBandAlong(
  ctx: GeneratorContext,
  band: THREE.Group,
  child: JointId,
  fraction: number,
): THREE.Group {
  const offset = new THREE.Vector3(...ctx.jointOffset(child));
  band.position.copy(offset).multiplyScalar(fraction);
  band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), offset.clone().normalize());
  return band;
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
    seatBandAlong(ctx, band, `arm.${slot}.forearm`, ctx.body.armBandAlong);
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
