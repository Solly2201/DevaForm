/**
 * THE HAND.
 *
 * Moved out of body.ts and rebuilt, because the old construction could not
 * reach the quality of the hands the mesh bodies bring. Shiva and Vishnu
 * wear a sculpted human mesh whose hands are part of one surface; Ganesha's
 * are generated, and at close range they were the obvious outlier. What a
 * close-up actually showed:
 *
 *   - the fingers did not touch the palm. Each one started AT the palm's
 *     surface, so its first ring was a full-radius circle sitting on the
 *     outside of the mass, and in an open mudra you could see daylight
 *     between a finger and the hand it belonged to;
 *   - every fingertip was a FLAT DISC, because `taperedTube` closed its
 *     ends with a fan. Four cut pipes;
 *   - the webs between the roots were spheres, and read as a row of beads
 *     laid across the knuckles;
 *   - the thenar and hypothenar were two more spheres stuck on a lofted
 *     ellipse, so the palm was a blob with lumps rather than one mass;
 *   - the wrist met the hand as a cylinder meeting a ball.
 *
 * None of that is tuning. The construction is different here:
 *
 *   - the palm is ONE lofted slab with a SUPERELLIPTICAL section — a
 *     rounded rectangle, flat across the back, dished on the palm side,
 *     thicker on the thumb's edge than the little finger's. The thenar
 *     and hypothenar are a width profile on that slab, not objects;
 *   - every finger is ROOTED INSIDE it. The point list starts eight
 *     millimetres up into the mass, so the join happens under the surface
 *     and what emerges is a finger growing out of a hand;
 *   - the webs are wedges that run along the fingers they sit between,
 *     thinning to nothing a third of the way up the proximal phalanx,
 *     which is what skin does there;
 *   - fingertips and the thumb are domed (`cap: "round"`);
 *   - the wrist section is the forearm's own radius, so the silhouette
 *     runs forearm → wrist → palm without a step.
 *
 * WHAT DID NOT CHANGE, deliberately: the semantic contract. Fingers grow
 * along local -Y and the palm faces +Z (HAND_FINGER_AXIS / HAND_PALM_AXIS);
 * the mudra shapes, the finger specs the aperture solver measures, the
 * grip channel, and `gripPoint` are all as they were, so every grip, every
 * gesture and every saved configuration resolves exactly as before.
 */
import * as THREE from "three";
import type { MudraId } from "@devaform/character-schema";
import { collapse, mesh, taperedTube, type V3 } from "../geometry";
import type { GeneratorContext } from "./types";

interface FingerSpec {
  /** Which finger it is, so the built mesh can say so. */
  name: "index" | "middle" | "ring" | "little";
  /** Root position on the knuckle arc (hand-local). */
  root: V3;
  lengthScale: number;
  radius: number;
}

/**
 * Build a finger as a chain of three phalanx segments, each bending by
 * `bend` radians toward the palm (+z), sampled into a smooth tube.
 */
export function fingerPoints(root: V3, lengthScale: number, bend: number, splay: number): V3[] {
  const segLengths = [0.021, 0.017, 0.014].map((l) => l * lengthScale);
  const points: V3[] = [root];
  const dir = new THREE.Vector3(Math.sin(splay) * 0.35, -1, 0.08).normalize();
  /**
   * FINGERS CURL TOWARD THE PALM, which is +Z in this frame.
   *
   * The rotation was about +X, and about +X a finger pointing down turns
   * BACKWARDS — away from the palm it belongs to. So every closing mudra
   * curled its fingers behind the hand: measured, the four tips reached a
   * maximum of nine to fifteen millimetres of local Z while the grip
   * point they are supposed to close on sits at twenty-two, and the
   * nearest any finger came to it was thirteen.
   */
  const bendAxis = new THREE.Vector3(-1, 0, 0);
  const p = new THREE.Vector3(...root);
  for (const len of segLengths) {
    dir.applyAxisAngle(bendAxis, bend);
    p.addScaledVector(dir, len);
    points.push([p.x, p.y, p.z]);
  }
  return points;
}

interface MudraShape {
  /** Per-phalanx bend for [index, middle, ring, pinky] (radians). */
  bends: readonly [number, number, number, number];
  splay: number;
  thumbCurl: number;
  /** Extra thumb pull toward the fingertips (pinch opposition). */
  thumbOppose: number;
  palmCup: number;
}

