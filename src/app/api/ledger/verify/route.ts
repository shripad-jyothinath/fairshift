import { NextResponse } from "next/server";
import { anchorStatus } from "@/lib/anchor/provider";
import { getKeyRing } from "@/lib/crypto/keys";
import { verifyChain } from "@/lib/ledger/chain";
import { getStore } from "@/lib/ledger/store";
import { verifyMembership } from "@/lib/zk/verifier";
import { verifyAnchorOnchain } from "@/lib/anchor/provider";

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

  const lastAnchor = [...store.events]
    .reverse()
    .find((event) => event.type === "ANCHOR");

  let onchain: Awaited<ReturnType<typeof verifyAnchorOnchain>> | null = null;
  if (deep && lastAnchor?.payload.mode === "BASE_SEPOLIA") {
    try {
      onchain = await verifyAnchorOnchain(lastAnchor.payload.merkleRoot);
    } catch {
      onchain = { configured: true, anchored: false };
    }
  }

  return NextResponse.json({
    chain,
    proofs,
    anchor: anchorStatus(),
    onchain,
    ok: chain.valid && proofs.invalid === 0 && (onchain ? onchain.anchored : true),
  });
}
