import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveErrorResponse } from "@/lib/characterSave";

type Params = { params: Promise<{ id: string }> };

/**
 * Resolve a share to its pinned configuration. Exposes only the shared
 * creation's name, deity, preview and configuration — nothing about the
 * rest of the library.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const share = await prisma.share.findUnique({
      where: { id },
      include: { version: true, character: { select: { name: true, deity: true, preview: true } } },
    });
    if (!share) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: share.id,
      name: share.character.name,
      deity: share.character.deity,
      preview: share.character.preview,
      createdAt: share.createdAt.toISOString(),
      config: JSON.parse(share.version.config) as unknown,
    });
  } catch (error) {
    return saveErrorResponse(error);
  }
}
