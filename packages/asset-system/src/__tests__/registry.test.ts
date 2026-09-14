import { describe, expect, it } from "vitest";
import {
  MUDRAS,
  createDefaultGaneshaConfiguration,
  isSocketId,
} from "@devaform/character-schema";
import { GANESHA_ASSETS } from "../manifests/ganesha";
import { GANESHA_EDITOR_CATEGORIES } from "../categories";
import { getAsset, listAssets, resolveAssetRef } from "../registry";
import { isHandheld } from "../presentation";

describe("ganesha manifest integrity", () => {
  it("has unique asset ids", () => {
    expect(new Set(GANESHA_ASSETS.map((a) => a.id)).size).toBe(GANESHA_ASSETS.length);
  });

  it("attachment assets only declare known sockets", () => {
    for (const asset of GANESHA_ASSETS) {
      if (asset.kind.type !== "attachment") continue;
      for (const socket of asset.kind.sockets) {
        expect(isSocketId(socket), `${asset.id} -> ${socket}`).toBe(true);
      }
    }
  });

  it("socketTransforms keys reference sockets the asset attaches to", () => {
    for (const asset of GANESHA_ASSETS) {
      if (!asset.socketTransforms) continue;
      expect(asset.kind.type).toBe("attachment");
      if (asset.kind.type !== "attachment") continue;
      for (const key of Object.keys(asset.socketTransforms)) {
        expect(asset.kind.sockets.includes(key as never), `${asset.id} -> ${key}`).toBe(true);
      }
    }
  });

  it("handheld presentations use real hand states, on hand-socket items", () => {
    for (const asset of GANESHA_ASSETS) {
      for (const presentation of asset.presentations ?? []) {
        if (!isHandheld(presentation)) continue;
        expect((MUDRAS as readonly string[]).includes(presentation.hand), asset.id).toBe(true);
        expect(asset.kind.type).toBe("attachment");
        if (asset.kind.type !== "attachment") continue;
        expect(
          asset.kind.sockets.some((s) => s.endsWith(".hand.item")),
          asset.id,
        ).toBe(true);
      }
    }
  });

  it("exclusion rules reference existing assets", () => {
    for (const asset of GANESHA_ASSETS) {
      for (const excluded of asset.excludes ?? []) {
        expect(getAsset(excluded), `${asset.id} excludes ${excluded}`).toBeDefined();
      }
    }
  });

  it("resolves every asset referenced by the default configuration", () => {
    const config = createDefaultGaneshaConfiguration();
    for (const ref of Object.values(config.parts)) {
      if (!ref) continue;
      expect(resolveAssetRef(ref), ref.assetId).toBeDefined();
    }
    for (const attachment of config.attachments) {
      expect(resolveAssetRef(attachment.asset), attachment.asset.assetId).toBeDefined();
    }
  });

  it("every editor category slot/socket has at least one asset", () => {
    for (const category of GANESHA_EDITOR_CATEGORIES) {
      if (category.content.type === "parts" || category.content.type === "mixed") {
        for (const slot of category.content.slots) {
          expect(
            listAssets({ deity: "ganesha", slot }).length,
            `${category.id}/${slot}`,
          ).toBeGreaterThan(0);
        }
      }
      if (category.content.type === "sockets" || category.content.type === "mixed") {
        for (const socket of category.content.sockets) {
          expect(
            listAssets({ deity: "ganesha", socket }).length,
            `${category.id}/${socket}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });
});
