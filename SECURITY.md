# Security policy

FairShift is an anonymous worker-safety reporting system with a tamper-evident
public ledger and a private payroll ledger. The cryptography is real, but this
repository is still a prototype: do **not** onboard real workers, real report
bodies, or real payroll data until the gaps in
[`docs/production-readiness.md`](docs/production-readiness.md) are closed.

## Supported versions

| Version | Supported | Notes |
|---|---|---|
| `0.1.x` (current) | Best effort | Hackathon / pilot build. Security fixes land on `main` only. |
| Older commits / forks | No | No backports, no LTS branch. |

There is no hosted service operated by the maintainers. If you deploy your own
copy, you own its patching, key custody, monitoring, and incident response.

## Reporting a vulnerability

**Do not open a public GitHub issue for a security problem.**

Use GitHub's private vulnerability reporting on this repository
(**Security → Advisories → Report a vulnerability**). If that channel is not
available, contact the maintainers privately through the repository owner's
published security contact and say that the report is sensitive.

Please include:

- affected commit / version and deployment shape (Cloud Run, local, IAP or not);
- a reproduction or proof-of-concept, with the smallest possible test data;
- the impact you believe it has (anonymity, ledger integrity, auth bypass,
  data exposure, denial of service);
- whether the issue is already public anywhere.

Do **not** include real worker identities, real report text, production
passphrases, private keys, or live worker data in a report. Use synthetic
records.

We aim to acknowledge a report within **3 business days** and to agree a
disclosure timeline with the reporter. This is a volunteer prototype, so those
are targets, not a contractual SLA. There is no bug bounty.

## Threat model summary

### Assets

- **Worker anonymity** — the link between a person and a report must not exist
  on the server.
- **Report confidentiality** — raw bodies are sealed with AES-256-GCM; only the
  redacted body is public.
- **Ledger integrity** — the hash chain, Ed25519 signatures, Merkle roots and
  optional Base Sepolia anchors must make silent edits detectable.
- **Closure integrity** — a high/critical issue cannot close without an
  independent oversight signature.
- **Payroll privacy** — shift and pay records live in a separate private,
  signed ops log; only a Merkle root and aggregate totals are public.
- **Credentials** — admin/oversight passphrases, session HMAC key, seal key,
  Ed25519 seeds, enrolment/check-in HMAC keys, and the anchor wallet key.

### Adversaries considered

| Adversary | Capability | Mitigation / residual risk |
|---|---|---|
| Malicious or coerced employer with server access | Can read the data directory, env, and decrypted sealed bodies | Can refuse service and read bodies, but cannot rewrite the chain undetected; high/critical closure still needs the oversight key. Host-level compromise is **not** prevented by the protocol. |
| Ledger tamperer | Edits/deletes a line in `ledger.ndjson` | Hash chain + signatures + anchors fail closed; the store refuses to load (`Ledger integrity failure`). Anchors must be independently retained/verified to detect whole-file replacement. |
| Outsider filing reports | No credential | Must produce a valid Semaphore Groth16 membership proof against a known site root; rate limits apply. |
| Worker inflating a count | One credential, many reports | Nullifier is per credential per issue; duplicates are rejected at the fold and API. |
| Stolen admin session | Cookie theft / shared passphrase | 8-hour HMAC session, SameSite=Strict, HttpOnly, same-origin writes; oversight key is separate. No MFA yet. |
| Stolen worker phone | Device localStorage | Attacker can impersonate that credential; there is **no revocation** in this build. |
| Network attacker | Intercepts traffic | TLS is assumed; never deploy over plain HTTP. HSTS is not set by the app; terminate TLS at Cloud Run / the load balancer. |
| XSS / supply chain | Runs script in the worker or admin origin | HttpOnly admin cookie limits session theft, but worker Semaphore/payroll secrets live in `localStorage` and are readable by any script on the origin. No CSP is configured in this build. |
| Cloud/IAP operator | Controls infrastructure and identity | IAP and Google Cloud IAM are trusted. The app does not defend against a hostile cloud operator. |
| Anchor publisher | Holds `ANCHOR_PRIVATE_KEY` | `AnchorRegistry` is ownerless: anyone may publish a root. A bad publisher cannot alter the ledger, but can spam anchors or publish misleading roots. Compare roots to the public ledger. |

### Trust boundaries

1. **Browser** — generates the Semaphore identity and payroll key; holds them in
   `localStorage`. Proof generation happens locally. Device storage is not a
   hardware keystore.
