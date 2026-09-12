import { NextResponse } from "next/server";
import { serializeConfiguration } from "@devaform/character-schema";
import { prisma } from "@/lib/prisma";
import { getOrCreateSession, ownsCharacter, type SessionWithUser } from "@/lib/auth";
import { saveErrorResponse, validateSave } from "@/lib/characterSave";

type Params = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Creation not found" }, { status: 404 });

/**
 * Load a character the session may access. Returns null (→ uniform 404)
 * for both missing rows and rows owned by someone else, so ids can't be
 * probed. Public access to a creation goes through /api/shares.
 */
async function findOwned(session: SessionWithUser, id: string) {
  const character = await prisma.character.findUnique({
    where: { id },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!character || !ownsCharacter(session, character)) return null;
  return character;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const session = await getOrCreateSession();
    const { id } = await params;
    const character = await findOwned(session, id);
    const latest = character?.versions[0];
    if (!character || !latest) return notFound();
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
    const session = await getOrCreateSession();
    const { id } = await params;
    const { name, config, assetVersions, preview } = validateSave(await request.json());
    const existing = await findOwned(session, id);
    if (!existing) return notFound();
    await prisma.character.update({
      where: { id },
      data: {
        name,
        ...(preview ? { preview } : {}),
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

/** Rename only — no new version is created. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await getOrCreateSession();
    const { id } = await params;
    const body = (await request.json()) as { name?: unknown };
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) {
      return NextResponse.json({ error: "A name is required" }, { status: 400 });
    }
    const existing = await findOwned(session, id);
    if (!existing) return notFound();
    await prisma.character.update({ where: { id }, data: { name } });
    return NextResponse.json({ id, name });
  } catch (error) {
    return saveErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await getOrCreateSession();
    const { id } = await params;
    const existing = await findOwned(session, id);
    if (!existing) return notFound();
    await prisma.character.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return saveErrorResponse(error);
  }
}
