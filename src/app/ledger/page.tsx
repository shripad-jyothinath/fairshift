"use client";

import { useCallback, useEffect, useState } from "react";
import { CATEGORIES } from "@/lib/domain";
import { shortHash, timeAgo, titleCase, formatDate } from "@/lib/format";
import type { AnyLedgerEvent } from "@/lib/ledger/types";

interface Block {
  index: number;
  fromSeq: number;
  toSeq: number;
  root: string;
  entries: number;
  ts: number;
  hash: string;
}

interface LedgerResponse {
  network: string;
  signers: Record<string, string>;
  verification: {
    valid: boolean;
    checked: number;
    head: string;
    brokenAt?: number;
    reason?: string;
    anchors: number;
  };
  blocks: Block[];
  events: AnyLedgerEvent[];
}

interface PublicIssue {
  clusterId: string;
  siteId: string;
  category: string;
  zone: string;
  severity: string;
  reporters: number;
  tier: number;
  tierLabel: string;
  status: "OPEN" | "CLOSED";
  deadline: number;
  overdue: boolean;
  slaBreaches: number;
  resolution: {
    kind: string;
    summary: string;
    action: string;
    seq: number;
  } | null;
  attestation: { statement: string; seq: number } | null;
}

interface AuditResult {
  chain: { valid: boolean; checked: number; brokenAt?: number; reason?: string };
  proofs: { checked: number; valid: number; invalid: number };
  onchain?: { configured: boolean; anchored: boolean; anchoredAt?: string } | null;
  ok: boolean;
}

