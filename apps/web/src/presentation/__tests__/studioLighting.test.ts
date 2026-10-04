/**
 * The Studio's light is the customer's, and it is not the character's.
 *
 * Two claims, and they are the whole of what this holds.
 *
 * THE FIRST is that adjusting the rig means something. A set of sliders
 * that move numbers nobody reads is the standard way a "customisable"
 * feature ships broken, and it looks identical to a working one from the
 * outside. So the resolving is pure — no three.js, no React, no scene —
 * and every control is pushed to both ends and the result measured.
 *
 * THE SECOND is the boundary. A saved creation is a statue: its parts,
 * its pose, its materials, the things a foundry needs. The light in the
 * room is not one of those. `plantedStage.test.ts` already asserts that a
 * character carries no stage; this asserts the other direction — that the
 * lighting value is plain serialisable data, so it can be stored beside a
 * character without ever being stored inside one.
 */
import { describe, expect, it } from "vitest";
import { LIGHTING_PRESETS, type LightingPreset } from "@/engine/lighting";
import {
  DEFAULT_STUDIO_LIGHTING,
  LIGHTING_CONTROLS,
  isUnadjusted,
  resolveStudioLighting,
  roleOf,
  shift,
  studioLightingFrom,
  type StudioLighting,
} from "../studioLighting";

const withValue = (over: Partial<StudioLighting>): StudioLighting => ({
  ...DEFAULT_STUDIO_LIGHTING,
  ...over,
});

describe("every shipped rig is written to the convention the roles assume", () => {
  /**
   * `roleOf` reads an unnamed rig as key-first, rim-last, fill between.
   * That is true of all five today and it is true because they were
   * written that way, not because anything made them. This is what makes
   * them.
   */
  for (const preset of LIGHTING_PRESETS as readonly LightingPreset[]) {
    it(`${preset.id}: one key, and it is the one that casts`, () => {
      const casting = preset.directionals.filter((light) => light.castShadow);
      expect(casting, `${preset.id} has exactly one shadow-casting light`).toHaveLength(1);
      const roles = preset.directionals.map((light, index) =>
        roleOf(light, index, preset.directionals.length),
      );
      expect(roles[0], `${preset.id}'s first light is the key`).toBe("key");
      expect(roles[roles.length - 1], `${preset.id}'s last light is the rim`).toBe("rim");
      expect(preset.directionals[0]?.castShadow, `${preset.id}'s key is the caster`).toBe(true);
      // And a rig is a rig: a key and a rim at the very least.
      expect(preset.directionals.length).toBeGreaterThanOrEqual(2);
    });
  }
});

