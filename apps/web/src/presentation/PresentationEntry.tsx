"use client";

/**
 * The entry into DevaForm: a fullscreen cinematic that IS the loading
 * screen.
 *
 * A first-time customer does not arrive at an editor that happens to be
 * playing a video. They arrive at black; the temple approach rises out of
 * it under the DevaForm mark; the doors open; the sanctum opens onto a
 * lit, empty mandala — and by then the Studio underneath has finished
 * building their statue, so the sequence ends by revealing it standing
 * there. The whole time, the editor is loading behind this layer: the
 * canvas is up, the body's GLB is arriving, the thumbnails are rendering.
 * The intro is not decoration after the work; it is the work's cover.
 *
 * NOT SKIPPABLE, by product decision. The one exception the sequence
 * makes is for people who asked their system for reduced motion, and for
 * a browser that cannot play the video at all — neither of whom is
 * skipping so much as being excused.
 *
 * THE HANDOVER IS A FADE BETWEEN ONE FRAME AND ITSELF. The video and the
 * stage backdrop share one measured geometry (see stageFrame.ts) and one
 * grade, and the backdrop file is derived from the video's last frame. So
 * when this layer fades, nothing on screen changes but the statue, which
 * rises into the light underneath — and the Studio chrome, which is the
 * product saying "yours now".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PresentationConfig, StageIntro } from "@devaform/asset-system";
import { frameLayerStyle } from "./stageFrame";
import { markIntroSeen, useStageStore } from "./stageStore";

/** When the DevaForm mark is on screen, seconds from playback start. */
const BRAND_IN_MS = 500;
const BRAND_OUT_MS = 3400;

export function PresentationEntry({ stage }: { stage: PresentationConfig }) {
  const intro = stage.intro as StageIntro;
  const phase = useStageStore((state) => state.phase);
  const beginSettle = useStageStore((state) => state.beginSettle);
  const characterReady = useStageStore((state) => state.characterReady);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [covered, setCovered] = useState(true);
  const [brand, setBrand] = useState(false);
  const [atLastFrame, setAtLastFrame] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [fading, setFading] = useState(false);

  // Up from black on a timer, not a media event: the events a browser
  // sends around playback start differ between browsers and between a
  // warm and a cold cache, and the one time they arrive late the customer
  // stares at a black rectangle. The shipped footage opens clean — the
  // cover is only the rise out of black.
  useEffect(() => {
    const up = window.setTimeout(() => setCovered(false), 260);
    const brandIn = window.setTimeout(() => setBrand(true), BRAND_IN_MS);
    const brandOut = window.setTimeout(() => setBrand(false), BRAND_OUT_MS);
    return () => {
      window.clearTimeout(up);
      window.clearTimeout(brandIn);
      window.clearTimeout(brandOut);
    };
  }, []);

  /**
   * Stop on the last frame. Handing over is a separate question: the
   * sequence is the loading state, and if the statue is still being
   * built, the frame is simply held — which is what a held frame is for.
   */
  const holdLastFrame = useCallback(() => {
    const video = videoRef.current;
    if (video && !video.paused) video.pause();
    setAtLastFrame(true);
  }, []);

  /** Give the stage the frame the video ended on. */
  const handOver = useCallback(() => {
    holdLastFrame();
    setFading(true);
    markIntroSeen();
    beginSettle();
  }, [beginSettle, holdLastFrame]);

  // Held until there is a statue to hand over to — and not a moment
  // longer, because the customer came for the statue.
  useEffect(() => {
    if (atLastFrame && characterReady) handOver();
  }, [atLastFrame, characterReady, handOver]);

  // The preparation indicator: a small ember, lit a moment into the
  // sequence so a fast machine never sees it flash, and put out the
  // instant the Studio is actually ready — it reports a fact, not a
  // theatre of progress.
  useEffect(() => {
    const timer = window.setTimeout(() => setPreparing(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;

    const start = () => {
      if (cancelled) return;
      // The media fragment on `src` asks the browser to begin here; this
      // is the belt to its braces.
      if (video.currentTime < intro.startsAt) video.currentTime = intro.startsAt;
      void video.play().catch(handOver);
    };
    // The last frame the encoder wrote, not `duration` — seeking past it
    // shows the same picture, and `ended` fires late enough to blink.
    const watch = () => {
      if (video.currentTime >= intro.lastFrameAt) holdLastFrame();
    };

    if (video.readyState >= 1) start();
    else video.addEventListener("loadedmetadata", start, { once: true });
    video.addEventListener("timeupdate", watch);
    video.addEventListener("ended", holdLastFrame);
    // A video that cannot decode is a browser being excused, not a
    // customer being stranded: the stage comes up immediately.
    video.addEventListener("error", handOver);
    const guard = window.setTimeout(handOver, (intro.lastFrameAt - intro.startsAt + 12) * 1000);

    return () => {
      cancelled = true;
      window.clearTimeout(guard);
      video.removeEventListener("timeupdate", watch);
      video.removeEventListener("ended", holdLastFrame);
      video.removeEventListener("error", handOver);
    };
  }, [intro, handOver, holdLastFrame]);

  if (phase === "ready") return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black"
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${intro.handoverMs}ms ease-out`,
        pointerEvents: fading ? "none" : "auto",
      }}
      data-testid="stage-intro"
      aria-label="Entering Divine Studio"
      role="presentation"
    >
      <video
        ref={videoRef}
        style={frameLayerStyle(stage.backdrop)}
        src={`${intro.video}#t=${intro.startsAt}`}
        muted
        playsInline
        preload="auto"
      />
      {/* The frame's edge — the same vignette the stage draws, so the
          fade reveals an identically graded picture. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(118% 88% at 50% 44%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.42) 72%, rgba(0,0,0,0.72) 100%)",
        }}
      />
      {/* The DevaForm mark, in the product's own brand treatment, over
          the approach — gone before the doors. The only wordmark in the
          entry: the footage itself ships with none. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        style={{
          opacity: brand ? 1 : 0,
          transition: "opacity 900ms ease-in-out",
          transform: "translateY(-6vh)",
        }}
      >
        <span
          className="font-display font-semibold tracking-wide text-saffron-500"
          style={{ fontSize: "clamp(2rem, 5vw, 3.75rem)", textShadow: "0 2px 24px rgba(0,0,0,0.55)" }}
        >
          DevaForm
        </span>
        <span
          className="mt-2 uppercase text-stone-300"
          style={{
            fontSize: "clamp(0.6rem, 1.1vw, 0.8rem)",
            letterSpacing: "0.42em",
            textShadow: "0 1px 12px rgba(0,0,0,0.6)",
          }}
        >
          Divine Studio
        </span>
      </div>
      {/* A small ember while the Studio prepares behind the sequence:
          non-interactive, clear of the temple imagery, gone the moment
          the statue is ready. Not a spinner — a lamp being kept. */}
      <style>{`@keyframes devaform-ember {
        0%, 100% { opacity: 0.45; transform: scale(0.85); }
        50% { opacity: 1; transform: scale(1.1); }
      }`}</style>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-10 flex items-center justify-center gap-3"
        style={{
          opacity: preparing && !characterReady && !fading ? 1 : 0,
          transition: "opacity 700ms ease",
        }}
        aria-live="polite"
      >
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
        <span className="text-xs uppercase tracking-[0.3em] text-stone-400">
          Preparing your murti
        </span>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: covered ? 1 : 0, transition: "opacity 420ms ease-out" }}
      />
    </div>
  );
}
