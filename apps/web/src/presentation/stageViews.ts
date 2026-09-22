/**
 * The named camera views, derived from the stage's own hero composition.
 *
 * Front, side and back are the hero camera swung about the figure, at the
 * same distance and the same height — so a stage that moves its camera
 * moves all of them with it, and "reset" means exactly the frame the
 * entry sequence settled on rather than a constant that has to be kept in
 * step with it by hand.
 *
 * And the hero itself is measured, not parked: see heroFraming.ts. That
 * is what makes these views true of a short broad Ganesha as well as of a
 * tall Vishnu — every one of them is the same composition about whichever
 * figure is standing on the stage. The portrait follows the same rule
 * about the head; it used to be two constants read off one deity's skull,
 * which is why it framed a forehead on another.
 */
import type { PresentationConfig } from "@devaform/asset-system";
import type { FigureExtent } from "@/engine/figureExtent";
import { heroComposition, portraitComposition } from "./heroFraming";

export type StageViewId =
  | "front"
  | "back"
  | "left"
  | "right"
  | "threeQuarter"
  | "face"
  | "reset";

export interface StageView {
  position: [number, number, number];
  target: [number, number, number];
}

/** The composition the viewport is currently working in. */
export interface StageFrame {
  figure: FigureExtent | null;
  aspect: number;
}

export function stageViews(
  stage: PresentationConfig,
  frame: StageFrame = { figure: null, aspect: 16 / 9 },
): Record<StageViewId, StageView> {
  const composed = heroComposition(stage.camera, frame.figure, frame.aspect);
  const [tx, ty, tz] = composed.target;
  const [hx, hy, hz] = composed.position;
  const target: [number, number, number] = [tx, ty, tz];
  const distance = Math.hypot(hx - tx, hz - tz);
  const around = (angle: number): [number, number, number] => [
    tx + Math.sin(angle) * distance,
    hy,
    tz + Math.cos(angle) * distance,
  ];
  const hero: StageView = { position: [hx, hy, hz], target };
  const portrait = portraitComposition(stage.camera, frame.figure, frame.aspect);
  return {
    front: { position: around(0), target },
    back: { position: around(Math.PI), target },
    left: { position: around(Math.PI / 2), target },
    right: { position: around(-Math.PI / 2), target },
    threeQuarter: hero,
    face: portrait ?? hero,
    reset: hero,
  };
}
