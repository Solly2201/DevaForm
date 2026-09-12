/**
 * Default Ganesha configuration. Asset ids here reference the placeholder
 * manifest in @devaform/asset-system; when production assets land only the
 * manifest and these ids change — the schema stays identical.
 */
import type { CharacterConfiguration } from "./configuration";
import { SCHEMA_VERSION } from "./configuration";
import { MATERIAL_PALETTES } from "./palettes";

export function createDefaultGaneshaConfiguration(): CharacterConfiguration {
  const traditional = MATERIAL_PALETTES[0];
  return {
    schemaVersion: SCHEMA_VERSION,
    deity: "ganesha",
    parts: {
      body: { assetId: "ganesha.body.classic", version: 2 },
      head: { assetId: "ganesha.head.classic", version: 2 },
      ears: { assetId: "ganesha.ears.large", version: 2 },
      trunk: { assetId: "ganesha.trunk.leftCurl", version: 2 },
      tusks: { assetId: "ganesha.tusks.single", version: 2 },
      eyes: { assetId: "ganesha.eyes.serene", version: 2 },
      hands: { assetId: "ganesha.hands.classic", version: 1 },
      lowerGarment: { assetId: "ganesha.garment.dhoti", version: 2 },
      upperGarment: { assetId: "ganesha.garment.shawl", version: 2 },
      earrings: { assetId: "ganesha.earrings.kundala", version: 1 },
      armlets: { assetId: "ganesha.armlets.vanki", version: 1 },
      bracelets: { assetId: "ganesha.bracelets.kada", version: 1 },
      anklets: { assetId: "ganesha.anklets.payal", version: 1 },
      hair: null,
    },
    attachments: [
      { socket: "head.crown", asset: { assetId: "ganesha.crown.kirita", version: 2 } },
      { socket: "chest.necklace", asset: { assetId: "ganesha.necklace.haram", version: 2 } },
      { socket: "waist.ornament", asset: { assetId: "ganesha.waist.kamarband", version: 2 } },
      { socket: "arm.frontLeft.hand.item", asset: { assetId: "ganesha.item.modak", version: 2 } },
      { socket: "arm.backRight.hand.item", asset: { assetId: "ganesha.item.axe", version: 2 } },
      { socket: "arm.backLeft.hand.item", asset: { assetId: "ganesha.item.lotus", version: 2 } },
    ],
    pose: {
      preset: "blessing",
      jointOverrides: {},
    },
    morphs: {},
    proportions: { height: 1, bulk: 1 },
    materials: traditional
      ? structuredClone(traditional.materials)
      : {
          skin: { color: "#d99a63", finish: "satin" },
          skinSecondary: { color: "#b97946", finish: "satin" },
          garment: { color: "#9c1c20", finish: "satin" },
          garmentAccent: { color: "#d99b26", finish: "satin" },
          metal: { color: "#e8ae32", finish: "metallic" },
          gem: { color: "#b81e2d", finish: "polished" },
          base: { color: "#7d5c3a", finish: "satin" },
        },
    base: { style: "lotus" },
    hands: {
      frontLeft: { mudra: "hold" },
      frontRight: { mudra: "abhaya" },
      backLeft: { mudra: "hold" },
      backRight: { mudra: "hold" },
    },
    arms: { count: 4 },
  };
}