2. **Next.js server** — verifies proofs, seals raw bodies, holds signing seeds
   and the seal key, and exposes the admin API. A server compromise is a
   confidentiality compromise.
3. **Ledger files** — `ledger.ndjson` (public accountability) and `ops.ndjson`
   (private shifts/pay) are append-only by convention and signed per event. The
   filesystem itself is not append-only; a host administrator can replace them,
   which is why anchors and backups matter.
4. **Base Sepolia** — optional public anchor registry. A confirmed anchor proves
   a root existed at a block time; it does not prove the whole history is
   honest. In `LOCAL` mode there is no external timestamp.
5. **IAP** — optional outer identity gate. Only the IAP-asserted
   `x-goog-authenticated-user-email` header is meaningful, and only when the
   service cannot be reached directly. See the warning below.

## Authentication and IAP: current state

The app ships with a passphrase-derived admin session and a separate oversight
passphrase. Cloud Run IAP is the recommended outer gate for `/admin` and
`/api/admin`.

The configuration names for IAP-aware admin checks are:

```text
TRUST_IAP=true
ADMIN_EMAILS=security@example.org,ops@example.org
```

**Important:** those getters exist in `src/lib/config.ts`, but in this snapshot
`requireRole()` still authenticates only the signed app cookie. The
header-trust branch is **planned, not wired**. Do not assume that setting
`TRUST_IAP` authenticates an admin. Until it is implemented and tested:

- keep the admin passphrase session as the application-level gate;
- put IAP in front of `/admin` and `/api/admin`;
- restrict ingress so the default `run.app` URL cannot bypass IAP;
- never trust a client-supplied email header on a directly reachable service.

When the header-trust path is implemented, it must accept the header only when
`TRUST_IAP=true` **and** `ADMIN_EMAILS` is non-empty, and the service must be
reachable only through IAP. A spoofed header on a direct URL would otherwise be
a full admin bypass.

## What must never be committed

- `.env`, `.env.local`, `.env.*.local`, or any file containing real values.
- `FAIRSHIFT_ADMIN_PASSPHRASE`, `FAIRSHIFT_OVERSIGHT_PASSPHRASE`
- `FAIRSHIFT_SESSION_SECRET`, `FAIRSHIFT_ENROLMENT_SECRET`,
  `FAIRSHIFT_CHECKIN_SECRET`, `FAIRSHIFT_PAY_SESSION_SECRET`
- `FAIRSHIFT_SEAL_KEY`
- `FAIRSHIFT_SYSTEM_SEED`, `FAIRSHIFT_ADMIN_SEED`, `FAIRSHIFT_OVERSIGHT_SEED`
- `ANCHOR_PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL` if it contains a provider API key,
  `BASESCAN_API_KEY`
- `keys.json`, `seal.key`, `ledger.ndjson`, `ops.ndjson`, `.data/`, any mounted
  data directory contents
- Google service-account JSON, IAP OAuth client secrets, CI/CD tokens
- Real worker report bodies, wage records, exports, screenshots, or DB dumps

`.gitignore` covers the common local paths, but it is not a substitute for
secret scanning. The fixed `FAIRSHIFT_SEAL_KEY` in
`.github/workflows/ci.yml` is a **non-secret test value**; never reuse it in a
deployment.

## Key rotation

