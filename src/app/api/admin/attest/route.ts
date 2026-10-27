import type { NextRequest } from "next/server";
import { fail, ok, readJson, sameOrigin, serverError } from "@/lib/api/respond";
import { attestSchema } from "@/lib/api/schemas";
import { config } from "@/lib/config";
import { checkClosure } from "@/lib/ledger/closure";
import { getStore } from "@/lib/ledger/store";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { safeEqual } from "@/lib/security/session";

export const dynamic = "force-dynamic";

/**
 * Second key. A high-severity issue cannot close on the admin's word alone:
 * an independent oversight reviewer must attest the resolution.
 *
 * Demo simplification: the oversight key is a separate passphrase. In
 * production this is a separate login with its own Ed25519 key.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail("Cross-origin write rejected", 403);

  const limit = rateLimit(clientKey(request.headers, "attest"), 10, 5 * 60_000);
  if (!limit.ok) return fail("Too many attempts. Wait a few minutes.", 429);

  const json = await readJson<unknown>(request);
  const parsed = attestSchema.safeParse(json);
  if (!parsed.success) return fail("Attestation validation failed", 422, parsed.error.issues);

  const { clusterId, resolutionId, statement, oversightPassphrase } = parsed.data;
  if (!safeEqual(oversightPassphrase, config.oversightPassphrase)) {
    return fail("Invalid oversight credentials", 401);
  }

  const store = getStore();
  const issue = store.state.issues.get(clusterId);
  if (!issue) return fail("Unknown issue", 404);
  if (issue.status === "CLOSED") return fail("Issue is already closed", 409);
  if (!issue.resolution) return fail("Publish a resolution before asking for attestation", 409);
  if (issue.resolution.resolutionId !== resolutionId) {
    return fail("Resolution does not match this issue", 409);
  }
  if (issue.attestation) return fail("Issue already has an oversight attestation", 409);

  try {
    const attestationId = `att_${resolutionId}`;
    const event = await store.append("OVERSIGHT_ATTESTED", "oversight", {
      attestationId,
      clusterId,
      resolutionId,
      statement: statement.trim(),
    });

    return ok(
      {
        attestationId,
        seq: event.seq,
        hash: event.hash,
        blockers: checkClosure(store.state.issues.get(clusterId)!).blockers,
      },
      201,
    );
  } catch (error) {
    return serverError("attest", error);
  }
}
