import type { NextRequest } from "next/server";
import { fail, ok, requireRole, sameOrigin, serverError } from "@/lib/api/respond";
import { merkleRoot } from "@/lib/ledger/merkle";
import { getStore } from "@/lib/ledger/store";

export const dynamic = "force-dynamic";

/**
 * Anchors all events since the previous anchor under one Merkle root.
 * This is the seam where an external chain (Base, Polygon, ...) would be
 * called: replace the append below with a contract write and store the tx hash.
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

  try {
    const root = merkleRoot(
      store.events.filter((event) => event.seq >= fromSeq).map((event) => event.hash),
    );
    const event = await store.append("ANCHOR", "admin", {
      fromSeq,
      toSeq,
      merkleRoot: root,
      label: `block-${String(fromSeq).padStart(4, "0")}-${String(toSeq).padStart(4, "0")}`,
    });

    return ok({ anchored: true, fromSeq, toSeq, merkleRoot: root, seq: event.seq });
  } catch (error) {
    return serverError("anchor", error);
  }
}
