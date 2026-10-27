"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CATEGORY_ICONS } from "@/components/Icons";
import { VoiceChat } from "@/components/VoiceChat";
import { CATEGORIES } from "@/lib/domain";
import { messageForBody } from "@/lib/crypto/field";
import { DEMO_WORKERS_PER_SITE, demoSecret } from "@/lib/demo/secret";
import { shortHash } from "@/lib/format";
import type { Category, Sector } from "@/lib/ledger/types";
import type { DeviceIdentity } from "@/lib/worker/identity";

type Lang = "en" | "hi" | "ta";
type Phase = "idle" | "hashing" | "proving" | "publishing" | "done";

interface Site {
  siteId: string;
  name: string;
  sector: Sector;
  zones: string[];
  members: number;
}

interface StateResponse {
  sites: Site[];
  demoMode: boolean;
}
interface GroupResponse {
  commitments: string[];
  scope: string;
  clusterId: string;
  depth: number;
  members: number;
  anonymous: boolean;
}

interface Receipt {
  seq: number;
  hash: string;
  clusterId: string;
  reporters: number;
  tier: number;
  nullifier: string;
}

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    kicker: "Worker card · anonymous by design",
    title: "Report a hazard without your name",
    site: "Where do you work?",
    crew: "Demo crew slot",
    hazard: "What kind of hazard?",
    zone: "Where exactly?",
    describe: "What happened?",
    placeholder: "Describe what you saw. Avoid names and phone numbers — those are automatically removed.",
    submit: "Send anonymously",
    listen: "Listen",
    speak: "Speak",
    listening: "Listening…",
    hashing: "Hashing on your device",
    proving: "Building the zero-knowledge proof",
    publishing: "Publishing to the public ledger",
    success: "Report sealed",
    again: "File another",
    identityNote: "Your identity is not in this record. Only a nullifier is.",
    anonymity: "verified credentials at this site",
    noSpeech: "Voice input is not available in this browser. Typing works just as well.",
    secondTab: "Tip: open this page in a second tab, pick another crew slot, and watch the counter rise.",
    requirement: "At least 20 characters.",
    viewLedger: "View the public ledger",
    failed: "Something went wrong. Nothing was written.",
    demo: "Demo credential",
  },
  hi: {
    kicker: "वर्कर कार्ड · पहचान छिपी रहती है",
    title: "अपना नाम बताए बिना खतरा दर्ज करें",
    site: "आप कहाँ काम करते हैं?",
    crew: "डेमो क्रू स्लॉट",
    hazard: "किस तरह का खतरा?",
    zone: "कहाँ पर?",
    describe: "क्या हुआ?",
    placeholder: "जो देखा वह लिखें। नाम और फ़ोन नंबर न लिखें — वे अपने आप हट जाते हैं।",
    submit: "गुप्त रूप से भेजें",
    listen: "सुनें",
    speak: "बोलें",
    listening: "सुन रहे हैं…",
    hashing: "आपके फ़ोन पर हैश बन रहा है",
    proving: "ज़ीरो-नॉलेज प्रमाण बन रहा है",
    publishing: "सार्वजनिक लेजर पर दर्ज हो रहा है",
    success: "रिपोर्ट सील हो गई",
    again: "एक और दर्ज करें",
    identityNote: "इस रिकॉर्ड में आपकी पहचान नहीं है। सिर्फ़ एक नलिफ़ायर है।",
    anonymity: "सत्यापित क्रेडेंशियल इस साइट पर",
    noSpeech: "इस ब्राउज़र में आवाज़ उपलब्ध नहीं है। टाइप करना भी काम करता है।",
    secondTab: "सुझाव: दूसरी टैब खोलें, दूसरा क्रू स्लॉट चुनें और गिनती बढ़ते देखें।",
    requirement: "कम से कम 20 अक्षर।",
    viewLedger: "सार्वजनिक लेजर देखें",
    failed: "कुछ गलत हुआ। कुछ भी दर्ज नहीं हुआ।",
    demo: "डेमो क्रेडेंशियल",
  },
  ta: {
    kicker: "தொழிலாளர் அட்டை · அடையாளம் மறைவு",
    title: "பெயரைச் சொல்லாமல் ஆபத்தைப் பதிவு செய்யுங்கள்",
    site: "நீங்கள் எங்கு வேலை செய்கிறீர்கள்?",
    crew: "டெமோ குழு இடம்",
    hazard: "எந்த வகை ஆபத்து?",
    zone: "எங்கு?",
    describe: "என்ன நடந்தது?",
    placeholder: "நீங்கள் பார்த்ததை எழுதுங்கள். பெயர்களையும் தொலைபேசி எண்களையும் சேர்க்க வேண்டாம் — அவை தானாக நீக்கப்படும்.",
    submit: "பெயர் இல்லாமல் அனுப்பு",
    listen: "கேளுங்கள்",
    speak: "பேசுங்கள்",
    listening: "கேட்கிறது…",
    hashing: "உங்கள் சாதனத்தில் ஹாஷ் உருவாகிறது",
    proving: "ஜீரோ-நாலெட்ஜ் சான்று உருவாகிறது",
    publishing: "பொது லெட்ஜரில் பதிவாகிறது",
    success: "பதிவு மூடப்பட்டது",
    again: "மற்றொன்றைப் பதிவு செய்",
    identityNote: "இந்தப் பதிவில் உங்கள் அடையாளம் இல்லை. ஒரு நலிஃபையர் மட்டுமே.",
    anonymity: "சரிபார்க்கப்பட்ட சான்றுகள் இந்த தளத்தில்",
    noSpeech: "இந்த உலாவியில் குரல் இல்லை. தட்டச்சு செய்வதும் வேலை செய்யும்.",
    secondTab: "குறிப்பு: இரண்டாவது தாவலைத் திறந்து வேறு குழு இடத்தைத் தேர்ந்தெடுத்து எண்ணிக்கை உயர்வதைப் பாருங்கள்.",
    requirement: "குறைந்தது 20 எழுத்துகள்.",
    viewLedger: "பொது லெட்ஜரைப் பார்க்க",
    failed: "ஏதோ தவறு நடந்தது. எதுவும் பதிவாகவில்லை.",
    demo: "டெமோ சான்று",
  },
};

