import type { NextRequest } from "next/server";
import { fail, ok, readJson, sameOrigin, serverError } from "@/lib/api/respond";
import { reportSchema } from "@/lib/api/schemas";
import { sha256Hex } from "@/lib/crypto/canonical";
import { CATEGORIES, clusterIdFor } from "@/lib/domain";
import { reconcile } from "@/lib/ledger/reconcile";
import { getStore } from "@/lib/ledger/store";
import { redact } from "@/lib/security/redact";
import { seal } from "@/lib/crypto/seal";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { MIN_ANONYMITY_SET } from "@/lib/zk/prover";
import { messageForBody } from "@/lib/crypto/field";
import { verifyReportProof } from "@/lib/zk/verifier";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail("Cross-origin write rejected", 403);

  const limit = rateLimit(clientKey(request.headers, "report"), 20, 60_000);
  if (!limit.ok) return fail("Too many reports. Try again shortly.", 429);

  const json = await readJson<unknown>(request);
  const parsed = reportSchema.safeParse(json);
  if (!parsed.success) {
    return fail("Report validation failed", 422, parsed.error.issues);
  }

  const { siteId, category, zone, body, proof } = parsed.data;
  const store = getStore();
  const site = store.state.sites.find((item) => item.siteId === siteId);
  if (!site) return fail("Unknown site", 404);
  if (!site.zones.includes(zone)) return fail("Unknown zone for this site", 400);

  const commitments = store.state.members.get(siteId) ?? [];
  if (commitments.length < MIN_ANONYMITY_SET) {
    return fail("This site has too few verified credentials for anonymity.", 409);
  }

  const clusterId = clusterIdFor(siteId, category, zone);
  const bodyHash = sha256Hex(body);
  const expectedMessage = messageForBody(bodyHash);
  if (proof.message !== expectedMessage) {
    return fail("Proof is not bound to this report body.", 400);
  }
  if (store.state.nullifiers.has(`${clusterId}:${proof.nullifier}`)) {
    return fail("This credential has already reported this issue.", 409);
  }

  const roots = store.state.roots.get(siteId) ?? new Set<string>();
  const verification = await verifyReportProof({
    proof,
    validRoots: roots,
    clusterId,
    bodyHash,
  });
  if (!verification.ok) return fail(verification.reason, 400);

  try {
    const previousTier = store.state.issues.get(clusterId)?.tier;
    const event = await store.append("REPORT_FILED", "system", {
      reportId: proof.nullifier.slice(0, 18),
      clusterId,
      siteId,
      category,
      severity: CATEGORIES[category].severity,
      zone,
      body: redact(body),
      bodyHash,
      sealedBody: seal(body),
      proof,
      nullifier: proof.nullifier,
    });

    await reconcile();
    const issue = store.state.issues.get(clusterId);

    // Record the escalation transition, so the public chain shows why the tier moved.
    if (issue && previousTier !== undefined && issue.tier > previousTier) {
      await store.append("ESCALATION_RAISED", "system", {
        clusterId,
        tier: issue.tier,
        reporters: issue.reporters,
        reason: issue.reporters >= 3 ? "THRESHOLD" : "SEVERITY",
        deadline: issue.deadline,
      });
    }

    return ok(
      {
        accepted: true,
        reportId: event.payload.reportId,
        clusterId,
        seq: event.seq,
        hash: event.hash,
        reporters: issue?.reporters ?? 1,
        tier: issue?.tier ?? 0,
        deadline: issue?.deadline ?? null,
        nullifier: proof.nullifier,
      },
      201,
    );
  } catch (error) {
    return serverError("report", error);
  }
}
