/**
 * Zone material set.
 *
 * All meshes of the character share one MeshPhysicalMaterial per material
 * zone. Color/finish changes mutate these materials in place — no rig
 * rebuild, no re-render of the scene graph, no material churn.
 *
 * Finishes are real PBR responses (roughness/metalness/clearcoat/
 * envMapIntensity), lit by a procedural environment map (see
 * SceneEnvironment) so gold reads as gold and polished stone reflects.
 */
import * as THREE from "three";
import {
  MATERIAL_ZONES,
  type MaterialFinish,
  type MaterialZone,
  type MaterialsConfiguration,
} from "@devaform/character-schema";

interface FinishProps {
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  envMapIntensity: number;
  sheen: number;
}

const FINISH_PROPS: Record<MaterialFinish, FinishProps> = {
  matte: { roughness: 0.94, metalness: 0, clearcoat: 0, clearcoatRoughness: 1, envMapIntensity: 0.35, sheen: 0.12 },
  satin: { roughness: 0.55, metalness: 0.02, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.7, sheen: 0.08 },
  polished: { roughness: 0.22, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 1.1, sheen: 0 },
  metallic: { roughness: 0.28, metalness: 1, clearcoat: 0.25, clearcoatRoughness: 0.25, envMapIntensity: 1.35, sheen: 0 },
};

/**
 * Zones with material behavior beyond the shared finish mapping:
 * gems get extra clearcoat/reflectivity so they read as stones.
 */
const ZONE_TWEAKS: Partial<Record<MaterialZone, Partial<FinishProps>>> = {
  gem: { clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.6 },
};

/** Fixed utility materials that are not user-configurable. */
export type FixedMaterialKey =
  | "eyeDark"
  | "eyeWhite"
  | "iris"
  | "ivory"
  | "tilak"
  | "mouthDark";

export class ZoneMaterials {
  readonly zones: Record<MaterialZone, THREE.MeshPhysicalMaterial>;
  readonly fixed: Record<FixedMaterialKey, THREE.MeshPhysicalMaterial>;

  constructor() {
    this.zones = Object.fromEntries(
      MATERIAL_ZONES.map((zone) => [
        zone,
        new THREE.MeshPhysicalMaterial({ name: `zone:${zone}` }),
      ]),
    ) as Record<MaterialZone, THREE.MeshPhysicalMaterial>;
    const fixed = (name: string, props: THREE.MeshPhysicalMaterialParameters) =>
      new THREE.MeshPhysicalMaterial({ name: `fixed:${name}`, ...props });
    this.fixed = {
      eyeDark: fixed("eyeDark", { color: "#141210", roughness: 0.18, clearcoat: 0.9 }),
      eyeWhite: fixed("eyeWhite", { color: "#f7f2e6", roughness: 0.28, clearcoat: 0.5 }),
      iris: fixed("iris", { color: "#4a2c17", roughness: 0.2, clearcoat: 0.8 }),
      ivory: fixed("ivory", { color: "#f0e7d3", roughness: 0.4, clearcoat: 0.3, envMapIntensity: 0.8 }),
      tilak: fixed("tilak", { color: "#c22b21", roughness: 0.6 }),
      mouthDark: fixed("mouthDark", { color: "#3f241b", roughness: 0.75 }),
    };
  }

  get(zone: MaterialZone): THREE.MeshPhysicalMaterial {
    return this.zones[zone];
  }

  applyConfiguration(materials: MaterialsConfiguration): void {
    for (const zone of MATERIAL_ZONES) {
      const target = this.zones[zone];
      const { color, finish } = materials[zone];
      const props: FinishProps = { ...FINISH_PROPS[finish], ...ZONE_TWEAKS[zone] };
      target.color.set(color);
      target.roughness = props.roughness;
      target.metalness = props.metalness;
      target.clearcoat = props.clearcoat;
      target.clearcoatRoughness = props.clearcoatRoughness;
      target.envMapIntensity = props.envMapIntensity;
      target.sheen = props.sheen;
      if (props.sheen > 0) target.sheenColor.set(color);
    }
  }

  dispose(): void {
    for (const material of Object.values(this.zones)) material.dispose();
    for (const material of Object.values(this.fixed)) material.dispose();
  }
}
