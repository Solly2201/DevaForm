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
import { grounded, handheld, wearable } from "../presentation";
import type { AssetDefinition } from "../types";

const proto = { printSourceAvailable: false } as const;

/**
 * Geometry facts the attributes' generators build to, stated once so the
 * manifest and the mesh cannot drift apart. The generators import these;
 * tests hold the geometry to them.
 */
/** Half-thickness of the trishul's shaft where a hand closes on it. */
export const TRISHUL_SHAFT_RADIUS = 0.008;
/** How far a fist may slide along that shaft before reaching the trident. */
export const TRISHUL_TRAVEL = 0.24;
/** Half-thickness of the damaru at its waist — the only part a hand grips. */
export const DAMARU_WAIST_RADIUS = 0.0062;
/** Half-length of that waist, before the drum flares. */
// Long enough for a hand. A drum whose waist is eighteen millimetres is
// gripped by fingers that span thirty, so the outer two run into the
// flare — which is not a placement problem to be nudged away but a drum
// with no handle on it.
export const DAMARU_WAIST_HALF = 0.014;

const HAND_SOCKETS = [
  "arm.frontLeft.hand.item",
  "arm.frontRight.hand.item",
  "arm.backLeft.hand.item",
  "arm.backRight.hand.item",
] as const;

export const SHIVA_ASSETS: readonly AssetDefinition[] = [
  // ---- BODY -------------------------------------------------------------
  // The three procedural builds below are SUPERSEDED by humanoid.body.human
  // plus its body variants — one mesh at three girths, which is what
  // references/ref3.png actually shows. They stay registered because
  // `deprecated` means exactly that: kept so a saved character naming one
  // still loads, share links included. They are not offered.
  {
    id: "shiva.body.classic",
    version: 1,
    name: "Classic Body (stylised)",
    description: "Balanced athletic build — the earlier primitive-assembled figure.",
    kind: { type: "part", slot: "body" },
    deityCompatibility: ["shiva"],
    stage: "deprecated",
    supersededBy: "humanoid.body.human",
    source: { kind: "procedural", generatorId: "humanoid.athletic", params: { form: "athletic", chest: 1, waist: 1, shoulder: 1 } },
    materialZones: ["skin", "skinSecondary"],
    category: "body",
    printability: proto,
  },
  {
    id: "shiva.body.ascetic",
    version: 1,
    name: "Ascetic Body (stylised)",
    description: "Lean tapasvin build of the mountain yogi.",
    kind: { type: "part", slot: "body" },
    deityCompatibility: ["shiva"],
    stage: "deprecated",
    supersededBy: "humanoid.body.human",
    source: { kind: "procedural", generatorId: "humanoid.athletic", params: { form: "athletic", chest: 0.88, waist: 0.88, shoulder: 0.94 } },
    materialZones: ["skin", "skinSecondary"],
    category: "body",
    printability: proto,
  },
  {
    id: "shiva.body.mahayogi",
    version: 1,
    name: "Mahayogi Body (stylised)",
    description: "Powerful broad-chested form.",
    kind: { type: "part", slot: "body" },
    deityCompatibility: ["shiva"],
    stage: "deprecated",
    supersededBy: "humanoid.body.human",
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
    // Superseded: the mesh body carries its own head.
    stage: "deprecated",
    supersededBy: "humanoid.body.human",
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
    // Superseded: the mesh body carries its own eyes.
    stage: "deprecated",
    supersededBy: "humanoid.body.human",
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
    // Superseded: the mesh body carries its own eyes.
    stage: "deprecated",
    supersededBy: "humanoid.body.human",
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
    description:
      "The reference silhouette: the ascetic's coiled crown with the mane falling down the back and locks brought forward over each shoulder.",
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
    // Superseded: the mesh body carries its own hands.
    stage: "deprecated",
    supersededBy: "humanoid.body.human",
    source: { kind: "procedural", generatorId: "humanoid.hands" },
    materialZones: ["skin"],
    category: "hands",
    printability: proto,
  },

  // ---- CLOTHING ---------------------------------------------------------
  {
    id: "shiva.garment.tigerHide",
    version: 1,
    name: "Dhoti and Tiger Hide",
    description:
      "The reference dress: cream dhoti to the ankle, the spotted hide slung over the hips and thighs, ochre sash with a long hanging panel.",
    kind: { type: "part", slot: "lowerGarment" },
    deityCompatibility: ["shiva"],
    stage: "integration",
    source: {
      kind: "procedural",
      generatorId: "humanoid.hideWrap",
      params: { length: 1, hide: 1, dhoti: 1, drape: 1 },
    },
    provenance: {
      type: "procedural",
      tool: "apps/web/src/engine/generators/hideGarment.ts",
      references: ["references/ref3.png", "references/reference_mid.png"],
      notes:
        "Every surface is lofted from the wearer's own measured hips, thighs, knees and calves. Split at the hip and the knee so each piece rides the bone beneath it, which is what keeps a folded leg inside its cloth.",
    },
    materialZones: ["garment", "garmentAccent", "metal"],
    category: "clothing",
    printability: {
      printSourceAvailable: false,
      minStatueHeightMm: 150,
      notes: "Torn hems and folds are 3-8 mm of relief at 1 m scale.",
    },
  },
  {
    id: "shiva.garment.dhoti",
    version: 2,
    name: "Pleated Dhoti",
    description: "Cream dhoti to the ankle with an ochre sash — no hide.",
    kind: { type: "part", slot: "lowerGarment" },
    deityCompatibility: ["shiva"],
    stage: "integration",
    source: {
      kind: "procedural",
      generatorId: "humanoid.hideWrap",
      params: { length: 1, hide: 0, dhoti: 1, drape: 1 },
    },
    materialZones: ["garment", "garmentAccent", "metal"],
    category: "clothing",
    printability: {
      printSourceAvailable: false,
      minStatueHeightMm: 150,
    },
  },
  {
    id: "shiva.garment.dhotiShort",
    version: 2,
    name: "Short Dhoti",
    description: "Knee-length ascetic wrap over the hips.",
    kind: { type: "part", slot: "lowerGarment" },
    deityCompatibility: ["shiva"],
    stage: "integration",
    source: {
      kind: "procedural",
      generatorId: "humanoid.hideWrap",
      params: { length: 0.6, hide: 1, dhoti: 0.55, drape: 0 },
    },
    materialZones: ["garment", "garmentAccent", "metal"],
    category: "clothing",
    printability: {
      printSourceAvailable: false,
      minStatueHeightMm: 150,
    },
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

  {
    id: "shiva.forehead.trinetra",
    version: 1,
    name: "Third Eye and Tripundra",
    description:
      "The reference brow: three horizontal bands of vibhuti with the vertical trinetra set between them.",
    kind: { type: "attachment", sockets: ["head.forehead"] },
    deityCompatibility: ["shiva"],
    stage: "integration",
    source: { kind: "procedural", generatorId: "ornament.trinetraTripundra" },
    provenance: {
      type: "procedural",
      tool: "apps/web/src/engine/generators/shiva.ts",
      references: ["references/ref3.png"],
    },
    materialZones: [],
    category: "face",
    printability: {
      printSourceAvailable: false,
      minStatueHeightMm: 150,
      notes: "Ash relief under 2 mm at 1 m scale; needs a minimum print size to survive.",
    },
  },
  {
    id: "shiva.tilak.tripundra",
    version: 1,
    name: "Tripundra",
    description:
      "The three horizontal bands of vibhuti across the brow. Ash on skin: millimetres of relief, curved to the forehead it lies on.",
    kind: { type: "attachment", sockets: ["head.forehead"] },
    deityCompatibility: ["shiva"],
    stage: "integration",
    source: { kind: "procedural", generatorId: "ornament.tripundra" },
    materialZones: [],
    category: "face",
    printability: {
      printSourceAvailable: false,
      minStatueHeightMm: 150,
      notes: "Relief under 2 mm at 1 m scale; needs a minimum print size to survive.",
    },
  },

  // ---- NECK ORNAMENTS (attachments) ---------------------------------------
  {
    id: "shiva.mala.rudraksha",
    version: 1,
    name: "Rudraksha Mala",
    description: "Twin strands of rudraksha beads draped on the chest. Bead color is the seed's own (not zone-recolorable).",
    // The mala seat, not the collar: a naga torque wraps the throat and
    // the beads hang below it, and the reference wears both.
    kind: { type: "attachment", sockets: ["chest.mala"] },
    deityCompatibility: ["shiva"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "ornament.rudraksha" },
    presentations: [
      wearable({
        id: "draped",
        label: "Draped on the chest",
        socket: "chest.mala",
        // A bead rests against the skin; the strand is checked to stay
        // outside it by at least this much on every bearing it crosses.
        clearanceM: 0.002,
      }),
    ],
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
    presentations: [
      wearable({
        id: "coiled",
        label: "Coiled at the neck",
        socket: "chest.necklace",
        // The serpent's belly runs this far off the skin the whole way
        // round — see walkSurface, which is given the gap PLUS the girth
        // so it is the scales that clear the body, not the centre line.
        clearanceM: 0.004,
      }),
    ],
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
    // Two legitimate relationships, in preference order. The asset is one
    // asset; only its relationship to the figure changes.
    presentations: [
      handheld({
        id: "handheldShaft",
        label: "Held by the shaft",
        hand: "grip",
        // Its butt is on the ground and the hand only steadies it — which
        // is why raising the arm slides the hand UP the shaft instead of
        // lifting the whole trident into the air.
        support: "ground",
        // The grip is ON THE SHAFT, and a planted staff slides through the
        // fist as the arm moves, so the grip point is a RANGE of points
        // along the shaft rather than one spot. The range ends where the
        // shaft does: a quarter of a metre up is where the trident begins,
        // and the generator builds its head above exactly this, so the
        // declaration and the geometry cannot disagree.
        grip: {
          axis: [0, 1, 0],
          travel: { up: TRISHUL_TRAVEL, down: TRISHUL_TRAVEL },
          radius: TRISHUL_SHAFT_RADIUS,
        },
      }),
      grounded({
        id: "grounded",
        label: "Planted beside the figure",
        // It was already standing on the base while the hand rested on it,
        // so when the hand is needed for a blessing it simply goes on
        // standing — a finger's width clear of the figure's own silhouette.
        stand: { clearanceM: 0.045 },
        grip: { axis: [0, 1, 0], radius: TRISHUL_SHAFT_RADIUS },
        notes: "Chosen automatically when the holding hand performs a gesture.",
      }),
    ],
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
    // A damaru is a different interaction problem from a trishul and gets
    // its own answer rather than a shared "make it fit the hand" pass.
    // It is pinched at the WAIST — the only part of it a hand can close
    // on — with the hourglass axis running through the ring the thumb and
    // fingers make, so the heads are up and down and the profile reads as
    // a drum rather than as a medallion facing the viewer.
    presentations: [
      handheld({
        id: "pinchHeld",
        label: "Pinched at the waist",
        hand: "pinch",
        grip: {
          axis: [0, 1, 0],
          // The waist is 18 mm long in total; a hand may not wander onto
          // the flare, because a hand that closes on a drum head closes
          // THROUGH it.
          travel: { up: DAMARU_WAIST_HALF, down: DAMARU_WAIST_HALF },
          radius: DAMARU_WAIST_RADIUS,
        },
        // Shiva carries the damaru in whichever hand the pose leaves free;
        // in Nataraja it is an upper hand. Moving it is preferable to
        // dropping it.
        mobile: true,
      }),
      handheld({
        id: "gripHeld",
        label: "Held in a closed fist",
        hand: "grip",
        grip: {
          axis: [0, 1, 0],
          travel: { up: DAMARU_WAIST_HALF, down: DAMARU_WAIST_HALF },
          radius: DAMARU_WAIST_RADIUS,
        },
        // Only if the customer asks: a fist round a damaru is legible but
        // it is not how the drum is played.
        autoSelectable: false,
      }),
    ],
    materialZones: ["garmentAccent", "metal"],
    category: "attributes",
    printability: proto,
  },
] as const;
