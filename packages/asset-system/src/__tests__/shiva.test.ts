/**
 * Shiva definition invariants — the deity-agnostic architecture test.
 *
 * These tests deliberately avoid implementation details: they assert that
 * Shiva is fully described by data (definition, manifest, skeleton,
 * presets) and that the shared schema round-trips his configuration
 * exactly, without any Ganesha assumptions leaking through.
 */
import { describe, expect, it } from "vitest";
import {
  GANESHA_SKELETON,
  HUMANOID_SKELETON,
  MUDRAS,
  SHIVA_POSE_PRESETS,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  deserializeConfiguration,
  getPosePreset,
  safeValidateConfiguration,
  serializeConfiguration,
  validateConfiguration,
} from "@devaform/character-schema";
import {
  coveredFeatures,
  getAvailableDeity,
  getAsset,
  isAssetCompatible,
  isHandheld,
  listAssets,
} from "../index";

const shiva = getAvailableDeity("shiva");

describe("shiva definition", () => {
  it("is a fully specified available deity", () => {
    expect(shiva).toBeDefined();
    expect(shiva?.assets.length).toBeGreaterThan(0);
    expect(shiva?.categories.length).toBeGreaterThan(0);
    expect(shiva?.posePresets.length).toBeGreaterThanOrEqual(4);
    expect(shiva?.skeleton.id).toBe("humanoid");
  });

  it("default configuration validates and references only resolvable, compatible assets", () => {
    const config = createDefaultShivaConfiguration();
    expect(config.deity).toBe("shiva");
    expect(safeValidateConfiguration(config).success).toBe(true);

    for (const [slot, ref] of Object.entries(config.parts)) {
      if (!ref) continue;
      const asset = getAsset(ref.assetId);
      expect(asset, `part ${slot}: ${ref.assetId}`).toBeDefined();
      expect(isAssetCompatible(asset!, "shiva"), `part ${slot}: ${ref.assetId}`).toBe(true);
    }
    for (const attachment of config.attachments) {
      const asset = getAsset(attachment.asset.assetId);
      expect(asset, attachment.asset.assetId).toBeDefined();
      expect(
        isAssetCompatible(asset!, "shiva", attachment.socket),
        `${attachment.asset.assetId} @ ${attachment.socket}`,
      ).toBe(true);
    }
  });

  it("every category slot either offers an option or is part of the body", () => {
    // A slot with nothing in it is a dead corner of the editor — unless
    // the selected body already provides it, which a continuous mesh
    // does for its head, face, eyes and hands. Those are declared, and
    // the panel says so instead of showing an empty grid.
    const covered = coveredFeatures(createDefaultShivaConfiguration()).features;
    for (const category of shiva?.categories ?? []) {
      const content = category.content;
      if (content.type === "parts" || content.type === "mixed") {
        for (const slot of content.slots) {
          if (covered.has(slot)) continue;
          expect(
            listAssets({ deity: "shiva", slot }).length,
            `category ${category.id}, slot ${slot}`,
          ).toBeGreaterThan(0);
        }
      }
      if (content.type === "sockets" || content.type === "mixed") {
        for (const socket of content.sockets) {
          expect(
            listAssets({ deity: "shiva", socket }).length,
            `category ${category.id}, socket ${socket}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it("offers a build for every variant the body can take", () => {
    const body = getAsset("humanoid.body.human")!;
    const exposed = new Set(body.morphTargets ?? []);
    expect(shiva?.bodyVariants?.length ?? 0).toBeGreaterThan(1);
    for (const variant of shiva?.bodyVariants ?? []) {
      for (const name of Object.keys(variant.morphs)) {
        expect(exposed.has(name), `${variant.id} needs ${name}`).toBe(true);
      }
    }
    // ...and the default configuration IS one of them, rather than a
    // fourth build nobody chose.
    const defaults = createDefaultShivaConfiguration().morphs;
    const matching = shiva?.bodyVariants?.find((variant) =>
      Object.entries(variant.morphs).every(
        ([name, value]) => Math.abs((defaults[name] ?? 0) - value) < 1e-9,
      ),
    );
    expect(matching, "the default build is an offered variant").toBeDefined();
  });

  it("keeps every superseded asset resolvable, and out of the pickers", () => {
    // `deprecated` is documented as "kept only so old saved characters
    // still resolve". A share link naming the stylised body must load.
    for (const id of [
      "shiva.body.classic",
      "shiva.body.ascetic",
      "shiva.body.mahayogi",
      "shiva.head.classic",
      "shiva.eyes.serene",
      "shiva.hands.classic",
    ]) {
      const asset = getAsset(id);
      expect(asset, id).toBeDefined();
      expect(asset!.stage, id).toBe("deprecated");
      expect(listAssets({ deity: "shiva" }).map((a) => a.id)).not.toContain(id);
    }
  });

  it("all category sockets exist on Shiva's skeleton", () => {
    const socketIds = new Set(shiva?.skeleton.sockets.map((s) => s.id));
    for (const category of shiva?.categories ?? []) {
      const content = category.content;
      if (content.type === "sockets" || content.type === "mixed") {
        for (const socket of content.sockets) {
          expect(socketIds.has(socket), `${category.id}: ${socket}`).toBe(true);
        }
      }
    }
    // The default configuration's attachments must also land on real sockets.
    for (const attachment of createDefaultShivaConfiguration().attachments) {
      expect(socketIds.has(attachment.socket), attachment.socket).toBe(true);
    }
  });
});

describe("shiva skeleton", () => {
  it("is the humanoid core — no trunk joints, no trunk sockets", () => {
    const jointIds = HUMANOID_SKELETON.joints.map((j) => j.id);
    expect(jointIds).not.toContain("trunkBase");
    expect(jointIds).not.toContain("trunkMid");
    expect(jointIds).not.toContain("trunkTip");
    expect(HUMANOID_SKELETON.sockets.map((s) => s.id)).not.toContain("trunk.tip");
    // Ganesha keeps his trunk.
    expect(GANESHA_SKELETON.joints.map((j) => j.id)).toContain("trunkTip");
    expect(GANESHA_SKELETON.sockets.map((s) => s.id)).toContain("trunk.tip");
  });

  it("pose UI groups contain no trunk group", () => {
    expect(HUMANOID_SKELETON.uiGroups.map((g) => g.label)).not.toContain("Trunk");
    expect(GANESHA_SKELETON.uiGroups.map((g) => g.label)).toContain("Trunk");
  });

  it("shiva pose presets reference only humanoid joints", () => {
    const jointIds = new Set(HUMANOID_SKELETON.joints.map((j) => j.id));
    for (const preset of SHIVA_POSE_PRESETS) {
      for (const jointId of Object.keys(preset.joints)) {
        expect(jointIds.has(jointId as never), `${preset.id}: ${jointId}`).toBe(true);
      }
      expect(getPosePreset(preset.id)).toBe(preset);
    }
  });
});

describe("shiva grips", () => {
  it("held attributes declare a handheld presentation with a real hand state", () => {
    for (const id of ["shiva.attribute.trishul", "shiva.attribute.damaru"]) {
      const asset = getAsset(id);
      expect(asset?.presentations, id).toBeDefined();
      const held = asset!.presentations!.filter(isHandheld);
      expect(held.length, id).toBeGreaterThan(0);
      for (const presentation of held) {
        expect(MUDRAS).toContain(presentation.hand);
        // A hand closes around something of a size; without the radius it
        // closes to whatever diameter it was modelled at.
        expect(presentation.grip?.radius, `${id}/${presentation.id}`).toBeGreaterThan(0);
      }
      expect(asset?.kind.type).toBe("attachment");
    }
  });

  it("the trishul can stand as well as be held", () => {
    const asset = getAsset("shiva.attribute.trishul");
    const modes = asset!.presentations!.map((p) => p.mode);
    expect(modes).toContain("handheld");
    expect(modes).toContain("grounded");
    const standing = asset!.presentations!.find((p) => p.mode === "grounded")!;
    // Grounded means grounded: no hand may be required for it.
    expect(standing.hand).toBe("none");
    expect(standing.stand?.clearanceM).toBeGreaterThan(0);
  });
});

describe("shiva serialization", () => {
  it("round-trips the default configuration exactly", () => {
    const config = createDefaultShivaConfiguration();
    const restored = deserializeConfiguration(serializeConfiguration(config));
    expect(restored).toEqual(config);
    // And a second cycle is stable (no normalization drift).
    expect(deserializeConfiguration(serializeConfiguration(restored))).toEqual(restored);
  });

  it("round-trips a customized configuration exactly", () => {
    const config = createDefaultShivaConfiguration();
    config.parts.hair = { assetId: "shiva.jata.flowing", version: 1 };
    config.pose = { preset: "shiva.tandava", jointOverrides: { head: [0.1, -0.05, 0] } };
    config.arms = { count: 4 };
    config.materials.hair = { color: "#5a3a20", finish: "satin" };
    config.attachments = [
      ...config.attachments.filter((a) => a.socket !== "chest.necklace"),
      {
        socket: "chest.necklace",
        asset: { assetId: "shiva.ornament.naga", version: 1 },
        offset: { position: [0, 0.01, 0], scale: 1.05 },
      },
    ];
    const restored = deserializeConfiguration(serializeConfiguration(config));
    expect(restored).toEqual(validateConfiguration(config));
  });

  it("keeps configurations saved before the hair zone loadable", () => {
    const legacy = createDefaultGaneshaConfiguration() as unknown as {
      materials: Record<string, unknown>;
    };
    delete legacy.materials.hair;
    const restored = deserializeConfiguration(JSON.stringify(legacy));
    expect(restored.materials.hair).toEqual({ color: "#31241a", finish: "matte" });
    expect(restored.deity).toBe("ganesha");
  });
});
