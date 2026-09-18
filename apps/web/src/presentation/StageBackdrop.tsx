"use client";

/**
 * The room the statue stands in — the intro's final frame, fullscreen,
 * behind the whole Studio.
 *
 * FULLSCREEN ON PURPOSE. The entry sequence owns the entire window, and
 * the frame it ends on has to be the frame the stage begins on — the same
 * pixels in the same places. So the backdrop is a fixed layer under the
 * Studio shell: the chrome panels are opaque and simply cover their part
 * of it, the canvas is transparent and shows it, and when the fullscreen
 * video fades out, what it reveals is itself.
 *
 * SCREEN SPACE ON PURPOSE. The frame is a photograph of a hall taken from
 * one point, already correct for the one camera position that matters;
 * rebuilding it as geometry would be rebuilding a perspective that
 * exists, at a cost, less accurately.
 *
 * AND IT NEVER GOES AWAY. The stage reads as a turntable in front of a
 * painted hall — the statue turns, the room stands still — so rotation
 * and zoom leave the backdrop exactly where it is. Earlier versions
 * faded it past an angle or a distance, and what the customer saw was
 * the temple popping to black under their hands. A backdrop that simply
 * IS the stage has nothing to pop.
 */
import type { StageBackdrop as StageBackdropConfig } from "@devaform/asset-system";
import { frameLayerStyle } from "./stageFrame";

export function StageBackdrop({ config }: { config: StageBackdropConfig }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ backgroundColor: config.voidColor }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- the frame
          is measured geometry shared with the entry; next/image
          would re-fit it and break the continuity. */}
      <img src={config.image} alt="" draggable={false} style={frameLayerStyle(config)} />
    </div>
  );
}
