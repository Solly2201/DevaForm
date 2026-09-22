/**
 * The presentation stage: where a finished statue is SHOWN.
 *
 * A character says what the figure is — its body, its garments, what its
 * hands hold. None of that says anything about the room it stands in, the
 * light falling on it, where the camera is, or what the customer sees in
 * the first four seconds. Those are a different decision, they change for
 * different reasons, and they must never end up inside a saved character:
 * a customer who loads their Shiva a year from now should get their
 * Shiva, not a year-old camera angle.
 *
 * So presentation is its own configuration, keyed by deity, resolved
 * separately, and combined with the resolved character only at the point
 * something is drawn:
 *
 *     resolved character  +  presentation config  ->  stage
 *
 * THE LAST FRAME IS THE STAGE. The entry sequence ends held on a lit
 * mandala in an empty sanctum, and that frame — the actual file, derived
 * from the video by `apps/web/scripts/build-intro-poster.mjs` — is the
 * backdrop the interactive stage stands on. There is one final state, not
 * an animation and a re-creation of its last moment.
 */

/** Where the camera sits when the entry sequence has settled. */
export interface StageCamera {
  /** Hero position, metres, in the statue's own space. */
  position: readonly [number, number, number];
  /** What it looks at. */
  target: readonly [number, number, number];
  fov: number;
  /** How close and how far the customer may take it. */
  minDistance: number;
  maxDistance: number;
  /** How far under the horizon they may go — never up through the floor. */
  maxPolarAngle: number;
  /**
   * And the ceiling on how far ABOVE the figure the orbit may go. The
   * backdrop is a room photographed at eye level; a near-top-down camera
   * would put the statue's head against the hall's upper storey, which
   * no stage does. Bounded, not faded — bounds cannot pop.
   */
  minPolarAngle: number;
  /**
   * Where the sequence's camera starts, as an offset from the hero.
   *
   * The settle is the last beat of the entry: the camera eases these last
   * few centimetres and degrees into the hero composition while the
   * statue rises out of the dark. Small on purpose — a long move at the
   * end reads as a second animation rather than as the end of the first.
   */
  settleFrom: { dolly: number; azimuth: number; height: number };
}

/**
 * The environment the statue stands in.
 *
 * `image` is the intro's final frame, shown in screen space as a FIXED
 * BACKDROP — the way a product configurator or a photographed murti
 * presentation works: the statue turns on its stage, the hall behind it
 * stands still. That reading is deliberate. The frame is a photograph of
 * a room taken from one point; treating orbiting as "the camera walking
 * through the hall" would demand parallax the picture cannot give, and
 * every attempt to paper over that — fading the room out past an angle,
 * fading it with distance — turned into the environment popping in and
 * out under the customer's hands. A backdrop that simply IS the stage
 * has nothing to pop. Rotation and zoom never touch it.
 */
export interface StageBackdrop {
  image: string;
  /** The frame's own width over height — 16:9 footage is 1.778. */
  aspect: number;
  /**
   * How far past the frame edge to scale it, as a fraction.
   *
   * Two reasons, both about edges: the viewport is not 16:9, and the
   * supplied footage carries its generator's glyph in one corner.
   */
  overscan: number;
  /** Vertical placement of the frame, as a fraction of the overscan. */
  offsetY: number;
  /**
   * How the room is graded, as a CSS filter.
   *
   * Applied to the backdrop AND to the video, because they are the same
   * picture and the handover between them has to be invisible: grading
   * one of them is a step in brightness exactly where there must not be
   * one. The hall is warm, bright and carved all over, and at full
   * strength it argues with the figure standing in it.
   */
  grade: string;
  /** The ground behind the frame's own edges, on extreme aspect ratios. */
  voidColor: string;
}

