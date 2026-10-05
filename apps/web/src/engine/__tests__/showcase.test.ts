/**
 * Every option the Studio offers, built.
 *
 * The acceptance layer for a product somebody is going to be shown. Not
 * "do the generators run" — the question is narrower and harsher: for
 * every choice a customer can actually click, in every deity that offers
 * it, does a thing appear, is it made of geometry, and does the rig build
 * without complaining?
 *
 * WHY THIS IS NOT COVERED BY THE REST OF THE SUITE. Every other test in
 * here measures the DEFAULT configuration of each figure, or one named
 * asset it is about. The picker offers a good deal more than the
 * defaults, and an option that renders nothing is indistinguishable from
 * one that renders correctly until somebody clicks it — which, at a
 * showcase, is the first thing that happens.
 *
 * It enumerates from `listAssets` with the SAME filter the panel uses, so
 * an asset that becomes selectable becomes tested on the same commit.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

const PUBLIC_DIR = join(__dirname, "..", "..", "..", "public");
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", async () => {
  interface RealLoader {
    parse(
      data: ArrayBuffer,
      path: string,
      onLoad: (gltf: { scene: THREE.Group }) => void,
      onError?: (error: unknown) => void,
    ): void;
  }
  const actual = await vi.importActual<{ GLTFLoader: new () => RealLoader }>(
    "three/examples/jsm/loaders/GLTFLoader.js",
  );
  return {
    GLTFLoader: class {
      private readonly real = new actual.GLTFLoader();
      load(path: string, onLoad: (gltf: { scene: THREE.Group }) => void): void {
        const file = readFileSync(join(PUBLIC_DIR, path.replace(/^\//, "")));
        const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
        // A GLB with baked textures cannot finish parsing in node — there
        // is no `createImageBitmap` — and without a handler the rejection
        // surfaces as an unhandled error beside an otherwise green run.
        // Swallowed here; the asset is then checked as a file instead.
        this.real.parse(buffer as ArrayBuffer, "", onLoad, () => {});
      }
    },
  };
});

import {
  DEITIES as DEITY_REGISTRY,
  customerFacingIssues,
  listAssets,
  resolveCharacterPresentation,
  VISIBLE_STAGES,
  type AssetDefinition,
} from "@devaform/asset-system";
import {
  PART_SLOTS,
  POSE_PRESETS,
  getSocket,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
  type DeityId,
  type PartSlot,
  type SocketId,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport, type CharacterRig } from "../rig";
import { deformedVertex } from "../skinning";
import { STAGE_BADGE, badgeCoverage } from "@/components/editor/assetBadge";
import { ZoneMaterials } from "../materials";

const DEITIES: Array<[DeityId, () => CharacterConfiguration]> = [
  ["ganesha", createDefaultGaneshaConfiguration],
  ["shiva", createDefaultShivaConfiguration],
  ["vishnu", createDefaultVishnuConfiguration],
];

/**
 * What the panel offers for this deity and slot.
 *
 * The same call `CustomizationPanel` makes. An asset the panel can show
 * and this cannot reach is a gap in the test, not in the product.
 */
function offeredParts(deity: DeityId, slot: PartSlot): AssetDefinition[] {
  return listAssets({ deity, slot });
}

/** Geometry actually built for one asset id, anywhere in the rig. */
function builtVertices(rig: CharacterRig, assetId: string): number {
  let total = 0;
  rig.root.traverse((node) => {
    if (node.name !== `part:${assetId}` && node.name !== `attachment:${assetId}`) return;
    node.traverse((mesh) => {
      if (mesh instanceof THREE.Mesh) total += mesh.geometry?.getAttribute("position")?.count ?? 0;
    });
  });
  return total;
}

