/**
 * The Studio's light, as a value the customer owns.
 *
 * WHAT THIS IS FOR. `engine/lighting.ts` holds five authored rigs — a
 * sanctum, a studio, a temple, a dawn, a moonlit hall — and until now the
 * whole of the customer's say in how their statue is lit was picking one
 * of them from a dropdown. A statue is a physical object someone intends
 * to have made, and how it is lit is most of what a photograph of it
 * says. One of five is not a choice about that.
 *
 * So the presets stay what they are — authored starting points, each a
 * considered rig — and this adds the dimension that was missing: the
 * customer's own adjustment on top of one. Key, fill, rim and ambient as
 * MULTIPLIERS rather than absolute intensities, because a preset's
 * balance is the thing worth keeping and an absolute slider throws it
 * away the moment the preset changes underneath it. Plus the two controls
 * that are not about any one light — exposure, and whether the key casts
 * a shadow map at all.
 *
 * WHERE IT LIVES, AND WHY NOT IN THE CHARACTER. A saved creation is a
 * statue: its parts, its pose, its materials, the things a foundry would
 * need. The light in the room is not one of those, and the repository
 * already says so in a test — `plantedStage.test.ts` asserts that a
 * default configuration carries no `camera`, `environment`, `backdrop`,
 * `pivot` or `lighting` key, and it would fail by design if this went
 * there. This is presentation, it lives with the presentation, and it is
 * serialisable so that it can be persisted beside the character rather
 * than inside it.
 *
 * AND IT IS PURE. Resolving a studio lighting value to a concrete rig
 * touches no three.js object and no React state, which is what makes it
 * something a test can hold to a number instead of to a screenshot.
 */
import {
  getLightingPreset,
  LIGHTING_PRESETS,
  type DirectionalLightSpec,
  type LightingPresetId,
} from "@/engine/lighting";

/** Which job a light in a rig is doing. */
export type LightRole = "key" | "fill" | "rim";

export interface StudioLighting {
  /** The authored rig this is an adjustment OF. */
  preset: LightingPresetId;
  /** Multipliers on the preset's own intensities. 1 is the preset as authored. */
  key: number;
  fill: number;
  rim: number;
  /** The hemisphere light, which is the ambient term and the sky's colour. */
  ambient: number;
  /**
   * Colour temperature shift across the whole rig: -1 cools it, +1 warms
   * it, 0 leaves the preset's own colours alone. One control rather than
   * a colour picker per light, because what a customer wants here is
   * "warmer", and four pickers is a lighting desk.
   */
  warmth: number;
  /** Tone-mapping exposure. The Studio never set one; this is it. */
  exposure: number;
  /**
   * Whether the key casts a shadow map.
   *
   * THE SHADOW COST STRATEGY, in one switch. There is exactly one
   * shadow-casting light in the Studio and its map is framed on the
   * figure alone — two metres across 2048 texels, which is what resolves
   * a face — and the sanctum neither casts nor receives, because the
   * two-pass render keeps it out of the frustum. That is already about as
   * cheap as a real shadow gets. What remains is the pass itself, which a
   * weak machine may simply not want to pay for, and the honest control
   * for that is off rather than a quality ladder whose rungs all cost
   * something. Off, the contact shadow still grounds the figure.
   */
  shadows: boolean;
}

/** The limits each control runs between, and what to call it. */
export const LIGHTING_CONTROLS = [
  { key: "key", label: "Key", min: 0, max: 2, step: 0.05 },
  { key: "fill", label: "Fill", min: 0, max: 2, step: 0.05 },
  { key: "rim", label: "Rim", min: 0, max: 2, step: 0.05 },
  { key: "ambient", label: "Ambient", min: 0, max: 2, step: 0.05 },
  { key: "warmth", label: "Warmth", min: -1, max: 1, step: 0.05 },
  { key: "exposure", label: "Exposure", min: 0.4, max: 1.8, step: 0.02 },
] as const satisfies ReadonlyArray<{
  key: keyof StudioLighting;
  label: string;
  min: number;
  max: number;
  step: number;
}>;

export type LightingControlKey = (typeof LIGHTING_CONTROLS)[number]["key"];

export const DEFAULT_STUDIO_LIGHTING: StudioLighting = {
  preset: "sanctum",
  key: 1,
  fill: 1,
  rim: 1,
  ambient: 1,
  warmth: 0,
  exposure: 1,
  shadows: true,
};

/**
 * Which job each of a preset's directionals is doing.
 *
 * The rigs are all written the same way and say so in their comments: the
 * key first — it is the one that casts — the rim last, and whatever is
 * between them is fill. A preset may name a role explicitly; this is what
 * it means not to. `lighting.test.ts` holds every shipped preset to the
 * convention, so a sixth one written differently fails there rather than
 * being silently misread here.
 */
export function roleOf(spec: DirectionalLightSpec, index: number, count: number): LightRole {
  if (spec.role) return spec.role;
  if (index === 0) return "key";
  if (index === count - 1) return "rim";
  return "fill";
}