/**
 * The room, as GEOMETRY.
 *
 * WHY IT IS NO LONGER A PHOTOGRAPH. The backdrop was the entry's final
 * frame shown in screen space — correct for exactly one camera position,
 * which is the one it was taken from. That is a defensible way to stand a
 * statue in a hall and an indefensible way to let someone walk round it:
 * the floor's painted mandala keeps the perspective of the hero angle
 * while the base standing on it takes the perspective of wherever the
 * customer has moved to, so at ninety degrees the two disagree and the
 * figure reads as sliding across a picture. Every attempt to hide that —
 * fading the room past an angle, fading it with distance — made the
 * temple pop to black under the customer's hands instead.
 *
 * So the sanctum is built. It is cheap geometry, deliberately: a floor,
 * a painted circle, a ring of columns, a wall, an oculus and its shaft.
 * What it buys is that every angle is a real angle — the floor is under
 * the feet from all of them, there is no void to rotate into, and
 * nothing has to be faded to hide a seam.
 *
 * ANCHORED TO THE STAGE, not to the character. The pivot is the
 * presentation's, the figure stands at it, and neither knows about the
 * other: a character carries no stage, and a stage carries no character.
 */
export interface StageEnvironment {
  /** How far the floor reaches, metres. */
  floorRadius: number;
  floorColor: string;
  /** The painted circle the figure stands on. */
  mandala: { radius: number; color: string; ringColor: string; rings: number };
  /** The colonnade: how many, how far out, how tall, how thick. */
  columns: { count: number; radius: number; height: number; thickness: number; color: string };
  /** The hall beyond them — a wall the camera can never get outside. */
  wall: { radius: number; height: number; color: string };
  /** The opening the light comes through, and the shaft it makes. */
  oculus: { radius: number; height: number; color: string; shaftOpacity: number };
  /** Oil lamps on the floor, which is what warms a dark hall. */
  lamps: { count: number; radius: number; color: string };
}

/**
 * The entry sequence, and how it hands over.
 *
 * NOTHING PLAYS. The approach into the sanctum is a strip of stills and
 * the customer's own scrolling is its clock — they walk in, rather than
 * watching a film of somebody else walking in. The strip is sampled from
 * the source footage offline (see scripts/build-intro-frames.mjs); its
 * LAST still is the backdrop this stage already stands on, so arriving is
 * one picture giving way to itself.
 */
export interface StageIntro {
  /** The media asset's id, in the presentation asset tree. */
  assetId: string;
  frames: {
    /** Where the numbered stills live. The last one is `backdrop.image`. */
    dir: string;
    /** How many stills the approach has, the backdrop included. */
    count: number;
    /** The stills' own pixel size — what the entry draws at. */
    width: number;
    height: number;
  };
  /**
   * How much scrolling the whole approach takes, in CSS pixels.
   *
   * About eighteen notches of a wheel, or two firm trackpad gestures:
   * long enough that arriving feels like a journey, short enough that
   * nobody wonders whether the page is broken. See introScroll.ts for
   * how input becomes a position.
   */
  travelPx: number;
  /** The same approach, for a customer who asked for less motion. */
  reducedTravelPx: number;
  /** How long the entry takes to give way to the live stage, ms. */
  handoverMs: number;
  /** How long the statue takes to rise into the light after it, ms. */
  settleMs: number;
  /** The footage the strip was sampled from — provenance, not runtime. */
  sourceVideo: string;
}

export interface PresentationConfig {
  id: string;
  label: string;
  /** Deities this stage is for, or "any". */
  deityCompatibility: readonly string[] | "any";
  /** The viewport lighting preset this stage opens in. */
  lighting: string;
  camera: StageCamera;
  backdrop: StageBackdrop;
  /**
   * The room the statue stands in, built rather than photographed.
   *
   * A stage that declares one is orbited; a stage that does not falls
   * back to a plain ground, which is what a deity with no room of its
   * own gets.
   */
  environment?: StageEnvironment;
  intro?: StageIntro;
  /**
   * Where the stage turns, in world metres.
   *
   * The camera orbits this and the environment is anchored to it. It is
   * the PRESENTATION's pivot, not the character's: a saved creation
   * carries no stage, and moving the stage must never move the figure.
   */
  pivot: readonly [number, number, number];
}