/**
 * The tube a closed hand makes runs across the palm, from the little
 * finger toward the thumb: every finger here curls about the hand's own
 * local X, so that axis IS the grip channel. It is chiral only in
 * direction — you grip a staff with the thumb toward its head — which is
 * what `side` carries.
 */
export const GRIP_CHANNEL_AXIS: V3 = [1, 0, 0];
/** Which way the palm faces, in the same frame (the hand contract's +Z). */
export const PALM_AXIS: V3 = [0, 0, 1];

const MUDRA_SHAPES: Record<MudraId, MudraShape> = {
  abhaya: { bends: [0.08, 0.07, 0.08, 0.1], splay: 0.04, thumbCurl: 0.22, thumbOppose: 0, palmCup: 0.05 },
  varada: { bends: [0.3, 0.28, 0.3, 0.34], splay: 0.09, thumbCurl: 0.32, thumbOppose: 0, palmCup: 0.1 },
  open: { bends: [0.22, 0.2, 0.22, 0.26], splay: 0.15, thumbCurl: 0.3, thumbOppose: 0, palmCup: 0.08 },
  // Palm-up cradle: fingers gently curled to support an offering.
  hold: { bends: [0.55, 0.58, 0.6, 0.64], splay: 0.05, thumbCurl: 0.5, thumbOppose: 0.2, palmCup: 0.22 },
  // Stem pinch: index meets thumb, remaining fingers fold in.
  pinch: { bends: [0.62, 1.05, 1.15, 1.25], splay: 0.02, thumbCurl: 0.55, thumbOppose: 0.85, palmCup: 0.15 },
  // Closed fist around a shaft running across the palm (local X axis).
  grip: { bends: [1.12, 1.16, 1.18, 1.2], splay: 0, thumbCurl: 0.95, thumbOppose: 0.55, palmCup: 0.28 },
};

/**
 * The four fingers, rooted on a KNUCKLE ARC rather than along an edge.
 *
 * A real hand's metacarpal heads arch in both planes at once: the middle
 * knuckle stands furthest forward and highest, the index and little fall
 * away from it, and the whole row curves around the ball of the hand.
 *
 * The lengths are the classical proportions — middle longest, ring just
 * under it, index shorter, little markedly shorter and set lower on the
 * hand, which is the single clearest thing that separates a hand from
 * four identical prongs.
 */
const FINGERS: readonly FingerSpec[] = [
  { name: "index", root: [-0.0235, -0.0565, 0.0035], lengthScale: 0.86, radius: 0.0076 },
  { name: "middle", root: [-0.008, -0.0635, 0.0105], lengthScale: 1.0, radius: 0.0081 },
  { name: "ring", root: [0.0072, -0.0625, 0.0098], lengthScale: 0.92, radius: 0.0075 },
  { name: "little", root: [0.0218, -0.0535, 0.0028], lengthScale: 0.7, radius: 0.0063 },
];

/**
 * How much room the fingers leave around the grip axis at a given bend.
 *
 * The axis runs along the hand's local X through the grip point, so the
 * aperture is measured in the (y, z) plane the fingers curl in: the
 * closest any finger's flesh comes to that line. Negative means the
 * fingers have closed through it.
 */
function apertureAt(
  shape: MudraShape,
  grip: readonly [number, number, number],
  closure: number,
): number {
  let clearance = Number.POSITIVE_INFINITY;
  FINGERS.forEach((finger, i) => {
    const splay = shape.splay * (finger.root[0] / 0.0225);
    const points = fingerPoints(
      finger.root,
      finger.lengthScale,
      (shape.bends[i] ?? 0.2) * closure,
      splay,
    );
    for (const [, y, z] of points) {
      const distance = Math.hypot(y - grip[1], z - grip[2]);
      clearance = Math.min(clearance, distance - finger.radius);
    }
  });
  return clearance;
}

/**
 * How far to close this mudra so the hand's own flesh clears `radius`.
 *
 * The hand is drawn at a closure; the item declares a radius; this finds
 * the tightest closure whose aperture still clears it.
 */
