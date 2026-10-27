import type { NextRequest } from "next/server";
import { fail, ok, requireRole, sameOrigin } from "@/lib/api/respond";
import { publishAnchor, anchorStatus, type AnchorReceipt } from "@/lib/anchor/provider";
import { merkleRoot } from "@/lib/ledger/merkle";
import { getStore } from "@/lib/ledger/store";

export const dynamic = "force-dynamic";

/**
 * Returns current anchor status and network configuration.
 */
export async function GET(request: NextRequest) {
  if (!requireRole(request, "admin")) return fail("Not authorised", 401);
  return ok(anchorStatus());
}

/**
 * Anchors all events since the previous anchor under one Merkle root.
 *
 * LOCAL mode records the root in the ledger only. BASE_SEPOLIA and HEDERA_TESTNET
 * modes publish it to the target blockchain and record the real transaction receipt.
 * A failure before the on-chain write aborts; a failure after it reports the
 * tx hash so the operator can reconcile rather than blindly retry.
 */
export async function POST(request: NextRequest) {
  if (!requireRole(request, "admin")) return fail("Not authorised", 401);
  if (!sameOrigin(request)) return fail("Cross-origin write rejected", 403);

  const store = getStore();
  const lastAnchor = [...store.events]
    .reverse()
    .find((event) => event.type === "ANCHOR");
  const fromSeq = (lastAnchor?.payload.toSeq ?? 0) + 1;
  const toSeq = store.events.length;

  if (fromSeq > toSeq) return fail("Nothing new to anchor", 409);

  const root = merkleRoot(
    store.events.filter((event) => event.seq >= fromSeq).map((event) => event.hash),
  );
  const label = `block-${String(fromSeq).padStart(4, "0")}-${String(toSeq).padStart(4, "0")}`;

  let receipt: AnchorReceipt | null = null;

  try {
    receipt = await publishAnchor({ root, label });
    const event = await store.append("ANCHOR", "admin", {
      fromSeq,
      toSeq,
      merkleRoot: root,
      label,
      ...receipt,
    } as any);

    return ok({
      anchored: true,
      fromSeq,
      toSeq,
      merkleRoot: root,
      seq: event.seq,
      ...receipt,
    });
  } catch (error) {
    console.error("[fairshift:anchor]", error);
    if (receipt?.txHash) {
      return fail(
        `The anchor was published on-chain (tx ${receipt.txHash}) but could not be recorded in the ledger. Do not retry blindly.`,
        500,
      );
    }
    return fail(
      error instanceof Error ? error.message : "Anchoring failed. Nothing was written.",
      502,
    );
  }
}
