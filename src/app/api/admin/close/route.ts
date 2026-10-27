import type { NextRequest } from "next/server";
import { fail, ok, readJson, requireRole, sameOrigin, serverError } from "@/lib/api/respond";
import { closeSchema } from "@/lib/api/schemas";
import { checkClosure } from "@/lib/ledger/closure";
import { getStore } from "@/lib/ledger/store";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Closing is a gate, not a button. The server re-checks every closure rule,
 * then writes a signed ISSUE_CLOSED event. There is no update or delete path.
 */
export async function POST(request: NextRequest) {
  if (!requireRole(request, "admin")) return fail("Not authorised", 401);
  if (!sameOrigin(request)) return fail("Cross-origin write rejected", 403);

  const limit = rateLimit(clientKey(request.headers, "close"), 30, 60_000);
  if (!limit.ok) return fail("Too many writes. Try again shortly.", 429);

  const json = await readJson<unknown>(request);
  const parsed = closeSchema.safeParse(json);
  if (!parsed.success) return fail("Closure validation failed", 422, parsed.error.issues);

  const store = getStore();
  const issue = store.state.issues.get(parsed.data.clusterId);
  if (!issue) return fail("Unknown issue", 404);

  const check = checkClosure(issue);
  if (!check.ok) return fail("Closure blocked", 409, check.blockers);

  try {
    const event = await store.append("ISSUE_CLOSED", "admin", {
      clusterId: issue.clusterId,
      resolutionId: issue.resolution!.resolutionId,
      attestationId: issue.attestation?.attestationId,
      note: parsed.data.note.trim(),
    });

    return ok({
      closed: true,
      seq: event.seq,
      hash: event.hash,
      note: "Closure published to the public ledger.",
    });
  } catch (error) {
    return serverError("close", error);
  }
}
