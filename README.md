# FairShift

**Anonymous worker safety reporting with zero-knowledge membership proofs, a tamper-evident public ledger, and a closure gate that makes "we fixed it" a signed public act.**

Built for Prompt Wars 2026 × SRM ACM — UN SDG 8, decent work.

---

## The idea in one paragraph

A worker opens a web page, picks a hazard type on their phone, and speaks or types what they saw. Their browser builds a Groth16 proof that they are one of the site's verified workers — without revealing which one — and publishes a report to a public, append-only ledger. Every report from the same credential for the same issue produces the same nullifier, so **five reports means five people**, not five clicks. As unique reporters cross 3 / 5 / 10, or the SLA expires, the issue escalates to the supervisor, site manager, regional lead, then the public and oversight board. The employer can only close it in one of two ways: publish a fix, or publish a disciplinary action with a hashed subject. High and critical issues also need an **independent oversight signature**. Only then does the closure event exist.

There is no delete endpoint. There is no "mark as resolved" without evidence.

---

## Why this is not another complaints dashboard

| Common submission | FairShift |
|---|---|
| "Anonymous" checkbox, name still in the DB | Zero-knowledge proof; the server never receives an identity |
| 12 reports = 12 tickets | Nullifier-per-credential; unique reporters counted, sybil-inflated counts impossible |
| Status field set to "resolved" | Closure requires a signed resolution + evidence hash; severity ≥ HIGH needs a second key |
| Trust the admin panel | Public ledger re-verifies every hash, signature and Groth16 proof |
| Two industries named in the pitch | Two live sector packs from one engine: construction and hospital |

---

## How the anonymity actually works

Semaphore v4 (Groth16 over BN254), **proved in the browser**.

1. **Enrolment.** The worker's device generates an identity secret and a commitment. Only the commitment enters the employer's site group (and the public `MEMBER_ADDED` event). The secret never leaves the device.
2. **Reporting.** The device builds a proof that its commitment is a leaf of the site's LeanIMT group. The circuit exposes only:
   - `merkleTreeRoot` — proves which group,
   - `nullifier = H(secret, scope)` — one per credential per issue,
   - `message` — a field element derived from SHA-256 of the exact report body,
   - `scope` — derived from the issue id.
3. **Verification.** The server checks the proof against the site's known roots, checks `scope` matches the issue, checks `message` matches the body hash, and checks the nullifier has never been seen for that issue. It then stores the redacted body, an AES-256-GCM sealed full body, and the proof.
4. **What the server knows:** that *some* credentialed worker reported. **What it does not know:** which one. There is no identity column to leak, because there is no identity.

> Demo identities are derived from public strings so judges can switch crew slots in two tabs. That is explicitly gated by `NEXT_PUBLIC_DEMO_MODE` and is **not** the production enrolment path. See `src/lib/demo/identities.ts`.

### Threat model

| Threat | Mitigation |
|---|---|
| Employer edits/deletes a report | Hash chain + Ed25519 signatures; one byte change breaks every later hash |
| Employer fabricates a closure | Closure gate requires a resolution event and, for HIGH/CRITICAL, a separate oversight key signature |
| Worker files 50 reports | One nullifier per credential per issue; duplicates rejected at the proof layer |
| Outsider submits a report | Proof must verify against a root in that site's enrolment history |
| Server leaks its database | Bodies are AES-256-GCM sealed; no identity mapping exists |
| Report text identifies the worker | Public body is redacted (phone, email, ID, links); raw text is sealed |
| Stolen admin session closes a severe issue | Oversight passphrase/key is separate from the admin session |
| CSRF | SameSite=Strict HttpOnly session, same-origin check on every write |
| Brute force | Constant-time passphrase compare + per-IP fixed-window rate limits |

**Non-goals / honest limitations:** the ledger is a hash-chained public log with Merkle anchors, not an L1 contract (the anchor adapter is the seam); demo credentials are public by design; the store is a single-writer NDJSON log intended for one Cloud Run instance; rate limits are in-process.

---

## The event vocabulary

Ten event types. No update, no delete.

| Event | Actor | Meaning |
|---|---|---|
| `GENESIS` | system | Network start |
| `ORG_REGISTERED` | system | Employer group |
| `SITE_REGISTERED` | system | Sector pack + zones |
| `MEMBER_ADDED` | system | Public commitment + new group root |
| `REPORT_FILED` | system | Proof, nullifier, redacted body, sealed body |
| `ESCALATION_RAISED` | system | Tier change from threshold, severity or SLA breach |
| `RESOLUTION_PUBLISHED` | admin | `FIX` or `DISCIPLINE` + evidence hash |
| `OVERSIGHT_ATTESTED` | oversight | Independent second signature |
| `ISSUE_CLOSED` | admin | Only after the closure gate passes |
| `ANCHOR` | admin | Merkle root over a block of events |

