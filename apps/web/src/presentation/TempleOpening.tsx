"use client";

/**
 * The wait before the Studio, as one intentional thing.
 *
 * There were three of these and they did not know about each other: the
 * route said "Preparing Divine Studio…", the viewport chunk said
 * "Preparing 3D viewport…", and the entry said "Preparing your murti".
 * A customer opening the product met two or three different grey
 * sentences in a row, each in its own typeface and position, which is why
 * the opening read as slow even where it was quick — a wait that keeps
 * changing its mind about what it is looks longer than one that is going
 * somewhere.
 *
 * So there is one opening, and it names the stage it is actually at.
 *
 * HONEST STAGES, NOT A PERCENTAGE. Nothing here can truthfully say it is
 * seventy-three per cent done: a WebGL context, a chunk of JavaScript and
 * a rig being assembled have no common unit. What CAN be said truthfully
 * is which of them is happening, and that is what is shown. The entry's
 * own frame strip does report a real fraction, and it keeps its bar —
 * that number is counted, not invented.
 *
 * AND IT STAYS CHEAP. It renders before the renderer exists, so it is
 * text, a rule and one small lamp: no WebGL, no images, no layout that
 * can reflow when the real thing arrives. A loading state that costs
 * anything is a loading state making itself necessary.
 */

/** The stages a customer can actually be waiting at, in order. */
export type OpeningStage = "space" | "viewport" | "figure";

const WORDS: Record<OpeningStage, string> = {
  space: "Preparing the sacred space",
  viewport: "Opening the sanctum",
  figure: "Awakening the figure",
};

export function TempleOpening({
  stage,
  compact = false,
}: {
  stage: OpeningStage;
  /** Inside the editor's own frame rather than filling the window. */
  compact?: boolean;
}) {
  return (
    <div
      data-testid="temple-opening"
      data-stage={stage}
      className={`flex ${
        compact ? "h-full w-full" : "h-dvh"
      } flex-col items-center justify-center gap-5 bg-surface-950 px-8 text-center`}
      role="status"
      aria-live="polite"
    >
      <span className="font-display text-xl font-semibold tracking-wide text-saffron-500">
        DevaForm
      </span>
      <span className="text-[11px] uppercase tracking-[0.42em] text-stone-500">
        Opening the temple
      </span>
      {/* The lamp. One element, one keyframe, already defined for the
          entry's own ember — nothing new is loaded to show it. */}
      <span
        aria-hidden
        className="inline-block rounded-full"
        style={{
          width: 7,
          height: 7,
          background: "radial-gradient(circle, #ffd98a 0%, #e0a73f 60%, rgba(224,167,63,0) 100%)",
          boxShadow: "0 0 14px 4px rgba(224,167,63,0.45)",
          animation: "devaform-ember 2.4s ease-in-out infinite",
        }}
      />
      <span className="text-sm text-stone-400">{WORDS[stage]}</span>
    </div>
  );
}
