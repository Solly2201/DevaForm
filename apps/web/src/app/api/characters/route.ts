import { NextResponse } from "next/server";
import { serializeConfiguration } from "@devaform/character-schema";
import { prisma } from "@/lib/prisma";
import { getOrCreateSession, ownershipWhere } from "@/lib/auth";
import { saveErrorResponse, validateSave } from "@/lib/characterSave";

export async function GET() {
  try {
    const session = await getOrCreateSession();
    const characters = await prisma.character.findMany({
      where: ownershipWhere(session),
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, deity: true, updatedAt: true, preview: true },
    });
    return NextResponse.json({ characters });
  } catch (error) {
    return saveErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getOrCreateSession();
    const { name, config, assetVersions, preview } = validateSave(await request.json());
    const character = await prisma.character.create({
      data: {
        name,
        deity: config.deity,
        preview: preview ?? null,
        userId: session.userId,
        sessionId: session.id,
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
