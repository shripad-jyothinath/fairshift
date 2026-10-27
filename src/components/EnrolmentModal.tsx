"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface Site {
  siteId: string;
  name: string;
  sector: string;
  members: number;
}

interface TokenResult {
  token: string;
  url: string;
  expiresAt: number;
  site: Site;
}

export function EnrolmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [result, setResult] = useState<TokenResult | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setQr("");
    setError("");
    setCopied(false);

    const load = async () => {
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        const data = (await response.json()) as { sites: Site[] };
        setSites(data.sites);
        if (data.sites[0]) setSiteId(data.sites[0].siteId);
      } catch {
        setError("Could not load sites.");
      }
    };
    load();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/enrolment-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = (await response.json()) as TokenResult | { error: string };
      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error : "Could not mint a token.");
        return;
      }
      setResult(data);
      setQr(
        await QRCode.toDataURL(data.url, {
          width: 300,
          margin: 1,
          color: { dark: "#17130f", light: "#fbf8f1" },
          errorCorrectionLevel: "M",
        }),
      );
    } catch {
      setError("Could not mint a token.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
    } catch {
      setError("Clipboard is blocked. Copy the link manually.");
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="enrol-title">
        <div className="modal-head">
          <div>
            <span className="label">One-time credential</span>
            <h3 id="enrol-title" style={{ fontSize: 20, marginTop: 4 }}>
              Enrol a worker device
            </h3>
          </div>
          <button className="btn btn-quiet" type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {!result && (
            <>
              <p className="small muted" style={{ marginTop: 0 }}>
                Show this QR to the worker. Their phone generates the secrets; only a
                commitment and a payroll public key come back. The link works once and
                expires in 15 minutes.
              </p>
              <div className="field">
                <label htmlFor="enrol-site">
                  <span>Site</span>
                </label>
                <select
                  id="enrol-site"
                  className="select"
                  value={siteId}
                  onChange={(event) => setSiteId(event.target.value)}
                >
                  {sites.map((site) => (
                    <option key={site.siteId} value={site.siteId}>
                      {site.name} · {site.members} credentials
                    </option>
                  ))}
                </select>
              </div>
              {error && (
                <div className="callout callout-breach" role="alert">
                  {error}
                </div>
              )}
              <button className="btn btn-primary" onClick={generate} disabled={busy || !siteId}>
                {busy ? "Minting…" : "Create enrolment QR"}
              </button>
            </>
          )}

          {result && (
            <>
              <div className="flex-between">
                <span className="small">
                  <strong>{result.site.name}</strong>
                </span>
                <span className="mono small muted">
                  expires{" "}
                  {new Date(result.expiresAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div style={{ display: "grid", placeItems: "center", marginTop: 14 }}>
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qr}
                    alt={`Enrolment QR for ${result.site.name}`}
                    width={260}
                    height={260}
                    style={{ border: "1px solid var(--line-strong)", background: "#fbf8f1" }}
                  />
                ) : (
                  <div className="small muted">Rendering QR…</div>
                )}
              </div>
              <p className="mono small" style={{ overflowWrap: "anywhere", marginTop: 12 }}>
                {result.url}
              </p>
              {error && (
                <div className="callout callout-breach" role="alert">
                  {error}
                </div>
              )}
              <div className="btn-row" style={{ marginTop: 12 }}>
                <button className="btn btn-primary" onClick={copy} type="button">
                  {copied ? "Copied" : "Copy link"}
                </button>
                <button
                  className="btn btn-quiet"
                  onClick={() => {
                    setResult(null);
                    setQr("");
                  }}
                  type="button"
                >
                  Another worker
                </button>
              </div>
              <p className="hint" style={{ marginTop: 10 }}>
                One token = one device. Do not post this QR publicly.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