function closureFor(
  shape: MudraShape,
  grip: readonly [number, number, number],
  radius: number,
): number {
  const STEPS = 24;
  // Never straighter than half the mudra's own shape — a grip is still a
  // grip — and never more than half again, which would fold the fingers
  // into the palm.
  const LOOSEST = 0.5;
  /**
   * THE FALLBACK IS THE LOOSEST GRIP, not the tightest.
   *
   * This started at 1 — the mudra's own full closure — and returned it
   * whenever the very first step already had the fingers inside the
   * item. Which is every real item: measured, the fist closed to an
   * aperture of three point seven millimetres for a lotus stem of four,
   * an axe haft of seven, and a modak of THIRTY.
   *
   * If a hand cannot open far enough to clear what it is given, the
   * honest answer is the widest it opens.
   */
  let best = LOOSEST;
  for (let i = 0; i <= STEPS; i += 1) {
    const closure = LOOSEST + (i / STEPS) * 1.0;
    if (apertureAt(shape, grip, closure) < radius) break;
    best = closure;
  }
  return best;
}

/** One cross-section of the palm slab, hand-local. */
interface PalmSection {
  y: number;
  /** Half-width across the hand, and half-thickness front to back. */
  rx: number;
  rz: number;
  /** Where the section's centre sits in depth. */
  z: number;
  /** 0 = ellipse, 1 = nearly a rectangle. The back of a hand is flat. */
  square: number;
  /** How much wider the THUMB side is: the ball of the thumb. */
  thenar: number;
  /**
   * And the pad down the little-finger edge.
   *
   * Smaller than the thenar and on the other side. Without it the palm's
   * rounded corner falls away exactly where the LITTLE finger is rooted —
   * it sits furthest out on the knuckle arc — and three of its twelve
   * root vertices end up outside the mass, which is a seam at the base of
   * the one finger whose base is most on the silhouette.
   */
  hypo: number;
  /** How deep the palm dishes on its +z face. */
  dish: number;
}

/**
 * THE PALM, AS ONE MASS.
 *
 * A loft of superelliptical rings. The exponent is what makes it a hand
 * rather than a bar of soap: an ellipse is the same curvature everywhere,
 * and the back of a hand is a plane that turns over at the edges. The
 * thumb side carries more width than the little-finger side (the thenar),
 * and the palm face is pushed in (the dish) — both as profiles ON this
 * surface, because the moment they are separate spheres the hand is a
 * blob with lumps on it, which is what it was.
 */
