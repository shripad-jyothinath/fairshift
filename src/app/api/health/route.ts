import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Cloud Run readiness probe. Deliberately does not touch the ledger. */
export async function GET() {
  return NextResponse.json({ ok: true, service: "fairshift" });
}
