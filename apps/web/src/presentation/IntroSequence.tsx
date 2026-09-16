"use client";

/**
 * The entry sequence, and the moment it stops being one.
 *
 * The video plays over a canvas that is ALREADY the finished stage: the
 * backdrop behind it is this video's own last frame, the statue is
 * already built and posed on it, and the camera is a few centimetres from
 * its hero position. So the handover is not a transition between two
 * scenes. It is a fade between one frame and the same frame, with the
 * statue rising into the light underneath it.
 *
 * What it must never do is block the product. If the video will not
 * decode, or autoplay is refused, or the customer presses Skip, the stage
 * settles immediately and nothing is lost but the flourish.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { StageIntro } from "@devaform/asset-system";
import { markIntroSeen, useStageStore } from "./stageStore";

export function IntroSequence({ intro, grade }: { intro: StageIntro; grade: string }) {
  const phase = useStageStore((state) => state.phase);
  const beginSettle = useStageStore((state) => state.beginSettle);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const characterReady = useStageStore((state) => state.characterReady);
  const [covered, setCovered] = useState(true);
  const [atLastFrame, setAtLastFrame] = useState(false);
  const [fading, setFading] = useState(false);

  // Up from black, on a timer rather than on a media event.
  //
  // The point of the cover is that frame zero must never be seen — the
  // supplied footage opens on a wordmark that is not this product's, and
  // `startsAt` is what skips it. Gating the reveal on `seeked` looked
  // tidier and was not reliable: the events a browser sends around a
  // fragment seek differ between browsers and between a warm and a cold
  // cache, and the one time they arrive late the customer stares at a
  // black rectangle for nine seconds.
  useEffect(() => {
    const timer = window.setTimeout(() => setCovered(false), 260);
    return () => window.clearTimeout(timer);
  }, []);

  /**
   * Stop on the last frame. Handing over is a separate question.
   *
   * The sequence IS the loading state, so the end of the video is not
   * necessarily the moment to give way: if the body's mesh is still
   * arriving, the frame is simply held. Which is what a held frame is
   * for, and why this reveals nothing while it waits.
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

  // Held until there is a statue to hand over to — and then not held any
  // longer than that, because the customer came for the statue.
  useEffect(() => {
    if (atLastFrame && characterReady) handOver();
  }, [atLastFrame, characterReady, handOver]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;

    const start = () => {
      if (cancelled) return;
      // The media fragment on `src` asks the browser to begin here; this
      // is the belt to its braces, because a browser that ignores the
      // fragment would open on a wordmark that is not this product's.
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
    // A video that cannot be decoded is not worth waiting for, and a
    // sequence that never starts must not strand anyone inside it.
    video.addEventListener("error", handOver);
    const guard = window.setTimeout(handOver, (intro.lastFrameAt - intro.startsAt + 10) * 1000);

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
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden bg-black"
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${intro.handoverMs}ms ease-out`,
      }}
      data-testid="stage-intro"
    >
      <video
        ref={videoRef}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        // Scaled and cropped exactly as the backdrop is, so the frame the
        // video ends on and the still behind it are the same picture in
        // the same place.
        style={{
          width: "114%",
          height: "114%",
          objectFit: "cover",
          objectPosition: "50% 34%",
          // The stage's grade, on the video too: they are the same
          // picture, and the handover must not be a change of exposure.
          filter: grade,
        }}
        src={`${intro.video}#t=${intro.startsAt}`}
        muted
        playsInline
        preload="auto"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: covered ? 1 : 0, transition: "opacity 420ms ease-out" }}
      />
      {!fading && (
        <button
          type="button"
          onClick={handOver}
          className="pointer-events-auto absolute bottom-6 right-6 rounded-full border border-white/15 bg-black/35 px-4 py-1.5 text-xs uppercase tracking-[0.18em] text-stone-300 backdrop-blur-sm transition hover:border-white/35 hover:text-white"
        >
          Skip
        </button>
      )}
    </div>
  );
}
