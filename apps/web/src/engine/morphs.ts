/**
 * Morph influences the engine derives, on top of the ones the customer set.
 *
 * A procedural hand is built in whatever mudra it was asked for. A mesh
 * hand is already modelled, so closing it is a deformation — and a body
 * mesh that can close its hands says so by exposing `grip<ArmSlot>` and
 * `cradle<ArmSlot>` morph targets, plus the radii it baked them at. Per
 * ARM SLOT, and every slot the body has: the four-armed mesh shipped only
 * the front pair's targets, so the back hands were never closed at all
 * and held their attributes in an open rest palm.
 *
 * A body may also bake states that are not closures — `poise<ArmSlot>`,
 * the raised index a discus balances on — which an attribute asks for by
 * name through its presentation rather than by pretending to be six
 * millimetres thick.
 *
 * WHY TWO. A hand closed on a staff and a hand closed on a conch are not
 * the same hand scaled: one fist dialled to a fraction travels from an
 * open hand, through a hand whose fingers are merely half-extended, to a
 * fist closed on nothing, and the family of hands closed AROUND cylinders
 * of different sizes does not lie on that path. Every grip in this
 * product was picked off it, which is why every grip either failed to
 * close or closed through what it held. So the body bakes two real
 * closures and this blends between them by the radius the item declares.
 */
import {
  ARM_SLOTS,
  type ArmSlot,
  type HandsConfiguration,
  type MudraId,
} from "@devaform/character-schema";
import type { AssetDefinition, HandClosure } from "@devaform/asset-system";

/**
 * How closed each mudra's hand is when it is holding NOTHING.
 *
 * A hand that is holding something closes onto that instead. These are
 * the empty-handed shapes: a cradle is barely closed, a pinch without a
 * stem is a suggestion, and the open-palm gestures are exactly that.
 */
const MUDRA_CLOSURE: Record<MudraId, number> = {
  abhaya: 0,
  varada: 0,
  open: 0,
  hold: 0.22,
  pinch: 0.55,
  grip: 1,
};

const shapeTarget = (shape: string, slot: ArmSlot): string =>
  `${shape}${slot[0]!.toUpperCase()}${slot.slice(1)}`;

/**
 * The blend that closes this hand on an object of this radius.
 *
 * Both baked shapes are hands closed on a real cylinder, so anything
 * between them is one too. Outside them the nearer shape is used whole: a
 * hand cannot close tighter than its own fingers allow, and it does not
 * open further than a cradle for something bigger than a fist — it holds
 * such a thing against the palm, which is what the cradle is.
 */
export function gripBlend(
  shapes: Readonly<Record<string, number>> | undefined,
  radius: number,
): Readonly<Record<string, number>> | undefined {
  const tight = shapes?.grip;
  const wide = shapes?.cradle;
  if (tight === undefined || wide === undefined || wide <= tight) return undefined;
  // A millimetre and a half of air, so the fingers stop AT the surface
  // rather than a little way into it. Skin presses on what it holds, and
  // the flesh over a knuckle comes closer than the bone does — without
  // this the fingertips show through the far side of a thin shaft.
  const CONTACT_GAP = 0.0015;
  const t = Math.min(1, Math.max(0, (radius + CONTACT_GAP - tight) / (wide - tight)));
  return { grip: 1 - t, cradle: t };
}

export function handMorphInfluences(
  hands: HandsConfiguration,
  body: AssetDefinition | undefined,
  /** What each hand is holding, how thick it is, and which state holds it. */
  held: Readonly<
    Partial<Record<ArmSlot, { radius?: number; closure?: HandClosure }>>
  > = {},
): Record<string, number> {
  const available = new Set(body?.morphTargets ?? []);
  const influences: Record<string, number> = {};
  for (const slot of ARM_SLOTS) {
    const targets = ["grip", "cradle", "poise"].filter((shape) =>
      available.has(shapeTarget(shape, slot)),
    );
    if (targets.length === 0) continue;
    for (const shape of targets) influences[shapeTarget(shape, slot)] = 0;

    // A hand state that is not a closure does not blend with one: a
    // poised hand is a whole baked shape, and half of it plus half a
    // fist is neither.
    const poise = shapeTarget("poise", slot);
    if (held[slot]?.closure === "poise" && available.has(poise)) {
      influences[poise] = 1;
      continue;
    }
    const radius = held[slot]?.radius;
    const blend = radius === undefined ? undefined : gripBlend(body?.gripShapes, radius);
    if (blend) {
      // Holding something: the hand closes ON it, fully. What the hand is
      // DOING cannot open it — a pinch holding a stem is still a hand
      // round a stem — but see the presentation vocabulary for which
      // shape an attribute asks for in the first place.
      for (const [shape, weight] of Object.entries(blend)) {
        const target = shapeTarget(shape, slot);
        if (available.has(target)) influences[target] = weight;
      }
      continue;
    }
    // Empty: the gesture decides, and it dials the tight shape, because
    // an empty hand closing has nothing to close around.
    const tight = shapeTarget("grip", slot);
    if (available.has(tight)) influences[tight] = MUDRA_CLOSURE[hands[slot].mudra];
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
  held: Readonly<
    Partial<Record<ArmSlot, { radius?: number; closure?: HandClosure }>>
  > = {},
): Record<string, number> {
  return { ...handMorphInfluences(hands, body, held), ...configured };
}
