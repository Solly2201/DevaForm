/**
 * Morph influences the engine derives, on top of the ones the customer set.
 *
 * A procedural hand is built in whatever mudra it was asked for. A mesh
 * hand is already modelled, so closing it is a deformation — and a body
 * mesh that can close its hands says so by exposing `grip<ArmSlot>` morph
 * targets. The engine reads that declaration and dials them from the same
 * mudra the rest of the gesture system uses; a body without them simply
 * keeps its open hands, which is what the pose system already assumes.
 */
import {
  ARM_SLOTS,
  type ArmSlot,
  type HandsConfiguration,
  type MudraId,
} from "@devaform/character-schema";
import type { AssetDefinition } from "@devaform/asset-system";

/**
 * How closed each mudra's hand is when it is holding NOTHING.
 *
 * A hand that is holding something closes onto that instead — see
 * `closureFor`. These are the empty-handed shapes: a cradle is barely
 * closed, a pinch without a stem is a suggestion, and the open-palm
 * gestures are exactly that.
 */
const MUDRA_CLOSURE: Record<MudraId, number> = {
  abhaya: 0,
  varada: 0,
  open: 0,
  hold: 0.22,
  pinch: 0.55,
  grip: 1,
};

/** How much air a closing hand leaves around what it holds. */
const CONTACT_GAP = 0.0015;

const gripTarget = (slot: ArmSlot): string => `grip${slot[0]!.toUpperCase()}${slot.slice(1)}`;

/**
 * The closure that brings this hand onto an object of this radius.
 *
 * The body measured its own fist at a series of influences; this reads
 * that curve backwards. Closing further than the object allows would put
 * fingers through it, so the answer is the influence whose aperture the
 * object exactly fills — and when the object is thinner than the fist can
 * ever close, the hand simply shuts, because that is all it can do.
 */
export function closureFor(
  aperture: readonly (readonly [number, number])[] | undefined,
  radius: number,
): number | undefined {
  if (!aperture || aperture.length === 0) return undefined;
  let previous = aperture[0] as readonly [number, number];
  if (radius >= previous[1]) return previous[0];
  for (let i = 1; i < aperture.length; i += 1) {
    const current = aperture[i] as readonly [number, number];
    if (radius >= current[1]) {
      const span = previous[1] - current[1];
      const t = Math.abs(span) < 1e-9 ? 0 : (previous[1] - radius) / span;
      return previous[0] + (current[0] - previous[0]) * t;
    }
    previous = current;
  }
  return previous[0];
}

export function handMorphInfluences(
  hands: HandsConfiguration,
  body: AssetDefinition | undefined,
  /** What each hand is holding, and how thick it is where the hand closes. */
  held: Readonly<Partial<Record<ArmSlot, { radius?: number }>>> = {},
): Record<string, number> {
  const available = new Set(body?.morphTargets ?? []);
  const influences: Record<string, number> = {};
  for (const slot of ARM_SLOTS) {
    const target = gripTarget(slot);
    if (!available.has(target)) continue;
    const radius = held[slot]?.radius;
    const measured =
      radius !== undefined
        ? // A millimetre and a half of air, so the fingers stop AT the
          // object rather than a little way into it. The aperture curve
          // is the largest circle that fits, which is a lower bound on
          // the hole — the flesh comes closer than that in places, and
          // closing to the exact radius put fingertips a few millimetres
          // inside a drum that is made of wood.
          closureFor(body?.gripApertures?.[slot], radius + CONTACT_GAP)
        : undefined;
    // What the hand is DOING bounds how far it closes. A pinch that shuts
    // into a fist because the object is thin is not a pinch — and a drum
    // is pinched at a waist nine millimetres long, so a fist closing over
    // three centimetres of it runs its fingers into the flare whatever
    // the waist measures. The object can only ever stop the hand sooner.
    const intended = MUDRA_CLOSURE[hands[slot].mudra];
    influences[target] = measured === undefined ? intended : Math.min(measured, intended);
  }
  return influences;
}

/**
 * Everything the meshes should be morphed by: what the customer chose,
 * plus what their hand gestures imply. Customer weights win on conflict —
 * an explicit slider is a decision, a derived one is an inference.
 */
export function morphInfluences(
  configured: Readonly<Record<string, number>>,
  hands: HandsConfiguration,
  body: AssetDefinition | undefined,
  held: Readonly<Partial<Record<ArmSlot, { radius?: number }>>> = {},
): Record<string, number> {
  return { ...handMorphInfluences(hands, body, held), ...configured };
}
