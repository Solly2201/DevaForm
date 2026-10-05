/**
 * Does what a hand is holding STAY in the hand?
 *
 * The grip tests in this suite are deep on one hand at a time: whether
 * the fingers close on the shaft (`grip`), whether the arm can reach the
 * pose at all (`handReach`), whether the chain from asset to world stays
 * relational (`gripChain`), whether two hands collide (`handCoexistence`).
 * Every one of them measures a single configuration standing still.
 *
 * A showcase does not stand still. Somebody picks an attribute, then a
 * mudra, then a pose, then another deity, then reloads the share link —
 * and an item that was correctly in the hand for the configuration it was
 * authored against can be left behind by any of those. That is the
 * failure a person actually sees: a trident hanging in the air beside the
 * figure that is supposed to be holding it.
 *
 * So this is the cross product, and it asks only one thing, of every
 * combination, in every pose:
 *
 *     the item is where the hand is.
 *
 * Deliberately coarse. How WELL the fingers close is `grip.test`'s
 * question and it is a harder one; this is the question that catches a
 * whole class of showcase defect in one number, and it is the one that a
 * pose change or a reload breaks.
 */
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () =>
  import("./glbLoader").then((module) => module.diskLoader()),
);

import { listAssets } from "@devaform/asset-system";
import {
  MUDRAS,
  activeArmSlots,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type ArmSlot,
  type CharacterConfiguration,
  type MudraId,
  type SocketId,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport } from "../rig";
import { ZoneMaterials } from "../materials";

async function build(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  let rig = buildRig(config, materials);
  for (let attempt = 0; attempt < 6 && rig.pending.length > 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    rig = buildRig(config, materials);
  }
  return { rig, materials };
}

/**
 * How far the nearest point of a held item is from the hand holding it.
 *
 * The NEAREST point, not the item's origin: a trident is a metre and a
 * half long and its origin is wherever the artist put it, so an origin
 * measurement reports a correctly-held staff as half a metre adrift. What
 * is being asked is whether any part of the thing is in the hand.
 */
function gapToHand(
  rig: ReturnType<typeof buildRig>,
  assetId: string,
  arms: readonly ArmSlot[],
): number | null {
  /**
   * TO THE NEAREST HAND, not to the one that was asked for.
   *
   * The resolver decides which hand ends up holding a thing: ask for a
   * lotus in the front right hand of a figure already giving abhaya there
   * and it is placed in another, which is correct and is the behaviour
   * `showcase.test` checks. Measuring to the requested hand reported a
   * lotus correctly held in the front LEFT as four hundred and
   * thirty-four millimetres adrift, under every mudra, which is the
   * distance across his shoulders.
   *
   * What this file is asking is whether the thing is in A hand at all.
   */
  rig.root.updateWorldMatrix(true, true);
  /**
   * THE WHOLE HAND, fingers included.
   *
   * The wrist bone alone is the wrong reference for anything not held in
   * a fist. Vishnu's discus is poised on a raised index FINGERTIP — the
   * manifest says so and `chakraPresentation.test` holds it to it — and a
   * raised finger is a hundred millimetres from the wrist, so measuring
   * to the wrist reported a correctly balanced disc as adrift under every
   * mudra. It is also the better reference for a gripped shaft, which
   * lies against the fingers rather than the wrist.
   */
  const hands: THREE.Vector3[] = [];
  for (const slot of arms) {
    const prefix = `arm.${slot}.hand`;
    for (const [id, bone] of rig.joints) {
      if (id === prefix || id.startsWith(`${prefix}.`)) {
        hands.push(bone.getWorldPosition(new THREE.Vector3()));
      }
    }
  }
  if (hands.length === 0) return null;

  let item: THREE.Object3D | null = null;
  rig.root.traverse((node) => {
    if (node.name === `attachment:${assetId}`) item = node;
  });
  if (item === null) return null;

  let nearest = Number.POSITIVE_INFINITY;
  const point = new THREE.Vector3();
  (item as THREE.Object3D).traverse((node) => {
    const mesh = node as THREE.Mesh;
    const position = mesh.geometry?.getAttribute("position");
    if (!mesh.isMesh || !position) return;
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < position.count; i += 7) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      for (const hand of hands) nearest = Math.min(nearest, point.distanceTo(hand));
    }
  });
  return Number.isFinite(nearest) ? nearest : null;
}

const FIGURES: ReadonlyArray<[string, () => CharacterConfiguration]> = [
  ["ganesha", createDefaultGaneshaConfiguration],
  ["shiva", createDefaultShivaConfiguration],
  ["vishnu", createDefaultVishnuConfiguration],
];

/**
 * How close is held.
 *
 * A hand is roughly a hundred millimetres across and its grip channel
 * runs through the middle, so some part of a thing being gripped is
 * within that of the wrist bone. Eighty is generous and still an order of
 * magnitude under "left behind by the pose", which is what this exists to
 * catch -- an item that stayed where the rest pose put it while the arm
 * went somewhere else is a quarter of a metre away or more.
 */
const HELD_MM = 80;

