"use client";

import { useEffect, useState } from "react";
import { formatNumber, shortHash } from "@/lib/format";

interface StateSlice {
  stats: {
    openIssues: number;
    closedIssues: number;
    overdue: number;
    breaches: number;
    reporters: number;
    members: number;
  };
  chain: { length: number; valid: boolean; anchors: number };
  head: { seq: number; hash: string };
  recent: Array<{ seq: number; type: string; hash: string }>;
  demoMode: boolean;
}

export function LiveStats() {
  const [state, setState] = useState<StateSlice | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) throw new Error("state");
        const data = (await response.json()) as StateSlice;
        if (active) {
          setState(data);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    };

    load();
    const timer = setInterval(load, 20_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (error) {
    return (
      <div className="callout callout-breach" role="status">
        Ledger unreachable. Is the server running?
      </div>
    );
  }

  if (!state) {
    return (
      <div className="grid-4" aria-busy="true" aria-label="Loading live figures">
        {[0, 1, 2, 3].map((index) => (
          <div className="stat" key={index}>
            <div className="stat-value muted">—</div>
            <div className="stat-label">Loading</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div aria-live="polite">
      <div className="grid-4">
        <div className="stat">
          <div className="stat-value">{formatNumber(state.stats.openIssues)}</div>
          <div className="stat-label">Open issues</div>
        </div>
        <div className="stat">
          <div className="stat-value">{formatNumber(state.stats.reporters)}</div>
          <div className="stat-label">Verified reports</div>
        </div>
        <div className="stat">
          <div className="stat-value">{formatNumber(state.stats.overdue)}</div>
          <div className="stat-label">Past SLA</div>
        </div>
        <div className="stat">
          <div className="stat-value">{formatNumber(state.chain.length)}</div>
          <div className="stat-label">Signed events</div>
        </div>
      </div>

      <div className="ticker" style={{ marginTop: 20 }} aria-label="Recent ledger activity">
        <div>
          <span className="dot" style={{ color: state.chain.valid ? "var(--verified)" : "var(--seal)" }} />{" "}
          {state.chain.valid ? "CHAIN VALID" : "CHAIN BROKEN"}
        </div>
        <div>HEAD #{state.head.seq}</div>
        <div>HASH {shortHash(state.head.hash, 8)}</div>
        <div>ANCHORS {state.chain.anchors}</div>
        <div>{formatNumber(state.stats.members)} VERIFIED CREDENTIALS</div>
        <div>{formatNumber(state.stats.breaches)} SLA BREACHES ON RECORD</div>
      </div>
    </div>
  );
}
