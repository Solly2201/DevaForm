/**
 * Asset dataset sidecar contract.
 *
 * Every GLB asset lives in a versioned dataset directory, filed by what
 * the asset IS rather than by who uses it (see public/assets/README.md
 * and scripts/lib/layout.mjs):
 *
 *   public/assets/<area>/<name>/<version>/
 *     model.glb
 *     asset.json      ← this schema
 *     thumbnail.png   (generated)
 *
 * asset.json is the machine-readable record of what the file is and where
 * it came from. The TypeScript manifest remains the curated registry the
 * app ships — the ingest tool writes the sidecar and emits a matching
 * manifest entry, and a human commits it. That human gate is deliberate:
 * experimental/AI assets must never silently reach customers.
 */
import { z } from "zod";
import type { AssetStage } from "./types";

export const provenanceSchema = z.object({
  type: z.enum(["ai", "artist", "procedural", "manual", "imported"]),
  provider: z.string().optional(),
  tool: z.string().optional(),
  creator: z.string().optional(),
  references: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const stageSchema = z.enum([
  "concept",
  "source",
  "prototype",
  "experimental",
  "integration",
  "review",
  "production",
  "deprecated",
]) satisfies z.ZodType<AssetStage>;

export const assetSidecarSchema = z.object({
  /** Dot-namespaced asset id, e.g. "ganesha.head.classic". */
  id: z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9-]*)+$/),
  version: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().optional(),
  deity: z.string().min(1),
  category: z.string().min(1),
  kind: z.union([
    z.object({ type: z.literal("part"), slot: z.string() }),
    z.object({ type: z.literal("attachment"), sockets: z.array(z.string()).min(1) }),
  ]),
  stage: stageSchema,
  provenance: provenanceSchema,
  /** Model filename relative to the sidecar (normally "model.glb"). */
  model: z.string().default("model.glb"),
  thumbnail: z.string().optional(),
  materialZones: z.array(z.string()),
  geometry: z
    .object({
      triangles: z.number().int().nonnegative().optional(),
      vertices: z.number().int().nonnegative().optional(),
      boundsM: z.tuple([z.number(), z.number(), z.number()]).optional(),
    })
    .optional(),
  units: z.literal("meters").default("meters"),
  upAxis: z.literal("+Y").default("+Y"),
  forwardAxis: z.literal("+Z").default("+Z"),
  supersedes: z.string().optional(),
  supersededBy: z.string().optional(),
  printability: z
    .object({
      printSourceAvailable: z.boolean(),
      minStatueHeightMm: z.number().optional(),
      notes: z.string().optional(),
    })
    .default({ printSourceAvailable: false }),
});

export type AssetSidecar = z.infer<typeof assetSidecarSchema>;

export function validateAssetSidecar(value: unknown): AssetSidecar {
  return assetSidecarSchema.parse(value);
}