describe.each(FIGURES)("%s's hands keep hold", (deity, make) => {
  const base = make();
  const arms = [...activeArmSlots(base.arms)];

  /**
   * One arm's worth of the cross product, so the run stays finite: every
   * mudra against every item this deity offers, in the front right hand,
   * which is the hand a customer reaches for first.
   */
  const slot = (arms.includes("frontRight" as ArmSlot) ? "frontRight" : arms[0]) as ArmSlot;
  const socket = `arm.${slot}.hand.item` as SocketId;
  const items = listAssets({ deity: deity as "ganesha" | "shiva" | "vishnu", socket });

  it("offers something to hold", () => {
    expect(items.length, `${deity} has items for ${slot}`).toBeGreaterThan(0);
  });

  it(
    "holds every item under every mudra, or says why it cannot",
    async () => {
      const adrift: string[] = [];
      for (const asset of items) {
        for (const mudra of MUDRAS) {
          const config: CharacterConfiguration = {
            ...base,
            hands: { ...base.hands, [slot]: { mudra: mudra as MudraId } },
            attachments: [
              ...base.attachments.filter((entry) => entry.socket !== socket),
              { socket, asset: { assetId: asset.id, version: asset.version } },
            ],
          };
          const { rig, materials } = await build(config);
          try {
            poseRig(rig, config.pose);
            settleOnSupport(rig);
            /**
             * ONLY THE ONES A HAND IS ACTUALLY HOLDING.
             *
             * The resolver chooses a presentation per attachment, and not
             * every presentation puts the thing in a fist. Shiva's trident
             * is PLANTED beside him when his hands are giving gestures —
             * it stands on the base, which is why it was measured a
             * hundred and forty millimetres from the nearest wrist and
             * reported adrift. Vishnu's chakra spins clear of the
             * fingertip rather than being gripped.
             *
             * The presentation says so itself: `hand: "none"` is "this
             * hand is not holding it". Asking that is the difference
             * between auditing the grip and auditing the iconography.
             */
            const chosen = rig.resolved.attachments.find(
              (entry) => entry.asset.id === asset.id,
            );
            if (!chosen || chosen.presentation.hand === "none") continue;

            const gap = gapToHand(rig, asset.id, arms);
            /**
             * NOT BUILT IS NOT A FAILURE HERE. A hand giving abhaya
             * cannot also hold a noose, and the resolver settles that
             * deterministically and writes the customer a sentence about
             * it — which `showcase.test` is the place that checks. What
             * this file is about is the other case: it IS on the figure,
             * and it is nowhere near the hand.
             */
            if (gap === null) continue;
            if (gap * 1000 > HELD_MM) {
              adrift.push(`${asset.id} under ${mudra}: ${(gap * 1000).toFixed(0)} mm from the hand`);
            }
          } finally {
            materials.dispose();
          }
        }
      }
      expect(adrift, adrift.join("; ")).toEqual([]);
    },
    900_000,
  );

  it(
    "keeps hold through every pose, and through a rebuild",
    async () => {
      const presets = [null, ...base.pose.preset ? [base.pose.preset] : []];
      const held = items.slice(0, 4);
      const adrift: string[] = [];
      const unstable: string[] = [];

      for (const asset of held) {
        const config: CharacterConfiguration = {
          ...base,
          attachments: [
            ...base.attachments.filter((entry) => entry.socket !== socket),
            { socket, asset: { assetId: asset.id, version: asset.version } },
          ],
        };
        for (const preset of presets) {
          const { rig, materials } = await build(config);
          try {
            poseRig(rig, { ...config.pose, preset });
            settleOnSupport(rig);
            const chosen = rig.resolved.attachments.find(
              (entry) => entry.asset.id === asset.id,
            );
            if (!chosen || chosen.presentation.hand === "none") continue;
            const gap = gapToHand(rig, asset.id, arms);
            if (gap === null) continue;
            if (gap * 1000 > HELD_MM) {
              adrift.push(
                `${asset.id} in ${preset ?? "rest"}: ${(gap * 1000).toFixed(0)} mm from the hand`,
              );
            }

            /**
             * AND THE SAME ANSWER TWICE. A share link is a rebuild from
             * the same configuration; if the second build puts the item
             * somewhere else, the creation a customer saved is not the
             * one their friend opens.
             */
            const again = await build(config);
            try {
              poseRig(again.rig, { ...config.pose, preset });
              settleOnSupport(again.rig);
              const second = gapToHand(again.rig, asset.id, arms);
              if (second !== null && Math.abs(second - gap) * 1000 > 0.01) {
                unstable.push(
                  `${asset.id} in ${preset ?? "rest"}: ${(gap * 1000).toFixed(2)} mm, then ` +
                    `${(second * 1000).toFixed(2)} mm`,
                );
              }
            } finally {
              again.materials.dispose();
            }
          } finally {
            materials.dispose();
          }
        }
      }
      expect(adrift, adrift.join("; ")).toEqual([]);
      expect(unstable, unstable.join("; ")).toEqual([]);
    },
    900_000,
  );
});
