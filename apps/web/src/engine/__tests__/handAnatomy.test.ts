/**
 * A hand is one mass, not five tubes standing on a blob.
 *
 * The grip tests already ask whether the fingers close on what they hold.
 * Nothing asked whether the hand LOOKS like a hand, and a close-up said it
 * did not: fingers rooted on the palm's surface rather than inside it, so
 * each one stood off the mass it belonged to; fingertips that were flat
 * discs, because the tube primitive capped its ends with a fan; webs that
 * were spheres and read as beads; a thumb whose base was a 24 mm cylinder,
 * wider than anything at the wrist.
 *
 * Those are all structural claims, and structure is testable. What this
 * pins is the vocabulary a sculpted hand has to have:
 *
 *   - every finger and the thumb start INSIDE the palm;
 *   - every one of them ends at a point, not on a rim;
 *   - the four fingers are four different fingers;
 *   - the thumb is thicker than a finger and thinner than the wrist;
 *   - the silhouette is wider at the knuckles than at the wrist;
 *   - and all of that holds in every mudra the product offers.
 *
 * Screenshots are how the result was judged. This is how it is kept.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MUDRAS, type MudraId } from "@devaform/character-schema";
import { ZoneMaterials } from "../materials";
import { makeHand } from "../generators/hand";
import type { GeneratorContext } from "../generators/types";

function context(materials: ZoneMaterials): GeneratorContext {
  return { materials } as unknown as GeneratorContext;
}

/** The named limbs of a hand: four fingers and a thumb. */
function limbsOf(hand: THREE.Group): Map<string, THREE.Mesh> {
  const found = new Map<string, THREE.Mesh>();
  hand.updateMatrixWorld(true);
  hand.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name.startsWith("finger:") || mesh.name === "thumb") found.set(mesh.name, mesh);
  });
  return found;
}

/**
 * The palm, as whatever `collapse` left under "hand:shell".
 *
 * By the GROUP's name, not the mesh's: merging by material can leave more
 * than one mesh, and they are anonymous. A test that looked for a mesh
 * called "hand:shell" found nothing and reported a hand with no palm.
 */
function shellOf(hand: THREE.Group): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  hand.traverse((node) => {
    if (node.name !== "hand:shell") return;
    node.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) found.push(mesh);
    });
  });
  return found;
}

function pointsOf(mesh: THREE.Mesh): THREE.Vector3[] {
  const position = mesh.geometry.getAttribute("position");
  const points: THREE.Vector3[] = [];
  mesh.updateWorldMatrix(true, false);
  for (let i = 0; i < position.count; i += 1) {
    points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
  }
  return points;
}

/** The tube's first ring: the vertices the builder writes first. */
function rootRing(mesh: THREE.Mesh, radial: number): THREE.Vector3[] {
  const position = mesh.geometry.getAttribute("position");
  const ring: THREE.Vector3[] = [];
  mesh.updateWorldMatrix(true, false);
  for (let i = 0; i < radial && i < position.count; i += 1) {
    ring.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
  }
  return ring;
}

function centroid(points: readonly THREE.Vector3[]): THREE.Vector3 {
  const sum = new THREE.Vector3();
  for (const point of points) sum.add(point);
  return sum.divideScalar(Math.max(1, points.length));
}

/**
 * Is `point` inside any of the solids the palm is made of? Ray parity.
 *
 * PER SOLID, then OR — not parity over the sum. The palm, the wrist ball
 * and the webs overlap, and a point inside two of them crosses four
 * surfaces on the way out: summed, the parity is even and the point reads
 * as OUTSIDE. Two of the thumb's twelve root vertices sit exactly there,
 * and they stayed "outside" however deep the root was buried, which is
 * the shape of a measurement bug rather than of a modelling one.
 */
function insideShell(shell: readonly THREE.Mesh[], point: THREE.Vector3): boolean {
  const raycaster = new THREE.Raycaster(point, new THREE.Vector3(0.317, 0.628, 0.711).normalize());
  raycaster.far = 1;
  return shell.some((mesh) => raycaster.intersectObject(mesh, false).length % 2 === 1);
}

const FINGERS = ["finger:index", "finger:middle", "finger:ring", "finger:little"] as const;
const LIMBS = [...FINGERS, "thumb"] as const;
/** What `makeHand` builds its tubes with. */
const FINGER_RADIAL = 12;