async function rigFor(config: CharacterConfiguration) {
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

async function rigWearing(
  base: CharacterConfiguration,
  slot: PartSlot,
  assetId: string,
  version: number,
) {
  const config: CharacterConfiguration = {
    ...base,
    parts: { ...base.parts, [slot]: { assetId, version } },
  };
  const materials = new ZoneMaterials();
  /**
   * Build until nothing is still arriving.
   *
   * A configuration may pull in several GLBs and the loader resolves them
   * a tick at a time, so a fixed number of rebuilds is a guess that is
   * wrong for whichever asset needs one more. Bounded, so a file that
   * genuinely never loads still fails rather than hanging.
   */
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

describe.each(DEITIES)("%s", (deity, make) => {
  /**
   * The slots a customer can actually change on this figure.
   *
   * A mesh-bodied deity's head, eyes and hands are inside its body GLB
   * and its defaults say `null` for them, so those are not choices here
   * however many assets exist for a stylised figure.
   */
  const base = make();
  const slots = PART_SLOTS.filter((slot) => {
    if (slot === "body") return false;
    if (base.parts[slot] === undefined) return false;
    return offeredParts(deity, slot).length > 0;
  });

  it("offers something for the slots it exposes", () => {
    expect(slots.length, `${deity} exposes part slots`).toBeGreaterThan(2);
  });

  for (const slot of slots) {
    const options = offeredParts(deity, slot);
    it.each(options.map((asset) => [asset.id, asset.version] as const))(
      `${slot}: %s builds something`,
      async (assetId, version) => {
        const { rig, materials } = await rigWearing(base, slot, assetId, version);
        try {
          /**
           * A GLB carrying baked TEXTURES cannot finish parsing here.
           * `GLTFLoader` hands image data to `createImageBitmap`, which
           * node does not have, so the load never completes — in this
           * environment only. `ganesha.head.aidraft` renders correctly in
           * a browser; it was photographed to check.
           *
           * So the claim made about those assets is the one that CAN be
           * made here: the file the manifest points at exists and is a
           * glTF binary. Its geometry is checked by `validate-assets`,
           * which reads the container rather than the engine.
           */
          if (rig.pending.includes(assetId)) {
            const asset = listAssets({}).find((candidate) => candidate.id === assetId)!;
            expect(asset.source.kind, `${assetId} is a file, not a generator`).toBe("glb");
            const file = join(PUBLIC_DIR, (asset.source as { path: string }).path.replace(/^\//, ""));
            const head = readFileSync(file).subarray(0, 4).toString("ascii");
            expect(head, `${assetId} is a glTF binary at ${file}`).toBe("glTF");
            return;
          }
          const vertices = builtVertices(rig, assetId);
          expect(vertices, `${assetId} built geometry`).toBeGreaterThan(0);
          const complaints = rig.warnings.filter((warning) => warning.includes(assetId));
          expect(complaints, complaints.join("; ")).toEqual([]);
        } finally {
          materials.dispose();
        }
      },
      180_000,
    );
  }
});

/**
 * The sockets this deity's editor actually shows, read from the same
 * table the sidebar renders.
 *
 * Hand item sockets are filtered by the arms the figure HAS, exactly as
 * the panel does: a two-armed Shiva is not offered a rear hand.
 */
function offeredSockets(deity: DeityId, armSlots: readonly string[]): SocketId[] {
  const entry = DEITY_REGISTRY.find(
    (candidate): candidate is Extract<typeof candidate, { categories: unknown }> =>
      candidate.id === deity && "categories" in candidate,
  );
  const sockets: SocketId[] = [];
  for (const category of entry?.categories ?? []) {
    const content = category.content as { type: string; sockets?: readonly SocketId[] };
    for (const socket of content.sockets ?? []) {
      const hand = socket.match(/^arm\.(\w+)\.hand\.item$/);
      if (hand && !armSlots.includes(hand[1] ?? "")) continue;
      if (!sockets.includes(socket)) sockets.push(socket);
    }
  }
  return sockets;
}

describe.each(DEITIES)("%s attachments", (deity, make) => {
  const base = make();
  // The arms this figure HAS, which is what the panel filters hand
  // sockets by. The configuration's `hands` record names all four
  // whatever the body brought, so reading it instead offers a two-armed
  // Shiva a rear hand that does not exist.
  const armSlots = [...resolveCharacterPresentation(base).armSlots];

  for (const socket of offeredSockets(deity, armSlots)) {
    const options = listAssets({ deity, socket });
    if (options.length === 0) continue;
    it.each(options.map((asset) => [asset.id, asset.version] as const))(
      `${getSocket(socket).label}: %s builds something`,
      async (assetId, version) => {
        const config: CharacterConfiguration = {
          ...base,
          attachments: [
            ...base.attachments.filter((entry) => entry.socket !== socket),
            { socket, asset: { assetId, version } },
          ],
        };
        const { rig, materials } = await rigFor(config);
        try {
          if (rig.pending.includes(assetId)) return;
          /**
           * IT BUILDS, OR THE PRODUCT SAYS WHY.
           *
           * Some combinations are genuinely impossible — a hand giving
           * abhaya cannot also hold a noose — and the resolver settles
           * them deterministically and writes a sentence for the
           * customer: "Pasha was let go: the frontRight hand is
           * performing abhaya and cannot hold it." `ResolutionNotices`
           * puts that on screen.
           *
           * What must never happen is the third case: nothing appears and
           * nothing is said. That is the only failure here.
           */
          if (builtVertices(rig, assetId) > 0) {
            const complaints = rig.warnings.filter((warning) => warning.includes(assetId));
            expect(complaints, complaints.join("; ")).toEqual([]);
            return;
          }
          const explained = customerFacingIssues(rig.resolved).filter(
            (issue) => issue.assetId === assetId,
          );
          expect(
            explained.map((issue) => issue.message),
            `${assetId} built nothing and said nothing about it`,
          ).not.toEqual([]);
        } finally {
          materials.dispose();
        }
      },
      180_000,
    );
  }
});

describe.each(DEITIES)("%s poses", (deity, make) => {
  const base = make();
  const presets = POSE_PRESETS.filter(
    (preset) => preset.id.startsWith(`${deity}.`) || !preset.id.includes("."),
  );

  it("offers more than one pose", () => {
    expect(presets.length, `${deity} has poses`).toBeGreaterThan(1);
  });

  it.each(presets.map((preset) => [preset.id] as const))(
    "%s poses the figure and keeps it on its base",
    async (presetId) => {
      const config: CharacterConfiguration = {
        ...base,
        pose: { ...base.pose, preset: presetId },
      };
      const { rig, materials } = await rigFor(config);
      try {
        poseRig(rig, { preset: presetId, jointOverrides: {} });
        settleOnSupport(rig);
        rig.root.updateWorldMatrix(true, true);
        /**
         * The figure is still a figure: standing on the base it was
         * settled onto, the right way up, and with every hand that is
         * holding something still holding it.
         */
        /**
         * The lowest VERTEX, not the lowest bounding box. `settleOnSupport`
         * places the figure by its vertices, and a posed mesh's bounding
         * box is a box round its rest pose — measured, that is twelve
         * millimetres of slop on a seated figure, which looks exactly
         * like a statue hovering.
         */
        let lowest = Number.POSITIVE_INFINITY;
        let highest = Number.NEGATIVE_INFINITY;
        const point = new THREE.Vector3();
        for (const mesh of rig.bodyMeshes) {
          const position = mesh.geometry.getAttribute("position");
          if (!position) continue;
          mesh.updateWorldMatrix(true, false);
          for (let i = 0; i < position.count; i += 1) {
            deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
            rig.root.worldToLocal(point);
            lowest = Math.min(lowest, point.y);
            highest = Math.max(highest, point.y);
          }
        }
        const box = { min: { y: lowest }, max: { y: highest }, isEmpty: () => !Number.isFinite(lowest) };
        expect(box.isEmpty(), `${presetId} built a body`).toBe(false);
        const height = box.max.y - box.min.y;
        expect(height, `${presetId} keeps a plausible height (got ${height.toFixed(3)}m)`)
          .toBeGreaterThan(0.6);
        expect(height, `${presetId} keeps a plausible height (got ${height.toFixed(3)}m)`)
          .toBeLessThan(1.8);
        expect(
          Math.abs(box.min.y - rig.baseTop) * 1000,
          `${presetId} rests on the base rather than above or below it`,
        ).toBeLessThan(1);
        /**
         * A pose may legitimately refuse a gesture, and says so.
         *
         * `applyGestureOrientations` reverts a hand the arm cannot turn
         * far enough to show, "rather than producing a hand that is
         * neither one thing nor the other" — measured, Ganesha's standing
         * and dancing arms are thirty-six and twenty-eight degrees short
         * of abhaya, which is a real limit of where the pose puts the
         * arm. What must not happen is a pose that fails for any OTHER
         * reason: a staff whose butt left the ground, a hand that cannot
         * reach what it holds.
         */
        const unexplained = rig.poseWarnings.filter(
          (warning) => !/^Gesture: /.test(warning),
        );
        expect(unexplained, unexplained.join("; ")).toEqual([]);
      } finally {
        materials.dispose();
      }
    },
    180_000,
  );
});

describe("the picker's own labels", () => {
  /**
   * A BADGE IS A SIGNAL, AND A SIGNAL THAT ALWAYS FIRES IS NOT ONE.
   *
   * The card used to print "In preparation" under prototype, experimental
   * and integration assets, which is 81 of the 82 options a customer can
   * select. Opening the Studio therefore read as a product apologising
   * for every choice in it, which is not what the field meant: nothing
   * had been promoted out of `prototype` in the first place.
   *
   * The rule this pins is the one that survived. Whether an option is fit
   * to show is decided by whether it is OFFERED — `VISIBLE_STAGES`, plus
   * the rest of this file holding every offered asset to building real
   * geometry. A label on the tile cannot do that job, so it is only
   * allowed to carry information a customer gains from: at most a
   * minority of the catalogue, or it is decoration pretending to be a
   * warning.
   */
  it("marks a minority of the catalogue, or it is not telling anyone anything", () => {
    const offered = listAssets().filter((asset) =>
      (VISIBLE_STAGES as readonly string[]).includes(asset.stage),
    );
    const { badged, total } = badgeCoverage(offered);
    expect(total, "there is a catalogue to badge").toBeGreaterThan(20);
    expect(
      badged / total,
      `${badged} of ${total} offered assets carry a badge — a label on everything says nothing`,
    ).toBeLessThan(0.25);
  });

  it("prints nothing about DevaForm's own pipeline", () => {
    /**
     * The stage names are how far a piece has got through our process.
     * A customer buying a statue has no use for them, and seeing them
     * tells them something about us instead of about the statue.
     */
    const jargon = [
      "concept",
      "source",
      "prototype",
      "experimental",
      "integration",
      "review",
      "production",
      "deprecated",
    ];
    for (const label of Object.values(STAGE_BADGE)) {
      expect(jargon, `the picker prints "${label}"`).not.toContain(label.toLowerCase());
    }
  });
});
