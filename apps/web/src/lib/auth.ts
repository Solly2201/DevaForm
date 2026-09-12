/**
 * First-party auth: scrypt-hashed passwords (node:crypto, no external
 * provider) and cookie sessions.
 *
 * Every visitor gets an anonymous Session; creations are owned by the
 * session until the visitor signs up/in, at which point the session's
 * creations are claimed by the user. Ownership checks accept either the
 * owning user or the creating session. Legacy rows with neither owner
 * (pre-auth local dev data) remain visible in local development.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import type { Session, User } from "@prisma/client";
import { prisma } from "./prisma";

const scrypt = promisify(scryptCb);

const SESSION_COOKIE = "devaform_session";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export type SessionWithUser = Session & { user: User | null };

/**
 * Resolve the request's session, creating an anonymous one (and setting
 * the cookie) on first contact. Route-handler cookies are writable.
 */
export async function getOrCreateSession(): Promise<SessionWithUser> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const existing = await prisma.session.findUnique({
      where: { id: token },
      include: { user: true },
    });
    if (existing) {
      // Touch at most once a day to avoid a write per request.
      if (Date.now() - existing.lastSeenAt.getTime() > 86_400_000) {
        await prisma.session.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date() },
        });
      }
      return existing;
    }
  }
  const session = await prisma.session.create({ data: {}, include: { user: true } });
  store.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: "/",
  });
  return session;
}

/** Attach a user to the current session and claim its guest creations. */
export async function attachUserToSession(session: Session, userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.session.update({ where: { id: session.id }, data: { userId } }),
    prisma.character.updateMany({
      where: { sessionId: session.id, userId: null },
      data: { userId },
    }),
  ]);
}

/** Rotate to a fresh anonymous session (logout). */
export async function rotateSession(): Promise<void> {
  const store = await cookies();
  const fresh = await prisma.session.create({ data: {} });
  store.set(SESSION_COOKIE, fresh.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: "/",
  });
}

/** Ownership filter for library queries. */
export function ownershipWhere(session: SessionWithUser) {
  const owners: Array<Record<string, unknown>> = [{ sessionId: session.id }];
  if (session.userId) owners.push({ userId: session.userId });
  // Legacy local-dev rows predate ownership; keep them reachable in dev.
  if (process.env.NODE_ENV !== "production") {
    owners.push({ userId: null, sessionId: null });
  }
  return { OR: owners };
}

/** True when this session may mutate the given character row. */
export function ownsCharacter(
  session: SessionWithUser,
  character: { userId: string | null; sessionId: string | null },
): boolean {
  if (character.userId) return character.userId === session.userId;
  if (character.sessionId) return character.sessionId === session.id;
  return process.env.NODE_ENV !== "production"; // legacy dev rows
}
