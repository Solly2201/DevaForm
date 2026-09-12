import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { safeValidateConfiguration, createDefaultGaneshaConfiguration } from "@devaform/character-schema";
import { validateAssetSidecar } from "../dataset";
import { getAsset, resolveAssetRef } from "../registry";
import { getProvenance, type AssetDefinition } from "../types";

const here = path.dirname(fileURLToPath(import.meta.url));
const webPublic = path.resolve(here, "..", "..", "..", "..", "apps", "web", "public");

const GLB_ASSET_IDS = [
  "ganesha.head.sculpted",
  "ganesha.companion.mushak",
  "ganesha.companion.kalash",
];

describe("dataset sidecars", () => {
  it("every GLB asset has a valid asset.json sidecar that matches the registry", () => {
    for (const id of GLB_ASSET_IDS) {
      const asset = getAsset(id);
      expect(asset?.source.kind).toBe("glb");
      if (asset?.source.kind !== "glb") continue;
      const sidecarPath = path.join(
        webPublic,
        path.dirname(asset.source.path.replace(/^\//, "")),
        "asset.json",
      );
      const sidecar = validateAssetSidecar(JSON.parse(readFileSync(sidecarPath, "utf8")));
      expect(sidecar.id).toBe(asset.id);
      expect(sidecar.version).toBe(asset.version);
      expect(sidecar.stage).toBe(asset.stage);
      expect(sidecar.provenance.type).toBeDefined();
    }
  });
});

describe("provenance", () => {
  it("GLB assets declare explicit provenance", () => {
    for (const id of GLB_ASSET_IDS) {
      const asset = getAsset(id);
      expect(asset?.provenance?.type, id).toBeDefined();
    }
  });

  it("procedural assets default to procedural provenance", () => {
    const asset = getAsset("ganesha.crown.kirita");
    expect(asset).toBeDefined();
    if (!asset) return;
    const provenance = getProvenance(asset);
    expect(provenance.type).toBe("procedural");
    expect(provenance.tool).toContain("crown.kirita");
  });
});

describe("artist replacement (architecture proof)", () => {
  it("an artist v2 replaces an AI/procedural v1 without any engine change", () => {
    const v1 = getAsset("ganesha.companion.kalash");
    expect(v1).toBeDefined();
    if (!v1) return;

    // The hypothetical artist delivery: same id, bumped version, new file,
    // new provenance. Nothing else in the platform changes shape.
    const v2: AssetDefinition = {
      ...v1,
      version: 2,
      stage: "review",
      source: { kind: "glb", path: "/assets/ganesha/companion/kalash/2/model.glb" },
      provenance: { type: "artist", creator: "Studio Artist", tool: "Blender" },
      supersedes: undefined,
    };
    // Type-level proof: v2 is a plain AssetDefinition — no parallel "AI
    // asset" type exists. Sidecar contract accepts it too.
    const sidecar = validateAssetSidecar({
      id: v2.id,
      version: 2,
      name: v2.name,
      deity: "ganesha",
      category: "companion",
      kind: { type: "attachment", sockets: ["base.platform"] },
      stage: "review",
      provenance: { type: "artist", creator: "Studio Artist" },
      materialZones: [...v2.materialZones],
      printability: { printSourceAvailable: false },
    });
    expect(sidecar.provenance.type).toBe("artist");

    // A configuration saved against v1 still validates and resolves —
    // saved creations pin their version and never break on replacement.
    const config = createDefaultGaneshaConfiguration();
    const withKalash = {
      ...config,
      attachments: [
        ...config.attachments,
        { socket: "base.platform", asset: { assetId: "ganesha.companion.kalash", version: 1 } },
      ],
    };
    expect(safeValidateConfiguration(withKalash).success).toBe(true);
    expect(
      resolveAssetRef({ assetId: "ganesha.companion.kalash", version: 1 }),
    ).toBeDefined();
  });
});