### Escalation

| Unique reporters | Tier | Owner | SLA |
|---|---|---|---|
| 1–2 | 1 | Site supervisor | 72 h |
| 3–4 | 2 | Site manager | 48 h |
| 5–9 | 3 | Regional safety lead | 24 h |
| 10+ | 4 | Public + oversight board | 12 h |

`CRITICAL` starts at tier 3, `HIGH` at tier 2. Missing an SLA escalates one tier automatically. The deadline clock is visible to the public.

---

## Run locally

```bash
npm install
npm run setup:zk        # downloads Semaphore artifacts into public/zk (gitignored)
npm run dev             # http://localhost:3000
```

The first request seeds a two-sector demo ledger (construction + hospital) with **real proofs** from `src/lib/demo/seed-proofs.json`.

Demo credentials:

| Role | Credential |
|---|---|
| Admin | `fairshift-demo` |
| Oversight | `fairshift-oversight` |
| Worker | any crew slot 1–12 on the worker card |

Reset the demo by deleting `.data/` and restarting.

### Regenerate the seeded proofs

```bash
npm run setup:zk && npm run seed:proofs
```

This proves every seeded report for real (~30 s) and writes `src/lib/demo/seed-proofs.json` (safe to commit: proofs and nullifiers are public).

---

## Tests

```bash
npm test
```

Covered:

- hash chain: valid chain, edited payload, broken link, removed event, deterministic hashes
- Ed25519: sign/verify, wrong role, wrong hash, three distinct keys
- zero-knowledge: real proof verifies; proof is bound to body + issue; wrong body/root rejected; one nullifier per credential per issue
- escalation: SLA breach, idempotent once written, closed issues skipped, tier cap
- fold: unique reporter counts, tier derivation, duplicate nullifier rejection, closure without resolution rejected, full lifecycle
- closure gate: no resolution, missing evidence hash, missing oversight, mismatched attestation, unhashed discipline subject
- sealing: round-trip, fresh IV, tamper fails closed
- redaction: phone, email, Aadhaar-shaped ID, links, whitespace

---

## Deploy to Cloud Run

```bash
gcloud run deploy fairshift \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --max-instances 1 \
  --min-instances 1 \
  --memory 1Gi \
  --set-env-vars "FAIRSHIFT_ADMIN_PASSPHRASE=<secret>,FAIRSHIFT_OVERSIGHT_PASSPHRASE=<other-secret>,FAIRSHIFT_SESSION_SECRET=<random>,FAIRSHIFT_SEAL_KEY=<32-byte-base64>,NEXT_PUBLIC_DEMO_MODE=true"
```

Why `--max-instances 1`: the ledger is a single-writer append-only log on the instance filesystem. Scaling out would create divergent chains. For multi-instance production, swap `src/lib/ledger/store.ts` for Firestore/Postgres with the same append contract — the rest of the system does not change.

`--min-instances 1` avoids a cold start re-seeding the demo during judging.

SLA sweeps are idempotent and run when the public ledger or employer desk is opened; a breach becomes a signed `ESCALATION_RAISED` event, so it stays on the record even if the issue is later closed. The landing page deliberately does not write, so it shows the raw overdue state.

---

## Zero-knowledge design

See [`docs/zero-knowledge.md`](docs/zero-knowledge.md) for the protocol walkthrough, what each side learns, and the limitations of the demo.

---

## Project map

```
src/
  app/
    page.tsx                 landing
    worker/page.tsx          worker card: icons, 3 languages, voice
    admin/page.tsx           employer desk: triage, resolve, attest, close
    ledger/page.tsx          public explorer + audit
    api/
      reports/route.ts       verify ZK proof, seal body, append
      admin/*                login, issues, resolve, attest, close, anchor
      ledger/*               public events, blocks, deep verification
      groups/[siteId]        public commitments + scope for local proving
  lib/
    ledger/                  chain, fold, closure, escalation, store
    zk/                      browser prover + server verifier
    crypto/                  canonical JSON, Ed25519 keys, AES-GCM, field math
    demo/                    two-sector scenario + precomputed proofs
    security/                redaction, session, rate limit
scripts/
  fetch-zk-artifacts.mjs     downloads artifacts at image build
  build-seed-proofs.ts       regenerates the demo proofs
tests/                       unit + real-proof integration tests
```

---

## Submission checklist

- Public GitHub URL must end in `.git`
- Exactly one branch, under 10 MB (`public/zk/` is gitignored; artifacts download at build)
- Final host is Cloud Run — no Vercel/Netlify
- LinkedIn post: problem → build → solution fit

Built with Next.js 16, React 19, TypeScript, Semaphore v4, Node crypto, Tailwind v4, Vitest.
