/**
 * Vishnu — prepared, not yet offered.
 *
 * `references/ref_vishnu.png` is the direction: a serene, majestic king;
 * blue skin, gold ornament, a yellow dhoti with red borders, a tall
 * kirita mukuta, and the four attributes in four hands — chakra and
 * shankha raised in the back pair, gada resting on the ground under one
 * front hand, padma held out in the other.
 *
 * WHAT THIS FILE IS FOR. Vishnu is the first deity added after the
 * engine stopped being Ganesha's engine with a second character in it,
 * and the point of preparing him this way is to find out whether that is
 * true. Everything here is declaration: what the attributes are, how each
 * one can be held, which hands can hold it, what the figure wears, what
 * colour it all is. None of it is new machinery. If a deity can be
 * described and the existing resolver, grip solver, surface walker and
 * garment system can build it, the architecture has done its job.
 *
 * The deity is registered as UPCOMING with this manifest attached, so the
 * asset system validates every entry and no picker offers a half-built
 * god. What is deliberately NOT here: a body, a face and a crown of
 * production quality. Those are modelling work, and a rushed one would be
 * worse than none — see docs/vishnu-direction.md.
 */
import { grounded, handheld, wearable } from "../presentation";
import type { AssetDefinition } from "../types";

const HAND_SOCKETS = [
  "arm.frontLeft.hand.item",
  "arm.frontRight.hand.item",
  "arm.backLeft.hand.item",
  "arm.backRight.hand.item",
] as const;

/** Where the hand closes on the mace's shaft, and how far it may slide. */
export const GADA_SHAFT_RADIUS = 0.009;
export const GADA_TRAVEL = 0.06;
/** The lotus is held by its stem, which is the thinnest thing any hand here takes. */
export const PADMA_STEM_RADIUS = 0.004;
/** The conch is held ROUND, in the palm, not pinched. */
export const SHANKHA_BODY_RADIUS = 0.028;

const proto = {
  printSourceAvailable: false,
  minStatueHeightMm: 150,
} as const;