describe("adjusting the rig changes the rig", () => {
  it("the default resolves to the preset exactly as authored", () => {
    const rig = resolveStudioLighting(DEFAULT_STUDIO_LIGHTING);
    const preset = LIGHTING_PRESETS.find((entry) => entry.id === DEFAULT_STUDIO_LIGHTING.preset)!;
    expect(rig.directionals.map((light) => light.intensity)).toEqual(
      preset.directionals.map((light) => light.intensity),
    );
    expect(rig.directionals.map((light) => light.color)).toEqual(
      preset.directionals.map((light) => light.color),
    );
    expect(rig.hemisphere.intensity).toBe(preset.hemisphere.intensity);
    expect(rig.envIntensity).toBe(preset.envIntensity);
    expect(rig.exposure).toBe(1);
    expect(isUnadjusted(DEFAULT_STUDIO_LIGHTING)).toBe(true);
  });

  it("each of key, fill and rim moves its own lights and nobody else's", () => {
    const base = resolveStudioLighting(DEFAULT_STUDIO_LIGHTING);
    for (const role of ["key", "fill", "rim"] as const) {
      const doubled = resolveStudioLighting(withValue({ [role]: 2 }));
      for (let i = 0; i < base.directionals.length; i += 1) {
        const before = base.directionals[i]!;
        const after = doubled.directionals[i]!;
        if (before.role === role) {
          expect(after.intensity, `${role} light ${i} doubled`).toBeCloseTo(
            before.intensity * 2,
            6,
          );
        } else {
          expect(after.intensity, `${role} left light ${i} alone`).toBeCloseTo(
            before.intensity,
            6,
          );
        }
      }
      // And zero is off, not "a bit dimmer".
      const dark = resolveStudioLighting(withValue({ [role]: 0 }));
      for (const light of dark.directionals) {
        if (light.role === role) expect(light.intensity).toBe(0);
      }
    }
  });

  it("ambient reaches the hemisphere AND the environment", () => {
    const base = resolveStudioLighting(DEFAULT_STUDIO_LIGHTING);
    const up = resolveStudioLighting(withValue({ ambient: 1.5 }));
    expect(up.hemisphere.intensity).toBeCloseTo(base.hemisphere.intensity * 1.5, 6);
    // Both of these are "how much light is simply around", and a control
    // that moved one of them would half work.
    expect(up.envIntensity).toBeCloseTo(base.envIntensity * 1.5, 6);
  });

  it("warmth moves the rig, and the two ends go opposite ways", () => {
    const base = resolveStudioLighting(DEFAULT_STUDIO_LIGHTING);
    const warm = resolveStudioLighting(withValue({ warmth: 1 }));
    const cool = resolveStudioLighting(withValue({ warmth: -1 }));
    const red = (hex: string) => Number.parseInt(hex.slice(1, 3), 16);
    const blue = (hex: string) => Number.parseInt(hex.slice(5, 7), 16);
    for (let i = 0; i < base.directionals.length; i += 1) {
      const hot = warm.directionals[i]!.color;
      const cold = cool.directionals[i]!.color;
      /**
       * Warmer has relatively more red than blue than cooler does. Said
       * as a ratio because the presets' own colours differ wildly and an
       * absolute threshold would be a claim about one of them.
       *
       * And NOT as "every colour changes": the sanctum's lamp is already
       * exactly the colour warm moves toward, so warming it is correctly
       * a no-op. A light that is already there stays there.
       */
      expect(red(hot) / Math.max(1, blue(hot)), `light ${i} warm vs cool`).toBeGreaterThan(
        red(cold) / Math.max(1, blue(cold)),
      );
    }
    // The rig as a whole does move, which is the thing a customer sees.
    expect(warm.directionals.map((l) => l.color)).not.toEqual(
      base.directionals.map((l) => l.color),
    );
    expect(cool.directionals.map((l) => l.color)).not.toEqual(
      base.directionals.map((l) => l.color),
    );
    // But not all the way: a moonlit hall pushed warm is still a moonlit
    // hall, at sunrise.
    expect(shift("#000000", 1)).not.toBe("#ffb469");
  });

  it("exposure is carried through and clamped to something sane", () => {
    expect(resolveStudioLighting(withValue({ exposure: 1.4 })).exposure).toBeCloseTo(1.4, 6);
    expect(resolveStudioLighting(withValue({ exposure: 99 })).exposure).toBeLessThanOrEqual(1.8);
    expect(resolveStudioLighting(withValue({ exposure: -5 })).exposure).toBeGreaterThanOrEqual(
      0.4,
    );
  });

  it("turning shadows off removes every caster, and leaves the lights alone", () => {
    const lit = resolveStudioLighting(DEFAULT_STUDIO_LIGHTING);
    const flat = resolveStudioLighting(withValue({ shadows: false }));
    expect(lit.shadows).toBe(true);
    expect(flat.shadows).toBe(false);
    expect(flat.directionals.every((light) => !light.castShadow)).toBe(true);
    // The whole point is that it costs a pass, not a look: the lights are
    // exactly as bright as they were.
    expect(flat.directionals.map((l) => l.intensity)).toEqual(
      lit.directionals.map((l) => l.intensity),
    );
  });

  it("every preset can be chosen, and choosing one changes the rig", () => {
    const seen = new Set<string>();
    for (const preset of LIGHTING_PRESETS) {
      const rig = resolveStudioLighting(withValue({ preset: preset.id }));
      expect(rig.presetId).toBe(preset.id);
      seen.add(`${rig.background}|${rig.directionals.map((l) => l.intensity).join(",")}`);
    }
    // Five rigs, five different rigs. A preset list where two entries
    // resolve the same is a choice that is not one.
    expect(seen.size).toBe(LIGHTING_PRESETS.length);
  });
});

describe("a stored lighting value cannot stop the Studio opening", () => {
  it("reads back what it wrote", () => {
    const chosen = withValue({ preset: "night", key: 0.6, warmth: -0.4, shadows: false });
    expect(studioLightingFrom(JSON.parse(JSON.stringify(chosen)))).toEqual(chosen);
  });

  it("survives nonsense, missing fields and an unknown preset", () => {
    expect(studioLightingFrom(undefined)).toEqual(DEFAULT_STUDIO_LIGHTING);
    expect(studioLightingFrom(null)).toEqual(DEFAULT_STUDIO_LIGHTING);
    expect(studioLightingFrom({})).toEqual(DEFAULT_STUDIO_LIGHTING);
    expect(studioLightingFrom({ preset: "a-rig-that-never-shipped" }).preset).toBe(
      DEFAULT_STUDIO_LIGHTING.preset,
    );
    expect(studioLightingFrom({ key: "bright" }).key).toBe(1);
    expect(studioLightingFrom({ exposure: Number.NaN }).exposure).toBe(1);
    // Out of range is clamped rather than refused: it is still an
    // intention, just one from a Studio with different limits.
    expect(studioLightingFrom({ key: 99 }).key).toBe(2);
    expect(studioLightingFrom({ warmth: -99 }).warmth).toBe(-1);
  });

  /**
   * AND IT IS PLAIN DATA.
   *
   * The thing that makes this storable beside a character rather than
   * inside one is that it is numbers, booleans and a string — no THREE
   * object, no function, nothing that would have to be reconstructed. The
   * repository's rule about raw three.js objects in persisted state is
   * what this is holding.
   */
  it("is JSON, all the way down", () => {
    const round = JSON.parse(JSON.stringify(DEFAULT_STUDIO_LIGHTING));
    expect(round).toEqual(DEFAULT_STUDIO_LIGHTING);
    for (const [key, value] of Object.entries(DEFAULT_STUDIO_LIGHTING)) {
      expect(["number", "boolean", "string"], `${key} is a primitive`).toContain(typeof value);
    }
    // Every control the UI offers is a field the model actually has.
    for (const control of LIGHTING_CONTROLS) {
      expect(DEFAULT_STUDIO_LIGHTING).toHaveProperty(control.key);
      expect(typeof DEFAULT_STUDIO_LIGHTING[control.key]).toBe("number");
    }
  });
});
