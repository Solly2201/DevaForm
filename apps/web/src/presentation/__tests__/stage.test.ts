/**
 * The presentation layer, where it meets the engine.
 *
 * Two things the stage config cannot check on its own: that the lighting
 * it names actually exists in the renderer, and that the camera views the
 * viewport offers are derived from the stage's hero composition rather
 * than from constants that have to be kept in step with it by hand.
 *
 * Both have gone wrong in products before in the same way — a config
 * naming something the renderer dropped, and a "reset" button that no
 * longer resets to where the intro ended.
 */
import { describe, expect, it } from "vitest";
import { getPresentation, PRESENTATIONS } from "@devaform/asset-system";
import { LIGHTING_PRESETS, getLightingPreset } from "@/engine/lighting";
import { heroComposition } from "@/presentation/heroFraming";
import { stageViews } from "@/presentation/stageViews";

describe("a stage names lighting the renderer has", () => {
  it.each(PRESENTATIONS.map((stage) => stage.id))("%s", (id) => {
    const stage = PRESENTATIONS.find((entry) => entry.id === id)!;
    const known = LIGHTING_PRESETS.map((preset) => preset.id);
    expect(known, `${id} names a lighting preset that exists`).toContain(stage.lighting);

    // And that lighting is a rig rather than a single lamp: a statue
    // needs a key to sculpt it, a fill to keep the shadow side readable
    // and a rim to lift it off a dark hall.
    const preset = getLightingPreset(stage.lighting as (typeof known)[number]);
    expect(preset.directionals.length, "key, fill and rim at least").toBeGreaterThanOrEqual(3);
    expect(preset.directionals.some((light) => light.castShadow)).toBe(true);
    // Restrained on purpose. Shiva's skin is ash-pale and the first thing
    // a generous key does to it is blow it to paper.
    const strongest = Math.max(...preset.directionals.map((light) => light.intensity));
    expect(strongest, `${id}: the key is not blowing the figure out`).toBeLessThan(3);
    expect(preset.envIntensity).toBeLessThan(0.6);
  });
});

describe("the named views come from the stage", () => {
  const stage = getPresentation("shiva");
  // A figure on the stage, as the engine measures one — the views are a
  // composition about a statue, and without one there is nothing to
  // compose about. See heroFraming.test.ts for the composition itself.
  const figure = {
    footY: 0,
    topY: 1.1,
    headY: 0.92,
    centreX: 0,
    centreZ: 0,
    radius: 0.24,
  };
  const frame = { figure, aspect: 16 / 9 };
  const views = stageViews(stage, frame);

  it("resets to exactly where the entry sequence settled", () => {
    const hero = heroComposition(stage.camera, figure, frame.aspect);
    expect(views.reset.position).toEqual(hero.position);
    expect(views.reset.target).toEqual(hero.target);
    expect(views.threeQuarter).toEqual(views.reset);
  });

  it("swings the same camera about the figure", () => {
    const [tx, , tz] = views.reset.target;
    const distance = (view: { position: [number, number, number] }) =>
      Math.hypot(view.position[0] - tx, view.position[2] - tz);
    const hero = distance(views.reset);
    for (const id of ["front", "back", "left", "right"] as const) {
      expect(distance(views[id]), `${id} is the same distance out`).toBeCloseTo(hero, 5);
      expect(views[id].position[1], `${id} is at the same height`).toBeCloseTo(
        views.reset.position[1],
        5,
      );
    }
    // Front and back are opposite each other, not the same place.
    expect(views.front.position[2]).toBeGreaterThan(views.back.position[2]);
    expect(views.left.position[0]).toBeGreaterThan(views.right.position[0]);
  });

  it("frames the face on the head, which is the one view that is not the hero", () => {
    expect(views.face.target[1]).toBeGreaterThan(figure.headY);
    expect(views.face).not.toEqual(views.reset);
  });

  it("falls back to the stage's own coordinates with nobody measured", () => {
    const bare = stageViews(stage);
    expect(bare.reset.position).toEqual([...stage.camera.position]);
    expect(bare.reset.target).toEqual([...stage.camera.target]);
  });

  it("gives every deity the same derivation", () => {
    for (const deity of ["ganesha", "shiva", "vishnu", "nobody"]) {
      const theirs = stageViews(getPresentation(deity), frame);
      expect(theirs.reset.position, deity).toEqual(
        heroComposition(getPresentation(deity).camera, figure, frame.aspect).position,
      );
    }
  });
});
