/**
 * Default Ganesha configuration. Asset ids here reference the placeholder
 * manifest in @devaform/asset-system; when production assets land only the
 * manifest and these ids change — the schema stays identical.
 */
import type { CharacterConfiguration } from "./configuration";
import { SCHEMA_VERSION } from "./configuration";

export function createDefaultGaneshaConfiguration(): CharacterConfiguration {
  return {
    schemaVersion: SCHEMA_VERSION,
    deity: "ganesha",
    parts: {
      body: { assetId: "ganesha.body.classic", version: 1 },
      head: { assetId: "ganesha.head.classic", version: 1 },
      ears: { assetId: "ganesha.ears.large", version: 1 },
      trunk: { assetId: "ganesha.trunk.leftCurl", version: 1 },
      tusks: { assetId: "ganesha.tusks.single", version: 1 },
      eyes: { assetId: "ganesha.eyes.serene", version: 1 },
      lowerGarment: { assetId: "ganesha.garment.dhoti", version: 1 },
      upperGarment: null,
      hair: null,
    },
    attachments: [
      { socket: "head.crown", asset: { assetId: "ganesha.crown.kirita", version: 1 } },
      { socket: "chest.necklace", asset: { assetId: "ganesha.necklace.haram", version: 1 } },
      { socket: "arm.frontLeft.hand.item", asset: { assetId: "ganesha.item.modak", version: 1 } },
      { socket: "arm.backRight.hand.item", asset: { assetId: "ganesha.item.axe", version: 1 } },
      { socket: "arm.backLeft.hand.item", asset: { assetId: "ganesha.item.lotus", version: 1 } },
    ],
    pose: {
      preset: "blessing",
      jointOverrides: {},
    },
    morphs: {},
    proportions: { height: 1, bulk: 1 },
    materials: {
      skin: { color: "#e8b88a", finish: "satin" },
      skinSecondary: { color: "#d49a6a", finish: "satin" },
      garment: { color: "#c2410c", finish: "matte" },
      garmentAccent: { color: "#facc15", finish: "satin" },
      metal: { color: "#eab308", finish: "metallic" },
      gem: { color: "#dc2626", finish: "polished" },
      base: { color: "#7c5c3b", finish: "matte" },
    },
    base: { style: "round" },
  };
}
