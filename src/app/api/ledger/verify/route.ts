import { NextResponse } from "next/server";
import { getKeyRing } from "@/lib/crypto/keys";
import { verifyChain } from "@/lib/ledger/chain";
import { getStore } from "@/lib/ledger/store";
import { verifyMembership } from "@/lib/zk/verifier";

export const dynamic = "force-dynamic";

/**
 * Deep audit: re-verifies the hash chain, every Ed25519 signature and every
 * Groth16 membership proof. This is deliberately slower than /api/ledger.
 */
export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get("deep") !== "0";
  const store = getStore();
  const keys = getKeyRing();
  const chain = verifyChain(store.events, keys.verify);

  let proofs = { checked: 0, valid: 0, invalid: 0 };

  if (deep) {
    for (const event of store.events) {
      if (event.type !== "REPORT_FILED") continue;
      proofs.checked += 1;
      if (await verifyMembership(event.payload.proof)) proofs.valid += 1;
      else proofs.invalid += 1;
    }
  }

  return NextResponse.json({
    chain,
    proofs,
    ok: chain.valid && proofs.invalid === 0,
  });
}
