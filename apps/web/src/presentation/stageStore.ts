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
  /**
   * A form the customer has asked for and that is not standing yet.
   *
   * Separate from `phase`, which is about the ENTRY — the one sequence
   * that happens once per visit. This is the other moment the stage has
   * nothing finished to show: a deity has been swapped, the old figure is
   * gone and the new one is being prepared. Both deserve a veil and they
   * are not the same veil, because the entry is a place the customer
   * walks through and this is a wait they did not ask for.
   *
   * Holds the NAME, because what the veil says is the whole of what makes
   * it a transition rather than a stall: "Vishnu is taking form".
   */
  arriving: string | null;
  beginSettle: () => void;
  finishSettle: () => void;
  beginArrival: (name: string) => void;
  finishArrival: () => void;
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
  arriving: null,
  /**
   * The old figure is counted as gone AT ONCE.
   *
   * The rig the previous deity was using is still in the scene for the
   * frame or two it takes React to commit the new configuration, so
   * `characterReady` would stay true across the switch and the veil would
   * lift before anything had changed. Saying plainly that there is no
   * character yet is both true a moment early and the only way to make
   * "wait for the new one" mean what it says.
   */
  beginArrival: (name) => set({ arriving: name, characterReady: false }),
  finishArrival: () => set({ arriving: null }),
  characterReady: false,
  setCharacterReady: (ready) =>
    set((state) => (state.characterReady === ready ? state : { characterReady: ready })),
  figure: null,
  setFigure: (figure) =>
    set((state) => (sameFigure(state.figure, figure) ? state : { figure })),
}));
