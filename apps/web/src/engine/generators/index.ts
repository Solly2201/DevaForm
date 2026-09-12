/**
 * Generator registries. The asset manifest references these ids; the rig
 * resolves procedural sources through them. GLB-sourced assets bypass this
 * entirely (see glbCache.ts).
 */
import type { AttachmentGenerator, PartGenerator } from "./types";
import { ganeshaBody, ganeshaHands } from "./body";
import { ganeshaEars, ganeshaEyes, ganeshaHead, ganeshaTrunk, ganeshaTusks } from "./head";
import { ganeshaDhoti, ganeshaShawl } from "./clothing";
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
  waistKamarband,
} from "./ornaments";
import { itemAxe, itemLotus, itemModak, itemPasha } from "./items";

export type { AttachmentGenerator, GeneratorContext, JointedPart, PartGenerator } from "./types";
export { makeHand } from "./body";
export { BASE_BUILDERS, BASE_TOP_HEIGHT } from "./bases";

export const PART_GENERATORS: Record<string, PartGenerator> = {
  "ganesha.body": ganeshaBody,
  "ganesha.head": ganeshaHead,
  "ganesha.eyes": ganeshaEyes,
  "ganesha.ears": ganeshaEars,
  "ganesha.trunk": ganeshaTrunk,
  "ganesha.tusks": ganeshaTusks,
  "ganesha.hands": ganeshaHands,
  "ganesha.dhoti": ganeshaDhoti,
  "ganesha.shawl": ganeshaShawl,
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
  "item.modak": itemModak,
  "item.lotus": itemLotus,
  "item.axe": itemAxe,
  "item.noose": itemPasha,
};
