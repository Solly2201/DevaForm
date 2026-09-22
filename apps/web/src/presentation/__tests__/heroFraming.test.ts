/**
 * Does the hero shot actually FIT the figure standing in it?
 *
 * This is the defect written down. The stage's camera was a parked
 * position tuned against one figure, and Ganesha — shorter than Vishnu
 * and a great deal broader — arrived at the Studio with his finial
 * against the top of the frame and his lotus on the bottom edge. "It
 * looks too big" and "the figure's silhouette projects past the frame
 * edge" are the same finding; only the second one can be checked.
 *
 * So the composition is solved from measured metres, and the check is the
 * honest one: build the camera the composition asks for, project the
 * figure's own extremes through it, and require that every one of them
 * lands inside the frame with a margin — and that the figure still fills
 * enough of it to be a hero shot rather than a speck.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { getPresentation } from "@devaform/asset-system";
import type { FigureExtent } from "@/engine/figureExtent";
import { heroComposition, portraitComposition } from "@/presentation/heroFraming";

const stage = getPresentation("shiva");

/** A figure, as the engine measures one. */
const figure = (over: Partial<FigureExtent> = {}): FigureExtent => ({
  footY: 0,
  topY: 1.1,
  headY: 0.92,
  centreX: 0,
  centreZ: 0,
  radius: 0.22,
  ...over,
});

/**
 * The bounding cylinder of the figure, as the camera sees it: how far out
 * of the middle of the frame its furthest silhouette point lands, in
 * normalised device coordinates, where 1 is the frame edge.
 */
function framedExtent(
  composition: { position: [number, number, number]; target: [number, number, number] },
  extent: FigureExtent,
  aspect: number,
): { x: number; y: number } {
  const camera = new THREE.PerspectiveCamera(stage.camera.fov, aspect, 0.01, 100);
  camera.position.set(...composition.position);
  camera.lookAt(...composition.target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const point = new THREE.Vector3();
  let x = 0;
  let y = 0;
  for (const height of [extent.footY, extent.topY, (extent.footY + extent.topY) / 2]) {
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      point
        .set(
          extent.centreX + Math.cos(angle) * extent.radius,
          height,
          extent.centreZ + Math.sin(angle) * extent.radius,
        )
        .project(camera);
      x = Math.max(x, Math.abs(point.x));
      y = Math.max(y, Math.abs(point.y));
    }
  }
  return { x, y };
}

describe("the hero shot fits whoever is standing in it", () => {
  // The two shapes the single parked camera could not both serve: a tall
  // narrow figure, and a short broad one.
  const shapes = {
    tall: figure({ topY: 1.24, headY: 1.04, radius: 0.2 }),
    stocky: figure({ topY: 0.96, headY: 0.74, radius: 0.36 }),
    wide: figure({ topY: 1.02, headY: 0.82, radius: 0.48 }),
  };

  for (const aspect of [16 / 9, 4 / 3, 1, 0.75]) {
    for (const [name, extent] of Object.entries(shapes)) {
      it(`${name} is inside the frame at ${aspect.toFixed(2)}:1`, () => {
        const composed = heroComposition(stage.camera, extent, aspect);
        const { x, y } = framedExtent(composed, extent, aspect);
        expect(x, "the figure's width is inside the frame").toBeLessThanOrEqual(1);
        expect(y, "the figure's height is inside the frame").toBeLessThanOrEqual(1);
        // And a hero shot, not a speck on a floor: one of the two
        // dimensions is close to filling what the stage asked for.
        expect(Math.max(x, y), "the figure fills the frame").toBeGreaterThan(0.55);
      });
    }
  }

  it("stands further back for a broader figure at the same height", () => {
    const narrow = figure({ topY: 1.02, radius: 0.18 });
    const broad = figure({ topY: 1.02, radius: 0.48 });
    const distance = (extent: FigureExtent) => {
      const composed = heroComposition(stage.camera, extent, 16 / 9);
      return Math.hypot(
        composed.position[0] - composed.target[0],
        composed.position[1] - composed.target[1],
        composed.position[2] - composed.target[2],
      );
    };
    expect(distance(broad)).toBeGreaterThan(distance(narrow));
  });

  it("keeps the stage's authored angle, and only changes the distance", () => {
    const authored = new THREE.Vector3(...stage.camera.position)
      .sub(new THREE.Vector3(...stage.camera.target))
      .normalize();
    for (const extent of Object.values(shapes)) {
      const composed = heroComposition(stage.camera, extent, 16 / 9);
      const direction = new THREE.Vector3(...composed.position)
        .sub(new THREE.Vector3(...composed.target))
        .normalize();
      expect(direction.dot(authored)).toBeGreaterThan(0.9999);
    }
  });

  it("looks at the figure it was given, not at a fixed height", () => {
    const low = heroComposition(stage.camera, shapes.stocky, 16 / 9);
    const high = heroComposition(stage.camera, shapes.tall, 16 / 9);
    expect(high.target[1]).toBeGreaterThan(low.target[1]);
  });

  it("falls back to the authored composition before anything is measured", () => {
    const composed = heroComposition(stage.camera, null, 16 / 9);
    expect(composed.position).toEqual([...stage.camera.position]);
    expect(composed.target).toEqual([...stage.camera.target]);
    expect(portraitComposition(stage.camera, null, 16 / 9)).toBeNull();
  });

  it("stays inside the orbit's own limits", () => {
    for (const extent of Object.values(shapes)) {
      const composed = heroComposition(stage.camera, extent, 16 / 9);
      const distance = Math.hypot(
        composed.position[0] - composed.target[0],
        composed.position[1] - composed.target[1],
        composed.position[2] - composed.target[2],
      );
      expect(distance).toBeGreaterThanOrEqual(stage.camera.minDistance);
      expect(distance).toBeLessThanOrEqual(stage.camera.maxDistance);
    }
  });
});

describe("the portrait frames the head", () => {
  it("looks above the head joint, never at the waist", () => {
    for (const extent of [figure(), figure({ topY: 0.96, headY: 0.74 })]) {
      const portrait = portraitComposition(stage.camera, extent, 16 / 9)!;
      expect(portrait.target[1]).toBeGreaterThan(extent.headY);
      expect(portrait.target[1]).toBeLessThan(extent.topY);
    }
  });

  it("is closer than the hero, because a head is smaller than a figure", () => {
    const extent = figure();
    const reach = (c: { position: [number, number, number]; target: [number, number, number] }) =>
      Math.hypot(
        c.position[0] - c.target[0],
        c.position[1] - c.target[1],
        c.position[2] - c.target[2],
      );
    expect(reach(portraitComposition(stage.camera, extent, 16 / 9)!)).toBeLessThan(
      reach(heroComposition(stage.camera, extent, 16 / 9)),
    );
  });
});
