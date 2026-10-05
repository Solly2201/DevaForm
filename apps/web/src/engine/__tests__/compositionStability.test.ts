/**
 * Swapping an ornament must not move the statue.
 *
 * Selecting necklace A and then necklace B should leave the same body in
 * the same pose with the same camera, with only the necklace different.
 * What happens instead is that the stage measures the WHOLE figure — see
 * `measureFigure`, which exists so that a tall crown's finial is not
 * cropped — and every ornament is part of that measurement. A garland
 * that reaches a centimetre further out than the collar it replaced
 * therefore re-frames the photograph.
 *
 * This measures the two halves separately, because they have different
 * answers:
 *
 *   THE BODY MUST NOT MOVE AT ALL. Nothing about a necklace can justify
 *   the chest, the hands or the feet being somewhere else. A hard zero.
 *
 *   THE FRAMING MAY MOVE A LITTLE, but only as much as the ornament
 *   itself sticks out, and never enough to read as the camera jumping.
 */
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () =>
  import("./glbLoader").then((module) => module.diskLoader()),
);

import { listAssets } from "@devaform/asset-system";
import {
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
  type SocketId,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport } from "../rig";
import { ZoneMaterials } from "../materials";
import { measureFigure } from "../figureExtent";

async function build(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  let rig = buildRig(config, materials);
  for (let attempt = 0; attempt < 6 && rig.pending.length > 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    rig = buildRig(config, materials);
  }
  poseRig(rig, config.pose);
  settleOnSupport(rig);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

/** Where every bone of the figure is, which is what "the body" means. */
function skeleton(rig: ReturnType<typeof buildRig>): Map<string, THREE.Vector3> {
  const places = new Map<string, THREE.Vector3>();
  for (const [id, bone] of rig.joints) {
    places.set(id, bone.getWorldPosition(new THREE.Vector3()));
  }
  return places;
}

const FIGURES = [
  ["ganesha", createDefaultGaneshaConfiguration],
  ["shiva", createDefaultShivaConfiguration],
  ["vishnu", createDefaultVishnuConfiguration],
] as const;

/** Sockets whose contents a customer swaps between while comparing them. */
const SWAPPABLE: readonly SocketId[] = [
  "head.crown" as SocketId,
  "chest.necklace" as SocketId,
  "chest.mala" as SocketId,
  "waist.ornament" as SocketId,
];

describe.each(FIGURES)("%s's composition holds still", (deity, make) => {
  for (const socket of SWAPPABLE) {
    const options = listAssets({ deity: deity as "ganesha" | "shiva" | "vishnu", socket });
    if (options.length < 2) continue;

    it(
      `swapping what is in ${socket} leaves the body where it was`,
      async () => {
        const base = make();
        const wearing = (assetId: string, version: number): CharacterConfiguration => ({
          ...base,
          attachments: [
            ...base.attachments.filter((entry) => entry.socket !== socket),
            { socket, asset: { assetId, version } },
          ],
        });

        const first = options[0]!;
        const reference = await build(wearing(first.id, first.version));
        const bones = skeleton(reference.rig);
        const extent = measureFigure(reference.rig);
        reference.materials.dispose();
        expect(extent, "the figure was measured").not.toBeNull();

        for (const option of options.slice(1)) {
          const { rig, materials } = await build(wearing(option.id, option.version));
          try {
            /**
             * THE BODY IS A HARD ZERO. A bone that moves because a
             * different necklace was chosen is the composition being
             * recomputed, which is what makes an editor feel unstable.
             */
            let worst = 0;
            let where = "";
            for (const [id, place] of skeleton(rig)) {
              const before = bones.get(id);
              if (!before) continue;
              const moved = before.distanceTo(place) * 1000;
              if (moved > worst) {
                worst = moved;
                where = id;
              }
            }
            expect(
              worst,
              `${option.id}: ${where} moved ${worst.toFixed(2)} mm when only the ` +
                `${socket} changed`,
            ).toBeLessThan(0.01);

            /**
             * AND THE FRAMING MOVES ONLY AS MUCH AS THE ORNAMENT DOES.
             *
             * The stage composes from the figure's own extent so a tall
             * crown is not cropped, which is right — a crown IS part of
             * the silhouette. A necklace is not.
             */
            const now = measureFigure(rig);
            expect(now, `${option.id} measured`).not.toBeNull();
            if (process.env.DEVAFORM_FRAME_PROBE) {
              console.log(
                `FRAME ${deity} ${option.id}: foot=${(now!.footY*1000).toFixed(0)} head=${(now!.headY*1000).toFixed(0)} top=${(now!.topY*1000).toFixed(0)} radius=${(now!.radius*1000).toFixed(0)} | ref head=${(extent!.headY*1000).toFixed(0)} top=${(extent!.topY*1000).toFixed(0)}`,
              );
            }
            /**
             * A CROWN MAY RE-FRAME; A NECKLACE MAY NOT.
             *
             * A crown is part of the silhouette — Ganesha wearing the
             * circlet is 218 mm shorter than Ganesha wearing the kirita,
             * and a photograph of him has to change. What must not happen
             * is the camera ARRIVING there discontinuously, which is a
             * different fix and lives in AdoptHero: the composition is
             * eased over about a third of a second rather than snapped.
             *
             * Neckwear, malas and waist ornaments are not silhouette.
             * Sixty millimetres is more than any of them is worth and far
             * less than a jump.
             */
            const budget = socket === ("head.crown" as SocketId) ? 320 : 60;
            const dTop = Math.abs(now!.topY - extent!.topY) * 1000;
            const dRadius = Math.abs(now!.radius - extent!.radius) * 1000;
            const dFoot = Math.abs(now!.footY - extent!.footY) * 1000;
            expect(
              Math.max(dTop, dRadius, dFoot),
              `${option.id}: the framing moved by top ${dTop.toFixed(0)} mm, ` +
                `radius ${dRadius.toFixed(0)} mm, foot ${dFoot.toFixed(0)} mm`,
            ).toBeLessThan(budget);
          } finally {
            materials.dispose();
          }
        }
      },
      240_000,
    );
  }
});
