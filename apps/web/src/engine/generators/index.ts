/**
 * Generator registries. The asset manifest references these ids; the rig
 * resolves procedural sources through them. GLB-sourced assets bypass this
 * entirely (see glbCache.ts).
 */
import type { AttachmentGenerator, PartGenerator } from "./types";
import { humanoidBody, humanoidHands } from "./body";
import { athleticBody } from "./bodyAthletic";
import { ganeshaEars, classicEyes, ganeshaHead, ganeshaTrunk, ganeshaTusks } from "./head";
import { humanoidHideWrap } from "./hideGarment";
import {
  itemChakra,
  itemGada,
  itemPadma,
  itemShankha,
  ornamentKirita,
  ornamentVaijayanti,
} from "./vishnu";
import { humanoidDhoti, humanoidShawl } from "./clothing";
import {
  ankletsPayal,
  armletsVanki,
  braceletsKada,
  crownFan,
  crownKaranda,
  crownKirita,
  earringsKundala,
  necklaceHaram,
  necklaceMala,
  tikkaChandra,
  waistKamarband,
} from "./ornaments";
import { itemAnkush, itemAxe, itemLotus, itemModak, itemPasha } from "./items";
import {
  itemDamaru,
  itemTrishul,
  ornamentCrescent,
  ornamentNaga,
  ornamentRudraksha,
  ornamentThirdEye,
  ornamentTrinetraTripundra,
  ornamentTripundra,
  shivaHead,
  shivaJata,
} from "./shiva";

export type {
  AttachmentGenerator,
  GeneratorContext,
  HeldItemSpec,
  JointedPart,
  PartGenerator,
  SocketRefinement,
} from "./types";
export { deriveBodyProfile, type BodyProfile } from "./bodyProfile";
export { makeHand } from "./body";
export { BASE_BUILDERS, BASE_TOP_HEIGHT } from "./bases";

export const PART_GENERATORS: Record<string, PartGenerator> = {
  // Shared humanoid generators — parameterized by manifest data, used by
  // any deity whose anatomy they fit.
  "humanoid.body": humanoidBody,
  "humanoid.athletic": athleticBody,
  "humanoid.hands": humanoidHands,
  "humanoid.dhoti": humanoidDhoti,
  "humanoid.hideWrap": humanoidHideWrap,
  "humanoid.shawl": humanoidShawl,
  "humanoid.eyes": classicEyes,
  // Ganesha anatomy
  "ganesha.head": ganeshaHead,
  "ganesha.ears": ganeshaEars,
  "ganesha.trunk": ganeshaTrunk,
  "ganesha.tusks": ganeshaTusks,
  // Shiva anatomy
  "shiva.head": shivaHead,
  "shiva.jata": shivaJata,
  // Shared ornament sets
  "ornament.earrings": earringsKundala,
  "ornament.armlets": armletsVanki,
  "ornament.bracelets": braceletsKada,
  "ornament.anklets": ankletsPayal,
};

export const ATTACHMENT_GENERATORS: Record<string, AttachmentGenerator> = {
  "crown.kirita": crownKirita,
  "crown.karanda": crownKaranda,
  "crown.fan": crownFan,
  "ornament.necklace": necklaceHaram,
  "ornament.mala": necklaceMala,
  "ornament.waistband": waistKamarband,
  "ornament.tikka": tikkaChandra,
  "ornament.crescent": ornamentCrescent,
  "ornament.thirdeye": ornamentThirdEye,
  "ornament.tripundra": ornamentTripundra,
  "ornament.trinetraTripundra": ornamentTrinetraTripundra,
  "ornament.rudraksha": ornamentRudraksha,
  "ornament.naga": ornamentNaga,
  "item.modak": itemModak,
  "item.lotus": itemLotus,
  "item.axe": itemAxe,
  "item.noose": itemPasha,
  "item.ankush": itemAnkush,
  "item.trishul": itemTrishul,
  // Vishnu — prepared, not offered. Shapes only: how each is held is the
  // manifest's business and the resolver's.
  "vishnu.gada": itemGada,
  "vishnu.chakra": itemChakra,
  "vishnu.shankha": itemShankha,
  "vishnu.padma": itemPadma,
  "vishnu.crown": ornamentKirita,
  "vishnu.garland": ornamentVaijayanti,

  "item.damaru": itemDamaru,
};
