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

/**
 * The Classic build, as weights on the human body's own morph targets.
 * Kept in step with the deity's `bodyVariants` by a test — a default that
 * is not one of the offered variants is a fourth variant nobody chose.
 */
export const SHIVA_DEFAULT_MORPHS: Readonly<Record<string, number>> = {
  bodyHeroic: 0.85,
  bodyPowerful: 0.35,
  bodyAscetic: 0.3,
  faceDivine: 1,
};

export function createDefaultShivaConfiguration(): CharacterConfiguration {
  return {
    schemaVersion: SCHEMA_VERSION,
    deity: "shiva",
    parts: {
      // The human mesh: one continuous skinned body with its own head,
      // face, eyes and hands. The head/eyes/hands slots are left empty
      // because this body already has them — see integratedFeatures.
      body: { assetId: "humanoid.body.human", version: 1 },
      head: null,
      eyes: null,
      hair: { assetId: "shiva.jata.flowing", version: 1 },
      hands: null,
      // The skin IS the garment. A cream dhoti under it made the hide
      // read as a belt over a cream cylinder; the layered dhoti-and-hide
      // of ref3 is still offered, and still loads for anything saved
      // with it.
      lowerGarment: { assetId: "shiva.garment.vyaghracharma", version: 1 },
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
      { socket: "head.forehead", asset: { assetId: "shiva.forehead.trinetra", version: 1 } },
      { socket: "chest.necklace", asset: { assetId: "shiva.ornament.naga", version: 1 } },
      { socket: "chest.mala", asset: { assetId: "shiva.mala.rudraksha", version: 1 } },
      { socket: "arm.frontRight.hand.item", asset: { assetId: "shiva.attribute.trishul", version: 1 } },
      { socket: "arm.frontLeft.hand.item", asset: { assetId: "shiva.attribute.damaru", version: 1 } },
    ],
    pose: {
      preset: "shiva.standing",
      jointOverrides: {},
    },
    morphs: { ...SHIVA_DEFAULT_MORPHS },
    proportions: { height: 1, bulk: 1 },
    // Ash-pale skin, matted brown jata, CREAM cloth with an ochre sash and
    // a spotted hide over it — the layering references/ref3.png shows. The
    // garment zone used to be the ochre itself, which left the reference's
    // cream underlayer with nowhere to come from.
    materials: {
      // Ash, which is a pale blue-grey and not white. At satin finish
      // under studio light #c8cfdb rendered as paper; the reference's
      // skin keeps a visible blue cast in the lit areas.
      skin: { color: "#aebbd0", finish: "satin" },
      skinSecondary: { color: "#8e9cb3", finish: "satin" },
      hair: { color: "#4a3324", finish: "matte" },
      garment: { color: "#ece0c8", finish: "matte" },
      garmentAccent: { color: "#c9862e", finish: "satin" },
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

/**
 * Vishnu's default: a standing figure with the four attributes in the four
 * hands his body now has.
 *
 * The skin is the deep blue of the reference, satin rather than polished —
 * a gloss on blue reads as plastic. The dhoti is the shared wrap in
 * Vishnu's colours, and the ornament is the existing slots used densely,
 * which is what the iconography asks for and what the engine already does.
 */
export const VISHNU_DEFAULT_MORPHS: Readonly<Record<string, number>> = {
  // Graceful, not a strongman: the reference's torso is athletic and
  // composed, nothing like Shiva's mahayogi build.
  bodyAthletic: 0.5,
  bodyHeroic: 0.25,
  faceDivine: 1,
};

export function createDefaultVishnuConfiguration(): CharacterConfiguration {
  return {
    schemaVersion: SCHEMA_VERSION,
    deity: "vishnu",
    parts: {
      // The four-armed mesh: one body, four arms, its own head, face,
      // eyes and hands — so those slots stay empty, as they do for the
      // two-armed one.
      body: { assetId: "humanoid.body.human4", version: 1 },
      head: null,
      eyes: null,
      hair: { assetId: "vishnu.hair.flowing", version: 1 },
      hands: null,
      lowerGarment: { assetId: "vishnu.garment.dhoti", version: 1 },
      upperGarment: null,
      earrings: { assetId: "ganesha.earrings.kundala", version: 1 },
      armlets: { assetId: "ganesha.armlets.vanki", version: 1 },
      bracelets: { assetId: "ganesha.bracelets.kada", version: 1 },
      anklets: { assetId: "ganesha.anklets.payal", version: 1 },
    },
    attachments: [
      { socket: "head.crown", asset: { assetId: "vishnu.crown.kirita", version: 1 } },
      { socket: "head.forehead", asset: { assetId: "vishnu.forehead.tilaka", version: 1 } },
      { socket: "chest.mala", asset: { assetId: "vishnu.garland.vaijayanti", version: 1 } },
      // Front pair low: the mace steadied on the ground, the lotus held
      // out. Back pair raised: the discus and the conch.
      { socket: "arm.frontRight.hand.item", asset: { assetId: "vishnu.attribute.gada", version: 1 } },
      { socket: "arm.frontLeft.hand.item", asset: { assetId: "vishnu.attribute.padma", version: 1 } },
      { socket: "arm.backRight.hand.item", asset: { assetId: "vishnu.attribute.chakra", version: 1 } },
      { socket: "arm.backLeft.hand.item", asset: { assetId: "vishnu.attribute.shankha", version: 1 } },
    ],
    pose: { preset: "vishnu.regal", jointOverrides: {} },
    morphs: { ...VISHNU_DEFAULT_MORPHS },
    proportions: { height: 1, bulk: 1 },
    // The reference's own palette panel: divine blue that is MUTED — a
    // slate with the light in it, not a saturated plastic — sacred gold,
    // yellow garment, red accents, green gemstones, near-black hair, and
    // a cream lotus pedestal.
    materials: {
      skin: { color: "#7b8db8", finish: "satin" },
      skinSecondary: { color: "#66779e", finish: "satin" },
      hair: { color: "#241a12", finish: "matte" },
      garment: { color: "#e3a41f", finish: "satin" },
      garmentAccent: { color: "#b23327", finish: "satin" },
      metal: { color: "#d9a63b", finish: "metallic" },
      gem: { color: "#20643f", finish: "polished" },
      base: { color: "#ded1b6", finish: "matte" },
    },
    base: { style: "lotus" },
    hands: {
      frontLeft: { mudra: "pinch" },
      frontRight: { mudra: "grip" },
      backLeft: { mudra: "hold" },
      backRight: { mudra: "hold" },
    },
    arms: { count: 4 },
  };
}
