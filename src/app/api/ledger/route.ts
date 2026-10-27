import { NextResponse } from "next/server";
import { getKeyRing } from "@/lib/crypto/keys";
import { verifyChain } from "@/lib/ledger/chain";
import { toBlocks } from "@/lib/ledger/merkle";
import { reconcile } from "@/lib/ledger/reconcile";
import { getStore } from "@/lib/ledger/store";

export const dynamic = "force-dynamic";

/** Everything a third party needs to recompute and verify the ledger. */
export async function GET() {
  try {
    await reconcile();
  } catch (error) {
    console.error("[fairshift:ledger:reconcile]", error);
  }

  const store = getStore();
  const keys = getKeyRing();
  const verification = verifyChain(store.events, keys.verify);

  return NextResponse.json({
    network: "fairshift-devnet",
    signers: keys.signers,
    verification,
    blocks: toBlocks(store.events),
    events: store.events,
  });
}
