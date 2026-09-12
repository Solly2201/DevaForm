import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { attachUserToSession, getOrCreateSession, hashPassword } from "@/lib/auth";
import { saveErrorResponse } from "@/lib/characterSave";

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = signupSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "A valid email and a password of at least 8 characters are required" },
        { status: 400 },
      );
    }
    const { email, password, name } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }
    const session = await getOrCreateSession();
    const user = await prisma.user.create({
      data: { email, name: name ?? null, passwordHash: await hashPassword(password) },
    });
    await attachUserToSession(session, user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } }, { status: 201 });
  } catch (error) {
    return saveErrorResponse(error);
  }
}
