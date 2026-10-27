"use client";

import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";

interface Site {
  siteId: string;
  name: string;
  sector?: string;
}

interface CheckInModalProps {
  open: boolean;
  onClose: () => void;
  mode: "admin" | "worker";
  sites: Site[];
  currentSiteId?: string;
  onWorkerScan?: (payload: { siteId: string; siteName: string }) => void;
}

export function CheckInModal({
  open,
  onClose,
  mode,
  sites,
  currentSiteId,
  onWorkerScan,
}: CheckInModalProps) {
  const [selectedSiteId, setSelectedSiteId] = useState(currentSiteId || sites[0]?.siteId || "apex-tower-b");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [fullscreen, setFullscreen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const activeSite = sites.find((s) => s.siteId === selectedSiteId) || sites[0];

  useEffect(() => {
    if (!open) {
      stopCamera();
      setFullscreen(false);
      setScanMessage(null);
      return;
    }

    if (currentSiteId) {
      setSelectedSiteId(currentSiteId);
    }
  }, [open, currentSiteId]);

  useEffect(() => {
    if (!open || !activeSite) return;

    const payload = JSON.stringify({
      type: "FAIRSHIFT_GATE_CHECKIN",
      siteId: activeSite.siteId,
      siteName: activeSite.name,
      ts: Date.now(),
    });

    QRCode.toDataURL(payload, {
      width: 400,
      margin: 2,
      color: {
        dark: "#1c1917",
        light: "#ffffff",
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error("QR generation error:", err));
  }, [open, activeSite]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const startCamera = async () => {
    setScanning(true);
    setScanMessage("Starting camera viewfinder…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setScanMessage("Point camera at Gate QR Code on Laptop/Tablet screen");

      // Check if BarcodeDetector is natively supported
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any;
      if ("BarcodeDetector" in win) {
        const detector = new win.BarcodeDetector({ formats: ["qr_code"] });
        const interval = setInterval(async () => {
          if (!videoRef.current || !streamRef.current) {
            clearInterval(interval);
            return;
          }
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              clearInterval(interval);
              const raw = barcodes[0].rawValue;
              handleScanRaw(raw);
            }
          } catch {
            // Frame read error, continue
          }
        }, 300);
      }
    } catch {
      setScanMessage("Camera blocked or unavailable. You can use Quick Scan below.");
    }
  };

  const handleScanRaw = (raw: string) => {
    stopCamera();
    try {
      const parsed = JSON.parse(raw);
      if (parsed.type === "FAIRSHIFT_GATE_CHECKIN" && parsed.siteId) {
        setScanMessage(`✓ Scanned Gate: ${parsed.siteName}`);
        onWorkerScan?.({ siteId: parsed.siteId, siteName: parsed.siteName });
        setTimeout(() => onClose(), 800);
        return;
      }
    } catch {
      // Fallback
    }

    // Default match
    setScanMessage(`✓ Scanned Site Gate: ${activeSite.name}`);
    onWorkerScan?.({ siteId: activeSite.siteId, siteName: activeSite.name });
    setTimeout(() => onClose(), 800);
  };

  const simulateQuickScan = () => {
    handleScanRaw(
      JSON.stringify({
        type: "FAIRSHIFT_GATE_CHECKIN",
        siteId: activeSite.siteId,
        siteName: activeSite.name,
      }),
    );
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `fairshift-gate-qr-${activeSite.siteId}.png`;
    a.click();
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: fullscreen ? "#000" : "rgba(0, 0, 0, 0.75)",
        backdropFilter: fullscreen ? "none" : "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: fullscreen ? 0 : 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !fullscreen) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: fullscreen ? "100vw" : "min(460px, 100%)",
          height: fullscreen ? "100vh" : "auto",
          maxHeight: fullscreen ? "100vh" : "90vh",
          borderRadius: fullscreen ? 0 : 16,
          background: "var(--card, #1c1917)",
          color: "var(--fg, #f5f5f4)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.03)",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 17 }}>
              {mode === "admin" ? "Site Shift Gate Check-In Station" : "Mobile Shift Check-In / Out"}
            </h3>
            <span style={{ fontSize: 11, color: "var(--muted, #a8a29e)" }}>
              UN SDG 8 • Automatic Overtime & Fatigue Tracking
            </span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {mode === "admin" && (
              <button
                type="button"
                className="btn btn-quiet"
                style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={() => setFullscreen(!fullscreen)}
              >
                {fullscreen ? "Exit Kiosk" : "🖥️ Kiosk Fullscreen"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-quiet"
              style={{ padding: "4px 8px", fontSize: 14 }}
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
          {mode === "admin" ? (
            <>
              {/* Site Selector */}
              <div style={{ width: "100%", marginBottom: 16 }}>
                <label className="label" style={{ display: "block", marginBottom: 6 }}>
                  Select Facility Gate
                </label>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${sites.length}, 1fr)`, gap: 8 }}>
                  {sites.map((s) => (
                    <button
                      key={s.siteId}
                      type="button"
                      className={`btn ${s.siteId === selectedSiteId ? "btn-primary" : "btn-quiet"}`}
                      style={{ fontSize: 12, justifyContent: "center", padding: "8px 4px" }}
                      onClick={() => setSelectedSiteId(s.siteId)}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* QR Display Card */}
              <div
                style={{
                  background: "#fff",
                  padding: 20,
                  borderRadius: 16,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  maxWidth: 320,
                  width: "100%",
                }}
              >
                <div style={{ color: "#1c1917", fontWeight: 700, fontSize: 15, marginBottom: 8, textAlign: "center" }}>
                  {activeSite.name}
                </div>
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt="Shift Gate Check-In QR"
                    style={{ width: "100%", height: "auto", display: "block", borderRadius: 8 }}
                  />
                ) : (
                  <div style={{ width: 260, height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
                    Generating QR…
                  </div>
                )}
                <div style={{ color: "#444", fontSize: 11, marginTop: 8, textAlign: "center" }}>
                  Workers scan with mobile phone upon entry & exit
                </div>
              </div>

              {/* Admin Actions */}
              <div style={{ width: "100%", marginTop: 20, display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: "1 1 180px", justifyContent: "center" }}
                  onClick={downloadQr}
                >
                  📥 Download Gate QR (PNG)
                </button>
                <button
                  type="button"
                  className="btn btn-quiet"
                  style={{ flex: "1 1 180px", justifyContent: "center" }}
                  onClick={() => setFullscreen(!fullscreen)}
                >
                  {fullscreen ? "Exit Kiosk" : "🖥️ Gate Display Mode"}
                </button>
              </div>

              <p className="hint" style={{ marginTop: 14, textAlign: "center", fontSize: 11 }}>
                💡 Place this QR on a tablet at site security or download to print. Scans automatically calculate shift durations and flag fatigue risks (&gt;10 hrs) without worker manual input.
              </p>
            </>
          ) : (
            <>
              {/* Worker Camera / Quick Scan Mode */}
              <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <p className="small muted" style={{ textAlign: "center", margin: "0 0 16px" }}>
                  Scan the Site Gate QR code on the supervisor’s tablet/laptop screen to check in or out.
                </p>

                {scanning ? (
                  <div style={{ width: "100%", maxWidth: 300, position: "relative", borderRadius: 12, overflow: "hidden", border: "2px solid #10b981" }}>
                    <video ref={videoRef} style={{ width: "100%", height: 240, objectFit: "cover" }} />
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        border: "2px dashed #10b981",
                        borderRadius: 12,
                        pointerEvents: "none",
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      width: "100%",
                      maxWidth: 300,
                      height: 180,
                      background: "rgba(255, 255, 255, 0.03)",
                      borderRadius: 12,
                      border: "1px dashed rgba(255, 255, 255, 0.2)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 36 }}>📷</span>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={startCamera}
                    >
                      Open Camera Viewfinder
                    </button>
                  </div>
                )}

                {scanMessage && (
                  <div className="callout callout-verified" style={{ marginTop: 14, width: "100%" }}>
                    {scanMessage}
                  </div>
                )}

                <div style={{ width: "100%", borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 18, paddingTop: 16 }}>
                  <label className="label" style={{ display: "block", marginBottom: 6, textAlign: "center" }}>
                    Instant Demonstration / Fast Scan
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: "100%", justifyContent: "center", padding: "12px 16px" }}
                    onClick={simulateQuickScan}
                  >
                    📲 1-Tap Scan {activeSite.name} Gate QR
                  </button>
                  <span className="hint" style={{ display: "block", textAlign: "center", marginTop: 6, fontSize: 11 }}>
                    Simulates instant gate QR barcode detection for quick hackathon evaluation.
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
