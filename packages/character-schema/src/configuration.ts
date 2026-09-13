/**
 * CharacterConfiguration — the single source of truth for a customized deity.
 *
 * Design goals:
 * - serializable (plain JSON, no class instances)
 * - versioned (schemaVersion + migrations in serialization.ts)
 * - deterministic (config + asset versions => identical character)
 * - deity-agnostic core, deity-specific slot/asset content
 *
 * The UI writes it, the 3D engine reads it, the backend persists it and the
 * print pipeline will eventually consume it.
 */
import { z } from "zod";
import { ARM_SLOTS, isJointId, type ArmSlot } from "./skeleton";
import { isSocketId } from "./sockets";

export const SCHEMA_VERSION = 1;

/** Deities a configuration may reference — widened as deities are added. */
export const DEITY_IDS = ["ganesha", "shiva"] as const;
export type DeityId = (typeof DEITY_IDS)[number];

/**
 * Part slots — mesh regions of the character that are swapped as whole
 * components. Deity definitions declare which slots they use; the engine
 * renders whatever slots are present.
 */
export const PART_SLOTS = [
  "body",
  "head",
  "eyes",
  "ears",
  "trunk",
  "tusks",
  "hair",
  "hands",
  "lowerGarment",
  "upperGarment",
  "earrings",
  "armlets",
  "bracelets",
  "anklets",
] as const;
export type PartSlot = (typeof PART_SLOTS)[number];

/** Reference to a registered asset at a specific published version. */
export const assetRefSchema = z.object({
  assetId: z.string().min(1),
  version: z.number().int().positive(),
});
export type AssetRef = z.infer<typeof assetRefSchema>;

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof vec3Schema>;

const jointIdSchema = z.string().refine(isJointId, { message: "unknown joint id" });
const socketIdSchema = z.string().refine(isSocketId, { message: "unknown socket id" });

/**
 * Pose: an optional named preset plus per-joint euler overrides (radians).
 * Overrides are applied on top of the preset, so a user can start from
 * "blessing" and tweak one wrist. Unknown/missing joints fall back to rest.
 */
export const poseConfigurationSchema = z.object({
  preset: z.string().nullable(),
  jointOverrides: z.record(jointIdSchema, vec3Schema),
});
export type PoseConfiguration = z.infer<typeof poseConfigurationSchema>;

/**
 * Attachment: an asset placed on a socket, with an optional user transform
 * (applied on top of the asset's own default socket transform).
 */
export const attachmentConfigurationSchema = z.object({
  socket: socketIdSchema,
  asset: assetRefSchema,
  offset: z
    .object({
      position: vec3Schema.optional(),
      rotation: vec3Schema.optional(),
      scale: z.number().positive().optional(),
    })
    .optional(),
});
export type AttachmentConfiguration = z.infer<typeof attachmentConfigurationSchema>;

/**
 * Material zones — logical color/finish regions. Production materials will
 * map zones to PBR material variants; for now each zone is a color + finish.
 */
export const MATERIAL_ZONES = ["skin", "skinSecondary", "hair", "garment", "garmentAccent", "metal", "gem", "base"] as const;
export type MaterialZone = (typeof MATERIAL_ZONES)[number];

/**
 * Zones added after launch default on parse so configurations saved before
 * the zone existed keep loading byte-for-byte (the default is only material
 * for assets that actually declare the zone).
 */
const LATE_ZONE_DEFAULTS: Partial<Record<MaterialZone, ZoneMaterial>> = {
  hair: { color: "#31241a", finish: "matte" },
};

export const materialFinishSchema = z.enum(["matte", "satin", "polished", "metallic"]);
export type MaterialFinish = z.infer<typeof materialFinishSchema>;

export const zoneMaterialSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  finish: materialFinishSchema,
});
export type ZoneMaterial = z.infer<typeof zoneMaterialSchema>;

