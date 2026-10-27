import { NextResponse, type NextRequest } from "next/server";
import { verifySession, type SessionRole } from "@/lib/security/session";

export const SESSION_COOKIE = "fairshift_session";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400, extra?: unknown): NextResponse {
  return NextResponse.json({ error: message, detail: extra ?? null }, { status });
}

export function requireRole(request: NextRequest, role: SessionRole) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = verifySession(token);
  return session?.role === role ? session : null;
}

/** Worker payroll session travels in a Bearer header, never a cookie (no CSRF). */
export function bearerToken(request: NextRequest): string | undefined {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice(7).trim();
}

export function sessionCookie(token: string, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=28800",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Same-origin guard for state-changing requests. Combined with a SameSite=Strict
 * session cookie this blocks the standard CSRF shapes.
 */
export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser clients do not send Origin.
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/** Never log or return raw error internals to the client. */
export function serverError(scope: string, error: unknown): NextResponse {
  console.error(`[fairshift:${scope}]`, error);
  return fail("The ledger rejected this operation. Nothing was written.", 500);
}
