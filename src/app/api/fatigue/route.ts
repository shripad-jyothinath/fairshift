import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/ledger/store";
import { sha256Hex } from "@/lib/crypto/canonical";

export async function POST(request: NextRequest) {
  const store = getStore();
  const json = await request.json().catch(() => null);

  if (!json || typeof json.siteId !== "string") {
    return NextResponse.json({ error: "Invalid fatigue report request" }, { status: 400 });
  }

  const { siteId, shiftHours, riskLevel, note, workerBadgeId, isVerified } = json;

  if (!isVerified && !workerBadgeId) {
    return NextResponse.json(
      { error: "Only verified workers can trigger site fatigue safety alerts." },
      { status: 403 },
    );
  }

  const alertId = `fatigue_${sha256Hex(`${siteId}:${Date.now()}:${Math.random()}`).slice(0, 16)}`;
  const nullifier = sha256Hex(`fairshift:fatigue:${siteId}:${workerBadgeId || "anon"}:${Date.now()}`).slice(0, 24);

  const payload = {
    alertId,
    siteId,
    shiftHours: Number(shiftHours) || 10,
    riskLevel: (riskLevel as "MODERATE" | "HIGH" | "CRITICAL") || "HIGH",
    note: (note || "Consecutive overtime shift logged without required recovery rest period.").slice(0, 300),
    nullifier,
  };

  const event = await store.append("FATIGUE_ALERT_RAISED", "system", payload);

  return NextResponse.json({
    ok: true,
    alertId,
    seq: event.seq,
    hash: event.hash,
    alert: {
      alertId,
      siteId: payload.siteId,
      shiftHours: payload.shiftHours,
      riskLevel: payload.riskLevel,
      note: payload.note,
      ts: event.ts,
    },
  });
}
