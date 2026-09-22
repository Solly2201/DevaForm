/**
 * Where the camera has to stand to compose the stage's picture.
 *
 * The stage says what the picture should look like — the figure fills
 * about four fifths of the frame, seen from three-quarters, looked at a
 * little above the waist. It does NOT say how far back the camera stands,
 * because that depends entirely on who is standing there: Ganesha is
 * shorter and much broader than Vishnu, and the distance that framed one
 * comfortably cropped the other's finial against the top of the frame.
 *
 * So the authored camera supplies the ANGLE and the fallback, the figure
 * supplies the size, and the distance is solved from the two. Pure
 * arithmetic on measured metres: no scene, no camera object, no three.js
 * beyond a vector, so the composition can be checked without a browser.
 */
import type { StageCamera } from "@devaform/asset-system";
import { isMeasured, type FigureExtent } from "@/engine/figureExtent";

export interface HeroComposition {
  position: [number, number, number];
  target: [number, number, number];
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * How far back a camera must stand for something `half` metres from the
 * middle of the frame to its edge to fill `fill` of that frame, through a
 * lens whose half-angle is `halfAngle`.
 *
 * A STATUE IS NOT FLAT, which the first version of this forgot. The
 * furthest point of a figure's silhouette is on the side of it nearest
 * the camera — a broad Ganesha's shoulder is a third of a metre closer
 * than his spine — and a perspective lens magnifies what is nearer. Solve
 * against the near face, `depth` metres in front of the axis the distance
 * is measured to, or the widest figures project past the frame edge by
 * exactly the amount the solver ignored.
 */
function standBack(half: number, halfAngle: number, fill: number, depth: number): number {
  const angle = Math.max(0.02, halfAngle * clamp(fill, 0.1, 1));
  return half / Math.tan(angle) + Math.max(0, depth);
}

/** The lens, as the two half-angles it actually subtends. */
function lens(fovDegrees: number, aspect: number) {
  const vertical = (fovDegrees * Math.PI) / 180 / 2;
  return { vertical, horizontal: Math.atan(Math.tan(vertical) * Math.max(0.2, aspect)) };
}

/** The authored composition, unit direction from target to camera. */
function heroDirection(camera: StageCamera): [number, number, number] {
  const dx = camera.position[0] - camera.target[0];
  const dy = camera.position[1] - camera.target[1];
  const dz = camera.position[2] - camera.target[2];
  const length = Math.hypot(dx, dy, dz) || 1;
  return [dx / length, dy / length, dz / length];
}

/**
 * The hero composition for the figure that is actually on the stage.
 *
 * Both dimensions are fitted and the binding one wins — a broad figure is
 * framed by its width and a tall one by its height, which is the whole
 * difference between Ganesha and Vishnu. The vertical half-span is
 * measured from the point the camera LOOKS at rather than from the
 * figure's middle, because a camera aimed above the waist has more
 * statue below it than above and the longer side is what has to fit.
 */
export function heroComposition(
  camera: StageCamera,
  figure: FigureExtent | null,
  aspect: number,
): HeroComposition {
  if (!isMeasured(figure)) {
    return {
      position: [...camera.position] as [number, number, number],
      target: [...camera.target] as [number, number, number],
    };
  }

  const height = figure.topY - figure.footY;
  const targetY = figure.footY + height * camera.framing.lookAt;
  const target: [number, number, number] = [figure.centreX, targetY, figure.centreZ];

  const { vertical, horizontal } = lens(camera.fov, aspect);
  const halfHeight = Math.max(figure.topY - targetY, targetY - figure.footY);
  const reach = Math.max(figure.radius, 1e-3);
  const distance = clamp(
    Math.max(
      standBack(halfHeight, vertical, camera.framing.fill, reach),
      standBack(reach, horizontal, camera.framing.fill, reach),
    ),
    camera.minDistance,
    camera.maxDistance,
  );

  const [dx, dy, dz] = heroDirection(camera);
  return {
    position: [target[0] + dx * distance, target[1] + dy * distance, target[2] + dz * distance],
    target,
  };
}

/**
 * The portrait, composed the same way but about the head.
 *
 * "The face" is the one view that is not the hero swung around, and it
 * used to be two hardcoded points a metre and a sixth off the floor —
 * true of the figure they were read off and of no other. The head joint
 * is where the skull starts and whatever is above it is head and crown,
 * so the portrait's subject is that span, measured.
 */
export function portraitComposition(
  camera: StageCamera,
  figure: FigureExtent | null,
  aspect: number,
): HeroComposition | null {
  if (!isMeasured(figure)) return null;

  const crown = Math.max(0.04, figure.topY - figure.headY);
  const { vertical, horizontal } = lens(camera.fov, aspect);
  const { fill, lookAt } = camera.framing.portrait;
  // A portrait is chin-to-finial: the span above the head joint, and as
  // much again below it for the jaw and throat.
  const half = crown;
  const targetY = figure.headY + crown * lookAt;
  const target: [number, number, number] = [figure.centreX, targetY, figure.centreZ];
  const distance = clamp(
    Math.max(
      standBack(half, vertical, fill, half * 0.5),
      standBack(half, horizontal, fill, half * 0.5),
    ),
    camera.minDistance,
    camera.maxDistance,
  );

  // Nearly face-on, turned just off the axis so the portrait has a side
  // to it — the hero's own azimuth, softened.
  const [dx, , dz] = heroDirection(camera);
  const azimuth = Math.atan2(dx, dz) * 0.35;
  return {
    position: [
      target[0] + Math.sin(azimuth) * distance,
      target[1] + crown * 0.25,
      target[2] + Math.cos(azimuth) * distance,
    ],
    target,
  };
}
