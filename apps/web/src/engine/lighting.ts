/**
 * Lighting presets — self-contained light rigs (no network HDR dependency).
 * Each preset defines ambient/hemisphere plus key/fill/rim directional
 * lights and a background color for the viewport.
 */

export interface DirectionalLightSpec {
  position: [number, number, number];
  intensity: number;
  color: string;
  castShadow?: boolean;
}

export interface LightingPreset {
  id: string;
  label: string;
  background: string;
  hemisphere: { sky: string; ground: string; intensity: number };
  directionals: DirectionalLightSpec[];
  /** Image-based lighting strength (see SceneEnvironment). */
  envIntensity: number;
}

export const LIGHTING_PRESETS = [
  {
    id: "studio",
    label: "Studio",
    background: "#131110",
    hemisphere: { sky: "#e8e0d5", ground: "#38312a", intensity: 0.32 },
    directionals: [
      // Key — warm, high, slightly camera-left
      { position: [2.2, 3.2, 2.8], intensity: 1.9, color: "#fff0da", castShadow: true },
      // Fill — cool, low, camera-right; keeps the face readable
      { position: [-2.8, 1.4, 2.2], intensity: 0.65, color: "#d8e2ef" },
      // Rim — behind, separates silhouette from the dark backdrop
      { position: [-0.5, 2.8, -3.2], intensity: 1.3, color: "#ffe4b0" },
    ],
    envIntensity: 0.35,
  },
  {
    id: "temple",
    label: "Temple",
    background: "#171009",
    hemisphere: { sky: "#fcd34d", ground: "#451a03", intensity: 0.6 },
    directionals: [
      { position: [1.5, 2.5, 2.5], intensity: 1.8, color: "#fbbf24", castShadow: true },
      { position: [-2.5, 1.2, 1.5], intensity: 0.7, color: "#f97316" },
      { position: [0, 2.5, -3], intensity: 1.1, color: "#fde68a" },
    ],
    envIntensity: 0.45,
  },
  {
    id: "dawn",
    label: "Dawn",
    background: "#1d1a2c",
    hemisphere: { sky: "#c4b5fd", ground: "#312e81", intensity: 0.65 },
    directionals: [
      { position: [3, 1.5, 2], intensity: 1.7, color: "#fda4af", castShadow: true },
      { position: [-2, 2.5, 0.5], intensity: 0.7, color: "#a5b4fc" },
      { position: [-1, 3, -3], intensity: 1.1, color: "#e0e7ff" },
    ],
    envIntensity: 0.42,
  },
  {
    id: "night",
    label: "Moonlit",
    background: "#0a0d15",
    hemisphere: { sky: "#93c5fd", ground: "#111827", intensity: 0.45 },
    directionals: [
      { position: [2, 3.5, 2.5], intensity: 1.7, color: "#cfe1f7", castShadow: true },
      { position: [-2.5, 1.5, 1], intensity: 0.6, color: "#818cf8" },
      { position: [0.5, 2, -3.5], intensity: 1.2, color: "#e2e8f0" },
    ],
    envIntensity: 0.45,
  },
] as const satisfies readonly LightingPreset[];

export type LightingPresetId = (typeof LIGHTING_PRESETS)[number]["id"];

export function getLightingPreset(id: LightingPresetId): LightingPreset {
  return LIGHTING_PRESETS.find((p) => p.id === id) ?? LIGHTING_PRESETS[0];
}
