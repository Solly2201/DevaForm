import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSession, ownsCharacter } from "@/lib/auth";
import { saveErrorResponse } from "@/lib/characterSave";

/**
 * Create a public share for a creation you own. The share pins the
 * creation's latest immutable version, so later edits never change what
 * was shared. Reading a share (GET /api/shares/[id]) stays public.
 */
export async function POST(request: Request) {
  try {
    const session = await getOrCreateSession();
    const body = (await request.json()) as { characterId?: unknown };
    const characterId = typeof body.characterId === "string" ? body.characterId : "";
    if (!characterId) {
      return NextResponse.json({ error: "characterId is required" }, { status: 400 });
    }
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const latest = character?.versions[0];
    if (!character || !latest || !ownsCharacter(session, character)) {
      return NextResponse.json({ error: "Creation not found" }, { status: 404 });
    }
    const share = await prisma.share.create({
      data: { characterId: character.id, versionId: latest.id },
    });
    return NextResponse.json({ id: share.id }, { status: 201 });
  } catch (error) {
    return saveErrorResponse(error);
  }
}
