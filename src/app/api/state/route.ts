import { NextResponse } from "next/server";
import { anchorStatus } from "@/lib/anchor/provider";
import { config } from "@/lib/config";
import { getStore } from "@/lib/ledger/store";
import { publicIssues, statsFor } from "@/lib/ledger/view";
import { verifyChain } from "@/lib/ledger/chain";
import { getKeyRing } from "@/lib/crypto/keys";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  const now = Date.now();
  const verification = verifyChain(store.events, getKeyRing().verify);

  return NextResponse.json({
    demoMode: config.demoMode,
    anchor: anchorStatus(),
    stats: statsFor(store.state, now),
    head: store.head(),
    chain: {
      length: store.events.length,
      valid: verification.valid,
      anchors: verification.anchors,
    },
    sites: store.state.sites.map((site) => ({
      ...site,
      members: store.state.members.get(site.siteId)?.length ?? 0,
    })),
    issues: publicIssues(store.state, now),
    recent: store.events.slice(-8).reverse().map((event) => ({
      seq: event.seq,
      ts: event.ts,
      type: event.type,
      actor: event.actor,
      hash: event.hash,
    })),
  });
}
