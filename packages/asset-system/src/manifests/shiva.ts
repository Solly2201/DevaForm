/**
 * Shiva asset manifest.
 *
 * Prototype-stage assets are procedural (generator ids resolved by the web
 * engine). Shared humanoid generators (body, hands, dhoti, shawl, eyes) are
 * referenced by their generic ids with Shiva-tuned parameters; only truly
 * Shiva-specific geometry (head, jata, crescent, third eye, rudraksha,
 * naga, trishul, damaru) has its own generators. Replacing any prototype
 * with a production sculpt means switching its `source` to a GLB path and
 * bumping `version` — nothing else changes.
 */
import type { AssetDefinition } from "../types";

const proto = { printSourceAvailable: false } as const;

const HAND_SOCKETS = [
  "arm.frontLeft.hand.item",
  "arm.frontRight.hand.item",
  "arm.backLeft.hand.item",
  "arm.backRight.hand.item",
] as const;

export const SHIVA_ASSETS: readonly AssetDefinition[] = [
  // ---- BODY -------------------------------------------------------------
  {
    id: "shiva.body.classic",
    version: 1,
    name: "Classic Body",
    description: "Balanced athletic build — broad shoulders, taut waist.",
    kind: { type: "part", slot: "body" },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "humanoid.athletic", params: { form: "athletic", chest: 1, waist: 1, shoulder: 1 } },
    materialZones: ["skin", "skinSecondary"],
    category: "body",
    printability: proto,
  },
  {
    id: "shiva.body.ascetic",
    version: 1,
    name: "Ascetic Body",
    description: "Lean tapasvin build of the mountain yogi.",
    kind: { type: "part", slot: "body" },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "humanoid.athletic", params: { form: "athletic", chest: 0.88, waist: 0.88, shoulder: 0.94 } },
    materialZones: ["skin", "skinSecondary"],
    category: "body",
    printability: proto,
  },
  {
    id: "shiva.body.mahayogi",
    version: 1,
    name: "Mahayogi Body",
    description: "Powerful broad-chested form.",
    kind: { type: "part", slot: "body" },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "humanoid.athletic", params: { form: "athletic", chest: 1.18, waist: 1.08, shoulder: 1.12 } },
    materialZones: ["skin", "skinSecondary"],
    category: "body",
    printability: proto,
  },

  // ---- HEAD -------------------------------------------------------------
  {
    id: "shiva.head.classic",
    version: 1,
    name: "Classic Head",
    description: "Serene divine face with human ears; jata is a separate hair asset.",
    kind: { type: "part", slot: "head" },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "shiva.head", params: {} },
    // The sculpt physically includes its ears — standalone ear parts (if a
    // configuration ever carried them) are suppressed, same rule as
    // complete Ganesha sculpts.
    integratedFeatures: ["ears"],
    materialZones: ["skin", "skinSecondary"],
    category: "head",
    printability: proto,
  },

  // ---- EYES -------------------------------------------------------------
  {
    id: "shiva.eyes.serene",
    version: 1,
    name: "Serene Eyes",
    description: "Half-lidded meditative gaze with kohl lining.",
    kind: { type: "part", slot: "eyes" },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: {
      kind: "procedural",
      generatorId: "humanoid.eyes",
      params: {
        lidCover: 1.38, gazeDown: 0.12, shapeX: 1.05, shapeY: 0.8, kohl: 1, iris: 1.0,
        // Placement on the Shiva head's brow surface (head-joint-local).
        baseY: 0.032, baseZ: 0.065, spacing: 0.027, eyeScale: 0.5, splay: 0.12,
      },
    },
    materialZones: ["skinSecondary"],
    morphTargets: ["eyeSize", "eyeSpacing", "eyeHeight", "browHeight"],
    category: "face",
    printability: proto,
  },
  {
    id: "shiva.eyes.open",
    version: 1,
    name: "Awakened Eyes",
    description: "Open, direct gaze.",
    kind: { type: "part", slot: "eyes" },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: {
      kind: "procedural",
      generatorId: "humanoid.eyes",
      params: {
        lidCover: 1.05, gazeDown: 0.06, shapeX: 1.0, shapeY: 0.9, kohl: 1, iris: 1.0,
        baseY: 0.032, baseZ: 0.065, spacing: 0.027, eyeScale: 0.5, splay: 0.12,
      },
    },
    materialZones: ["skinSecondary"],
    morphTargets: ["eyeSize", "eyeSpacing", "eyeHeight", "browHeight"],
    category: "face",
    printability: proto,
  },

  // ---- HAIR / JATA ------------------------------------------------------
  {
    id: "shiva.jata.crown",
    version: 1,
    name: "Jatamukuta",
    description: "Matted locks coiled into the ascetic's crown; seats the crescent.",
    kind: { type: "part", slot: "hair" },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "shiva.jata", params: { flowing: 0 } },
    materialZones: ["hair"],
    category: "head",
    printability: proto,
  },
  {
    id: "shiva.jata.flowing",
    version: 1,
    name: "Flowing Jata",
    description: "Jata crown with matted strands falling to the shoulders.",
    kind: { type: "part", slot: "hair" },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "shiva.jata", params: { flowing: 1 } },
    materialZones: ["hair"],
    category: "head",
    printability: proto,
  },

  // ---- HANDS ------------------------------------------------------------
  {
    id: "shiva.hands.classic",
    version: 1,
    name: "Classic Hands",
    description: "Sculpted hands; per-hand mudras set in the Hands panel.",
    kind: { type: "part", slot: "hands" },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "humanoid.hands" },
    materialZones: ["skin"],
    category: "hands",
    printability: proto,
  },

  // ---- CLOTHING ---------------------------------------------------------
  {
    id: "shiva.garment.dhoti",
    version: 1,
    name: "Pleated Dhoti",
    description: "Full-length pleated dhoti.",
    kind: { type: "part", slot: "lowerGarment" },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "humanoid.dhoti", params: { length: 1, layered: 0 } },
    materialZones: ["garment", "garmentAccent"],
    category: "clothing",
    printability: proto,
  },
  {
    id: "shiva.garment.dhotiShort",
    version: 1,
    name: "Short Dhoti",
    description: "Knee-length ascetic wrap. A true tiger-skin drape awaits a production asset.",
    kind: { type: "part", slot: "lowerGarment" },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "humanoid.dhoti", params: { length: 0.5, layered: 0 } },
    materialZones: ["garment", "garmentAccent"],
    category: "clothing",
    printability: proto,
  },
  {
    id: "shiva.garment.uttariya",
    version: 1,
    name: "Uttariya",
    description: "Cloth draped across the chest.",
    kind: { type: "part", slot: "upperGarment" },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "humanoid.shawl" },
    materialZones: ["garmentAccent"],
    category: "clothing",
    printability: proto,
  },

  // ---- HEAD ORNAMENTS (attachments) --------------------------------------
  {
    id: "shiva.crescent.chandra",
    version: 1,
    name: "Crescent Moon",
    description: "Chandra resting in the jata. Seats on the hair's crescent socket.",
    kind: { type: "attachment", sockets: ["head.moon"] },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "ornament.crescent" },
    materialZones: ["metal"],
    category: "ornaments",
    printability: proto,
  },
  {
    id: "shiva.thirdeye.trinetra",
    version: 1,
    name: "Third Eye",
    description: "The vertical trinetra on the forehead; the head part refines the socket onto its brow surface.",
    kind: { type: "attachment", sockets: ["head.forehead"] },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "ornament.thirdeye" },
    materialZones: [],
    category: "face",
    printability: proto,
  },

  // ---- NECK ORNAMENTS (attachments) ---------------------------------------
  {
    id: "shiva.mala.rudraksha",
    version: 1,
    name: "Rudraksha Mala",
    description: "Twin strands of rudraksha beads draped on the chest. Bead color is the seed's own (not zone-recolorable).",
    kind: { type: "attachment", sockets: ["chest.necklace"] },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "ornament.rudraksha" },
    materialZones: ["metal"],
    category: "ornaments",
    printability: proto,
  },
  {
    id: "shiva.ornament.naga",
    version: 1,
    name: "Naga Torque",
    description: "Serpent ornament coiled around the neck, hood raised at the shoulder.",
    kind: { type: "attachment", sockets: ["chest.necklace"] },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "ornament.naga" },
    materialZones: ["metal", "gem"],
    category: "ornaments",
    printability: proto,
  },

  // ---- ATTRIBUTES (hand-held attachments) ---------------------------------
  {
    id: "shiva.attribute.trishul",
    version: 1,
    name: "Trishul",
    description: "The trident of the three energies.",
    kind: { type: "attachment", sockets: HAND_SOCKETS },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "item.trishul" },
    // A hand grips the shaft and slides along it as the arm moves. It may
    // go a quarter of a metre up before the shaft stops being shaft — the
    // generator builds the trident head above exactly this, so the number
    // and the geometry cannot disagree.
    grip: { mudra: "grip", travel: { up: 0.24, down: 0.24 } },
    // The icon's trishul stands: vertical, head up, butt on the ground,
    // whatever the wrist is doing.
    presentation: { upright: true, grounded: true },
    materialZones: ["metal"],
    category: "attributes",
    printability: proto,
  },
  {
    id: "shiva.attribute.damaru",
    version: 1,
    name: "Damaru",
    description: "The two-headed drum of creation's rhythm.",
    kind: { type: "attachment", sockets: HAND_SOCKETS },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "item.damaru" },
    // Pinched at the waist, not fisted: a drum is held between thumb and
    // fingers, and a hand closed all the way round it would have to close
    // through the drum heads.
    grip: { mudra: "pinch" },
    // A damaru hangs from the fist that holds its waist: heads up and
    // down, hourglass in profile. Without this it turns with the wrist
    // and presents a drum head to the viewer like a medallion.
    presentation: { upright: true },
    materialZones: ["garmentAccent", "metal"],
    category: "attributes",
    printability: proto,
  },
] as const;
