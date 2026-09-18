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
  matte: { roughness: 0.94, metalness: 0, clearcoat: 0, clearcoatRoughness: 1, envMapIntensity: 0.35, sheen: 0.3 },
  satin: { roughness: 0.55, metalness: 0.02, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.7, sheen: 0.22 },
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
  | "mouthDark"
  | "rudraksha"
  | "serpent"
  | "nagamani"
  | "lotusPetal"
  | "stem";

const FIXED_MATERIAL_KEYS: readonly FixedMaterialKey[] = [
  "eyeDark",
  "eyeWhite",
  "iris",
  "ivory",
  "tilak",
  "lotusPetal",
  "stem",
  "mouthDark",
  "rudraksha",
  "serpent",
  "nagamani",
];

export function isFixedMaterialKey(value: string): value is FixedMaterialKey {
  return (FIXED_MATERIAL_KEYS as readonly string[]).includes(value);
}

export class ZoneMaterials {
  readonly zones: Record<MaterialZone, THREE.MeshPhysicalMaterial>;
  readonly fixed: Record<FixedMaterialKey, THREE.MeshPhysicalMaterial>;
  /**
   * Zone materials that read per-vertex colour as a multiplier. A hide has
   * markings, and a statue's markings are geometry-free: the generator
   * paints them into the mesh's colour attribute, and this material lets
   * them tint the zone colour the customer chose instead of replacing it.
   */
  private readonly patterned = new Map<MaterialZone, THREE.MeshPhysicalMaterial>();
  private readonly patternedFixed = new Map<FixedMaterialKey, THREE.MeshPhysicalMaterial>();
  private readonly mapped = new Map<string, THREE.MeshPhysicalMaterial>();

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
      ivory: fixed("ivory", { color: "#f8f1e2", roughness: 0.3, clearcoat: 0.45, envMapIntensity: 1.05 }),
      tilak: fixed("tilak", { color: "#c22b21", roughness: 0.6 }),
      mouthDark: fixed("mouthDark", { color: "#3f241b", roughness: 0.75 }),
      // Rudraksha seeds keep their natural color — declared texture-fixed
      // in the manifest rather than pretending to recolor.
      rudraksha: fixed("rudraksha", { color: "#6b4423", roughness: 0.85 }),
      // The stone a naga carries on its brow. Deep and warm rather than
      // bright: it is an ornament the serpent wears, not a lamp.
      // A lotus is PINK, and a lotus painted in whatever the customer
      // chose for garment accents is a lotus that turns maroon when the
      // dhoti border does. Petal and stem are what the flower is.
      lotusPetal: fixed("lotusPetal", { color: "#e78aa4", roughness: 0.55, clearcoat: 0.2 }),
      stem: fixed("stem", { color: "#48663c", roughness: 0.7 }),
      nagamani: fixed("nagamani", {
        color: "#7c2f3a",
        roughness: 0.14,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
        envMapIntensity: 1.3,
      }),
      // A serpent is a serpent: its colour is not the customer's to pick,
      // any more than an eye's is.
      // Copper and dark bronze, the way ref4.png shows it: a regal
      // serpent, not a green one. The colour here is the LIGHTEST the
      // skin goes — its belly — because vertex colours multiply, so the
      // dark of the back is painted by darkening this rather than by
      // brightening past it.
      serpent: fixed("serpent", {
        color: "#c08a4e",
        roughness: 0.42,
        clearcoat: 0.35,
        clearcoatRoughness: 0.35,
        envMapIntensity: 1.15,
      }),
    };
  }

  get(zone: MaterialZone): THREE.MeshPhysicalMaterial {
    return this.zones[zone];
  }

  /**
   * The same zone, wearing a texture.
   *
   * The map is greyscale and multiplies the zone's colour, so the
   * customer still chooses what the garment is dyed and the texture only
   * says where the marking falls. Vertex colours stay live on top of it:
   * a piece can still shade its own hem.
   *
   * This is the answer to a pattern that cannot be carried by geometry. A
   * vertex colour is no smaller than the triangles under it, and a
   * tiger's rosettes on a few hundred quads of cloth came out as mottling
   * however the cells were set.
   */
  getMapped(zone: MaterialZone, texture: THREE.Texture): THREE.MeshPhysicalMaterial {
    const key = `${zone}:${texture.name}`;
    let material = this.mapped.get(key);
    if (!material) {
      material = this.zones[zone].clone();
      material.name = `zone:${zone}`;
      material.vertexColors = true;
      material.side = THREE.DoubleSide;
      material.map = texture;
      this.mapped.set(key, material);
      this.syncMapped(zone);
    }
    return material;
  }

  private syncMapped(zone: MaterialZone): void {
    const source = this.zones[zone];
    for (const [key, material] of this.mapped) {
      if (!key.startsWith(`${zone}:`)) continue;
      material.color.copy(source.color);
      material.roughness = source.roughness;
      material.metalness = source.metalness;
      material.clearcoat = source.clearcoat;
      material.clearcoatRoughness = source.clearcoatRoughness;
      material.envMapIntensity = source.envMapIntensity;
      material.sheen = source.sheen;
      material.sheenColor.copy(source.sheenColor);
    }
  }

  /**
   * A fixed material wearing a texture, with vertex colours live on top.
   *
   * The map says where a scale is; the vertex colours say which way the
   * skin faces, so one serpent can be dark along its back and pale under
   * its belly without either being painted in.
   */
  getMappedFixed(key: FixedMaterialKey, texture: THREE.Texture): THREE.MeshPhysicalMaterial {
    const id = `${key}:${texture.name}`;
    let material = this.mapped.get(id);
    if (!material) {
      material = this.fixed[key].clone();
      material.vertexColors = true;
      material.map = texture;
      this.mapped.set(id, material);
    }
    return material;
  }

  /**
   * A fixed material that renders its mesh's vertex colours on top.
   *
   * What a skin is made of is not the customer's to choose — a serpent is
   * green, a rudraksha seed is brown — but a single flat colour over a
   * swept tube is what makes one read as plastic. The pattern belongs to
   * the geometry that carries it; this is only the material that shows it.
   */
  getPatternedFixed(key: FixedMaterialKey): THREE.MeshPhysicalMaterial {
    let material = this.patternedFixed.get(key);
    if (!material) {
      material = this.fixed[key].clone();
      material.vertexColors = true;
      this.patternedFixed.set(key, material);
    }
    return material;
  }

  /**
   * The same zone, rendering its mesh's vertex colours on top. Meshes that
   * ask for this MUST carry a colour attribute, or they render black.
   */
  getPatterned(zone: MaterialZone): THREE.MeshPhysicalMaterial {
    let material = this.patterned.get(zone);
    if (!material) {
      material = this.zones[zone].clone();
      material.name = `zone:${zone}`;
      material.vertexColors = true;
      // Cloth is a surface, not a solid: the inside of a hem is visible.
      material.side = THREE.DoubleSide;
      this.patterned.set(zone, material);
      this.syncPatterned(zone);
      this.syncMapped(zone);
    }
    return material;
  }

  private syncPatterned(zone: MaterialZone): void {
    const patterned = this.patterned.get(zone);
    if (!patterned) return;
    const source = this.zones[zone];
    patterned.color.copy(source.color);
    patterned.roughness = source.roughness;
    patterned.metalness = source.metalness;
    patterned.clearcoat = source.clearcoat;
    patterned.clearcoatRoughness = source.clearcoatRoughness;
    patterned.envMapIntensity = source.envMapIntensity;
    patterned.sheen = source.sheen;
    patterned.sheenColor.copy(source.sheenColor);
    patterned.sheenRoughness = source.sheenRoughness;
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
      if (props.sheen > 0) {
        target.sheenColor.set(color);
        target.sheenRoughness = 0.55;
      }
      this.syncPatterned(zone);
      this.syncMapped(zone);
    }
  }

  dispose(): void {
    for (const material of Object.values(this.zones)) material.dispose();
    for (const material of Object.values(this.fixed)) material.dispose();
    for (const material of this.patterned.values()) material.dispose();
    this.patterned.clear();
    for (const material of this.patternedFixed.values()) material.dispose();
    this.patternedFixed.clear();
    for (const material of this.mapped.values()) material.dispose();
    this.mapped.clear();
  }
}
