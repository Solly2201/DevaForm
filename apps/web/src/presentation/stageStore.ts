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
 * `alignment` is how close the camera still is to the hero angle, and it
 * is here rather than in the scene because the thing that reads it is a
 * DOM layer behind the canvas. One number, written by the renderer and
 * read by the backdrop.
 */
import { create } from "zustand";

export type StagePhase = "intro" | "settling" | "ready";

interface StageState {
  phase: StagePhase;
  /** 1 at the hero composition, 0 once the camera has left it. */
  alignment: number;
  /**
   * Whether there is a statue to hand over TO.
   *
   * The sequence is the loading state — that is most of why it earns its
   * place. A handover that happens while the body's mesh is still
   * arriving reveals an empty room, so the last frame is simply held
   * until the figure is standing in it.
   */
  characterReady: boolean;
  beginSettle: () => void;
  finishSettle: () => void;
  setAlignment: (value: number) => void;
  setCharacterReady: (ready: boolean) => void;
}

/**
 * Whether the sequence has already been shown in this tab.
 *
 * Once per session, not once per visit to the Studio: a customer who
 * switches deity twice while deciding does not want the temple doors
 * three times. Also skipped for anyone who has asked their system for
 * reduced motion, which is the whole point of that setting.
 */
export function shouldPlayIntro(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(INTRO_SEEN) === "1") return false;
  } catch {
    // Private mode and similar: the sequence is not worth an exception.
    return false;
  }
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
  alignment: 1,
  beginSettle: () => set((state) => (state.phase === "intro" ? { phase: "settling" } : state)),
  finishSettle: () => set({ phase: "ready" }),
  characterReady: false,
  setAlignment: (value) =>
    set((state) => (Math.abs(state.alignment - value) < 0.01 ? state : { alignment: value })),
  setCharacterReady: (ready) =>
    set((state) => (state.characterReady === ready ? state : { characterReady: ready })),
}));