| Key | What breaks if rotated carelessly | Safe procedure |
|---|---|---|
| Admin / oversight passphrases | Nothing in the ledger; existing sessions remain valid until the session secret also rotates | Update the secret in Secret Manager, deploy a new revision, rotate `FAIRSHIFT_SESSION_SECRET` to force re-login. |
| `FAIRSHIFT_SESSION_SECRET` | All admin sessions become invalid immediately | Add a new secret version, redeploy. Users sign in again. No ledger impact. |
| `FAIRSHIFT_PAY_SESSION_SECRET` | All worker payroll sessions become invalid | Same as above. If unset it falls back to the session secret. |
| `FAIRSHIFT_ENROLMENT_SECRET` / `FAIRSHIFT_CHECKIN_SECRET` | Outstanding enrolment QRs and daily check-in QRs stop verifying | Rotate between shifts, then issue fresh QRs. No ledger impact. |
| `FAIRSHIFT_SEAL_KEY` | **Old sealed report bodies become unreadable** | Re-encrypt first: take traffic/stop writes, decrypt every `sealedBody` with the old key and re-seal with the new key in a controlled migration, verify, then deploy the new key. Keep the old key until the backup is verified. Losing the key loses the bodies. |
| `FAIRSHIFT_SYSTEM_SEED`, `FAIRSHIFT_ADMIN_SEED`, `FAIRSHIFT_OVERSIGHT_SEED` | **Historical chain verification fails.** `verifyChain` verifies every event with the *current* key ring; changing a seed makes old signatures invalid and the store throws `Ledger integrity failure`. | Do **not** rotate in place. A rotation needs a code change that verifies against the per-event `signer` public key, pins old and new keys, and a tested replay. Until then, treat these seeds as permanent and back them up offline. |
| `ANCHOR_PRIVATE_KEY` | Past anchors remain valid; future anchors come from a new publisher address | Fund a fresh low-value wallet, update the secret, redeploy. Contract is ownerless and has no admin role. |
| IAP OAuth client / Google identity | Admin access only | Rotate in Google Cloud Console; the app has no copy. |
| CI test seal key | CI only | Non-secret; rotate the workflow constant if desired. Never map it to production. |

After any suspected key compromise: stop traffic, preserve copies of both NDJSON
logs, rotate the session secret first (kick sessions), then follow the
table above. Do not delete or truncate a ledger to "fix" a verification error.

## Known limitations

These are deliberate, documented limits of the current build:

- **Timing correlation.** An employer who knows who was on shift when a report
  was filed can narrow down the reporter. Delayed/batched publication and mix
  networks are not implemented.
- **Small anonymity sets.** The app refuses reports below 3 credentials, but a
  3-person site is not meaningfully anonymous. The group is capped at 1,024
  (tree depth 10); the UI shows the live set size.
- **Content correlation.** Redaction removes phone numbers, emails, IDs and
  links, but unusual phrasing can still identify a worker. The raw body is
  sealed, not magic.
- **Demo credentials are public.** Demo crew secrets are derived from public
  strings. `NEXT_PUBLIC_DEMO_MODE` is a build-time signal; the checked-in
  Dockerfile does not remove the demo UI/flows. A production build must remove
  or hard-disable the demo picker and demo passphrase hints in code.
- **No credential revocation.** A lost phone cannot be un-enrolled. Revocation
  lists or short-lived credentials are required before real deployment.
- **Single-writer store.** `ledger.ndjson` and `ops.ndjson` assume one process.
  `--max-instances 1` is required today. There is no cross-instance locking.
- **GCS FUSE is not a POSIX database.** Mounting a bucket preserves bytes across
  cold starts, but it does not provide multi-writer locking or atomic appends.
- **In-process rate limiting.** Limits are per instance and reset on restart.
  There is no Redis/Cloud Armor-backed global limiter.
- **No independent security audit.** The cryptographic design is implemented
  with Semaphore v4 and Node `crypto`, but it has not been audited by a third
  party.
- **No legal review.** Wage rules are demo packs, not a compliance opinion under
  Indian labour law. Payroll amounts and retention need legal/DPDP review.
- **Host can read plaintext.** An admin API call decrypts sealed bodies; a
  server operator with the seal key can read them. This is intentional for the
  employer workflow, but it is not end-to-end encryption against the host.
- **Shared admin passphrase.** There are no per-user admin accounts, MFA, or
  maker-checker beyond the oversight attestation. Login rate limiting is per IP
  and in-process.
- **Header trust is not wired.** `TRUST_IAP`/`ADMIN_EMAILS` are configuration
  placeholders; see the warning above.
- **No CSP / Subresource Integrity.** `next.config.ts` sets
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and
  `Permissions-Policy`, but no Content-Security-Policy. Treat third-party
  scripts as forbidden.
- **Deep audit is expensive.** `/api/ledger/verify?deep=1` re-verifies every
  Groth16 proof (and the last Base anchor). On a large ledger it is a
  deliberate CPU cost and can exceed the 20 s smoke-test timeout.
- **The anchor contract is ownerless.** Anyone can anchor a root; it is a public
  timestamp, not an access-controlled registry. A production design should add
  publisher allowlisting without making the log rewritable.
- **Anchors are manual.** The admin clicks "Anchor chain"; there is no
  scheduled/automated anchoring or alert when the chain grows unanchored.
- **Data is retained indefinitely.** There is no delete endpoint, no retention
  schedule, and no DPDP-compatible erasure/crypto-shredding workflow yet.
