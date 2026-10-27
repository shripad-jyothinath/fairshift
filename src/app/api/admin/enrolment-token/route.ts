import type { NextRequest } from "next/server";
import { fail, ok, readJson, requireRole, sameOrigin } from "@/lib/api/respond";
import { enrolmentTokenSchema } from "@/lib/api/schemas";
import { createEnrolmentToken } from "@/lib/enrolment/token";
import { getStore } from "@/lib/ledger/store";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/** Admin-only: mint a one-time 15-minute enrolment QR for a site. */
export async function POST(request: NextRequest) {
  if (!requireRole(request, "admin")) return fail("Not authorised", 401);
  if (!sameOrigin(request)) return fail("Cross-origin write rejected", 403);

  const limit = rateLimit(clientKey(request.headers, "enrol-token"), 30, 60_000);
  if (!limit.ok) return fail("Too many enrolment tokens. Try again shortly.", 429);

  const json = await readJson<unknown>(request);
  const parsed = enrolmentTokenSchema.safeParse(json);
  if (!parsed.success) return fail("siteId is required", 422);

  const store = getStore();
  const site = store.state.sites.find((item) => item.siteId === parsed.data.siteId);
  if (!site) return fail("Unknown site", 404);

  const { token, expiresAt } = createEnrolmentToken(site.siteId, site.orgId);
  const url = `${request.nextUrl.origin}/worker/enrol?token=${encodeURIComponent(token)}`;

  return ok({
    token,
    url,
    expiresAt,
    site: {
      siteId: site.siteId,
      name: site.name,
      sector: site.sector,
      members: store.state.members.get(site.siteId)?.length ?? 0,
    },
  });
}
