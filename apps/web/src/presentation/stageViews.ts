/**
 * The named camera views, derived from the stage's own hero composition.
 *
 * Front, side and back are the hero camera swung about the figure, at the
 * same distance and the same height — so a stage that moves its camera
 * moves all of them with it, and "reset" means exactly the frame the
 * entry sequence settled on rather than a constant that has to be kept in
 * step with it by hand.
 *
 * The face view is the one exception: it is a portrait, framed on the
 * head rather than on the figure, so it does not follow the hero.
 */
import type { PresentationConfig } from "@devaform/asset-system";

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

const FACE_TARGET: [number, number, number] = [0, 1.16, 0.05];
const FACE_POSITION: [number, number, number] = [0.28, 1.22, 0.85];

export function stageViews(stage: PresentationConfig): Record<StageViewId, StageView> {
  const [tx, ty, tz] = stage.camera.target;
  const [hx, hy, hz] = stage.camera.position;
  const target: [number, number, number] = [tx, ty, tz];
  const distance = Math.hypot(hx - tx, hz - tz);
  const around = (angle: number): [number, number, number] => [
    tx + Math.sin(angle) * distance,
    hy,
    tz + Math.cos(angle) * distance,
  ];
  const hero: StageView = { position: [hx, hy, hz], target };
  return {
    front: { position: around(0), target },
    back: { position: around(Math.PI), target },
    left: { position: around(Math.PI / 2), target },
    right: { position: around(-Math.PI / 2), target },
    threeQuarter: hero,
    face: { position: FACE_POSITION, target: FACE_TARGET },
    reset: hero,
  };
}
