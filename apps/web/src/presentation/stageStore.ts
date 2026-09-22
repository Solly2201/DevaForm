"use client";

/**
 * What the stage is doing right now.
 *
 * Three states and nothing else: the entry sequence is playing, the
 * statue is rising into the light at the end of it, or the customer has
 * the stage. They are a sequence, never a branch — `settling` is the last
 * beat of the intro rather than a separate animation, which is what makes
 * the handover invisible.
 *
 */
import { create } from "zustand";
import type { FigureExtent } from "@/engine/figureExtent";

export type StagePhase = "intro" | "settling" | "ready";

interface StageState {
  phase: StagePhase;
  /**
   * Whether there is a statue to hand over TO.
   *
   * The sequence is the loading state — that is most of why it earns its
   * place. A handover that happens while the body's mesh is still
   * arriving reveals an empty room, so the last frame is simply held
   * until the figure is standing in it.
   */
  characterReady: boolean;
  /**
   * How big the statue on the stage is, in metres — measured off the
   * built figure, never authored. The stage composes its picture from
   * this (see heroFraming.ts) so that a short broad deity and a tall
   * narrow one are both framed by the same statement about the picture
   * rather than by two sets of coordinates.
   */
  figure: FigureExtent | null;
  beginSettle: () => void;
  finishSettle: () => void;
  setCharacterReady: (ready: boolean) => void;
  setFigure: (figure: FigureExtent | null) => void;
}

/** Two measurements of the same statue, to within a tenth of a millimetre. */
function sameFigure(a: FigureExtent | null, b: FigureExtent | null): boolean {
  if (a === null || b === null) return a === b;
  const near = (x: number, y: number) => Math.abs(x - y) < 1e-4;
  return (
    near(a.footY, b.footY) &&
    near(a.topY, b.topY) &&
    near(a.headY, b.headY) &&
    near(a.centreX, b.centreX) &&
    near(a.centreZ, b.centreZ) &&
    near(a.radius, b.radius)
  );
}

/**
 * Whether the entry is offered on this visit.
 *
 * Once per session, not once per visit to the Studio: a customer who
 * switches deity twice while deciding does not want the temple doors
 * three times.
 *
 * Reduced motion no longer excludes anyone. It did when the entry PLAYED
 * — six seconds of camera movement nobody asked for is exactly what that
 * setting is about — but nothing moves here unless the customer moves it,
 * and excusing them from the entry would mean excusing them from the
 * product's front door. What the preference changes is the journey's
 * length and its weight; see `prefersReducedMotion`.
 */
export function shouldShowEntry(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(INTRO_SEEN) !== "1";
  } catch {
    // Private mode and similar: the entry is not worth an exception.
    return false;
  }
}

/** Has this customer asked their system for less movement? */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const INTRO_SEEN = "devaform.stage.introSeen";

export function markIntroSeen(): void {
  try {
    window.sessionStorage.setItem(INTRO_SEEN, "1");
  } catch {
    /* nothing to do: it simply plays again next time */
  }
}

export const useStageStore = create<StageState>()((set) => ({
  phase: "intro",
  beginSettle: () => set((state) => (state.phase === "intro" ? { phase: "settling" } : state)),
  finishSettle: () => set({ phase: "ready" }),
  characterReady: false,
  setCharacterReady: (ready) =>
    set((state) => (state.characterReady === ready ? state : { characterReady: ready })),
  figure: null,
  setFigure: (figure) =>
    set((state) => (sameFigure(state.figure, figure) ? state : { figure })),
}));
