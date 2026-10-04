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
/**
 * Asymmetric on purpose. The mace's head stands on the ground, so nearly
 * all of the slide is DOWNWARD — the shaft drops through the fist until
 * the head lands. Six centimetres each way left it hanging in the air:
 * the hand is at the hip and the floor is eleven centimetres further.
 */
export const GADA_TRAVEL_UP = 0.05;
export const GADA_TRAVEL_DOWN = 0.24;
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
          travel: { up: GADA_TRAVEL_UP, down: GADA_TRAVEL_DOWN },
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
     * The reference shows the discus balanced on a raised index finger —
     * and that is the only honest way to present a disc with a hand: a
     * fist closed round its rim would put fingers through the blade, and
     * a disc big enough to read at statue distance has no handle to take.
     *
     * Saying so as a RADIUS did not work. The presentation used to claim
     * the disc was six millimetres thick so the closure would shut on
     * "a finger", and the Studio showed exactly what that means: a fist
     * closed on nothing beside a wheel floating over it, with no visible
     * relationship between the two. The hand state is a fact about the
     * hand, not a lie about the object, so it is named: `poise` — three
     * fingers and the thumb closed, the index standing, the disc on its
     * tip, with the body's own measurement of where that tip is.
     */
    presentations: [
      handheld({
        id: "fingerPoised",
        label: "Spinning on a raised finger",
        hand: "hold",
        /**
         * THE DISCUS SPINS FLAT, and this one declaration is what says so.
         *
         * The asset is drawn in its own XY plane with its face normal
         * along +Z, and `axis` names the asset-local direction that runs
         * UP the grip channel. Naming the normal puts the disc horizontal
         * on a vertical axis — a plate spinning on a fingertip, which is
         * what references/vishnu.jpg shows. Naming +Y, as this used to,
         * stood it on its rim like a cartwheel.
         *
         * No `facing`. That spends the free spin about the channel to aim
         * an item's +Z out the statue's front, which is exactly right for
         * a conch or a wheel presented face-on and meaningless here: the
         * free spin IS about the disc's own normal now, and a disc is
         * symmetric about that. Asking for a facing would be asking a
         * spinning wheel which spoke should face the devotee.
         */
        grip: { axis: [0, 0, 1], closure: "poise" },
        notes: "Balanced and turning on the raised index; the fingers do not close on it.",
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


  {
    id: "vishnu.forehead.tilaka",
    version: 1,
    name: "Urdhva Pundra",
    description: "The rising tilaka: two white strokes with the red srichurna between them.",
    kind: { type: "attachment", sockets: ["head.forehead"] },
    deityCompatibility: ["vishnu"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "vishnu.tilaka" },
    presentations: [
      wearable({ id: "worn", label: "Worn", socket: "head.forehead", clearanceM: 0.001 }),
    ],
    materialZones: [],
    category: "ornaments",
    printability: proto,
  },
  // ---- HAIR -------------------------------------------------------------
  //
  // One generator, three heads of hair. What separates them is how far
  // the locks fall, how far round the sides they come and how much mass
  // they carry — see generators/vishnu.ts. A second style is a line here
  // rather than a second generator, which is the same bargain Shiva's two
  // jata already make.
  {
    id: "vishnu.hair.flowing",
    version: 1,
    name: "Flowing Hair",
    description: "Long dark hair falling behind the shoulders and forward past each ear.",
    kind: { type: "part", slot: "hair" },
    deityCompatibility: ["vishnu"],
    stage: "prototype",
    source: { kind: "procedural", generatorId: "vishnu.hair", params: { fall: 1, sweep: 1, mass: 1 } },
    materialZones: ["hair"],
    category: "features",
    printability: proto,
  },
  {
    id: "vishnu.hair.gathered",
    version: 1,
    name: "Gathered",
    description:
      "Drawn back off the face and falling in one mass behind — the ears and the kundala clear.",
    kind: { type: "part", slot: "hair" },
    deityCompatibility: ["vishnu"],
    stage: "prototype",
    source: {
      kind: "procedural",
      generatorId: "vishnu.hair",
      params: { fall: 1.15, sweep: 0.62, mass: 1.1 },
    },
    materialZones: ["hair"],
    category: "features",
    printability: proto,
  },
  {
    id: "vishnu.hair.cropped",
    version: 1,
    name: "Close Cropped",
    description: "Short at the nape, close to the skull — the plainest of the three.",
    kind: { type: "part", slot: "hair" },
    deityCompatibility: ["vishnu"],
    stage: "prototype",
    source: {
      kind: "procedural",
      generatorId: "vishnu.hair",
      params: { fall: 0.22, sweep: 0.7, mass: 0.6 },
    },
    materialZones: ["hair"],
    category: "features",
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
      // No side sash-fall: on Vishnu's yellow it read as a red blotch
      // stuck to the thigh. The centre cascade the reference shows stays.
      params: { length: 1, hide: 0, dhoti: 1, drape: 0, accent: 0 },
    },
    materialZones: ["garment", "garmentAccent", "metal"],
    category: "clothing",
    printability: proto,
  },
] as const;
