import type { NextRequest } from "next/server";
import { fail, ok, readJson, requireRole, sameOrigin, serverError } from "@/lib/api/respond";
import { resolutionSchema } from "@/lib/api/schemas";
import { sha256Hex } from "@/lib/crypto/canonical";
import { checkClosure } from "@/lib/ledger/closure";
import { getStore } from "@/lib/ledger/store";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Exit one: publish what was fixed, or who was held accountable and how.
 * The event is signed by the admin key and is immutable once written.
 */
export async function POST(request: NextRequest) {
  if (!requireRole(request, "admin")) return fail("Not authorised", 401);
  if (!sameOrigin(request)) return fail("Cross-origin write rejected", 403);

  const limit = rateLimit(clientKey(request.headers, "resolve"), 30, 60_000);
  if (!limit.ok) return fail("Too many writes. Try again shortly.", 429);

  const json = await readJson<unknown>(request);
  const parsed = resolutionSchema.safeParse(json);
  if (!parsed.success) return fail("Resolution validation failed", 422, parsed.error.issues);

  const { clusterId, kind, summary, action, accountableRole, evidenceHash, subjectRef } =
    parsed.data;

  if (kind === "DISCIPLINE" && !subjectRef) {
    return fail("Disciplinary action requires a hashed subject reference.", 422);
  }

  const store = getStore();
  const issue = store.state.issues.get(clusterId);
  if (!issue) return fail("Unknown issue", 404);
  if (issue.status === "CLOSED") return fail("Issue is already closed", 409);
  if (issue.resolution) return fail("A resolution is already published", 409);

  try {
    const resolutionId = `res_${sha256Hex(`${clusterId}:${Date.now()}`).slice(0, 20)}`;
    const event = await store.append("RESOLUTION_PUBLISHED", "admin", {
      resolutionId,
      clusterId,
      kind,
      summary: summary.trim(),
      action: action.trim(),
      accountableRole: accountableRole.trim(),
      subjectRef: kind === "DISCIPLINE" ? subjectRef! : "",
      evidenceHash,
    });

    return ok(
      {
        resolutionId,
        seq: event.seq,
        hash: event.hash,
        blockers: checkClosure(store.state.issues.get(clusterId)!).blockers,
      },
      201,
    );
  } catch (error) {
    return serverError("resolve", error);
  }
}
