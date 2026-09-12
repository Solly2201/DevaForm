import { NextResponse } from "next/server";
import { rotateSession } from "@/lib/auth";
import { saveErrorResponse } from "@/lib/characterSave";

export async function POST() {
  try {
    await rotateSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return saveErrorResponse(error);
  }
}
