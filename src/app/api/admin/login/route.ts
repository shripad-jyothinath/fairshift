import type { NextRequest } from "next/server";
import { createSession } from "@/lib/security/session";
import { config } from "@/lib/config";
import { fail, ok, readJson, sessionCookie, sameOrigin } from "@/lib/api/respond";
import { loginSchema } from "@/lib/api/schemas";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { safeEqual } from "@/lib/security/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail("Cross-origin write rejected", 403);

  const limit = rateLimit(clientKey(request.headers, "admin-login"), 6, 5 * 60_000);
  if (!limit.ok) return fail("Too many attempts. Wait a few minutes.", 429);

  const json = await readJson<unknown>(request);
  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) return fail("Passphrase is required", 422);

  if (!safeEqual(parsed.data.passphrase, config.adminPassphrase)) {
    return fail("Invalid credentials", 401);
  }

  const response = ok({ ok: true, role: "admin" });
  response.headers.set(
    "Set-Cookie",
    sessionCookie(createSession("admin"), process.env.NODE_ENV === "production"),
  );
  return response;
}