/** The colour the warmth control moves toward at each end. */
const WARM = [1, 0.706, 0.412] as const;
const COOL = [0.737, 0.816, 0.91] as const;

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function hexOf(rgb: readonly [number, number, number]): string {
  const part = (channel: number) =>
    Math.round(Math.min(1, Math.max(0, channel)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

/**
 * Shift a colour toward warm or cool.
 *
 * Only part of the way, even at the ends: a rig driven all the way to one
 * end should read as warm light, not as a colour wash that has thrown
 * away the preset's own choices. A moonlit hall pushed warm is a moonlit
 * hall at sunrise, and it is still recognisably that preset.
 */
export function shift(hex: string, warmth: number): string {
  if (Math.abs(warmth) < 1e-6) return hex;
  const amount = Math.min(1, Math.abs(warmth)) * 0.45;
  const [r, g, b] = channels(hex);
  const target = warmth > 0 ? WARM : COOL;
  return hexOf([
    r + (target[0] - r) * amount,
    g + (target[1] - g) * amount,
    b + (target[2] - b) * amount,
  ]);
}

export interface ResolvedLight {
  position: readonly [number, number, number];
  intensity: number;
  color: string;
  castShadow: boolean;
  role: LightRole;
}

export interface ResolvedRig {
  presetId: LightingPresetId;
  background: string;
  hemisphere: { sky: string; ground: string; intensity: number };
  directionals: ResolvedLight[];
  envIntensity: number;
  exposure: number;
  /** True when any light in the rig is set to cast. */
  shadows: boolean;
}

const clamp = (value: number, low: number, high: number) =>
  Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : low;

/**
 * A studio lighting value, resolved to the rig it describes.
 *
 * Everything the renderer needs and nothing it does not: no React, no
 * three.js, no scene. The ambient multiplier reaches the environment
 * intensity as well as the hemisphere light, because both of them are
 * "how much light is simply around" and separating them would give the
 * customer a control that half works.
 */
export function resolveStudioLighting(lighting: StudioLighting): ResolvedRig {
  const preset = getLightingPreset(lighting.preset);
  const multiplier: Record<LightRole, number> = {
    key: clamp(lighting.key, 0, 2),
    fill: clamp(lighting.fill, 0, 2),
    rim: clamp(lighting.rim, 0, 2),
  };
  const ambient = clamp(lighting.ambient, 0, 2);
  const warmth = clamp(lighting.warmth, -1, 1);
  const directionals = preset.directionals.map((spec, index): ResolvedLight => {
    const role = roleOf(spec, index, preset.directionals.length);
    return {
      position: spec.position,
      intensity: spec.intensity * multiplier[role],
      color: shift(spec.color, warmth),
      castShadow: (spec.castShadow ?? false) && lighting.shadows,
      role,
    };
  });
  return {
    presetId: preset.id as LightingPresetId,
    background: preset.background,
    hemisphere: {
      sky: shift(preset.hemisphere.sky, warmth),
      ground: shift(preset.hemisphere.ground, warmth),
      intensity: preset.hemisphere.intensity * ambient,
    },
    directionals,
    envIntensity: preset.envIntensity * ambient,
    exposure: clamp(lighting.exposure, 0.4, 1.8),
    shadows: directionals.some((light) => light.castShadow),
  };
}

/**
 * Read a studio lighting value back from whatever was stored.
 *
 * Tolerant on purpose. What this parses came out of the customer's own
 * browser storage and may have been written by a version of the Studio
 * that offered different controls — so an unknown preset, a missing
 * field, or a number somebody edited by hand into the console all resolve
 * to the default for that field rather than to a Studio that will not
 * open. Nothing here can fail; a lighting rig is not worth an error
 * boundary.
 */
export function studioLightingFrom(value: unknown): StudioLighting {
  const source = (value ?? {}) as Partial<Record<keyof StudioLighting, unknown>>;
  const known = LIGHTING_PRESETS.some((preset) => preset.id === source.preset);
  const result: StudioLighting = {
    ...DEFAULT_STUDIO_LIGHTING,
    preset: known ? (source.preset as LightingPresetId) : DEFAULT_STUDIO_LIGHTING.preset,
    shadows: typeof source.shadows === "boolean" ? source.shadows : true,
  };
  for (const control of LIGHTING_CONTROLS) {
    const given = source[control.key];
    if (typeof given === "number" && Number.isFinite(given)) {
      (result[control.key] as number) = clamp(given, control.min, control.max);
    }
  }
  return result;
}

/** Whether this is the preset as authored, with nothing adjusted. */
export function isUnadjusted(lighting: StudioLighting): boolean {
  return (
    lighting.key === 1 &&
    lighting.fill === 1 &&
    lighting.rim === 1 &&
    lighting.ambient === 1 &&
    lighting.warmth === 0 &&
    lighting.exposure === 1 &&
    lighting.shadows
  );
}