function palmSlab(sections: readonly PalmSection[], side: 1 | -1, radial = 30): THREE.BufferGeometry {
  const spline = (pick: (s: PalmSection) => number) =>
    new THREE.CatmullRomCurve3(
      sections.map((s, i) => new THREE.Vector3(i, pick(s), 0)),
      false,
      "catmullrom",
      0.5,
    );
  const yC = spline((s) => s.y);
  const rxC = spline((s) => s.rx);
  const rzC = spline((s) => s.rz);
  const zC = spline((s) => s.z);
  const squareC = spline((s) => s.square);
  const thenarC = spline((s) => s.thenar);
  const hypoC = spline((s) => s.hypo);
  const dishC = spline((s) => s.dish);

  const rings = (sections.length - 1) * 6;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= rings; i += 1) {
    const t = i / rings;
    const y = yC.getPoint(t).y;
    const rx = Math.max(0.0005, rxC.getPoint(t).y);
    const rz = Math.max(0.0005, rzC.getPoint(t).y);
    const zOff = zC.getPoint(t).y;
    const square = Math.min(0.95, Math.max(0, squareC.getPoint(t).y));
    const thenar = thenarC.getPoint(t).y;
    const hypo = hypoC.getPoint(t).y;
    const dish = dishC.getPoint(t).y;
    // A superellipse: |x/a|^n + |z/b|^n = 1. n = 2 is an ellipse; higher
    // flattens the faces and tightens the corners.
    const n = 2 + square * 2.6;
    for (let j = 0; j < radial; j += 1) {
      const angle = (j / radial) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const px = Math.sign(cos) * Math.abs(cos) ** (2 / n);
      const pz = Math.sign(sin) * Math.abs(sin) ** (2 / n);
      // The thumb's edge is the fuller one.
      const widthHere =
        rx * (1 + thenar * Math.max(0, px * side) + hypo * Math.max(0, -px * side));
      // And the palm face is dished: the +z half is pulled back toward
      // the bones, most of it in the middle of the hand.
      const cupHere = pz > 0 ? dish * pz * (1 - 0.55 * Math.abs(px)) : 0;
      positions.push(widthHere * px, y, zOff + rz * pz - cupHere);
    }
  }
  for (let i = 0; i < rings; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      indices.push(a, c, b, b, c, d);
    }
  }
  // Caps at the wrist and at the knuckle line. The knuckle end is buried
  // under the finger roots; the wrist end under the forearm.
  const capAt = (ring: number, flip: boolean) => {
    const centre = positions.length / 3;
    const t = ring / rings;
    positions.push(0, yC.getPoint(t).y, zC.getPoint(t).y);
    for (let j = 0; j < radial; j += 1) {
      const a = ring * radial + j;
      const b = ring * radial + ((j + 1) % radial);
      if (flip) indices.push(centre, b, a);
      else indices.push(centre, a, b);
    }
  };
  capAt(0, false);
  capAt(rings, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function makeHand(
  ctx: GeneratorContext,
  mudra: MudraId,
  side: 1 | -1, // 1 = left hand, -1 = right hand
  /** Half-thickness of what this hand is closing on, if anything. */
  closeOn?: number,
): THREE.Group {
  const skin = ctx.materials.get("skin");
  const base = MUDRA_SHAPES[mudra];
  // A hand that is holding something closes onto THAT, not onto whatever
  // diameter it happened to be drawn at.
  const closure =
    closeOn !== undefined && closeOn > 0
      ? closureFor(base, gripPoint(mudra, side), closeOn)
      : 1;
  const shape: MudraShape =
    closure === 1
      ? base
      : {
          ...base,
          bends: base.bends.map((b) => b * closure) as unknown as MudraShape["bends"],
          thumbCurl: base.thumbCurl * (0.7 + 0.3 * closure),
        };
  const g = new THREE.Group();

  const cup = shape.palmCup;
  /**
   * THE BALL THE FOREARM ENDS INSIDE.
   *
   * Centred on the hand joint, which is the whole point: the forearm's
   * end cap is a flat disc AT that joint, the wrist turns about it, and a
   * turn tilts the disc — so nothing that merely sits above or below the
   * joint can cover it. Removing the ball to check left the disc in the
   * middle of a closed fist, plainly visible; that is what it is for.
   *
   * WIDER THAN THE CAP, narrower than the palm. The cap's rim sits at
   * exactly the arm's end radius from the joint whatever angle the wrist
   * is at, so a ball NARROWER than that cannot cover it — the mistake
   * this went through three times, at 20, 16 and 13.8 mm against an arm
   * of 20.5, 18 and 15.2. Nineteen point six against nineteen covers it
   * at any angle, and the palm's own wrist at 21 covers the ball from
   * below.
   */
  g.add(mesh(new THREE.SphereGeometry(0.0196, 18, 14), skin));
  /**
   * Wrist, heel, ball, knuckles — and the shape of the section changes as
   * much as its size does. Round at the wrist because a wrist is round;
   * nearly rectangular across the knuckles because the back of the hand
   * is a plane there and the palm under it is a dish.
   */
  g.add(
    mesh(
      palmSlab(
        [
          /**
           * THE WRIST IS PART OF THE HAND, and it starts with a sphere.
           *
           * The forearm ends AT the joint, narrow, and its flat cap is
           * covered by `wristBall` below — a sphere centred on the joint
           * is the only cover a bend cannot pull off it. These sections
           * then take the slab out from inside that sphere, past it, and
           * down into the palm: the top ring is small enough to hide
           * inside the ball, the ring just below it carries the ball's
           * own widest point, and from there it is a hand.
           *
           * Owned here rather than by the arm because a wrist owned by
           * two generators is a joint they can disagree about, and they
           * did: a 27 mm ball handing over to a 17 mm palm.
           */
          /**
           * BARELY ABOVE THE JOINT, and wider than the ball below it.
           *
           * Anything the hand draws above the wrist joint swings when
           * the wrist bends — the hand's frame turns under the arm's —
           * so a slab reaching up inside the forearm comes out through
           * its side on a strong pose. Fourteen millimetres of it did.
           * Four is short enough to stay in.
           *
           * Below the joint the slab has to be WIDER than the ball, or
           * the ball surfaces through the wrist as a bead. Its radius
           * falls off as sqrt(r² − y²), so these two rings clear it with
           * two millimetres to spare.
           */
          // Ten millimetres above the joint, narrow enough to hide inside
          // both the ball and the forearm, so the palm's own top cap is
          // never the thing on the silhouette.
          { y: 0.010, rx: 0.0118, rz: 0.0116, z: 0, square: 0, thenar: 0, hypo: 0, dish: 0 },
          { y: 0.003, rx: 0.0178, rz: 0.0174, z: 0, square: 0, thenar: 0, hypo: 0, dish: 0 },
          { y: -0.004, rx: 0.0213, rz: 0.0205, z: 0.0004, square: 0.08, thenar: 0, hypo: 0, dish: 0 },
          { y: -0.012, rx: 0.0223, rz: 0.0196, z: 0.0008, square: 0.2, thenar: 0, hypo: 0.04, dish: 0 },
          // The thenar: the ball of muscle the thumb grows out of. It is
          // a width profile on the palm rather than a sphere stuck to it,
          // and it is what lets the thumb itself be only a thumb.
          { y: -0.028, rx: 0.0262, rz: 0.0168, z: 0.0035, square: 0.6, thenar: 0.3, hypo: 0.1, dish: cup * 0.012 },
          { y: -0.044, rx: 0.0295, rz: 0.0156, z: 0.005, square: 0.72, thenar: 0.2, hypo: 0.12, dish: cup * 0.02 },
          // The knuckle line: the back stands PROUD here, which is the
          // row of metacarpal heads. It is on the slab rather than on the
          // fingers because it bulges out of the back of the hand only.
          /**
           * Wide enough, and round enough at the corners, to bury the
           * LITTLE finger's root. It sits furthest out on the knuckle arc
           * and a tight superellipse corner left three of its twelve root
           * vertices outside the mass — a seam at the base of the one
           * finger whose base is most on the silhouette.
           */
          { y: -0.057, rx: 0.0316, rz: 0.0154, z: 0.0051, square: 0.66, thenar: 0.08, hypo: 0.1, dish: cup * 0.022 },
          { y: -0.066, rx: 0.0276, rz: 0.0108, z: 0.0056, square: 0.62, thenar: 0.02, hypo: 0.06, dish: cup * 0.016 },
          /**
           * AND IT ROLLS OVER, rather than stopping on a disc.
           *
           * The slab's far cap is a flat ellipse facing the fingertips.
           * With the fingers open it is hidden behind them; close them
           * into a fist and it faces the camera, which is the pale disc
           * a close-up of a gripping hand showed in the middle of the
           * palm. These three sections take it from the knuckle line to
           * almost nothing, so the cap is a few millimetres across and
           * sits inside the finger roots.
           */
          { y: -0.0715, rx: 0.0244, rz: 0.0086, z: 0.0052, square: 0.5, thenar: 0, hypo: 0.02, dish: cup * 0.008 },
          { y: -0.0748, rx: 0.0178, rz: 0.0056, z: 0.0048, square: 0.3, thenar: 0, hypo: 0, dish: 0 },
          { y: -0.0768, rx: 0.0088, rz: 0.0026, z: 0.0044, square: 0.1, thenar: 0, hypo: 0, dish: 0 },
        ],
        side,
      ),
      skin,
      {},
    ),
  );

  // Mirror finger order so the index finger is on the thumb's side.
  const indexFirst = side === 1 ? FINGERS : [...FINGERS].reverse();
  const rooted: { spec: FingerSpec; points: V3[] }[] = [];
  indexFirst.forEach((f, i) => {
    const splay = shape.splay * (f.root[0] / 0.0225);
    const bend = shape.bends[i] ?? 0.2;
    const pts = fingerPoints(f.root, f.lengthScale, bend, splay);
    rooted.push({ spec: f, points: pts });
    /**
     * THE ROOT GOES INSIDE THE PALM.
     *
     * The first point of the curve above is the metacarpal head — the
     * knuckle — which is ON the surface. Starting the tube there puts a
     * full-radius ring on the outside of the mass and leaves a seam the
     * eye reads as a gap; in an open mudra you could see through it.
     *
     * So the tube starts a centimetre further back, inside the slab,
     * along the finger's own direction reversed. Everything between
     * there and the surface is buried, and what comes out of the hand is
     * a finger growing out of it.
     */
    const first = pts[0] as V3;
    const second = pts[1] as V3;
    const inward = new THREE.Vector3(
      first[0] - second[0],
      first[1] - second[1],
      first[2] - second[2],
    ).normalize();
    const buried: V3 = [
      first[0] + inward.x * 0.011,
      first[1] + inward.y * 0.011,
      first[2] + inward.z * 0.011,
    ];
    const curve: V3[] = [buried, ...pts];
    /**
     * A FINGER IS THREE BONES, not a cone.
     *
     * Widest just past the knuckle, narrowing through the middle of each
     * phalanx, swelling again at each joint, ending in a rounded pad — so
     * the silhouette has three gentle bulges and the eye reads bones
     * under skin. `t` here runs over the WHOLE curve including the buried
     * root, so the profile is shifted to the part that shows.
     */
    const SHOWN = 0.011 / (0.011 + 0.052 * f.lengthScale);
    const knuckles = (u: number): number => {
      const t = Math.max(0, (u - SHOWN) / (1 - SHOWN));
      if (u < SHOWN) {
        // Inside the palm: the finger's own width, so the buried part
        // fills the hole it leaves rather than tapering away from it.
        return f.radius;
      }
      const taper = 1 - 0.34 * t;
      /**
       * THE KNUCKLE IS NOT IN HERE.
       *
       * A metacarpal head bulges DORSALLY — out of the back of the hand —
       * and a tube has one radius per ring, so putting the knuckle in the
       * finger swells it into the palm as well. Measured, that made the
       * finger ROOT the nearest flesh to the grip point: the aperture
       * stopped following the item, and a hand given a twelve-millimetre
       * sweet closed a hair tighter than one given a seven-millimetre
       * haft. The knuckle ridge belongs to the palm's own back, and that
       * is where it is (see the slab's section at the knuckle line).
       *
       * What stays here are the two interphalangeal joints and the pad:
       * they are on the finger, they move with it, and they are what
       * gives the silhouette bones under skin.
       */
      const swell =
        0.1 * Math.exp(-(((t - 0.38) / 0.1) ** 2)) +
        0.08 * Math.exp(-(((t - 0.7) / 0.09) ** 2));
      return f.radius * taper * (1 + swell);
    };
    const finger = new THREE.Mesh(taperedTube(curve, knuckles, 22, 12, "round"), skin);
    /**
     * NAMED, and kept out of the merge below: the fingers are what closes
     * on a held object, so they are what every grip measurement wants to
     * address, and they were once picked out by hard-coded child indices.
     */
    finger.name = `finger:${f.name}`;
    /**
     * And a finger is WIDER THAN IT IS DEEP. A circular section is the
     * other half of the plastic read; a human finger is flattened front
     * to back, more so toward the nail.
     */
    finger.scale.set(1.14, 1, 0.84);
    g.add(finger);

    /**
     * A NAIL. One small plate on the back of the last joint, and it is
     * worth more than everything else here put together — it is the
     * single detail that says "this is a hand" at the distance a statue
     * is looked at.
     */
    const tip = pts[pts.length - 1];
    const before = pts[pts.length - 2];
    if (tip && before) {
      const along = new THREE.Vector3(
        tip[0] - before[0],
        tip[1] - before[1],
        tip[2] - before[2],
      ).normalize();
      const back = new THREE.Vector3(0, 0, -1);
      back.addScaledVector(along, -back.dot(along)).normalize();
      const seat = new THREE.Vector3(...tip).addScaledVector(along, -f.radius * 1.05);
      seat.addScaledVector(back, f.radius * 0.6);
      const nail = mesh(new THREE.SphereGeometry(f.radius * 0.6, 10, 8), skin, {
        position: [seat.x, seat.y, seat.z],
      });
      nail.scale.set(0.92, 1.3, 0.3);
      nail.lookAt(seat.clone().add(back));
      g.add(nail);
    }
  });

  /**
   * THE WEBS are the palm's own end, not a part laid on it.
   *
   * Two attempts failed here and both failed the same way: anything
   * ADDED between the fingers is a separate body, and a separate body
   * between two tubes reads as an object. Spheres were beads; wedges
   * running up the fingers were spikes; one tube threaded through the
   * roots was a horseshoe lying on the palm.
   *
   * What is actually between two fingers is the hand itself, ending. So
   * the slab above rolls over at the knuckle line instead of stopping on
   * a flat cap — the last three sections take it from the knuckles to
   * almost nothing — and the fingers are rooted inside that roll. The
   * skin between them is the palm's own surface, which is what it is.
   */

  /**
   * THE THUMB.
   *
   * Three points rather than two, and the first of them inside the
   * thenar: a thumb is a metacarpal that moves plus two phalanges, and
   * drawn as one tube from the palm's edge it reads as a peg pushed into
   * the side of the hand. The base is nearly twice the width of the tip,
   * the joint swells, and the end is domed like the fingers'.
   */
  const thumbRoot: V3 = [side * 0.0198, -0.0315, 0.0032];
  const thumbPts: V3[] = [thumbRoot];
  const tDir = new THREE.Vector3(
    side * (0.75 - shape.thumbOppose * 0.55),
    -0.55 - shape.thumbOppose * 0.2,
    0.35 + shape.thumbOppose * 0.55,
  ).normalize();
  const tAxis = new THREE.Vector3(0.2, side * -0.8, 0).normalize();
  const tp = new THREE.Vector3(...thumbRoot);
  for (const len of [0.013, 0.019, 0.015]) {
    tDir.applyAxisAngle(tAxis, shape.thumbCurl * 0.62);
    tp.addScaledVector(tDir, len);
    thumbPts.push([tp.x, tp.y, tp.z]);
  }
  /**
   * Rooted inside the hand, toward the MIDDLE of the palm.
   *
   * The fingers bury backwards along their own direction, which works
   * because they leave the hand end-on. A thumb leaves it sideways: back
   * along its own axis is still along the palm's edge, and a ring nine
   * millimetres across centred there comes out through the back. Aimed at
   * the middle of the mass instead, the whole root is under the surface —
   * which is where a metacarpal is.
   */
  const inward = new THREE.Vector3(0, -0.034, 0.004)
    .sub(new THREE.Vector3(...thumbRoot))
    .normalize();
  thumbPts.unshift([
    thumbRoot[0] + inward.x * 0.013,
    thumbRoot[1] + inward.y * 0.013,
    thumbRoot[2] + inward.z * 0.013,
  ]);
  const thumb = new THREE.Mesh(
    taperedTube(
      thumbPts,
      /**
       * AND IT IS NOT AS THICK AS THE WRIST.
       *
       * The base was 11.8 mm of radius — a 24 mm cylinder standing on
       * the palm's edge, against fingers of 8 — and with a flat disc for
       * its buried end. Measured, it was the widest thing anywhere near
       * the wrist, at 37.6 mm from the hand's axis where the palm itself
       * reaches 33. In a close-up it is the ball sitting on the hand
       * that nothing else explained: three passes at the wrist, the palm
       * and the forearm all left it there, because it was never the
       * wrist.
       *
       * A thumb's metacarpal is thicker than a finger and thinner than
       * the wrist. The mound it grows out of is the palm's own (see
       * `thenar` on the slab), so this only has to be the thumb.
       */
      (t) => {
        if (t < 0.2) return 0.0094;
        const u = (t - 0.2) / 0.8;
        const taper = 1 - 0.28 * u;
        const joint = 0.1 * Math.exp(-(((u - 0.45) / 0.13) ** 2));
        return 0.0094 * taper * (1 + joint);
      },
      20,
      12,
      "round",
    ),
    skin,
  );
  thumb.scale.set(1, 1, 0.92);
  thumb.name = "thumb";
  g.add(thumb);

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  /**
   * THE HAND IS SIX MESHES: the four fingers, the thumb, and everything
   * else.
   *
   * The fingers and the thumb stay out of the merge because they are what
   * closes on a held object, so they are what the grip measurements
   * address; merging them into the palm would leave nothing to address.
   * The palm, the webs and the nails are one material on a rigid group,
   * which is exactly the case `collapse` is for.
   */
  const shell = new THREE.Group();
  for (const child of [...g.children]) {
    const name = typeof child.name === "string" ? child.name : "";
    if (name.startsWith("finger:") || name === "thumb") continue;
    g.remove(child);
    shell.add(child);
  }
  const merged = collapse(shell);
  merged.name = "hand:shell";
  g.add(merged);
  return g;
}

/**
 * Where each gesture actually holds an object, hand-local. The hand owns
 * its grip surface, so it refines the arm.<slot>.hand.item socket here —
 * items (whose grip point is their local origin) then land in the grip
 * relationally instead of via stacked absolute offsets.
 */
export function gripPoint(mudra: MudraId, side: 1 | -1): [number, number, number] {
  switch (mudra) {
    case "grip":
      // Center of the closed fist cavity — shafts pass through here.
      return [0, -0.052, 0.022];
    case "hold":
      // Cradle: offerings rest on the palm surface.
      return [0, -0.048, 0.02];
    case "pinch":
      // Stem held between thumb tip and curled index.
      return [side * 0.008, -0.055, 0.024];
    default:
      // Open gestures hold nothing; keep the palm center as the anchor.
      return [0, -0.05, 0.02];
  }
}
