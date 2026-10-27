import type { NextRequest } from "next/server";
import { fail, ok, requireRole, serverError } from "@/lib/api/respond";
import { openSealed } from "@/lib/crypto/seal";
import { reconcile } from "@/lib/ledger/reconcile";
import { getStore } from "@/lib/ledger/store";
import { toPublicIssue } from "@/lib/ledger/view";

export const dynamic = "force-dynamic";

/**
 * Employer view. This is the only endpoint that decrypts report bodies.
 * It returns no worker identity because the ledger never stores one.
 */
export async function GET(request: NextRequest) {
  if (!requireRole(request, "admin")) return fail("Not authorised", 401);

  try {
    await reconcile();
  } catch (error) {
    console.error("[fairshift:admin:reconcile]", error);
  }

  const store = getStore();
  const now = Date.now();

  const reports = new Map<
    string,
    Array<{ seq: number; ts: number; body: string; rawBody: string; proofRoot: string }>
  >();

  for (const event of store.events) {
    if (event.type !== "REPORT_FILED") continue;
    const list = reports.get(event.payload.clusterId) ?? [];
    let rawBody = "[sealed body unavailable]";
    try {
      rawBody = openSealed(event.payload.sealedBody);
    } catch {
      // Key rotation or tamper: fail visible, never silently.
    }
    list.push({
      seq: event.seq,
      ts: event.ts,
      body: event.payload.body,
      rawBody,
      proofRoot: event.payload.proof.merkleTreeRoot,
    });
    reports.set(event.payload.clusterId, list);
  }

  const issues = [...store.state.issues.values()]
    .map((issue) => ({
      ...toPublicIssue(issue, now),
      siteName:
        store.state.sites.find((site) => site.siteId === issue.siteId)?.name ?? issue.siteId,
      reports: (reports.get(issue.clusterId) ?? []).sort((a, b) => a.ts - b.ts),
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "OPEN" ? -1 : 1;
      if (b.tier !== a.tier) return b.tier - a.tier;
      return a.deadline - b.deadline;
    });

  return ok({
    issues,
    head: store.head(),
    chainLength: store.events.length,
  });
}
