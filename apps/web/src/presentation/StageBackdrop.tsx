"use client";

/**
 * The room the statue stands in — the intro's final frame, in screen
 * space, behind a transparent canvas.
 *
 * SCREEN SPACE ON PURPOSE. The frame is a photograph of a hall taken from
 * one point, and it is already correct for the one camera position that
 * matters. Rebuilding it as geometry would be rebuilding a perspective
 * that exists, at a cost, less accurately.
 *
 * WHICH IS ALSO WHY IT RECEDES. A fixed room behind a rotating statue is
 * right at the hero angle and wrong everywhere else: the pillars do not
 * move, and the eye catches it within about fifteen degrees. So the hall
 * fades to the dark it was lit out of as the camera leaves that angle,
 * and the customer inspects the statue on a plain ground — which is what
 * they want while inspecting it anyway. The room is for arriving.
 */
import type { StageBackdrop as StageBackdropConfig } from "@devaform/asset-system";
import { useStageStore } from "./stageStore";

export function StageBackdrop({ config }: { config: StageBackdropConfig }) {
  const alignment = useStageStore((state) => state.alignment);
  const scale = 1 + config.overscan;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ backgroundColor: config.voidColor }}
    >
      <div
        className="absolute inset-0 bg-cover bg-no-repeat"
        style={{
          backgroundImage: `url(${config.image})`,
          // Scaled past the frame edge: the viewport is not the video's
          // aspect, and the supplied footage carries its generator's glyph
          // in a corner.
          backgroundPosition: `50% ${config.offsetY * 100}%`,
          // Sized by HEIGHT, past the container's own: the frame is far
          // wider than any viewport, so covering by width letterboxes it
          // and leaves no room to place the mandala under the figure.
          backgroundSize: `auto ${scale * 100}%`,
          opacity: alignment,
          transition: "opacity 240ms linear",
          // The stage's own grade — the same one the video carries, so
          // the handover between them is not a step in brightness.
          filter: config.grade,
        }}
      />
    </div>
  );
}
