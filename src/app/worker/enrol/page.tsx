"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  createQrIdentity,
  loadIdentity,
  saveIdentity,
  type DeviceIdentity,
} from "@/lib/worker/identity";

interface Preview {
  siteId: string;
  siteName: string;
  sector: string;
  expiresAt: number;
  members: number;
}

function EnrolInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [preview, setPreview] = useState<Preview | null>(null);
  const [existing, setExisting] = useState<DeviceIdentity | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "working" | "done" | "error">("loading");
  const [error, setError] = useState("");
  const [device, setDevice] = useState<DeviceIdentity | null>(null);

  useEffect(() => {
    setExisting(loadIdentity());

    if (!token) {
      setState("error");
      setError("No enrolment token. Scan the QR shown on the employer desk.");
      return;
    }

    const load = async () => {
      try {
        const response = await fetch(`/api/enroll?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as Preview | { error: string };
        if (!response.ok || "error" in data) {
          setState("error");
          setError("error" in data ? data.error : "This enrolment link is not valid.");
          return;
        }
        setPreview(data);
        setState("ready");
      } catch {
        setState("error");
        setError("Could not reach the enrolment service.");
      }
    };
    load();
  }, [token]);

  const enrol = async () => {
    if (!preview) return;
    setState("working");
    setError("");
    try {
      const candidate = createQrIdentity(preview.siteId);
      const response = await fetch("/api/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          commitment: candidate.commitment,
          payrollKey: candidate.payrollKey,
        }),
      });
      const data = (await response.json()) as { enrolled?: true; error?: string };
      if (!response.ok || !data.enrolled) {
        setError(data.error ?? "Enrolment was rejected.");
        setState("error");
        return;
      }
      saveIdentity(candidate);
      setDevice(candidate);
      window.history.replaceState({}, "", "/worker/enrol");
      setState("done");
    } catch {
      setError("Could not complete enrolment. Nothing was saved.");
      setState("error");
    }
  };

  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 560 }}>
        <p className="eyebrow">Worker credential · device-generated</p>
        <h2 style={{ margin: "14px 0 10px" }}>Enrol this phone</h2>

        {state === "loading" && <p className="small muted">Checking the enrolment link…</p>}

        {state === "error" && (
          <div className="card card-pad" style={{ marginTop: 18 }}>
            <div className="callout callout-breach" role="alert">
              {error}
            </div>
            <p className="small muted" style={{ marginTop: 12 }}>
              Ask your supervisor for a fresh QR. Enrolment links expire after 15
              minutes and work once.
            </p>
            <Link className="btn btn-quiet" href="/worker" style={{ marginTop: 12 }}>
              Back to the worker card
            </Link>
          </div>
        )}

        {preview && (state === "ready" || state === "working") && (
          <div className="card card-pad" style={{ marginTop: 18 }}>
            <span className="label">Site</span>
            <h3 style={{ marginTop: 6 }}>{preview.siteName}</h3>
            <p className="mono small muted" style={{ marginTop: 4 }}>
              {preview.sector} · {preview.members} credentials · link expires{" "}
              {new Date(preview.expiresAt).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>

            {existing && (
              <div className="callout callout-breach" style={{ marginTop: 16 }}>
                This phone already holds a credential for{" "}
                <strong>{existing.siteId}</strong> (commitment{" "}
                {existing.commitment.slice(0, 10)}…). Enrolling again replaces it and
                you lose access to the old reports and payslips on this device.
              </div>
            )}

            <div className="stack-sm" style={{ marginTop: 16 }}>
              <p className="small" style={{ margin: 0 }}>
                Your phone will generate two secrets that never leave it:
              </p>
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                <li>A Semaphore identity used to prove membership anonymously.</li>
                <li>A payroll key used to check in and open your own payslips.</li>
              </ul>
              <p className="small muted" style={{ margin: 0 }}>
                The employer receives only two public values. Neither can be used to
                report as you.
              </p>
            </div>

            <button
              className="btn btn-primary btn-lg"
              style={{ width: "100%", marginTop: 18 }}
              onClick={enrol}
              disabled={state === "working"}
            >
              {state === "working" ? "Binding to the site group…" : "Create my credential"}
            </button>
          </div>
        )}

        {state === "done" && device && (
          <div className="card card-pad" style={{ marginTop: 18 }}>
            <span className="stamp stamp-verified">Enrolled</span>
            <h3 style={{ marginTop: 12 }}>This phone is now a verified worker device.</h3>
            <div className="proof-box" style={{ marginTop: 14 }}>
              <div>
                <b>site</b> {preview?.siteName ?? device.siteId}
              </div>
              <div>
                <b>commitment</b> {device.commitment.slice(0, 22)}…
              </div>
              <div>
                <b>payroll key</b> {device.payrollKey.slice(0, 22)}…
              </div>
              <div>
                <b>secrets</b> STORED ON THIS DEVICE ONLY
              </div>
            </div>
            <div className="btn-row" style={{ marginTop: 16 }}>
              <Link className="btn btn-primary" href="/worker">
                Report a hazard
              </Link>
              <Link className="btn btn-quiet" href="/worker/shifts">
                Shifts & payslip
              </Link>
            </div>
            <p className="hint" style={{ marginTop: 12 }}>
              Bookmark this page. If you clear browser data, the credential is gone and
              you will need a new enrolment QR.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EnrolPage() {
  return (
    <Suspense fallback={<div className="page wrap">Loading enrolment…</div>}>
      <EnrolInner />
    </Suspense>
  );
}