describe("every mudra builds a hand, and the hand is one mass", () => {
  it.each(MUDRAS as readonly MudraId[])("%s", (mudra) => {
    const materials = new ZoneMaterials();
    try {
      const hand = makeHand(context(materials), mudra, -1);
      const limbs = limbsOf(hand);
      const shell = shellOf(hand);
      expect(shell.length, `${mudra}: the hand has a palm`).toBeGreaterThan(0);
      for (const name of LIMBS) {
        expect(limbs.get(name), `${mudra}: the hand has a ${name}`).toBeDefined();
      }

      /**
       * EVERY LIMB STARTS INSIDE THE PALM.
       *
       * Rooted on the surface, a tube's first ring is a full-width circle
       * sitting on the outside of the mass, and in an open mudra you can
       * see daylight between a finger and the hand it belongs to. Rooted
       * inside, the join happens under the skin and what emerges is a
       * finger growing out of a hand.
       */
      for (const name of LIMBS) {
        const mesh = limbs.get(name);
        if (!mesh) continue;
        const ring = rootRing(mesh, FINGER_RADIAL);
        const buried = ring.filter((point) => insideShell(shell, point)).length;
        expect(
          buried,
          `${mudra}: ${name}'s root ring has ${buried} of ${ring.length} points inside the palm`,
        ).toBeGreaterThanOrEqual(ring.length - 1);
      }
    } finally {
      materials.dispose();
    }
  });
});

describe("the hand's own proportions", () => {
  const materials = new ZoneMaterials();
  const hand = makeHand(context(materials), "open", -1);
  const limbs = limbsOf(hand);
  const shell = shellOf(hand);

  /**
   * A FINGER ENDS AT A POINT.
   *
   * The tube builder writes the far end last: a flat fan cap ends on the
   * ring's centre, with twelve rim vertices at the same distance from it
   * — a disc — while a dome ends on a crown with its last ring drawn in
   * around it. So: how many vertices sit within a fifth of a millimetre
   * of the final one. For a disc that is the whole rim.
   *
   * Measured against the END rather than against the distance from the
   * root, because a curled finger's furthest point from its root is
   * somewhere round the middle of the curl.
   */
  it.each(LIMBS)("%s ends at a point, not on a rim", (name) => {
    const mesh = limbs.get(name);
    expect(mesh, name).toBeDefined();
    if (!mesh) return;
    const points = pointsOf(mesh);
    const end = points[points.length - 1]!;
    const atTip = points.filter((point) => point.distanceTo(end) < 0.0002).length;
    expect(atTip, `${name}: ${atTip} vertices sit on its last one`).toBeLessThan(
      FINGER_RADIAL / 2,
    );
  });

  it("the four fingers are four different fingers", () => {
    const lengths = FINGERS.map((name) => {
      const mesh = limbs.get(name)!;
      const root = centroid(rootRing(mesh, FINGER_RADIAL));
      return Math.max(...pointsOf(mesh).map((point) => point.distanceTo(root)));
    });
    const spread = Math.max(...lengths) - Math.min(...lengths);
    expect(
      spread,
      `the longest and shortest differ by ${(spread * 1000).toFixed(1)} mm: ` +
        lengths.map((l) => (l * 1000).toFixed(0)).join(", "),
    ).toBeGreaterThan(0.012);
  });

  /** A limb's own thickness, measured across its root ring. */
  const girth = (name: string) => {
    const ring = rootRing(limbs.get(name)!, FINGER_RADIAL);
    const middle = centroid(ring);
    return Math.max(...ring.map((point) => point.distanceTo(middle)));
  };

  it("the thumb is thicker than a finger and thinner than the wrist", () => {
    const thumb = girth("thumb");
    const middle = girth("finger:middle");
    expect(
      thumb,
      `thumb ${(thumb * 1000).toFixed(1)} mm, middle finger ${(middle * 1000).toFixed(1)} mm`,
    ).toBeGreaterThan(middle);
    /**
     * TWELVE MILLIMETRES of radius, which is the wrist's own.
     *
     * The thumb's base was 11.8 and the wrist is 20 across, so the thumb
     * was very nearly as thick as the arm it hangs off. Measured, it was
     * the widest thing anywhere near the wrist — and in a close-up it is
     * the ball sitting on the hand that three passes at the wrist, the
     * palm and the forearm all failed to explain, because it was never
     * the wrist.
     */
    expect(thumb, `the thumb's base is ${(thumb * 1000).toFixed(1)} mm of radius`).toBeLessThan(
      0.012,
    );
  });

  it("the silhouette is wider at the knuckles than at the wrist", () => {
    const points = shell.flatMap(pointsOf);
    const widest = (from: number, to: number) =>
      Math.max(
        0,
        ...points.filter((p) => p.y <= from && p.y > to).map((p) => Math.hypot(p.x, p.z)),
      );
    const knuckles = widest(-0.05, -0.065);
    const wrist = widest(0.004, -0.008);
    expect(
      knuckles,
      `knuckles ${(knuckles * 1000).toFixed(1)} mm, wrist ${(wrist * 1000).toFixed(1)} mm`,
    ).toBeGreaterThan(wrist * 1.2);
  });

  it("releases its materials", () => {
    materials.dispose();
  });
});
