import { NextResponse, type NextRequest } from "next/server";
import { CATEGORIES, clusterIdFor } from "@/lib/domain";
import { getStore } from "@/lib/ledger/store";
import { groupFor } from "@/lib/zk/prover";
import { scopeForCluster } from "@/lib/zk/verifier";
import type { Category } from "@/lib/ledger/types";

export const dynamic = "force-dynamic";

/**
 * Public group data needed by a worker's browser to build a proof locally.
 * Commitments are already public in MEMBER_ADDED events; the secret never
 * leaves the device.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await context.params;
  const store = getStore();
  const site = store.state.sites.find((item) => item.siteId === siteId);
  if (!site) return NextResponse.json({ error: "Unknown site" }, { status: 404 });

  const url = new URL(request.url);
  const category = url.searchParams.get("category") as Category | null;
  const zone = url.searchParams.get("zone");

  if (!category || !(category in CATEGORIES) || !zone) {
    return NextResponse.json(
      { error: "category and zone are required" },
      { status: 400 },
    );
  }
  if (!site.zones.includes(zone)) {
    return NextResponse.json({ error: "Unknown zone for this site" }, { status: 400 });
  }

  const commitments = store.state.members.get(siteId) ?? [];
  const group = groupFor(commitments);
  const clusterId = clusterIdFor(siteId, category, zone);

  return NextResponse.json({
    siteId,
    siteName: site.name,
    sector: site.sector,
    commitments,
    root: group.root.toString(),
    depth: Math.max(1, group.depth),
    members: commitments.length,
    anonymous: commitments.length >= 3,
    clusterId,
    scope: scopeForCluster(clusterId),
  });
}
