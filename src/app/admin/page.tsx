"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CATEGORIES, needsOversight } from "@/lib/domain";
import { shortHash, timeAgo, until } from "@/lib/format";
import type { Category, Severity } from "@/lib/ledger/types";

interface ReportLine {
  seq: number;
  ts: number;
  body: string;
  rawBody: string;
  proofRoot: string;
}

interface Resolution {
  resolutionId: string;
  kind: "FIX" | "DISCIPLINE";
  summary: string;
  action: string;
  accountableRole: string;
  subjectRef: string;
  evidenceHash: string;
  ts: number;
  seq: number;
}

interface Attestation {
  attestationId: string;
  resolutionId: string;
  statement: string;
  ts: number;
  seq: number;
}

interface AdminIssue {
  clusterId: string;
  siteId: string;
  siteName: string;
  category: Category;
  zone: string;
  severity: Severity;
  reporters: number;
  tier: number;
  tierLabel: string;
  status: "OPEN" | "CLOSED";
  firstTs: number;
  lastTs: number;
  deadline: number;
  overdue: boolean;
  slaBreaches: number;
  resolution: Resolution | null;
  attestation: Attestation | null;
  blockers: string[];
  reports: ReportLine[];
}

interface IssuesResponse {
  issues: AdminIssue[];
  head: { seq: number; hash: string };
  chainLength: number;
}

type Toast = { kind: "ok" | "err"; message: string } | null;

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