/**
 * The sanctum: DevaForm's one stage, for now.
 *
 * Deity-specific stages belong here beside it rather than in the
 * renderer — a stage is configuration, and the day Vishnu wants a
 * different room he gets another entry in this list, not a branch in a
 * component.
 */
const SANCTUM: PresentationConfig = {
  id: "sanctum",
  label: "Temple Sanctum",
  deityCompatibility: "any",
  lighting: "sanctum",
  camera: {
    // Three-quarters, a little above the waist, far enough back that the
    // base and the finial are both comfortably inside the frame.
    position: [1.32, 0.94, 1.96],
    target: [0, 0.6, 0],
    fov: 36,
    minDistance: 0.6,
    maxDistance: 5,
    maxPolarAngle: Math.PI * 0.52,
    minPolarAngle: Math.PI * 0.24,
    settleFrom: { dolly: 0.34, azimuth: 0.1, height: 0.06 },
  },
  backdrop: {
    image: "/assets/presentation/intros/temple-sanctum/1/final.jpg",
    aspect: 1280 / 720,
    overscan: 0.14,
    offsetY: 0.34,
    grade: "brightness(0.88) saturate(0.92)",
    voidColor: "#0d0b09",
  },
  /**
   * The sanctum, in numbers. Read off the entry's own last frame: a dark
   * warm hall, a cream circle on the floor, sandstone columns round it,
   * and a single shaft from an opening overhead.
   */
  environment: {
    floorRadius: 9,
    floorColor: "#181209",
    // Under the lotus base rather than around it: a painted circle the
    // figure stands on, not a plate it stands in front of.
    mandala: { radius: 0.62, color: "#7a684d", ringColor: "#4d341a", rings: 4 },
    columns: { count: 16, radius: 3.7, height: 5.2, thickness: 0.26, color: "#2f2418" },
    // Far enough back and dark enough that the figure separates from it.
    // A wall the same value as the statue is a wall the statue is lost in.
    wall: { radius: 9, height: 7.2, color: "#0b0805" },
    oculus: { radius: 0.9, height: 6.8, color: "#ffe2ab", shaftOpacity: 0.17 },
    lamps: { count: 12, radius: 1.75, color: "#ffb454" },
  },
  pivot: [0, 0, 0],
  intro: {
    assetId: "presentation.intro.templeSanctum",
    // The shipped cut opens clean — the footage's original title segment
    // (cut through the very end of its fade, verified frame-by-frame) and
    // its generator glyph were removed at the asset level, so nothing
    // needs skipping and nothing needs hiding.
    frames: {
      dir: "/assets/presentation/intros/temple-sanctum/1/frames",
      count: 40,
      width: 1280,
      height: 720,
    },
    travelPx: 1800,
    reducedTravelPx: 700,
    handoverMs: 520,
    settleMs: 1500,
    sourceVideo: "/assets/presentation/intros/temple-sanctum/1/intro.mp4",
  },
};

export const PRESENTATIONS: readonly PresentationConfig[] = [SANCTUM];

/**
 * The stage a deity is shown on.
 *
 * Falls back to the generic one, which is the point of `deityCompatibility`
 * being "any": a new deity is presentable the day it exists, and gets its
 * own room only if somebody decides it needs one.
 */
export function getPresentation(deityId?: string): PresentationConfig {
  const owned = deityId
    ? PRESENTATIONS.find(
        (stage) =>
          stage.deityCompatibility !== "any" && stage.deityCompatibility.includes(deityId),
      )
    : undefined;
  return owned ?? PRESENTATIONS.find((stage) => stage.deityCompatibility === "any") ?? SANCTUM;
}
