/**
 * ONE geometry for the temple frame, wherever it is shown.
 *
 * Two things display the same picture: the entry video, and the backdrop
 * still it ends on. The continuity between them is the whole point of the
 * presentation architecture, and it survives exactly as long as they are
 * scaled, cropped and positioned by the same arithmetic — so the
 * arithmetic runs ONCE, in `measureStageFrame`, and both layers consume
 * its result as CSS custom properties. There is nothing either layer
 * could disagree about.
 *
 * What the arithmetic decides:
 *
 * - Sized by HEIGHT, past the window's own (`overscan`), because the
 *   footage is wider than any studio viewport and the generator signed a
 *   corner of it. On a window wider than even the overscanned frame, it
 *   grows to cover — a letterboxed entry is not an entry.
 * - Centred not on the window but on the STATUE. The Studio's canvas sits
 *   between a sidebar and a panel, so its centre is not the window's, and
 *   a mandala centred on the window would leave the figure standing
 *   beside it. The viewport measures where its centre actually is and the
 *   frame follows — during the intro too, so the video's mandala is
 *   already where the statue is about to be.
 */
import type { StageBackdrop as StageBackdropConfig } from "@devaform/asset-system";

const VARS = {
  left: "--stage-frame-left",
  top: "--stage-frame-top",
  width: "--stage-frame-w",
  height: "--stage-frame-h",
} as const;

/**
 * Compute the frame's placement and publish it for both layers.
 *
 * `centerX` is where the statue's vertical axis crosses the window, in
 * pixels; the frame's own horizontal middle is put there. Vertically the
 * standard background-position rule: `offsetY` of the frame aligns with
 * `offsetY` of the window.
 */
export function measureStageFrame(
  config: StageBackdropConfig,
  window: { width: number; height: number },
  centerX: number,
): void {
  let height = window.height * (1 + config.overscan);
  let width = height * config.aspect;
  // Cover is a constraint on both EDGES, not on the width: the frame is
  // centred on the statue, which stands left of the window's middle when
  // a panel is open, so a frame merely as wide as the window leaves its
  // right edge short of the window's. Wide desktop viewports showed the
  // void there. The width that covers is twice the farther edge.
  const covering = 2 * Math.max(centerX, window.width - centerX);
  if (width < covering) {
    width = covering;
    height = width / config.aspect;
  }
  const left = centerX - width / 2;
  const top = (window.height - height) * config.offsetY;
  const root = document.documentElement.style;
  root.setProperty(VARS.left, `${left.toFixed(1)}px`);
  root.setProperty(VARS.top, `${top.toFixed(1)}px`);
  root.setProperty(VARS.width, `${width.toFixed(1)}px`);
  root.setProperty(VARS.height, `${height.toFixed(1)}px`);
}

export function clearStageFrame(): void {
  const root = document.documentElement.style;
  for (const name of Object.values(VARS)) root.removeProperty(name);
}

/**
 * Style for the element SHOWING the frame — image or video alike — inside
 * a fixed, fullscreen, overflow-hidden container.
 */
export function frameLayerStyle(config: StageBackdropConfig): React.CSSProperties {
  return {
    position: "absolute",
    // Until the viewport's first measurement lands, fill the window and
    // let object-fit crop — never a gap, only a briefly different crop.
    // Once measured, the element is exactly frame-shaped and object-fit
    // has nothing left to do.
    left: `var(${VARS.left}, 0px)`,
    top: `var(${VARS.top}, 0px)`,
    width: `var(${VARS.width}, 100%)`,
    height: `var(${VARS.height}, 100%)`,
    objectFit: "cover",
    // Tailwind's preflight caps img/video at max-width 100%, which
    // silently clamps the overscanned frame to the window and shears the
    // whole geometry. The frame is measured; nothing may re-fit it.
    maxWidth: "none",
    maxHeight: "none",
    filter: config.grade,
  };
}
