import { NextResponse } from "next/server";
import { getOrCreateSession } from "@/lib/auth";
import { saveErrorResponse } from "@/lib/characterSave";

export async function GET() {
  try {
    const session = await getOrCreateSession();
    return NextResponse.json({
      user: session.user
        ? { id: session.user.id, email: session.user.email, name: session.user.name }
        : null,
    });
  } catch (error) {
    return saveErrorResponse(error);
  }
}
