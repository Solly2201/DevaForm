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
 * `image` is the intro's final frame. It is shown in screen space rather
 * than as geometry, because it IS a photograph of a room taken from one
 * point: rebuilding it as a skybox would be rebuilding a perspective that
 * is already correct for the one camera position that matters.
 *
 * Which is also why it recedes. A fixed frame behind a rotating statue is
 * right at the hero angle and wrong everywhere else — the pillars do not
 * move, and the eye notices within about fifteen degrees. So as the
 * camera leaves the hero azimuth the room fades to the dark it was lit
 * out of, and the statue is left on a plain ground to be inspected. The
 * room is for arriving; the dark is for looking closely.
 */
export interface StageBackdrop {
  image: string;
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
  /** Azimuth from the hero angle, radians, at which the room has gone. */
  recedeWithin: number;
  /** The ground colour it recedes to. */
  voidColor: string;
}

/** The entry sequence, and how it hands over. */
export interface StageIntro {
  /** The media asset's id, in the presentation asset tree. */
  assetId: string;
  video: string;
  /** Seconds. Playback starts here — see the asset's own record for why. */
  startsAt: number;
  /** Seconds. The frame the encoder last wrote, and the backdrop's source. */
  lastFrameAt: number;
  /** How long the video takes to give way to the live stage, ms. */
  handoverMs: number;
  /** How long the statue takes to rise into the light after it, ms. */
  settleMs: number;
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
  intro?: StageIntro;
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
    settleFrom: { dolly: 0.34, azimuth: 0.1, height: 0.06 },
  },
  backdrop: {
    image: "/assets/presentation/intros/temple-sanctum/1/final.jpg",
    overscan: 0.14,
    offsetY: 0.34,
    grade: "brightness(0.88) saturate(0.92)",
    recedeWithin: 0.34,
    voidColor: "#0d0b09",
  },
  intro: {
    assetId: "presentation.intro.templeSanctum",
    video: "/assets/presentation/intros/temple-sanctum/1/intro.mp4",
    startsAt: 2.55,
    lastFrameAt: 9.96,
    handoverMs: 420,
    settleMs: 1500,
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
