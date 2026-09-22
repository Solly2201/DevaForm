"use client";

/**
 * The entry into DevaForm: the customer walks into the temple.
 *
 * NOTHING PLAYS. The old entry was a video that started itself, ran for
 * six seconds and handed over — a film of somebody else arriving, which
 * the customer watched. This one is a place they move through: the
 * sanctum's approach is a strip of stills, their scrolling is its clock,
 * and the doors come toward them exactly as fast as they ask. Stop, and
 * the hall stops. Go back, and they back out of it.
 *
 * WHY THAT IS DIFFERENT FROM A LONG PAGE. There is no document to scroll:
 * the layer takes the wheel, the trackpad, a finger and the arrow keys,
 * and turns all four into one number between the doors and the sanctum
 * (see introScroll.ts). Nothing under it moves, no scrollbar appears, and
 * the number is smoothed so a flick reads as momentum rather than as a
 * jump between slides.
 *
 * IT IS ALSO THE LOADING SCREEN, which is most of why it earns its place.
 * The Studio builds underneath the whole time — the canvas is up, the
 * body's GLB is arriving, the thumbnails are rendering. Arriving at the
 * sanctum before the statue is ready holds at the last frame with a small
 * ember lit, and hands over the moment there is something to hand over
 * to. Arriving after it is ready hands over immediately.
 *
 * THE HANDOVER IS ONE FRAME GIVING WAY TO ITSELF. The strip's last still
 * IS the stage's backdrop file, placed by the same measured geometry (see
 * stageFrame.ts) under the same grade. So when this layer fades, nothing
 * on screen changes but the statue — which rises into the light
 * underneath — and the Studio's tools, which arrive around it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PresentationConfig, StageIntro } from "@devaform/asset-system";
import { clearStageFrame, frameLayerStyle, measureStageFrame } from "./stageFrame";
import {
  beginApproach,
  easeApproach,
  frameAt,
  hasArrived,
  presence,
  pushApproach,
  setApproach,
  wheelPixels,
  type Approach,
} from "./introScroll";
import { markIntroSeen, prefersReducedMotion, useStageStore } from "./stageStore";

/** Every still of the approach, in order, ending on the stage's backdrop. */
function frameUrls(intro: StageIntro, backdrop: string): string[] {
  const urls: string[] = [];
  for (let i = 0; i < intro.frames.count - 1; i += 1) {
    urls.push(`${intro.frames.dir}/${String(i).padStart(3, "0")}.jpg`);
  }
  urls.push(backdrop);
  return urls;
}

/**
 * The strip, decoded and held.
 *
 * Reported as soon as the FIRST still is in — the temple entrance is on
 * screen while the rest of the hall is still arriving, which is what lets
 * the customer start reading it immediately. `depth` is how far in they
 * may currently go without meeting an undecoded frame; the input is
 * bounded by it, so scrolling can never outrun the download and show a
 * blank.
 */
function useApproachFrames(urls: string[]): {
  images: HTMLImageElement[];
  entranceReady: boolean;
  depth: number;
} {
  const [state, setState] = useState<{ entranceReady: boolean; depth: number }>({
    entranceReady: false,
    depth: 0,
  });
  const imagesRef = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    let cancelled = false;
    const images = urls.map(() => new Image());
    imagesRef.current = images;
    const done = new Array(urls.length).fill(false);
    // How far a customer may travel: the last still in an unbroken run
    // from the start. A frame that arrives out of order does not widen
    // the window until its predecessors have.
    const report = () => {
      if (cancelled) return;
      let reach = 0;
      while (reach + 1 < done.length && done[reach + 1]) reach += 1;
      setState({ entranceReady: done[0] === true, depth: reach / (done.length - 1 || 1) });
    };
    urls.forEach((url, index) => {
      const image = images[index]!;
      const settle = () => {
        done[index] = true;
        report();
      };
      image.onload = settle;
      // A still that will not decode must not stall the approach: it is
      // simply never reached past, and the neighbour before it is held.
      image.onerror = () => {
        done[index] = false;
        report();
      };
      image.decoding = "async";
      image.src = url;
    });
    return () => {
      cancelled = true;
      for (const image of images) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [urls]);

  return { images: imagesRef.current, ...state };
}

