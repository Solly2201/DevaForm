import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDefaultGaneshaConfiguration } from "@devaform/character-schema";
import { getAsset, resolveAssetRef } from "../registry";

const here = path.dirname(fileURLToPath(import.meta.url));
const webPublic = path.resolve(here, "..", "..", "..", "..", "apps", "web", "public");

describe("hero GLB assets", () => {
  it("the sculpted classic head is registered as an experimental GLB head", () => {
    const head = getAsset("ganesha.head.sculpted");
    expect(head).toBeDefined();
    expect(head?.stage).toBe("experimental");
    expect(head?.kind).toEqual({ type: "part", slot: "head" });
    expect(head?.source.kind).toBe("glb");
  });

  it("every GLB-sourced asset's file exists on disk", () => {
    for (const id of ["ganesha.head.sculpted", "ganesha.companion.mushak"]) {
      const asset = getAsset(id);
      expect(asset?.source.kind).toBe("glb");
      if (asset?.source.kind !== "glb") continue;
      const file = path.join(webPublic, asset.source.path.replace(/^\//, ""));
      expect(existsSync(file), `${id}: ${file}`).toBe(true);
    }
  });

  it("the default configuration uses the sculpted head and still resolves fully", () => {
    const config = createDefaultGaneshaConfiguration();
    expect(config.parts.head?.assetId).toBe("ganesha.head.sculpted");
    for (const ref of Object.values(config.parts)) {
      if (ref) expect(resolveAssetRef(ref), ref.assetId).toBeDefined();
    }
  });

  it("the prototype head remains available as a fallback", () => {
    const prototype = getAsset("ganesha.head.classic");
    expect(prototype).toBeDefined();
    expect(prototype?.stage).toBe("prototype");
  });
});
