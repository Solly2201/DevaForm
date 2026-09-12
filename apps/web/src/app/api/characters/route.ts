import { NextResponse } from "next/server";
import { serializeConfiguration } from "@devaform/character-schema";
import { prisma } from "@/lib/prisma";
import { saveErrorResponse, validateSave } from "@/lib/characterSave";

export async function GET() {
  try {
    const characters = await prisma.character.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, deity: true, updatedAt: true },
    });
    return NextResponse.json({ characters });
  } catch (error) {
    return saveErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { name, config, assetVersions } = validateSave(await request.json());
    const character = await prisma.character.create({
      data: {
        name,
        deity: config.deity,
        versions: {
          create: {
            schemaVersion: config.schemaVersion,
            config: serializeConfiguration(config),
            assetVersions: JSON.stringify(assetVersions),
          },
        },
      },
    });
    return NextResponse.json({ id: character.id }, { status: 201 });
  } catch (error) {
    return saveErrorResponse(error);
  }
}
