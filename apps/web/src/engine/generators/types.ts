import type * as THREE from "three";
import type {
  ArmsConfiguration,
  HandsConfiguration,
  JointId,
  Proportions,
} from "@devaform/character-schema";
import type { ZoneMaterials } from "../materials";

export interface GeneratorContext {
  /** Static parameters from the asset manifest entry. */
  params: Record<string, number | string>;
  materials: ZoneMaterials;
  proportions: Proportions;
  /** Live morph weights from the configuration (parametric morphs). */
  morphs: Record<string, number>;
  hands: HandsConfiguration;
  arms: ArmsConfiguration;
  /**
   * True when the active pose preset is seated. Clothing generators use
   * pose-compatible geometry (a draped lap instead of a full skirt).
   */
  seated: boolean;
}

/** A part places objects onto one or more joints so posing articulates it. */
export type JointedPart = ReadonlyArray<{ joint: JointId; object: THREE.Object3D }>;

export type PartGenerator = (ctx: GeneratorContext) => JointedPart;
export type AttachmentGenerator = (ctx: GeneratorContext) => THREE.Object3D;

export const num = (ctx: GeneratorContext, key: string, fallback: number): number => {
  const value = ctx.params[key];
  return typeof value === "number" ? value : fallback;
};

export const morph = (ctx: GeneratorContext, key: string): number => {
  const value = ctx.morphs[key];
  return typeof value === "number" ? value : 0;
};
