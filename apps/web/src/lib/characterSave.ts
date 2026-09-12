import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ConfigurationParseError,
  deserializeConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { resolveAssetRef } from "@devaform/asset-system";

const savePayloadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  config: z.unknown(),
  /** Optional small viewport capture used as the library thumbnail. */
  preview: z
    .string()
    .regex(/^data:image\/(jpeg|png);base64,/)
    .max(400_000)
    .optional(),
});

/**
 * Server-side validation shared by create/update:
 * - configuration passes strict schema validation (never trust the client)
 * - every referenced asset id must exist in the registry
 */
export function validateSave(body: unknown): {
  name: string;
  config: CharacterConfiguration;
  assetVersions: Record<string, number>;
  preview?: string;
} {
  const payload = savePayloadSchema.parse(body);
  const config = deserializeConfiguration(payload.config);

  const assetVersions: Record<string, number> = {};
  const refs = [
    ...Object.values(config.parts).filter((r) => r != null),
    ...config.attachments.map((a) => a.asset),
  ];
  for (const ref of refs) {
    const asset = resolveAssetRef(ref);
    if (!asset) {
      throw new ConfigurationParseError(`Unknown asset id: ${ref.assetId}`);
    }
    assetVersions[ref.assetId] = ref.version;
  }
  return { name: payload.name, config, assetVersions, preview: payload.preview };
}

export function saveErrorResponse(error: unknown) {
  if (error instanceof ConfigurationParseError) {
    return NextResponse.json({ error: error.message, issues: error.issues }, { status: 400 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid payload", issues: error.issues }, { status: 400 });
  }
  console.error("Character API error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