async function sha256HexBrowser(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [issues, setIssues] = useState<AdminIssue[]>([]);
  const [head, setHead] = useState<{ seq: number; hash: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/issues", { cache: "no-store" });
    if (response.status === 401) {
      setAuthed(false);
      return;
    }
    if (!response.ok) {
      setToast({ kind: "err", message: "Could not load the desk." });
      setAuthed(true);
      return;
    }
    const data = (await response.json()) as IssuesResponse;
    setIssues(data.issues);
    setHead(data.head);
    setAuthed(true);
    setSelectedId((current) => {
      if (current && data.issues.some((issue) => issue.clusterId === current)) return current;
      return data.issues[0]?.clusterId ?? null;
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError("");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase: loginPass }),
      });
      if (!response.ok) {
        setLoginError("That passphrase does not open the desk.");
        return;
      }
      setLoginPass("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setIssues([]);
  };

  const selected = useMemo(
    () => issues.find((issue) => issue.clusterId === selectedId) ?? null,
    [issues, selectedId],
  );

  const openCount = issues.filter((issue) => issue.status === "OPEN").length;
  const breachCount = issues.reduce((sum, issue) => sum + issue.slaBreaches, 0);
  const reporters = issues.reduce((sum, issue) => sum + issue.reporters, 0);

  if (authed === null) {
    return (
      <div className="page wrap">
        <p className="label">Employer desk</p>
        <h2 style={{ marginTop: 10 }}>Opening the docket…</h2>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="page wrap" style={{ maxWidth: 520 }}>
        <p className="eyebrow">Employer desk · restricted</p>
        <h2 style={{ margin: "14px 0 10px" }}>Sign the desk register</h2>
        <p className="small muted">
          Only the employer identity can read sealed report bodies. Every action
          after this point is signed and published.
        </p>
        <form className="card card-pad" style={{ marginTop: 20 }} onSubmit={login}>
          <div className="field">
            <label htmlFor="passphrase">
              <span>Admin passphrase</span>
            </label>
            <input
              id="passphrase"
              className="input"
              type="password"
              autoComplete="current-password"
              value={loginPass}
              onChange={(event) => setLoginPass(event.target.value)}
              required
            />
          </div>
          {loginError && (
            <div className="callout callout-breach" role="alert">
              {loginError}
            </div>
          )}
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
            {busy ? "Checking…" : "Open the desk"}
          </button>
          {DEMO_MODE && (
            <p className="hint" style={{ marginTop: 12 }}>
              Demo passphrase: <code>fairshift-demo</code>. Set{" "}
              <code>FAIRSHIFT_ADMIN_PASSPHRASE</code> in Cloud Run for a real one.
            </p>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="wrap">
        <div className="flex-between">
          <div>
            <p className="eyebrow">Employer desk · every action is public</p>
            <h2 style={{ marginTop: 10 }}>Accountability docket</h2>
          </div>
          <div className="btn-row">
            <Link className="btn btn-quiet" href="/ledger">
              Public ledger
            </Link>
            <button className="btn btn-quiet" type="button" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>

        <div className="grid-4" style={{ marginTop: 26 }}>
          <div className="stat">
            <div className="stat-value">{openCount}</div>
            <div className="stat-label">Open issues</div>
          </div>
          <div className="stat">
            <div className="stat-value">{reporters}</div>
            <div className="stat-label">Verified reports</div>
          </div>
          <div className="stat">
            <div
              className="stat-value"
              style={{ color: breachCount ? "var(--seal)" : undefined }}
            >
              {breachCount}
            </div>
            <div className="stat-label">SLA breaches recorded</div>
          </div>
          <div className="stat">
            <div className="stat-value">{head?.seq ?? "—"}</div>
            <div className="stat-label">Chain head</div>
          </div>
        </div>

        {toast && (
          <div
            className={`callout ${toast.kind === "ok" ? "callout-verified" : "callout-breach"}`}
            role="status"
            style={{ marginTop: 18 }}
          >
            {toast.message}
          </div>
        )}

        <div className="dash" style={{ marginTop: 22 }}>
          <div className="card">
            <div className="card-head">
              <span className="label">Issue queue · ordered by exposure</span>
              <button
                className="btn btn-quiet"
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const response = await fetch("/api/admin/anchor", { method: "POST" });
                    const data = (await response.json()) as { seq?: number; merkleRoot?: string; error?: string };
                    if (response.ok) {
                      setToast({
                        kind: "ok",
                        message: `Anchor published at event #${data.seq}. Root ${shortHash(data.merkleRoot ?? "", 14)}`,
                      });
                      await load();
                    } else {
                      setToast({ kind: "err", message: data.error ?? "Anchor failed." });
                    }
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Anchor chain
              </button>
            </div>

            <div className="issue-list">
              {issues.length === 0 && (
                <p className="card-pad small muted">No issues yet. File one from the worker card.</p>
              )}
              {issues.map((issue) => (
                <button
                  key={issue.clusterId}
                  type="button"
                  className="issue-row"
                  data-active={issue.clusterId === selectedId}
                  data-tier={issue.tier}
                  onClick={() => setSelectedId(issue.clusterId)}
                >
                  <span className="bar" aria-hidden="true" />
                  <span>
                    <span className="issue-title">
                      {CATEGORIES[issue.category].label} · {issue.zone}
                    </span>
                    <span className="issue-meta" style={{ display: "block" }}>
                      {issue.siteName} · {issue.reporters} reporters ·{" "}
                      {issue.status === "CLOSED" ? "CLOSED" : until(issue.deadline)}
                    </span>
                  </span>
                  <span className={`tier-badge tier-${issue.tier}`} aria-label={`Tier ${issue.tier + 1}`}>
                    <span className="dot" /> T{issue.tier + 1}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="detail-stack">
            {selected ? (
              <IssueDetail
                issue={selected}
                busy={busy}
                setBusy={setBusy}
                setToast={setToast}
                refresh={load}
              />
            ) : (
              <div className="card card-pad">
                <p className="small muted">Select an issue to open its dossier.</p>
              </div>
            )}

            <div className="card card-pad">
              <span className="label">Chain rule</span>
              <h3 style={{ fontSize: 18, marginTop: 8 }}>There is no delete button.</h3>
              <p className="small muted" style={{ marginTop: 6 }}>
                Resolutions and closures are new signed events. Editing or removing
                an earlier event breaks every hash after it — the public ledger will
                say so.
              </p>
              {head && (
                <p className="mono small" style={{ marginTop: 10 }}>
                  HEAD #{head.seq} · {shortHash(head.hash, 16)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IssueDetail({
  issue,
  busy,
  setBusy,
  setToast,
  refresh,
}: {
  issue: AdminIssue;
  busy: boolean;
  setBusy: (value: boolean) => void;
  setToast: (toast: Toast) => void;
  refresh: () => Promise<void>;
}) {
  const [kind, setKind] = useState<"FIX" | "DISCIPLINE">("FIX");
  const [summary, setSummary] = useState("");
  const [action, setAction] = useState("");
  const [role, setRole] = useState("Site supervisor");
  const [subjectRef, setSubjectRef] = useState("");
  const [subjectSalt] = useState(() => crypto.randomUUID());
  const [evidenceHash, setEvidenceHash] = useState("");
  const [evidenceName, setEvidenceName] = useState("");
  const [attestPass, setAttestPass] = useState("");
  const [attestStatement, setAttestStatement] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [formError, setFormError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setKind("FIX");
    setSummary("");
    setAction("");
    setRole("Site supervisor");
    setSubjectRef("");
    setEvidenceHash("");
    setEvidenceName("");
    setAttestPass("");
    setAttestStatement("");
    setCloseNote("");
    setFormError("");
  }, [issue.clusterId]);

  const oversight = needsOversight(issue.severity);

  const onEvidence = async (file: File | null) => {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const hex = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    setEvidenceHash(hex);
    setEvidenceName(`${file.name} · ${(file.size / 1024).toFixed(1)} KB`);
  };

  const publishResolution = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    setBusy(true);
    try {
      const hashedSubject = subjectRef
        ? `sha256:${await sha256HexBrowser(`fairshift:subject:${subjectSalt}:${subjectRef}`)}`
        : "";
      const response = await fetch("/api/admin/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clusterId: issue.clusterId,
          kind,
          summary,
          action,
          accountableRole: role,
          evidenceHash,
          subjectRef: hashedSubject,
        }),
      });
      const data = (await response.json()) as { error?: string; detail?: string[]; seq?: number };
      if (!response.ok) {
        setFormError(Array.isArray(data.detail) ? data.detail.join(" ") : data.error ?? "Rejected.");
        return;
      }
      setToast({ kind: "ok", message: `Resolution signed at event #${data.seq}. Now close the loop.` });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const attest = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (!issue.resolution) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/attest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clusterId: issue.clusterId,
          resolutionId: issue.resolution.resolutionId,
          statement: attestStatement,
          oversightPassphrase: attestPass,
        }),
      });
      const data = (await response.json()) as { error?: string; seq?: number };
      if (!response.ok) {
        setFormError(data.error ?? "Attestation rejected.");
        return;
      }
      setToast({ kind: "ok", message: `Independent attestation signed at event #${data.seq}.` });
      setAttestPass("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const close = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clusterId: issue.clusterId, note: closeNote }),
      });
      const data = (await response.json()) as { error?: string; detail?: string[]; seq?: number };
      if (!response.ok) {
        setFormError(Array.isArray(data.detail) ? data.detail.join(" ") : data.error ?? "Rejected.");
        return;
      }
      setToast({ kind: "ok", message: `Issue closed and published at event #${data.seq}.` });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <div>
            <span className="label">Dossier</span>
            <h3 style={{ marginTop: 4 }}>
              {CATEGORIES[issue.category].label} · {issue.zone}
            </h3>
          </div>
          {issue.status === "CLOSED" ? (
            <span className="stamp stamp-verified">Closed</span>
          ) : issue.overdue ? (
            <span className="stamp stamp-breach">SLA breach</span>
          ) : (
            <span className="stamp">Open</span>
          )}
        </div>

        <div className="card-pad stack-sm">
          <div className="flex-between">
            <span className="small">
              <strong>{issue.siteName}</strong>
            </span>
            <span className={`tier-badge tier-${issue.tier}`}>
              <span className="dot" /> Tier {issue.tier + 1} · {issue.tierLabel}
            </span>
          </div>
          <div className="mono small muted">
            {issue.reporters} unique {issue.reporters === 1 ? "reporter" : "reporters"} ·
            severity {issue.severity} · opened {timeAgo(issue.firstTs)} ·{" "}
            {issue.status === "CLOSED" ? "closed" : until(issue.deadline)}
          </div>
          {issue.overdue && issue.status === "OPEN" && (
            <div className="callout callout-breach">
              This issue has missed its {issue.tierLabel} deadline. The next escalation
              is recorded automatically and cannot be cancelled.
            </div>
          )}
          {issue.slaBreaches > 0 && (
            <div className="callout callout-breach">
              {issue.slaBreaches} SLA {issue.slaBreaches === 1 ? "breach" : "breaches"} on
              record. The tier moved automatically; the breach stays on the chain even
              after closure.
            </div>
          )}
        </div>

        <div className="card-head">
          <span className="label">Sealed reports · {issue.reports.length}</span>
          <span className="mono small muted">bodies decrypted for this desk only</span>
        </div>

        <div className="card-pad stack-sm">
          {issue.reports.map((report) => (
            <div className="report-note" key={report.seq}>
              <header>
                <span>
                  EVENT #{report.seq} · {timeAgo(report.ts)}
                </span>
                <span>proof root {shortHash(report.proofRoot, 8)}</span>
              </header>
              <p style={{ margin: 0 }}>{report.rawBody}</p>
              <p className="hint" style={{ marginTop: 6 }}>
                Public text: “{report.body}”
              </p>
            </div>
          ))}
        </div>
      </div>

      {issue.resolution && (
        <div className="card card-pad stack-sm">
          <div className="flex-between">
            <span className="label">Resolution on chain</span>
            <span className="mono small">#{issue.resolution.seq}</span>
          </div>
          <h3 style={{ fontSize: 19 }}>
            {issue.resolution.kind === "FIX" ? "Fixed" : "Disciplinary action"}
          </h3>
          <p style={{ margin: 0 }}>{issue.resolution.summary}</p>
          <p className="small muted" style={{ margin: 0 }}>
            Action: {issue.resolution.action}
          </p>
          <p className="mono small" style={{ margin: 0 }}>
            Accountable: {issue.resolution.accountableRole}
            {issue.resolution.subjectRef ? ` · ${shortHash(issue.resolution.subjectRef, 18)}` : ""}
          </p>
          <p className="mono small muted" style={{ margin: 0 }}>
            evidence {shortHash(issue.resolution.evidenceHash, 24)}
          </p>
        </div>
      )}

      {issue.attestation && (
        <div className="card card-pad stack-sm">
          <div className="flex-between">
            <span className="label">Independent oversight</span>
            <span className="mono small">#{issue.attestation.seq}</span>
          </div>
          <p style={{ margin: 0 }}>“{issue.attestation.statement}”</p>
          <p className="mono small muted" style={{ margin: 0 }}>
            Signed with the oversight key, not the admin key.
          </p>
        </div>
      )}

      {issue.status === "OPEN" && (
        <div className="card">
          <div className="card-head">
            <span className="label">Close the loop</span>
            <span className="mono small muted">{issue.blockers.length} blockers</span>
          </div>
          <div className="card-pad">
            {formError && (
              <div className="callout callout-breach" role="alert" style={{ marginBottom: 14 }}>
                {formError}
              </div>
            )}

            {!issue.resolution && (
              <form onSubmit={publishResolution}>
                <p className="small muted" style={{ marginTop: 0 }}>
                  Publish either a fix or a disciplinary action. This event is signed
                  and cannot be edited.
                </p>

                <div className="voice-row" style={{ marginBottom: 14 }}>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    aria-pressed={kind === "FIX"}
                    onClick={() => setKind("FIX")}
                  >
                    We fixed it
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    aria-pressed={kind === "DISCIPLINE"}
                    onClick={() => setKind("DISCIPLINE")}
                  >
                    We held someone accountable
                  </button>
                </div>

                <div className="field">
                  <label htmlFor="summary">
                    <span>What was the outcome?</span>
                  </label>
                  <textarea
                    id="summary"
                    className="textarea"
                    style={{ minHeight: 80 }}
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                    minLength={12}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="action">
                    <span>What concrete action was taken?</span>
                  </label>
                  <input
                    id="action"
                    className="input"
                    value={action}
                    onChange={(event) => setAction(event.target.value)}
                    minLength={6}
                    required
                  />
                </div>

                <div className="grid-2">
                  <div className="field">
                    <label htmlFor="role">
                      <span>Accountable role (never a name)</span>
                    </label>
                    <input
                      id="role"
                      className="input"
                      value={role}
                      onChange={(event) => setRole(event.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="subject">
                      <span>Subject reference {kind === "FIX" ? "(optional)" : "(required)"}</span>
                    </label>
                    <input
                      id="subject"
                      className="input"
                      value={subjectRef}
                      onChange={(event) => setSubjectRef(event.target.value)}
                      placeholder="Employee ID or initials"
                      required={kind === "DISCIPLINE"}
                    />
                    <span className="hint">
                      Hashed in your browser with a random salt. The raw reference never
                      leaves this tab.
                    </span>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="evidence">
                    <span>Evidence hash</span>
                  </label>
                  <input
                    id="evidence"
                    className="input"
                    value={evidenceHash}
                    onChange={(event) => setEvidenceHash(event.target.value)}
                    placeholder="64-character SHA-256"
                    pattern="[a-fA-F0-9]{64}"
                    required
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    className="sr-only"
                    onChange={(event) => onEvidence(event.target.files?.[0] ?? null)}
                  />
                  <div className="flex-between">
                    <span className="hint">Hash a photo, repair invoice or inspection log.</span>
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => fileRef.current?.click()}
                    >
                      Choose evidence file
                    </button>
                  </div>
                  {evidenceName && <span className="hint">{evidenceName}</span>}
                </div>

                <button className="btn btn-primary" disabled={busy}>
                  {busy ? "Signing…" : "Publish resolution"}
                </button>
              </form>
            )}

            {issue.resolution && oversight && !issue.attestation && (
              <form onSubmit={attest} style={{ marginTop: issue.resolution ? 0 : 18 }}>
                <div className="callout" style={{ marginBottom: 14 }}>
                  Severity {issue.severity} needs a second key. The oversight reviewer
                  must attest the resolution independently.
                </div>
                <div className="field">
                  <label htmlFor="attest-statement">
                    <span>Oversight statement</span>
                  </label>
                  <textarea
                    id="attest-statement"
                    className="textarea"
                    style={{ minHeight: 70 }}
                    value={attestStatement}
                    onChange={(event) => setAttestStatement(event.target.value)}
                    minLength={10}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="attest-pass">
                    <span>Oversight passphrase</span>
                  </label>
                  <input
                    id="attest-pass"
                    className="input"
                    type="password"
                    value={attestPass}
                    onChange={(event) => setAttestPass(event.target.value)}
                    required
                  />
                  <span className="hint">
                    {DEMO_MODE ? (
                      <>
                        Demo: <code>fairshift-oversight</code>. A leaked admin session
                        alone cannot close this issue.
                      </>
                    ) : (
                      "The oversight key is held by a separate reviewer."
                    )}
                  </span>
                </div>
                <button className="btn btn-primary" disabled={busy}>
                  {busy ? "Attesting…" : "Sign oversight attestation"}
                </button>
              </form>
            )}

            {issue.blockers.length > 0 && (
              <div className="callout callout-breach" style={{ marginTop: 16 }}>
                <strong>Closure blocked.</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {issue.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </div>
            )}

            {issue.blockers.length === 0 && (
              <form onSubmit={close} style={{ marginTop: 18 }}>
                <div className="field">
                  <label htmlFor="close-note">
                    <span>Closure note (published)</span>
                  </label>
                  <input
                    id="close-note"
                    className="input"
                    value={closeNote}
                    onChange={(event) => setCloseNote(event.target.value)}
                    minLength={6}
                    required
                  />
                </div>
                <button className="btn btn-seal" disabled={busy}>
                  {busy ? "Publishing…" : "Close issue on chain"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {issue.status === "CLOSED" && (
        <div className="card card-pad">
          <span className="stamp stamp-verified">Closed on chain</span>
          <p className="small" style={{ marginTop: 10 }}>
            The closure event is signed and permanent. Nothing in this dossier can be
            edited, only appended to.
          </p>
        </div>
      )}
    </div>
  );
}
