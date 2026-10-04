"use client";

/**
 * A form taking shape, over the stage it is taking shape on.
 *
 * WHAT THIS REPLACES. Choosing a different deity swapped the
 * configuration and let the viewport catch up in its own time, in public:
 * the old statue vanished, the sanctum stood empty for as long as the new
 * body's mesh took to arrive and assemble, and then a finished figure
 * appeared out of nothing. At its worst — before the rig stopped being
 * built twice — a half-dressed figure was visible in between, which reads
 * as a bug rather than as a wait.
 *
 * A wait the customer did not ask for has to be ACKNOWLEDGED or it reads
 * as a fault. So the stage veils: the hall dims, a light gathers where
 * the figure stands, the form is named, and the veil lifts onto a statue
 * that is already complete. Nothing is ever shown half-built, because the
 * veil does not lift until there is something finished behind it.
 *
 * IT IS NOT THE ENTRY. The entry is a place the customer walks through
 * once, at their own pace, and its clock is their hand. This is a pause
 * in work they are already doing, so it is short, it is quiet, and it
 * gets out of the way the moment it can.
 *
 * AND IT DOES NOT PRETEND. A deity whose assets are already cached is
 * ready almost at once; the veil still holds for a beat, because a flash
 * reads as a glitch, but it is a beat and not a loading bar. There is no
 * progress to report and none is invented.
 */
import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion, useStageStore } from "./stageStore";

/**
 * How long the veil holds at minimum, and how long it may hold at all.
 *
 * The floor is there so a cached form still reads as a transition rather
 * than a flicker. The ceiling is a guarantee to the customer: if
 * something has gone wrong with an asset, they get their Studio back and
 * the rig's own warnings explain what is missing — they do not get a
 * veil they cannot dismiss.
 */
const HOLD_MS = 420;
const GIVE_UP_MS = 12_000;
const FADE_MS = 260;
const LIFT_MS = 560;

export function StageArrival() {
  const arriving = useStageStore((state) => state.arriving);
  const characterReady = useStageStore((state) => state.characterReady);
  const finishArrival = useStageStore((state) => state.finishArrival);
  const [gentle] = useState(() => prefersReducedMotion());

  /** What is on screen: nothing, the veil, or the veil lifting. */
  const [showing, setShowing] = useState<string | null>(null);
  const [lifting, setLifting] = useState(false);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!arriving) return;
    setShowing(arriving);
    setLifting(false);
    startedAt.current = performance.now();
  }, [arriving]);

  /**
   * Lift when there is a finished statue behind it — and not before the
   * floor, and not after the ceiling.
   */
  useEffect(() => {
    if (!arriving) return;
    const elapsed = performance.now() - startedAt.current;
    const wait = characterReady
      ? Math.max(0, HOLD_MS - elapsed)
      : Math.max(0, GIVE_UP_MS - elapsed);
    const timer = setTimeout(() => finishArrival(), wait);
    return () => clearTimeout(timer);
  }, [arriving, characterReady, finishArrival]);

  // The veil's own exit, after the store has let go of it.
  useEffect(() => {
    if (arriving || !showing) return;
    setLifting(true);
    const timer = setTimeout(() => {
      setShowing(null);
      setLifting(false);
    }, LIFT_MS);
    return () => clearTimeout(timer);
  }, [arriving, showing]);

  if (!showing) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      data-testid="stage-arrival"
      data-arriving={arriving ?? ""}
      aria-live="polite"
      style={{
        opacity: lifting ? 0 : 1,
        transition: `opacity ${lifting ? LIFT_MS : FADE_MS}ms ease-out`,
      }}
    >
      {/* The hall going down. Not to black: a sanctum that blacks out is a
          dropped frame, and the room is still there the whole time. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "rgba(10, 8, 6, 0.86)" }}
      />
      {/* And the light gathering where the figure stands. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(42% 46% at 50% 52%, rgba(255,214,140,0.17) 0%, rgba(255,214,140,0) 72%)",
        }}
      />
      <div className="absolute inset-x-0 bottom-[18%] flex flex-col items-center gap-3">
        <span
          aria-hidden
          className="inline-block rounded-full"
          style={{
            width: 7,
            height: 7,
            background:
              "radial-gradient(circle, #ffd98a 0%, #e0a73f 60%, rgba(224,167,63,0) 100%)",
            boxShadow: "0 0 14px 4px rgba(224,167,63,0.45)",
            animation: gentle ? undefined : "devaform-ember 2.4s ease-in-out infinite",
          }}
        />
        <span className="text-xs uppercase tracking-[0.3em] text-stone-400">
          {showing} is taking form
        </span>
      </div>
      <style>{`
        @keyframes devaform-ember {
          0%, 100% { opacity: 0.45; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
