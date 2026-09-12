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
}

export const LIGHTING_PRESETS = [
  {
    id: "studio",
    label: "Studio",
    background: "#141210",
    hemisphere: { sky: "#e7e5e4", ground: "#44403c", intensity: 0.65 },
    directionals: [
      { position: [2.5, 3.5, 3], intensity: 2.4, color: "#fff7ed", castShadow: true },
      { position: [-3, 2, -1.5], intensity: 0.9, color: "#dbeafe" },
      { position: [0, 3, -3.5], intensity: 1.4, color: "#fef3c7" },
    ],
  },
  {
    id: "temple",
    label: "Temple",
    background: "#170f0a",
    hemisphere: { sky: "#fcd34d", ground: "#451a03", intensity: 0.5 },
    directionals: [
      { position: [1.5, 2.5, 2.5], intensity: 2.2, color: "#fbbf24", castShadow: true },
      { position: [-2.5, 1.2, 1], intensity: 0.8, color: "#f97316" },
      { position: [0, 2.5, -3], intensity: 1.1, color: "#fde68a" },
    ],
  },
  {
    id: "dawn",
    label: "Dawn",
    background: "#1e1b2e",
    hemisphere: { sky: "#c4b5fd", ground: "#312e81", intensity: 0.55 },
    directionals: [
      { position: [3, 1.5, 2], intensity: 1.9, color: "#fda4af", castShadow: true },
      { position: [-2, 2.5, -1], intensity: 0.7, color: "#a5b4fc" },
      { position: [-1, 3, -3], intensity: 1.2, color: "#e0e7ff" },
    ],
  },
  {
    id: "night",
    label: "Moonlit",
    background: "#0a0d16",
    hemisphere: { sky: "#93c5fd", ground: "#111827", intensity: 0.35 },
    directionals: [
      { position: [2, 3.5, 2.5], intensity: 1.3, color: "#bfdbfe", castShadow: true },
      { position: [-2.5, 1.5, -2], intensity: 0.5, color: "#818cf8" },
      { position: [0.5, 2, -3.5], intensity: 0.9, color: "#e2e8f0" },
    ],
  },
] as const satisfies readonly LightingPreset[];

export type LightingPresetId = (typeof LIGHTING_PRESETS)[number]["id"];

export function getLightingPreset(id: LightingPresetId): LightingPreset {
  return LIGHTING_PRESETS.find((p) => p.id === id) ?? LIGHTING_PRESETS[0];
}
