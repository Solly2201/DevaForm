import { NextResponse } from "next/server";
import { serializeConfiguration } from "@devaform/character-schema";
import { prisma } from "@/lib/prisma";
import { saveErrorResponse, validateSave } from "@/lib/characterSave";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const character = await prisma.character.findUnique({
      where: { id },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const latest = character?.versions[0];
    if (!character || !latest) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: character.id,
      name: character.name,
      deity: character.deity,
      updatedAt: character.updatedAt.toISOString(),
      config: JSON.parse(latest.config) as unknown,
    });
  } catch (error) {
    return saveErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { name, config, assetVersions } = validateSave(await request.json());
    const existing = await prisma.character.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    await prisma.character.update({
      where: { id },
      data: {
        name,
        versions: {
          create: {
            schemaVersion: config.schemaVersion,
            config: serializeConfiguration(config),
            assetVersions: JSON.stringify(assetVersions),
          },
        },
      },
    });
    return NextResponse.json({ id });
  } catch (error) {
    return saveErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.character.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return saveErrorResponse(error);
  }
}
