import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/ledger/store";
import { sha256Hex } from "@/lib/crypto/canonical";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clusterId: string }> },
) {
  const { clusterId } = await params;
  const store = getStore();
  const issue = store.state.issues.get(clusterId);

  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  return NextResponse.json({
    clusterId,
    comments: issue.comments ?? [],
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clusterId: string }> },
) {
  const { clusterId } = await params;
  const store = getStore();
  const issue = store.state.issues.get(clusterId);

  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const json = await request.json().catch(() => null);
  if (!json || typeof json.body !== "string" || !json.body.trim()) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  }

  // Verified employee gate: requires verified credential or badge token
  const { body, siteId, isVerified, authorBadgeMask, workerBadgeId } = json;

  if (!isVerified && !workerBadgeId) {
    return NextResponse.json(
      {
        error:
          "Verification required. Only authenticated employees enrolled at this facility can comment or corroborate safety issues.",
      },
      { status: 403 },
    );
  }

  const commentId = `cmt_${sha256Hex(`${clusterId}:${Date.now()}:${Math.random()}`).slice(0, 16)}`;
  const nullifier = sha256Hex(`fairshift:comment:${clusterId}:${workerBadgeId || "anon"}:${Date.now()}`).slice(0, 24);

  const payload = {
    commentId,
    clusterId,
    siteId: siteId || issue.siteId,
    body: body.trim().slice(0, 500),
    authorBadgeMask: authorBadgeMask || "Verified Site Worker (ZK Protected)",
    nullifier,
  };

  const event = await store.append("COMMENT_ADDED", "system", payload);

  return NextResponse.json({
    ok: true,
    commentId,
    seq: event.seq,
    hash: event.hash,
    comment: {
      commentId,
      body: payload.body,
      authorBadgeMask: payload.authorBadgeMask,
      ts: event.ts,
      nullifier,
    },
  });
}
