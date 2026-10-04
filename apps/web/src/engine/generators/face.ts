/**
 * Facial features, on whatever face is wearing them.
 *
 * WHAT THIS IS FOR. A deity's identity is mostly its head, and the Studio
 * offered one of each: one pair of eyes that came with the body, one
 * mouth, one brow line — which is to say no choice at all about the part
 * of a statue a devotee looks at. The Face panel had a single slider.
 *
 * WHAT IT IS NOT. It is not a per-deity head. Vishnu and Shiva wear the
 * same measured human skull, and a brow that only fits one of them would
 * be a brow authored against a body rather than against a face. Every
 * shape here is built from the body's OWN measurements — `skullAt` for
 * the silhouette at a height, `browY` for where a brow sits, `headRadius`
 * for scale — so the same asset fits any head the engine can measure, and
 * fits it differently because the head is different.
 *
 * THE VARIANTS ARE PARAMETERS, not copies. One generator, a handful of
 * numbers, and the manifest spends them: that is how Shiva's two jata
 * already work, and duplicating a generator per variant is how a feature
 * system turns into forty files nobody dares change.
 */
import * as THREE from "three";
import { taperedTube, type V3 } from "../geometry";
import type { BodyProfile } from "./bodyProfile";
import { num, type PartGenerator } from "./types";

/**
 * The skull's front surface at a lateral offset and a height, in
 * head-joint-local metres.
 *
 * The measured profile gives the silhouette's half-width and how far the
 * skin reaches front and back at each height; between those, a head is
 * close enough to an ellipse that a brow laid on one sits on the face.
 * The alternative is to assume the face is flat, which is how an applied
 * feature ends up floating beside a temple.
 */
function frontSurface(body: BodyProfile, x: number, y: number): number {
  const at = body.skullAt(y);
  const centreZ = (at.frontZ + at.backZ) / 2;
  const halfDepth = (at.frontZ - at.backZ) / 2;
  const across = at.halfWidth > 1e-6 ? Math.min(1, Math.abs(x) / at.halfWidth) : 1;
  return centreZ + halfDepth * Math.sqrt(Math.max(0, 1 - across * across));
}

/**
 * A brow, as a line across the face rather than a shape stuck to it.
 *
 * `arch` is how far the line lifts between its ends — a straight brow is
 * calm, a lifted one is graceful, and the difference is most of what
 * makes two otherwise identical faces read as two people. `weight` is how
 * much of it there is. `lift` moves the whole line relative to the brow
 * ridge the body measured, which is what lets one shape serve a serene
 * face and a fierce one.
 *
 * Flattened across its own thickness, because a brow is a band and a
 * tube of the same radius is a caterpillar.
 */
export const featureBrows: PartGenerator = (ctx) => {
  const hair = ctx.materials.get("hair");
  const body = ctx.body;
  const skull = body.headRadius;
  const arch = num(ctx, "arch", 0.5);
  const weight = num(ctx, "weight", 0.5);
  const lift = num(ctx, "lift", 0);

  const group = new THREE.Group();
  // Just under the measured brow ridge. That landmark is where a band
  // GRIPS a head, which is a little above where a brow sits on a face;
  // placed at it, all three variants floated off the eye.
  const base = body.browY + skull * (-0.035 + 0.06 * lift);
  /** How thick the band is where it is thickest. */
  const thick = skull * (0.025 + 0.018 * weight);

  for (const side of [1, -1] as const) {
    const path: V3[] = [];
    const STEPS = 9;
    for (let step = 0; step <= STEPS; step += 1) {
      const t = step / STEPS;
      // Inner end near the bridge of the nose, outer end at the temple.
      const x = side * skull * (0.11 + 0.40 * t);
      // The peak sits about two thirds out, where a brow's does.
      const rise = Math.sin(Math.pow(t, 0.78) * Math.PI) * skull * 0.075 * arch;
      // And the outer end falls away, which is what stops an arched brow
      // reading as a circumflex.
      const fall = Math.pow(t, 2.4) * skull * 0.05;
      const y = base + rise - fall;
      path.push([x, y, frontSurface(body, x, y) + skull * 0.004]);
    }
    const brow = new THREE.Mesh(
      taperedTube(path, [thick, thick * 0.42], 10, 7),
      hair,
    );
    // A band, not a rope.
    brow.scale.y = 0.52;
    brow.scale.z = 0.62;
    group.add(brow);
  }

  return [{ joint: "head", object: group }];
};
