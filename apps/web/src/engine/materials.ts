/**
 * Zone material set.
 *
 * All meshes of the character share one MeshStandardMaterial per material
 * zone. Color/finish changes mutate these materials in place — no rig
 * rebuild, no re-render of the scene graph, no material churn.
 */
import * as THREE from "three";
import {
  MATERIAL_ZONES,
  type MaterialFinish,
  type MaterialZone,
  type MaterialsConfiguration,
} from "@devaform/character-schema";

const FINISH_PROPS: Record<MaterialFinish, { roughness: number; metalness: number }> = {
  matte: { roughness: 0.9, metalness: 0 },
  satin: { roughness: 0.55, metalness: 0.05 },
  polished: { roughness: 0.2, metalness: 0.1 },
  metallic: { roughness: 0.32, metalness: 1 },
};

/** Fixed utility materials that are not user-configurable. */
export type FixedMaterialKey = "eyeDark" | "eyeLight" | "ivory";

export class ZoneMaterials {
  readonly zones: Record<MaterialZone, THREE.MeshStandardMaterial>;
  readonly fixed: Record<FixedMaterialKey, THREE.MeshStandardMaterial>;

  constructor() {
    this.zones = Object.fromEntries(
      MATERIAL_ZONES.map((zone) => [
        zone,
        new THREE.MeshStandardMaterial({ name: `zone:${zone}` }),
      ]),
    ) as Record<MaterialZone, THREE.MeshStandardMaterial>;
    this.fixed = {
      eyeDark: new THREE.MeshStandardMaterial({ name: "fixed:eyeDark", color: "#1c1917", roughness: 0.35 }),
      eyeLight: new THREE.MeshStandardMaterial({ name: "fixed:eyeLight", color: "#f5f0e6", roughness: 0.4 }),
      ivory: new THREE.MeshStandardMaterial({ name: "fixed:ivory", color: "#efe6d0", roughness: 0.5 }),
    };
  }

  get(zone: MaterialZone): THREE.MeshStandardMaterial {
    return this.zones[zone];
  }

  applyConfiguration(materials: MaterialsConfiguration): void {
    for (const zone of MATERIAL_ZONES) {
      const target = this.zones[zone];
      const { color, finish } = materials[zone];
      target.color.set(color);
      target.roughness = FINISH_PROPS[finish].roughness;
      target.metalness = FINISH_PROPS[finish].metalness;
    }
  }

  dispose(): void {
    for (const material of Object.values(this.zones)) material.dispose();
    for (const material of Object.values(this.fixed)) material.dispose();
  }
}
