/**
 * EXPERIMENT — spatial occupancy metadata is data, and only data.
 *
 * Two properties matter at this layer: the vocabulary survives
 * serialization exactly (an asset sidecar is JSON), and adding the field
 * changed NOTHING for the assets that exist — no manifest gained a
 * claim, and the resolver's answers are the same sentences they were.
 */
import { describe, expect, it } from "vitest";
import { createDefaultShivaConfiguration } from "@devaform/character-schema";
import { getAsset } from "../registry";
import { resolveCharacterPresentation } from "../resolve";
import {
  validateSpatialOccupancy,
  voidOfAnnulus,
  type SpatialOccupancy,
} from "../spatial";
import type { AssetDefinition } from "../types";

const ringOccupancy: SpatialOccupancy = {
  regions: [
    {
      kind: "occupied",
      label: "ring",
      primitive: {
        shape: "annulus",
        center: [0, 0, 0],
        axis: [0, 1, 0],
        innerRadius: 0.028,
        outerRadius: 0.034,
        halfHeight: 0.004,
      },
    },
    {
      kind: "void",
      label: "hole",
      primitive: {
        shape: "cylinder",
        center: [0, 0, 0],
        axis: [0, 1, 0],
        radius: 0.028,
        halfHeight: 0.004,
      },
    },
    {
      kind: "contact",
      label: "seat",
      primitive: { shape: "sphere", center: [0, -0.03, 0], radius: 0.01 },
    },
  ],
};

describe("spatial occupancy serializes", () => {
  it("round-trips through JSON byte-for-byte and validates clean", () => {
    const json = JSON.stringify(ringOccupancy);
    const revived = JSON.parse(json) as SpatialOccupancy;
    expect(revived).toEqual(ringOccupancy);
    expect(JSON.stringify(revived)).toBe(json);
    expect(validateSpatialOccupancy(revived)).toEqual([]);
  });

  it("the void an annulus keeps is derivable, not authored twice", () => {
    const annulus = ringOccupancy.regions[0]!.primitive;
    if (annulus.shape !== "annulus") throw new Error("fixture changed");
    expect(voidOfAnnulus(annulus)).toEqual(ringOccupancy.regions[1]!.primitive);
  });

  it("rides on an AssetDefinition without changing what the definition means", () => {
    const bearer: AssetDefinition = {
      id: "shared.test.ring",
      version: 1,
      name: "Test ring",
      kind: { type: "attachment", sockets: ["chest.necklace"] },
      deityCompatibility: ["any"],
      stage: "experimental",
      source: { kind: "procedural", generatorId: "test.none" },
      materialZones: ["metal"],
      category: "test",
      printability: { printSourceAvailable: false },
      spatial: ringOccupancy,
    };
    const revived = JSON.parse(JSON.stringify(bearer)) as AssetDefinition;
    expect(revived.spatial).toEqual(ringOccupancy);
    expect(validateSpatialOccupancy(revived.spatial)).toEqual([]);
  });
});

describe("no shipped asset gained a spatial claim", () => {
  it("the experiment's field is absent from every asset the resolver touches", () => {
    const resolved = resolveCharacterPresentation(createDefaultShivaConfiguration());
    for (const attachment of resolved.attachments) {
      expect(attachment.asset.spatial, attachment.asset.id).toBeUndefined();
    }
    expect(getAsset("shiva.attribute.trishul")?.spatial).toBeUndefined();
    expect(getAsset("shiva.ornament.naga")?.spatial).toBeUndefined();
  });
});
