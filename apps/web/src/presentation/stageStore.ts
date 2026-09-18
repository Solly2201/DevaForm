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
  beginSettle: () => void;
  finishSettle: () => void;
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
  beginSettle: () => set((state) => (state.phase === "intro" ? { phase: "settling" } : state)),
  finishSettle: () => set({ phase: "ready" }),
  characterReady: false,
  setCharacterReady: (ready) =>
    set((state) => (state.characterReady === ready ? state : { characterReady: ready })),
}));