export function PresentationEntry({ stage }: { stage: PresentationConfig }) {
  const intro = stage.intro as StageIntro;
  const phase = useStageStore((state) => state.phase);
  const beginSettle = useStageStore((state) => state.beginSettle);
  const characterReady = useStageStore((state) => state.characterReady);

  const urls = useMemo(
    () => frameUrls(intro, stage.backdrop.image),
    [intro, stage.backdrop.image],
  );
  const { images, entranceReady, depth } = useApproachFrames(urls);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const approachRef = useRef<Approach>(beginApproach());
  const depthRef = useRef(0);
  depthRef.current = depth;
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const [gentle] = useState(() => prefersReducedMotion());
  const travelPx = gentle ? intro.reducedTravelPx : intro.travelPx;

  /**
   * The frame's own placement.
   *
   * Measured HERE, because the entry is the only thing that shows a
   * photograph now — the Studio's room is built. Centred on the window,
   * which during the entry is the whole of it.
   */
  useEffect(() => {
    const measure = () =>
      measureStageFrame(
        stage.backdrop,
        { width: window.innerWidth, height: window.innerHeight },
        window.innerWidth / 2,
      );
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      clearStageFrame();
    };
  }, [stage.backdrop]);

  /** Arriving: fade this layer, and let the stage rise underneath. */
  const arrive = useCallback(() => {
    setFading(true);
    markIntroSeen();
    beginSettle();
  }, [beginSettle]);

  // --- input ---------------------------------------------------------------
  // The layer takes the gestures itself rather than letting a document
  // scroll under it: there is no document here, and a page that grows a
  // scrollbar to drive a cinematic is the thing this replaces.
  useEffect(() => {
    if (fading) return;
    const push = (pixels: number) => {
      approachRef.current = pushApproach(approachRef.current, pixels, travelPx);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      push(wheelPixels(event));
    };
    let lastTouch: number | null = null;
    const onTouchStart = (event: TouchEvent) => {
      lastTouch = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      const y = event.touches[0]?.clientY;
      if (y === undefined || lastTouch === null) return;
      // A finger dragged UP carries the customer forward, which is the
      // direction every scrolling surface already agrees on.
      push((lastTouch - y) * 1.6);
      lastTouch = y;
    };
    const onTouchEnd = () => {
      lastTouch = null;
    };
    const onKey = (event: KeyboardEvent) => {
      const step = travelPx * 0.14;
      switch (event.key) {
        case "ArrowDown":
        case "PageDown":
        case " ":
          event.preventDefault();
          push(step);
          break;
        case "ArrowUp":
        case "PageUp":
          event.preventDefault();
          push(-step);
          break;
        case "End":
        case "Enter":
          event.preventDefault();
          push(travelPx);
          break;
        case "Home":
          event.preventDefault();
          approachRef.current = setApproach(approachRef.current, 0);
          break;
        default:
          break;
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [travelPx, fading]);

  // --- the scene -----------------------------------------------------------
  // One loop: ease the shown position toward the intent, draw the two
  // stills that bracket it, and publish the position for the overlays.
  useEffect(() => {
    if (!entranceReady) return;
    let raf = 0;
    let last = performance.now();
    let published = -1;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = (now - last) / 1000;
      last = now;
      // A customer who asked for less motion gets the position they asked
      // for, without the weight — the movement is theirs either way.
      // How far the hall has actually arrived. Their intent is their own;
      // the scene follows it only as far as there is a picture to show.
      const reach = Math.max(0.02, depthRef.current);
      approachRef.current = gentle
        ? {
            ...approachRef.current,
            shown: Math.min(approachRef.current.intent, reach),
          }
        : easeApproach(approachRef.current, dt, 6, reach);
      const shown = approachRef.current.shown;
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (canvas && context) {
        const { from, to, blend } = frameAt(shown, urls.length);
        // The nearest still that exists at or before this position: a gap
        // in the strip holds the picture rather than blanking it.
        let at = from;
        while (at > 0 && !(images[at]?.complete && images[at]!.naturalWidth > 0)) at -= 1;
        const a = images[at];
        const b = at === from ? images[to] : undefined;
        if (a?.complete && a.naturalWidth > 0) {
          context.globalAlpha = 1;
          context.drawImage(a, 0, 0, canvas.width, canvas.height);
        }
        if (blend > 0 && b?.complete && b.naturalWidth > 0) {
          context.globalAlpha = blend;
          context.drawImage(b, 0, 0, canvas.width, canvas.height);
          context.globalAlpha = 1;
        }
      }
      // Only when it actually moved, and only to a hundredth: the
      // overlays read this, and re-rendering React sixty times a second
      // to fade a caption is how a cinematic starts dropping frames.
      const rounded = Math.round(shown * 100) / 100;
      if (rounded !== published) {
        published = rounded;
        setProgress(rounded);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [entranceReady, gentle, images, urls.length]);

  // Arriving: the sanctum reached AND a statue to reveal. Either order.
  useEffect(() => {
    if (fading) return;
    let raf = 0;
    const watch = () => {
      raf = requestAnimationFrame(watch);
      if (hasArrived(approachRef.current) && characterReady) arrive();
    };
    raf = requestAnimationFrame(watch);
    return () => cancelAnimationFrame(raf);
  }, [characterReady, arrive, fading]);

  if (phase === "ready") return null;

  const atSanctum = progress >= 0.999;
  const invite = presence(progress, 0, 0.015, 0.05);
  const brand = presence(progress, 0, 0.1, 0.08);
  const rail = progress > 0.01 && !atSanctum ? 1 : 0;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black"
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${intro.handoverMs}ms ease-out`,
        pointerEvents: fading ? "none" : "auto",
        overscrollBehavior: "none",
        touchAction: "none",
      }}
      data-testid="stage-intro"
      data-progress={progress}
      aria-label="Entering the sanctum"
      role="region"
    >
      <canvas
        ref={canvasRef}
        width={intro.frames.width}
        height={intro.frames.height}
        style={frameLayerStyle(stage.backdrop)}
        aria-hidden
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
      {/* A breath of depth: the hall darkens at the threshold and lifts as
          the sanctum opens, so moving in has a sense of light ahead. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 46%, rgba(255,214,140,0.16) 0%, rgba(255,214,140,0) 70%)",
          opacity: Math.min(1, Math.max(0, (progress - 0.45) / 0.4)),
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: entranceReady ? Math.max(0, 0.42 - progress * 0.9) : 1, transition: "opacity 500ms ease-out" }}
      />

      {/* The DevaForm mark, over the approach — gone by the doors. The only
          wordmark in the entry: the footage itself ships with none. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        style={{
          opacity: brand,
          transition: "opacity 400ms ease-out",
          transform: `translateY(${-8 - progress * 4}vh) scale(${1 + progress * 0.06})`,
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

      <style>{`
        @keyframes devaform-breathe {
          0%, 100% { opacity: 0.35; transform: translateY(-3px); }
          50% { opacity: 1; transform: translateY(4px); }
        }
        @keyframes devaform-ember {
          0%, 100% { opacity: 0.45; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .devaform-breathing { animation: none !important; opacity: 0.8 !important; }
        }
      `}</style>

      {/* The invitation. It says what to do, once, and leaves the moment
          they do it. */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 pb-14"
        style={{
          opacity: invite,
          transition: "opacity 400ms ease-out",
          pointerEvents: invite > 0.5 ? "auto" : "none",
        }}
      >
        <span
          className="uppercase text-stone-300"
          style={{
            fontSize: "clamp(0.62rem, 1vw, 0.78rem)",
            letterSpacing: "0.42em",
            textShadow: "0 1px 12px rgba(0,0,0,0.7)",
          }}
        >
          {gentle ? "Enter the sanctum" : "Scroll to enter the sanctum"}
        </span>
        <span
          aria-hidden
          className="devaform-breathing block"
          style={{
            width: 18,
            height: 18,
            borderRight: "1px solid rgba(224,167,63,0.85)",
            borderBottom: "1px solid rgba(224,167,63,0.85)",
            transform: "rotate(45deg)",
            animation: "devaform-breathe 2.6s ease-in-out infinite",
          }}
        />
        {/* The way in for anyone who cannot scroll — quiet, but real, and
            reachable by keyboard from the first frame. */}
        <button
          type="button"
          onClick={() => {
            approachRef.current = setApproach(approachRef.current, 1);
          }}
          className="rounded-full border border-saffron-500/40 px-5 py-1.5 text-[0.62rem] uppercase tracking-[0.3em] text-stone-300 transition hover:border-saffron-500 hover:text-saffron-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-saffron-500"
        >
          Enter
        </button>
      </div>

      {/* How far in they are. A hairline, not a progress bar. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center"
        style={{ opacity: rail, transition: "opacity 500ms ease" }}
      >
        <span className="block h-px w-40 overflow-hidden bg-white/15">
          <span
            className="block h-px bg-saffron-500/80"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </span>
      </div>

      {/* At the sanctum with no statue yet: a lamp being kept, not a
          theatre of progress. Out the instant there is one. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-10 flex items-center justify-center gap-3"
        style={{
          opacity: atSanctum && !characterReady && !fading ? 1 : 0,
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
    </div>
  );
}