export const VISHNU_ASSETS: readonly AssetDefinition[] = [
  // ---------------------------------------------------------------- attributes
  {
    id: "vishnu.attribute.gada",
    version: 1,
    name: "Kaumodaki",
    description: "The ceremonial mace, its ornate head resting on the ground.",
    kind: { type: "attachment", sockets: HAND_SOCKETS },
    deityCompatibility: ["vishnu"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "vishnu.gada" },
    // The same problem as the trishul, and therefore the same answer: a
    // heavy thing whose weight is on the ground, steadied by a hand that
    // slides along its shaft as the arm moves. Nothing new was needed to
    // say so.
    presentations: [
      handheld({
        id: "handheldShaft",
        label: "Resting on the ground under one hand",
        hand: "grip",
        support: "ground",
        grip: {
          axis: [0, 1, 0],
          travel: { up: GADA_TRAVEL, down: GADA_TRAVEL },
          radius: GADA_SHAFT_RADIUS,
        },
      }),
      grounded({
        id: "grounded",
        label: "Standing beside the figure",
        stand: { clearanceM: 0.05 },
        grip: { axis: [0, 1, 0], radius: GADA_SHAFT_RADIUS },
        notes: "Chosen automatically when the holding hand performs a gesture.",
      }),
    ],
    materialZones: ["metal"],
    category: "attributes",
    printability: proto,
  },
  {
    id: "vishnu.attribute.padma",
    version: 1,
    name: "Padma",
    description: "The lotus, held by its stem.",
    kind: { type: "attachment", sockets: HAND_SOCKETS },
    deityCompatibility: ["vishnu"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "vishnu.padma" },
    // A stem is four millimetres thick. The reference holds it between the
    // fingers with the flower above the fist — a pinch, and the flower's
    // own weight is nothing, so no support is declared.
    presentations: [
      handheld({
        id: "pinchHeld",
        label: "Held by the stem",
        hand: "pinch",
        grip: {
          axis: [0, 1, 0],
          travel: { up: 0.03, down: 0.03 },
          radius: PADMA_STEM_RADIUS,
        },
        mobile: true,
      }),
      handheld({
        id: "palmHeld",
        label: "Resting in an open palm",
        hand: "hold",
        grip: { axis: [0, 1, 0], radius: PADMA_STEM_RADIUS },
        // Offered, not chosen: a lotus lying in the palm is a different
        // gesture from a lotus held up, and which one is the customer's.
        autoSelectable: false,
      }),
    ],
    materialZones: ["garmentAccent"],
    category: "attributes",
    printability: proto,
  },
  {
    id: "vishnu.attribute.shankha",
    version: 1,
    name: "Panchajanya",
    description: "The conch of the first sound, held in the palm.",
    kind: { type: "attachment", sockets: HAND_SOCKETS },
    deityCompatibility: ["vishnu"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "vishnu.shankha" },
    // Not a staff and not a pinch: a conch is a fist-sized body cradled in
    // the hand with the fingers round its widest part. `hold` is the
    // vocabulary's word for that, and the grip solver curls the fingers
    // onto a radius rather than closing them into a fist.
    presentations: [
      handheld({
        id: "palmHeld",
        label: "Cradled in the palm",
        hand: "hold",
        grip: {
          axis: [0, 1, 0],
          travel: { up: 0.02, down: 0.02 },
          radius: SHANKHA_BODY_RADIUS,
        },
      }),
    ],
    materialZones: ["metal"],
    category: "attributes",
    printability: proto,
  },
  {
    id: "vishnu.attribute.chakra",
    version: 1,
    name: "Sudarshana Chakra",
    description: "The discus, poised on a raised finger.",
    kind: { type: "attachment", sockets: HAND_SOCKETS },
    deityCompatibility: ["vishnu"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "vishnu.chakra" },
    /**
     * The one attribute here that is NOT gripped.
     *
     * The reference shows the discus balanced on a raised index finger,
     * spinning — and that is the only honest way to present a disc with
     * a hand: a fist closed round its rim would put fingers through the
     * blade, and a disc big enough to read at statue distance has no
     * handle to take. So it declares a HOLD whose grip radius is the
     * finger's, not the disc's: the hand closes on nothing, the disc sits
     * above it, and no geometry passes through any other.
     */
    presentations: [
      handheld({
        id: "fingerPoised",
        label: "Poised on a raised finger",
        hand: "hold",
        grip: { axis: [0, 1, 0], radius: 0.006 },
        notes: "The disc rests above the hand; the fingers do not close on it.",
      }),
    ],
    materialZones: ["metal"],
    category: "attributes",
    printability: proto,
  },

  // ----------------------------------------------------------------- ornaments
  {
    id: "vishnu.crown.kirita",
    version: 1,
    name: "Kirita Mukuta",
    description: "The tall royal crown, gold with stone accents.",
    kind: { type: "attachment", sockets: ["head.crown"] },
    deityCompatibility: ["vishnu"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "vishnu.crown" },
    presentations: [wearable({ id: "worn", label: "Worn", socket: "head.crown", clearanceM: 0.002 })],
    materialZones: ["metal", "garmentAccent"],
    category: "ornaments",
    printability: proto,
  },
  {
    id: "vishnu.garland.vaijayanti",
    version: 1,
    name: "Vaijayanti",
    description: "The long forest garland, falling past the knees.",
    kind: { type: "attachment", sockets: ["chest.necklace", "chest.mala"] },
    deityCompatibility: ["vishnu"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "vishnu.garland" },
    presentations: [wearable({ id: "worn", label: "Worn", socket: "chest.mala", clearanceM: 0.004 })],
    materialZones: ["garmentAccent"],
    category: "ornaments",
    printability: proto,
  },

  // ------------------------------------------------------------------ clothing
  {
    id: "vishnu.garment.dhoti",
    version: 1,
    name: "Golden Dhoti",
    description: "The yellow wrapped lower garment with a red border.",
    kind: { type: "part", slot: "lowerGarment" },
    deityCompatibility: ["vishnu"],
    stage: "prototype",
    // The SHARED generator, with Vishnu's parameters. A dhoti is a dhoti:
    // it is cut to the same measured legs, gathered the same way, and
    // dyed whatever the customer chose. Writing a second one would be
    // writing the same file twice with different numbers in it.
    source: {
      kind: "procedural",
      generatorId: "humanoid.hideWrap",
      params: { length: 1, hide: 0, dhoti: 1, drape: 1 },
    },
    materialZones: ["garment", "garmentAccent", "metal"],
    category: "clothing",
    printability: proto,
  },
] as const;