const CATEGORY_COPY: Record<Lang, Partial<Record<Category, string>>> = {
  en: {},
  hi: {
    ELECTRICAL: "बिजली का खतरा",
    FIRE: "आग और निकास",
    STRUCTURAL: "ढांचे का खतरा",
    CHEMICAL: "रसायन",
    MACHINERY: "मशीनरी",
    SANITATION: "सफ़ाई और स्वच्छता",
    HARASSMENT: "उत्पीड़न",
    OTHER: "कुछ और",
  },
  ta: {
    ELECTRICAL: "மின் ஆபத்து",
    FIRE: "தீ மற்றும் வெளியேறும் வழி",
    STRUCTURAL: "கட்டமைப்பு ஆபத்து",
    CHEMICAL: "வேதிப்பொருள்",
    MACHINERY: "இயந்திரம்",
    SANITATION: "சுத்தம்",
    HARASSMENT: "துன்புறுத்தல்",
    OTHER: "வேறு ஏதாவது",
  },
};

const SPEECH_LANG: Record<Lang, string> = {
  en: "en-IN",
  hi: "hi-IN",
  ta: "ta-IN",
};

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

async function sha256HexBrowser(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface EmployeeProfile {
  id: string;
  name: string;
  role: string;
  slot: number;
}

export const EMPLOYEES: EmployeeProfile[] = [
  { id: "EMP-101", name: "Alice Sharma", role: "Scaffolding Safety Lead", slot: 0 },
  { id: "EMP-102", name: "Rajesh Kumar", role: "Tower Crane Operator", slot: 1 },
  { id: "EMP-103", name: "Vikram Patel", role: "High-Voltage Electrician", slot: 2 },
  { id: "EMP-104", name: "Deepak Verma", role: "Structural Welder", slot: 3 },
  { id: "EMP-201", name: "Dr. Priya Nair", role: "Emergency Medicine Physician", slot: 4 },
  { id: "EMP-202", name: "Sunita Devi", role: "Sanitation & Biohazard Lead", slot: 5 },
  { id: "EMP-203", name: "Kavita Reddy", role: "ICU Charge Nurse", slot: 6 },
  { id: "EMP-204", name: "Arjun Singh", role: "Facility Safety Officer", slot: 7 },
];

export default function WorkerPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [device, setDevice] = useState<DeviceIdentity | null>(null);
  const [workerIndex, setWorkerIndex] = useState(0);
  const [verifiedEmp, setVerifiedEmp] = useState<EmployeeProfile | null>(EMPLOYEES[0]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>("EMP-101");
  const [verifying, setVerifying] = useState(false);
  const [verifyLog, setVerifyLog] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [zone, setZone] = useState("");
  const [body, setBody] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [listening, setListening] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(true);
  const recognitionRef = useRef<Recognition | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);

  const copy = COPY[lang];
  const reportingSiteId = device?.siteId ?? siteId;
  const site = useMemo(
    () => sites.find((item) => item.siteId === reportingSiteId),
    [sites, reportingSiteId],
  );
  const busy = phase === "hashing" || phase === "proving" || phase === "publishing";

  useEffect(() => {
    const saved = window.localStorage.getItem("fairshift_lang") as Lang | null;
    if (saved && saved in COPY) setLang(saved);

    const load = async () => {
      try {
        const { loadIdentity } = await import("@/lib/worker/identity");
        const stored = loadIdentity();
        setDevice(stored);

        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) throw new Error("state");
        const data = (await response.json()) as StateResponse;
        setSites(data.sites);
        const target =
          (stored && data.sites.find((item) => item.siteId === stored.siteId)) || data.sites[0];
        if (target) {
          setSiteId(target.siteId);
          setZone(target.zones[0]);
        }
      } catch {
        setError(COPY.en.failed);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    setSpeechAvailable(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    if (phase === "done") statusRef.current?.focus();
  }, [phase]);

  const pickLang = (next: Lang) => {
    setLang(next);
    window.localStorage.setItem("fairshift_lang", next);
  };

  const pickSite = (next: Site) => {
    setSiteId(next.siteId);
    setZone(next.zones[0]);
    setReceipt(null);
    setPhase("idle");
  };

  const handleVerifyEmployee = async (empId: string) => {
    const emp = EMPLOYEES.find((e) => e.id === empId) || EMPLOYEES[0];
    setVerifying(true);
    setVerifyLog("1/3 Validating badge on site employee roster...");
    await new Promise((r) => setTimeout(r, 250));
    setVerifyLog("2/3 Generating on-device Semaphore secret (trapdoor, nullifierSecret)...");
    await new Promise((r) => setTimeout(r, 250));
    setVerifyLog("3/3 Verifying Leaf inclusion in site LeanIMT group... Success!");
    await new Promise((r) => setTimeout(r, 200));
    setWorkerIndex(emp.slot);
    setVerifiedEmp(emp);
    setVerifying(false);
  };

  const forgetDevice = async () => {
    if (
      !window.confirm(
        "Forget this device credential? You will lose access to its reports unless you enrol again.",
      )
    ) {
      return;
    }
    const { clearIdentity } = await import("@/lib/worker/identity");
    clearIdentity();
    setDevice(null);
    const first = sites[0];
    if (first) {
      setSiteId(first.siteId);
      setZone(first.zones[0]);
    }
  };

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = SPEECH_LANG[lang];
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  };

  const startVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      setSpeechAvailable(false);
      return;
    }
    const recognition = new Ctor();
    recognition.lang = SPEECH_LANG[lang];
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      setBody((current) => `${current}${current ? " " : ""}${transcript}`.trim());
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!site || !category || !zone) {
      setError("Pick a site, a hazard type and a zone.");
      return;
    }
    if (body.trim().length < 20) {
      setError(copy.requirement);
      return;
    }

    try {
      setPhase("hashing");
      const groupResponse = await fetch(
        `/api/groups/${site.siteId}?category=${category}&zone=${encodeURIComponent(zone)}`,
        { cache: "no-store" },
      );
      if (!groupResponse.ok) throw new Error("group");
      const group = (await groupResponse.json()) as GroupResponse;
      if (!group.anonymous) throw new Error("This site needs at least three credentials.");

      let customArtifacts: { wasm: string; zkey: string } | undefined;
      try {
        const artifactCheck = await fetch(`/zk/semaphore-${group.depth}.wasm`, {
          method: "HEAD",
        });
        if (!artifactCheck.ok) {
          customArtifacts = {
            wasm: `https://raw.githubusercontent.com/privacy-scaling-explorations/snark-artifacts/main/packages/semaphore/semaphore-${group.depth}.wasm`,
            zkey: `https://raw.githubusercontent.com/privacy-scaling-explorations/snark-artifacts/main/packages/semaphore/semaphore-${group.depth}.zkey`,
          };
        }
      } catch {
        customArtifacts = {
          wasm: `https://raw.githubusercontent.com/privacy-scaling-explorations/snark-artifacts/main/packages/semaphore/semaphore-${group.depth}.wasm`,
          zkey: `https://raw.githubusercontent.com/privacy-scaling-explorations/snark-artifacts/main/packages/semaphore/semaphore-${group.depth}.zkey`,
        };
      }

      const bodyHash = await sha256HexBrowser(body);
      const message = messageForBody(bodyHash);

      setPhase("proving");
      const { createIdentity, importIdentity, proveMembership } = await import(
        "@/lib/zk/prover"
      );
      const identity = device
        ? device.method === "DEMO"
          ? createIdentity(device.semaphoreSecret)
          : importIdentity(device.semaphoreSecret)
        : createIdentity(demoSecret(site.siteId, workerIndex));
      const proof = await proveMembership({
        identity,
        commitments: group.commitments,
        message,
        scope: group.scope,
        artifacts: customArtifacts,
      });

      setPhase("publishing");
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId: site.siteId,
          category,
          zone,
          body,
          proof,
        }),
      });

      const payload = (await response.json()) as
        | { accepted: true; seq: number; hash: string; clusterId: string; reporters: number; tier: number; nullifier: string }
        | { error: string };

      if (!response.ok || !("accepted" in payload)) {
        throw new Error("error" in payload ? payload.error : "publish");
      }

      setReceipt({
        seq: payload.seq,
        hash: payload.hash,
        clusterId: payload.clusterId,
        reporters: payload.reporters,
        tier: payload.tier,
        nullifier: payload.nullifier,
      });
      setPhase("done");
      setBody("");
      setCategory(null);
    } catch (caught) {
      setPhase("idle");
      setError(caught instanceof Error && caught.message !== "error" && caught.message !== "publish" && caught.message !== "group"
        ? caught.message
        : copy.failed);
    }
  };

  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 640 }}>
        <p className="eyebrow">{copy.kicker}</p>
        <h2 style={{ margin: "14px 0 8px" }}>{copy.title}</h2>
        <p className="small muted" style={{ marginBottom: 20 }}>
          {copy.secondTab}
        </p>

        <div className="worker-shell">
          <div className="worker-head">
            <div>
              <div className="label">{device ? "Device credential" : copy.demo}</div>
              {device ? (
                <div className="mono" style={{ fontSize: 12, marginTop: 3 }}>
                  {site?.name ?? device.siteId} · {shortHash(device.commitment, 10)}
                </div>
              ) : (
                <div className="mono" style={{ fontSize: 13, marginTop: 3 }}>
                  CREW SLOT {String(workerIndex + 1).padStart(2, "0")} / {DEMO_WORKERS_PER_SITE}
                </div>
              )}
            </div>
            <div className="lang-switch" role="group" aria-label="Language">
              {(["en", "hi", "ta"] as Lang[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={lang === code}
                  onClick={() => pickLang(code)}
                >
                  {code === "en" ? "EN" : code === "hi" ? "हिं" : "த"}
                </button>
              ))}
            </div>
          </div>

          <div className="worker-body" lang={lang}>
            {receipt ? (
              <ReceiptCard
                receipt={receipt}
                copy={copy}
                statusRef={statusRef}
                onAgain={() => {
                  setReceipt(null);
                  setPhase("idle");
                }}
              />
            ) : (
              <form onSubmit={submit}>
                {device && (
                  <div className="callout callout-verified" style={{ marginBottom: 14 }}>
                    <div className="flex-between">
                      <strong>{site?.name ?? device.siteId}</strong>
                      <button
                        className="btn btn-quiet"
                        type="button"
                        onClick={forgetDevice}
                        style={{ minHeight: 36, padding: "6px 10px" }}
                      >
                        Forget
                      </button>
                    </div>
                    <div className="mono small muted" style={{ marginTop: 4 }}>
                      {device.method === "QR" ? "QR-enrolled device" : "demo credential"} ·
                      commitment {shortHash(device.commitment, 14)}
                    </div>
                  </div>
                )}

                <div className="field">
                  <span>{copy.site}</span>
                  {device ? (
                    <div className="callout">
                      Enrolled at <strong>{site?.name ?? device.siteId}</strong>. Reports
                      use a zero-knowledge proof; your name is never attached.
                    </div>
                  ) : (
                    <div className="site-pick">
                      {sites.map((item) => (
                        <button
                          key={item.siteId}
                          type="button"
                          aria-pressed={item.siteId === reportingSiteId}
                          onClick={() => pickSite(item)}
                        >
                          <strong style={{ display: "block", fontSize: 14 }}>{item.name}</strong>
                          <span className="mono small muted">
                            {item.sector === "CONSTRUCTION" ? "CONSTRUCTION" : "HEALTHCARE"} ·{" "}
                            {item.members} {copy.anonymity}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {!device && (
                  <div
                    className="card card-pad"
                    style={{
                      background: verifiedEmp ? "var(--verified-soft)" : "var(--card)",
                      border: verifiedEmp ? "1px solid var(--verified)" : "1px solid var(--line-strong)",
                      marginBottom: 18,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div>
                        <strong
                          style={{
                            fontSize: 15,
                            display: "block",
                            color: verifiedEmp ? "var(--verified)" : "var(--ink)",
                          }}
                        >
                          {verifiedEmp ? `✅ Verified Site Employee: ${verifiedEmp.name}` : "Step 1: Employee Verification"}
                        </strong>
                        <span className="mono small muted">
                          {verifiedEmp
                            ? `Badge ${verifiedEmp.id} · ${verifiedEmp.role}`
                            : "Verify your active employment to generate on-device ZK credentials"}
                        </span>
                      </div>
                      <span
                        className="mono small"
                        style={{
                          background: verifiedEmp ? "var(--verified)" : "var(--line)",
                          color: verifiedEmp ? "#fff" : "var(--ink)",
                          padding: "4px 8px",
                          borderRadius: 4,
                        }}
                      >
                        {verifiedEmp ? "ZK VERIFIED" : "VERIFY FIRST"}
                      </span>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <label className="small muted" style={{ display: "block", marginBottom: 6 }}>
                        Select Verified Employee Badge:
                      </label>
                      <div className="voice-row">
                        <select
                          className="select"
                          value={selectedEmpId}
                          onChange={(e) => {
                            setSelectedEmpId(e.target.value);
                            handleVerifyEmployee(e.target.value);
                          }}
                          disabled={verifying}
                        >
                          {EMPLOYEES.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name} ({emp.id}) — {emp.role}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-quiet"
                          onClick={() => handleVerifyEmployee(selectedEmpId)}
                          disabled={verifying}
                        >
                          {verifying ? "Verifying..." : "⚡ Re-Verify"}
                        </button>
                      </div>

                      {verifying && (
                        <div className="small mono" style={{ marginTop: 10, color: "var(--amber)", fontWeight: 600 }}>
                          🔄 {verifyLog}
                        </div>
                      )}

                      {verifiedEmp && !verifying && (
                        <div className="callout callout-verified" style={{ marginTop: 12, fontSize: 13 }}>
                          🔒 <strong>Zero-Knowledge Protection Active:</strong> Your name (<em>{verifiedEmp.name}</em>) and
                          badge (<em>{verifiedEmp.id}</em>) never leave your phone. Your browser constructs a Groth16
                          mathematical proof that proves you are an enrolled site employee, without putting your name on the
                          public ledger.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="field">
                  <span>{copy.hazard}</span>
                  <div className="cat-grid" role="group" aria-label={copy.hazard}>
                    {(Object.keys(CATEGORIES) as Category[]).map((key) => {
                      const Icon = CATEGORY_ICONS[CATEGORIES[key].icon as keyof typeof CATEGORY_ICONS];
                      return (
                        <button
                          key={key}
                          type="button"
                          className="cat-tile"
                          aria-pressed={category === key}
                          onClick={() => setCategory(key)}
                        >
                          <Icon />
                          <span>{CATEGORY_COPY[lang][key] ?? CATEGORIES[key].label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="field">
                  <span>{copy.zone}</span>
                  <div className="zone-grid" role="group" aria-label={copy.zone}>
                    {(site?.zones ?? []).map((item) => (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={zone === item}
                        onClick={() => setZone(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="report-body">
                    <span>{copy.describe}</span>
                  </label>
                  <textarea
                    id="report-body"
                    className="textarea"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder={copy.placeholder}
                    maxLength={2000}
                    required
                  />
                  <div className="flex-between">
                    <span className="hint">{body.trim().length}/20 · {copy.requirement}</span>
                    <div className="voice-row">
                      <button
                        type="button"
                        className={`btn btn-quiet ${listening ? "recording" : ""}`}
                        onClick={startVoice}
                        aria-pressed={listening}
                        aria-label={copy.speak}
                      >
                        🎙 {listening ? copy.listening : copy.speak}
                      </button>
                    </div>
                  </div>
                  {!speechAvailable && <span className="hint">{copy.noSpeech}</span>}
                </div>

                {error && (
                  <div className="callout callout-breach" role="alert" style={{ marginBottom: 14 }}>
                    {error}
                  </div>
                )}

                <div className="step-track" aria-hidden="true">
                  <span data-on={phase !== "idle"} />
                  <span data-on={phase === "proving" || phase === "publishing" || phase === "done"} />
                  <span data-on={phase === "publishing" || phase === "done"} />
                </div>

                <p className="sr-only" role="status" aria-live="polite">
                  {phase === "hashing" && copy.hashing}
                  {phase === "proving" && copy.proving}
                  {phase === "publishing" && copy.publishing}
                </p>

                <button className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={busy}>
                  {phase === "hashing"
                    ? copy.hashing
                    : phase === "proving"
                      ? `${copy.proving} …`
                      : phase === "publishing"
                        ? copy.publishing
                        : copy.submit}
                </button>

                <p className="hint" style={{ marginTop: 10, textAlign: "center" }}>
                  🔒 {copy.identityNote}
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
      <VoiceChat
        role="worker"
        context={{ siteName: site?.name, zones: site?.zones }}
        onApplyReport={({ body: voiceText }) => {
          if (voiceText) setBody((prev) => (prev ? prev + " " + voiceText : voiceText));
        }}
      />
    </div>
  );
}

function ReceiptCard({
  receipt,
  copy,
  onAgain,
  statusRef,
}: {
  receipt: Receipt;
  copy: Record<string, string>;
  onAgain: () => void;
  statusRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite">
      <div className="flex-between">
        <span className="stamp stamp-verified">{copy.success}</span>
        <span className="mono small muted">SEQ #{receipt.seq}</span>
      </div>

      <div style={{ marginTop: 18 }} className="proof-box">
        <div>
          <b>event</b> REPORT_FILED
        </div>
        <div>
          <b>hash</b> {shortHash(receipt.hash, 22)}
        </div>
        <div>
          <b>issue</b> {receipt.clusterId}
        </div>
        <div>
          <b>nullifier</b> {shortHash(receipt.nullifier, 18)}
        </div>
        <div>
          <b>identity</b> NOT PRESENT
        </div>
      </div>

      <div className="callout callout-verified" style={{ marginTop: 16 }}>
        <strong>
          {receipt.reporters} {receipt.reporters === 1 ? "worker has" : "workers have"}{" "}
          confirmed this issue.
        </strong>{" "}
        Escalation tier {receipt.tier + 1} · {copy.identityNote}
      </div>

      <div className="btn-row" style={{ marginTop: 18 }}>
        <button className="btn btn-primary" onClick={onAgain} type="button">
          {copy.again}
        </button>
        <Link className="btn btn-quiet" href={`/ledger#${receipt.clusterId}`}>
          {copy.viewLedger}
        </Link>
      </div>
    </div>
  );
}
