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
 * How closed each mudra's hand is. `grip` is a fist around a shaft;
 * `pinch` holds a stem between thumb and fingers, which a single
 * whole-hand curl can only approximate; `hold` is a cradle, barely
 * closed. The open-palm gestures are exactly that.
 */
const MUDRA_CLOSURE: Record<MudraId, number> = {
  abhaya: 0,
  varada: 0,
  open: 0,
  hold: 0.22,
  pinch: 0.55,
  grip: 1,
};

const gripTarget = (slot: ArmSlot): string => `grip${slot[0]!.toUpperCase()}${slot.slice(1)}`;

export function handMorphInfluences(
  hands: HandsConfiguration,
  body: AssetDefinition | undefined,
): Record<string, number> {
  const available = new Set(body?.morphTargets ?? []);
  const influences: Record<string, number> = {};
  for (const slot of ARM_SLOTS) {
    const target = gripTarget(slot);
    if (!available.has(target)) continue;
    influences[target] = MUDRA_CLOSURE[hands[slot].mudra];
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
): Record<string, number> {
  return { ...handMorphInfluences(hands, body), ...configured };
}
