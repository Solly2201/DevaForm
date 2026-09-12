/**
 * Canonical morph definitions.
 *
 * A morph is a named continuous deformation weight stored in
 * `configuration.morphs`. With procedural prototype assets the engine
 * applies them parametrically (geometry is re-generated with the weight);
 * production GLB assets will map the same names onto real blend shapes.
 * Either way the configuration is identical — weights in [-1, 1], 0 = neutral.
 */

export interface MorphDefinition {
  id: string;
  label: string;
  /** Which part slots consume this morph (documentation/UI grouping). */
  appliesTo: readonly string[];
}

export const FACE_MORPHS: readonly MorphDefinition[] = [
  { id: "eyeSize", label: "Eye Size", appliesTo: ["eyes"] },
  { id: "eyeSpacing", label: "Eye Spacing", appliesTo: ["eyes"] },
  { id: "eyeHeight", label: "Eye Height", appliesTo: ["eyes"] },
  { id: "browHeight", label: "Brow Height", appliesTo: ["eyes"] },
  { id: "earSize", label: "Ear Size", appliesTo: ["ears"] },
  { id: "earAngle", label: "Ear Angle", appliesTo: ["ears"] },
  { id: "trunkLength", label: "Trunk Length", appliesTo: ["trunk"] },
  { id: "trunkCurl", label: "Trunk Curl", appliesTo: ["trunk"] },
] as const;

/** Convenience: current weight of a morph, defaulting to neutral. */
export function morphWeight(
  morphs: Record<string, number>,
  id: string,
  fallback = 0,
): number {
  const value = morphs[id];
  return typeof value === "number" ? value : fallback;
}
