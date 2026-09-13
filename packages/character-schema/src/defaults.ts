/**
 * Default deity configurations. Asset ids here reference the placeholder
 * manifests in @devaform/asset-system; when production assets land only the
 * manifests and these ids change — the schema stays identical.
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
      head: { assetId: "ganesha.head.sculpted", version: 1 },
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
          hair: { color: "#31241a", finish: "matte" },
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
      backLeft: { mudra: "pinch" },
      backRight: { mudra: "grip" },
    },
    arms: { count: 4 },
  };
}

export function createDefaultShivaConfiguration(): CharacterConfiguration {
  return {
    schemaVersion: SCHEMA_VERSION,
    deity: "shiva",
    parts: {
      body: { assetId: "shiva.body.classic", version: 1 },
      head: { assetId: "shiva.head.classic", version: 1 },
      eyes: { assetId: "shiva.eyes.serene", version: 1 },
      hair: { assetId: "shiva.jata.crown", version: 1 },
      hands: { assetId: "shiva.hands.classic", version: 1 },
      lowerGarment: { assetId: "shiva.garment.dhoti", version: 1 },
      // Bare-chested ascetic by default — the rudraksha and serpent read
      // against skin, as in classical iconography.
      upperGarment: null,
      earrings: { assetId: "ganesha.earrings.kundala", version: 1 },
      armlets: { assetId: "ganesha.armlets.vanki", version: 1 },
      bracelets: { assetId: "ganesha.bracelets.kada", version: 1 },
      anklets: { assetId: "ganesha.anklets.payal", version: 1 },
    },
    attachments: [
      { socket: "head.moon", asset: { assetId: "shiva.crescent.chandra", version: 1 } },
      { socket: "head.forehead", asset: { assetId: "shiva.thirdeye.trinetra", version: 1 } },
      { socket: "chest.necklace", asset: { assetId: "shiva.mala.rudraksha", version: 1 } },
      { socket: "arm.frontRight.hand.item", asset: { assetId: "shiva.attribute.trishul", version: 1 } },
      { socket: "arm.frontLeft.hand.item", asset: { assetId: "shiva.attribute.damaru", version: 1 } },
    ],
    pose: {
      preset: "shiva.standing",
      jointOverrides: {},
    },
    morphs: {},
    proportions: { height: 1, bulk: 1 },
    // Shiva's own default palette: fair ash-toned skin, matted brown jata,
    // ochre garment, antique gold — distinct from Ganesha's warm default.
    materials: {
      skin: { color: "#c8cfdb", finish: "satin" },
      skinSecondary: { color: "#a4adbd", finish: "satin" },
      hair: { color: "#4d3421", finish: "matte" },
      garment: { color: "#c9862e", finish: "satin" },
      garmentAccent: { color: "#8a5a1e", finish: "satin" },
      metal: { color: "#d8a636", finish: "metallic" },
      gem: { color: "#20643f", finish: "polished" },
      base: { color: "#5d5347", finish: "satin" },
    },
    base: { style: "round" },
    hands: {
      frontLeft: { mudra: "grip" },
      frontRight: { mudra: "grip" },
      backLeft: { mudra: "open" },
      backRight: { mudra: "open" },
    },
    arms: { count: 2 },
  };
}