export default function LedgerPage() {
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [issues, setIssues] = useState<PublicIssue[]>([]);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [ledgerResponse, stateResponse] = await Promise.all([
        fetch("/api/ledger", { cache: "no-store" }),
        fetch("/api/state", { cache: "no-store" }),
      ]);
      if (!ledgerResponse.ok) throw new Error("ledger");
      const ledgerData = (await ledgerResponse.json()) as LedgerResponse;
      setLedger(ledgerData);
      if (stateResponse.ok) {
        const stateData = (await stateResponse.json()) as { issues: PublicIssue[] };
        setIssues(stateData.issues);
      }
      setError("");
    } catch {
      setError("The ledger is unreachable. Nothing is being hidden — the server is down.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runAudit = async () => {
    setAuditing(true);
    try {
      const response = await fetch("/api/ledger/verify?deep=1", { cache: "no-store" });
      const data = (await response.json()) as AuditResult;
      setAudit(data);
    } catch {
      setError("Audit failed. Try again.");
    } finally {
      setAuditing(false);
    }
  };

  if (error && !ledger) {
    return (
      <div className="page wrap">
        <h2>Public ledger</h2>
        <div className="callout callout-breach" style={{ marginTop: 18 }} role="alert">
          {error}
        </div>
      </div>
    );
  }

  if (!ledger) {
    return (
      <div className="page wrap">
        <h2>Public ledger</h2>
        <p className="small muted" style={{ marginTop: 10 }}>
          Recomputing every hash…
        </p>
      </div>
    );
  }

  const { verification } = ledger;

  return (
    <div className="page">
      <div className="wrap">
        <p className="eyebrow">Public ledger · read-only · no login</p>
        <h2 style={{ margin: "14px 0 8px" }}>The entire record, in the open</h2>
        <p className="lede">
          Every report, escalation, resolution and closure. Each entry is signed by
          the actor that wrote it and commits to the hash before it.
        </p>

        <div className="chain-banner" data-valid={verification.valid} style={{ marginTop: 26 }}>
          <div>
            <span className="label">Chain status</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <span className={`stamp ${verification.valid ? "stamp-verified" : "stamp-breach"}`}>
                {verification.valid ? "Verified" : "Broken"}
              </span>
              <span className="mono small">
                {verification.checked} events · head {shortHash(verification.head, 14)}
              </span>
            </div>
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={runAudit} disabled={auditing}>
              {auditing ? "Re-verifying proofs…" : "Verify chain + all proofs"}
            </button>
            <a className="btn btn-quiet" href="/api/ledger" target="_blank" rel="noreferrer">
              Raw JSON ↗
            </a>
          </div>
        </div>

        {audit && (
          <div
            className={`callout ${audit.ok ? "callout-verified" : "callout-breach"}`}
            style={{ marginTop: 14 }}
            role="status"
          >
            <strong>{audit.ok ? "Audit passed." : "Audit failed."}</strong>{" "}
            {audit.chain.checked} event hashes recomputed ·{" "}
            {audit.proofs.valid}/{audit.proofs.checked} Groth16 membership proofs
            verified
            {audit.proofs.invalid > 0 ? ` · ${audit.proofs.invalid} invalid` : ""}.
            {audit.chain.brokenAt
              ? ` Chain broke at event #${audit.chain.brokenAt}: ${audit.chain.reason}.`
              : ""}
            {audit.onchain?.configured
              ? audit.onchain.anchored
                ? " Latest anchor confirmed on Base Sepolia."
                : " Latest anchor was not found on Base Sepolia."
              : ""}
          </div>
        )}

        <div className="grid-2" style={{ marginTop: 34, alignItems: "start" }}>
          <section>
            <div className="flex-between">
              <h3>Issues on this ledger</h3>
              <span className="mono small muted">{issues.length} total</span>
            </div>
            <div className="stack-sm" style={{ marginTop: 14 }}>
              {issues.length === 0 && <p className="small muted">No issues yet.</p>}
              {issues.map((issue) => (
                <article
                  key={issue.clusterId}
                  id={issue.clusterId}
                  className="card card-pad"
                  style={{ scrollMarginTop: 90 }}
                >
                  <div className="flex-between">
                    <span className="label">
                      {CATEGORIES[issue.category as keyof typeof CATEGORIES]?.label ??
                        titleCase(issue.category)}{" "}
                      · {issue.zone}
                    </span>
                    {issue.status === "CLOSED" ? (
                      <span className="stamp stamp-verified">Closed</span>
                    ) : issue.overdue ? (
                      <span className="stamp stamp-breach">Overdue</span>
                    ) : (
                      <span className="stamp">Open</span>
                    )}
                  </div>
                  <div className="mono small muted" style={{ marginTop: 8 }}>
                    {issue.reporters} unique {issue.reporters === 1 ? "reporter" : "reporters"} ·
                    Tier {issue.tier + 1} · {issue.slaBreaches} SLA{" "}
                    {issue.slaBreaches === 1 ? "breach" : "breaches"} · severity{" "}
                    {issue.severity}
                  </div>
                  {issue.resolution ? (
                    <div style={{ marginTop: 12 }}>
                      <p className="small" style={{ margin: 0 }}>
                        <strong>
                          {issue.resolution.kind === "FIX" ? "Fixed" : "Disciplined"}:
                        </strong>{" "}
                        {issue.resolution.summary}
                      </p>
                      {issue.attestation && (
                        <p className="small muted" style={{ margin: "6px 0 0" }}>
                          Oversight: “{issue.attestation.statement}”
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="small muted" style={{ marginTop: 10 }}>
                      No resolution published yet.
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>

          <aside className="stack">
            <div className="card card-pad">
              <span className="label">Signing keys</span>
              <div className="stack-sm" style={{ marginTop: 10 }}>
                {Object.entries(ledger.signers).map(([role, key]) => (
                  <div key={role}>
                    <div className="mono small" style={{ textTransform: "uppercase" }}>
                      {role}
                    </div>
                    <div className="mono small muted" style={{ overflowWrap: "anywhere" }}>
                      {key}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card card-pad">
              <span className="label">What verification means</span>
              <p className="small muted" style={{ marginTop: 8 }}>
                The browser recomputes each event&apos;s SHA-256 from its payload and
                previous hash, then checks the Ed25519 signature against the key for
                that role. The deep audit also re-verifies every worker&apos;s
                zero-knowledge proof.
              </p>
              <p className="small muted" style={{ marginTop: 8 }}>
                Changing one character in one report breaks every hash after it.
              </p>
            </div>

            <div className="card card-pad">
              <span className="label">Anchors</span>
              <p className="small muted" style={{ marginTop: 8 }}>
                {verification.anchors} Merkle anchors published. An anchor commits to
                every event since the previous one; wiring it to a public chain is a
                single adapter call.
              </p>
            </div>
          </aside>
        </div>

        <section style={{ marginTop: 44 }}>
          <div className="flex-between">
            <h3>Blocks</h3>
            <span className="mono small muted">
              {ledger.blocks.length} blocks · newest first
            </span>
          </div>

          <div style={{ marginTop: 14 }}>
            {ledger.blocks.map((block, index) => {
              const events = ledger.events.filter(
                (event) => event.seq >= block.fromSeq && event.seq <= block.toSeq,
              );
              return (
                <details className="block" key={block.index} open={index === 0}>
                  <summary className="block-head">
                    <span className="mono small">#{block.fromSeq}–{block.toSeq}</span>
                    <span className="block-root">
                      root {block.root}
                    </span>
                    <span className="mono small muted">
                      {block.entries} events · {timeAgo(block.ts)}
                    </span>
                  </summary>
                  {events.map((event) => (
                    <EventRow key={event.seq} event={event} />
                  ))}
                </details>
              );
            })}
          </div>
        </section>

        <p className="small muted" style={{ marginTop: 26 }}>
          Network: <span className="mono">{ledger.network}</span>. Data is
          append-only; the API exposes no update or delete endpoint.
        </p>
      </div>
    </div>
  );
}

function EventRow({ event }: { event: AnyLedgerEvent }) {
  return (
    <div className="event-row">
      <span className="mono small">#{event.seq}</span>
      <span className="event-type">{event.type}</span>
      <span>
        {summarise(event)}
        {event.type === "ANCHOR" && event.payload.explorerUrl && (
          <>
            {" · "}
            <a href={event.payload.explorerUrl} target="_blank" rel="noreferrer">
              BaseScan ↗
            </a>
          </>
        )}
      </span>
      <span className="event-hash" title={`${event.prevHash} → ${event.hash}`}>
        {shortHash(event.hash, 10)}
      </span>
    </div>
  );
}

function summarise(event: AnyLedgerEvent): string {
  switch (event.type) {
    case "GENESIS":
      return `network ${event.payload.network} · ${formatDate(event.ts)}`;
    case "ORG_REGISTERED":
      return event.payload.name;
    case "SITE_REGISTERED":
      return `${event.payload.name} · ${event.payload.sector}`;
    case "MEMBER_ADDED":
      return `commitment ${shortHash(event.payload.commitment, 10)} · root ${shortHash(event.payload.root, 8)}`;
    case "REPORT_FILED":
      return `${event.payload.category} · ${event.payload.zone} · nullifier ${shortHash(event.payload.nullifier, 8)}`;
    case "ESCALATION_RAISED":
      return `tier ${event.payload.tier + 1} · ${event.payload.reason} · ${event.payload.reporters} reporters`;
    case "RESOLUTION_PUBLISHED":
      return `${event.payload.kind} · ${event.payload.summary}`;
    case "OVERSIGHT_ATTESTED":
      return event.payload.statement;
    case "ISSUE_CLOSED":
      return event.payload.note;
    case "ANCHOR":
      return `${event.payload.label} · ${event.payload.mode === "BASE_SEPOLIA" ? "Base Sepolia" : "local"} · ${shortHash(
        event.payload.merkleRoot,
        12,
      )}`;
    default:
      return "";
  }
}
