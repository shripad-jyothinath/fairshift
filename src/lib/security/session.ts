import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";

export type SessionRole = "admin" | "oversight";

export interface Session {
  role: SessionRole;
  exp: number;
}

const TTL_MS = 8 * 60 * 60 * 1000;

function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
}

export function createSession(role: SessionRole): string {
  const session: Session = { role, exp: Date.now() + TTL_MS };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Session;
    if (session.exp < Date.now()) return null;
    if (session.role !== "admin" && session.role !== "oversight") return null;
    return session;
  } catch {
    return null;
  }
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
