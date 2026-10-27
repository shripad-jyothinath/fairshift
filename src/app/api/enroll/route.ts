import type { NextRequest } from "next/server";
import { fail, ok, readJson, sameOrigin, serverError } from "@/lib/api/respond";
import { enrolSchema } from "@/lib/api/schemas";
import { verifyEnrolmentToken } from "@/lib/enrolment/token";
import { LedgerInvariantError } from "@/lib/ledger/fold";
import { getStore } from "@/lib/ledger/store";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { groupFor } from "@/lib/zk/prover";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Public preview so the worker can see which site the QR is for. */
export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return fail("Missing enrolment token", 400);

  const verification = verifyEnrolmentToken(token);
  if (!verification.ok) return fail(verification.reason, 400);

  const store = getStore();
  const site = store.state.sites.find(
    (item) => item.siteId === verification.payload.siteId,
  );
  if (!site) return fail("Unknown site", 404);

  return ok({
    siteId: site.siteId,
    siteName: site.name,
    sector: site.sector,
    expiresAt: verification.payload.exp,
    members: store.state.members.get(site.siteId)?.length ?? 0,
  });
}

/**
 * One-time enrolment: proves possession of the admin-signed QR token and binds
 * a device-generated commitment + payroll key to the site group.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail("Cross-origin write rejected", 403);

  const limit = rateLimit(clientKey(request.headers, "enrol"), 10, 60_000);
  if (!limit.ok) return fail("Too many enrolment attempts. Try again shortly.", 429);

  const json = await readJson<unknown>(request);
  const parsed = enrolSchema.safeParse(json);
  if (!parsed.success) return fail("Enrolment validation failed", 422, parsed.error.issues);

  const verification = verifyEnrolmentToken(parsed.data.token);
  if (!verification.ok) return fail(verification.reason, 400);

  const { commitment, payrollKey } = parsed.data;
  if (Buffer.from(payrollKey, "base64").length !== 32) {
    return fail("Payroll key must be a 32-byte Ed25519 public key.", 400);
  }

  const store = getStore();
  const { siteId, orgId, nonce } = verification.payload;
  const site = store.state.sites.find((item) => item.siteId === siteId);
  if (!site || site.orgId !== orgId) return fail("Unknown site", 404);

  const commitments = store.state.members.get(siteId) ?? [];
  if (commitments.includes(commitment)) {
    return fail("This credential is already enrolled at this site.", 409);
  }
  if (store.state.enrollments.has(`enrol:${nonce}`)) {
    return fail("This enrolment token has already been used.", 409);
  }
  if (commitments.length >= 1024) {
    return fail("This site's credential group is full (1024).", 409);
  }

  const group = groupFor(commitments);
  group.addMember(commitment);

  try {
    const event = await store.append("MEMBER_ADDED", "system", {
      siteId,
      commitment,
      index: commitments.length,
      root: group.root.toString(),
      depth: group.depth,
      enrollmentId: `enrol:${nonce}`,
      method: "QR",
      payrollKey,
    });

    return ok(
      {
        enrolled: true,
        siteId,
        siteName: site.name,
        commitment,
        memberIndex: event.payload.index,
        root: event.payload.root,
        seq: event.seq,
      },
      201,
    );
  } catch (error) {
    if (error instanceof LedgerInvariantError) {
      return fail("Enrolment conflict. Ask for a fresh QR and try again.", 409);
    }
    return serverError("enroll", error);
  }
}