export const materialsConfigurationSchema = z.object(
  Object.fromEntries(
    MATERIAL_ZONES.map((zone) => {
      const lateDefault = LATE_ZONE_DEFAULTS[zone];
      return [zone, lateDefault ? zoneMaterialSchema.default(lateDefault) : zoneMaterialSchema];
    }),
  ) as Record<MaterialZone, typeof zoneMaterialSchema>,
);
export type MaterialsConfiguration = z.infer<typeof materialsConfigurationSchema>;

/**
 * Morphs: named continuous deformation weights in [0, 1] (or [-1, 1] for
 * bidirectional morphs). Keys are morph target names defined per-asset
 * (e.g. "trunkLength", "earSize"). The engine applies any that the active
 * meshes expose and ignores the rest — forward compatible by construction.
 */
export const morphsSchema = z.record(z.string(), z.number().min(-1).max(1));

/** Whole-body proportion controls (uniform, non-morph scaling). */
export const proportionsSchema = z.object({
  height: z.number().min(0.8).max(1.2),
  bulk: z.number().min(0.8).max(1.3),
});
export type Proportions = z.infer<typeof proportionsSchema>;

export const baseConfigurationSchema = z.object({
  style: z.enum(["none", "round", "lotus", "square", "peetam"]),
});
export type BaseConfiguration = z.infer<typeof baseConfigurationSchema>;

/**
 * Mudras — hand poses. Each is real geometry in the hand generator/asset,
 * not a texture or label:
 * - abhaya/varada/open: classic open-palm gestures
 * - hold: palm-up cradle (modak and offerings)
 * - pinch: thumb-and-finger stem hold (lotus)
 * - grip: closed fist around a shaft (axe, noose, goad)
 * Items declare a preferred grip mudra; attaching one auto-applies it.
 */
export const MUDRAS = ["abhaya", "varada", "open", "hold", "pinch", "grip"] as const;
export type MudraId = (typeof MUDRAS)[number];

const handConfigurationSchema = z.object({
  mudra: z.enum(MUDRAS),
});
export type HandConfiguration = z.infer<typeof handConfigurationSchema>;

/**
 * Per-hand configuration. Defaults keep configurations saved before this
 * field existed loadable (zod fills the default on parse).
 */
export const handsConfigurationSchema = z
  .object(
    Object.fromEntries(
      ARM_SLOTS.map((slot) => [slot, handConfigurationSchema.default({ mudra: "open" })]),
    ) as Record<ArmSlot, ReturnType<typeof handConfigurationSchema.default>>,
  )
  .default({});
export type HandsConfiguration = z.infer<typeof handsConfigurationSchema>;

/**
 * Arm configuration: iconographically Ganesha appears with 2 or 4 (or more)
 * arms. The skeleton always carries four chains; count controls which are
 * rendered and which hand sockets are active.
 */
export const armsConfigurationSchema = z
  .object({
    count: z.union([z.literal(2), z.literal(4)]),
  })
  .default({ count: 4 });
export type ArmsConfiguration = z.infer<typeof armsConfigurationSchema>;

/** Arm slots active for a given arm count (front pair is always present). */
export function activeArmSlots(arms: ArmsConfiguration): readonly ArmSlot[] {
  return arms.count === 4 ? ARM_SLOTS : (["frontLeft", "frontRight"] as const);
}

export const characterConfigurationSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  deity: z.enum(DEITY_IDS),
  /**
   * Mesh part selections. null = intentionally empty slot (e.g. no upper
   * garment); absent = slot not used by this deity.
   */
  parts: z.record(z.enum(PART_SLOTS), assetRefSchema.nullable()),
  /** Ornaments, crowns, held items… anything socket-attached. */
  attachments: z.array(attachmentConfigurationSchema),
  pose: poseConfigurationSchema,
  morphs: morphsSchema,
  proportions: proportionsSchema,
  materials: materialsConfigurationSchema,
  base: baseConfigurationSchema,
  hands: handsConfigurationSchema,
  arms: armsConfigurationSchema,
});

export type CharacterConfiguration = z.infer<typeof characterConfigurationSchema>;

export function validateConfiguration(value: unknown): CharacterConfiguration {
  return characterConfigurationSchema.parse(value);
}

export function safeValidateConfiguration(value: unknown) {
  return characterConfigurationSchema.safeParse(value);
}
