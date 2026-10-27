# Production readiness

**Verdict: not production-ready for real worker data or real payroll.**

FairShift is a working prototype with real cryptography: Semaphore v4 Groth16
membership proofs, Ed25519-signed hash chains, AES-256-GCM sealed bodies, a
closure gate with a separate oversight key, device-generated enrolment, and an
optional Base Sepolia anchor. The operational, legal, and multi-instance pieces
that turn a prototype into a service are not all there yet.

This page is deliberately candid. If a claim here disagrees with the code, the
code wins.

Status meanings:

- **Ready** — implemented and covered by tests at the level needed for a pilot.
- **Partial** — implemented, but a known gap blocks real deployment.
- **Not ready** — missing or unsafe for production use.

## Checklist

| Item | Status | What remains |
|---|---|---|
| **Auth — admin / oversight** | **Partial** | The app has a shared admin passphrase, an 8-hour HMAC session cookie (`HttpOnly`, `SameSite=Strict`, `Secure` in production), same-origin checks on writes, per-IP login rate limiting, and a separate oversight passphrase for `OVERSIGHT_ATTESTED`. It still needs per-user accounts, MFA/SSO, IAP enforcement on `/admin` and `/api/admin`, the planned `TRUST_IAP` + `ADMIN_EMAILS` header-trust path (config getters exist; `requireRole()` does not read them yet), lockout/alerting, and removal of the default `fairshift-demo` / `fairshift-oversight` fallbacks. |
| **ZK enrolment** | **Partial** | Device-generated Semaphore identity and payroll key, 15-minute HMAC enrolment token, admin-side QR modal, one-time `enrol:<nonce>` recorded in `MEMBER_ADDED`, duplicate commitment rejection, 1,024-member cap. Remains: credential revocation, device recovery, secure keystore instead of `localStorage`, E2E tests of the QR flow, distributed rate limiting, and a privacy review of the enrolment metadata (who enrolled when, at which site). |
| **Anonymity set minimum** | **Partial** | The API refuses reports when a site has fewer than 3 credentials (`MIN_ANONYMITY_SET = 3`), the tree supports depths 1–10 (up to 1,024 leaves), and the UI shows the live set size. A 3-person set is **not** anonymous; the threshold should be configurable per site and set much higher for real deployments. Timing correlation, content correlation and small-group inference remain unsolved. |
| **Key management** | **Partial** | Three role-separated Ed25519 seeds (system/admin/oversight), an AES-256-GCM seal key, optional env-provided seeds, and a `keys.json` fallback in the data directory. No KMS/HSM, no key IDs or versions in events, no escrow. Ed25519 seed rotation invalidates historical verification because `verifyChain` uses the current key ring; rotating a seed in place makes the store fail closed. Production needs managed keys, offline escrow, a key-history-aware verifier, and a tested rotation/retirement plan. |
| **Secrets** | **Partial** | `scripts/generate-secrets.mjs` generates every runtime secret; `.gitignore` excludes `.env*`; the CI key is a fixed non-secret test value; the deployment guide covers Secret Manager. Remains: secret scanning in CI, automated rotation, per-environment separation, a hard failure when required secrets are absent (`FAIRSHIFT_STRICT_ENV` exists but is not enforced), and a build-time fix for `NEXT_PUBLIC_DEMO_MODE` (it is inlined into client bundles, so a runtime env var cannot disable the demo UI). |
| **Rate limiting** | **Partial** | In-process fixed-window limits cover admin login, enrolment, reports, shift start/end, pay-session creation, check-in tokens and payroll writes. Limits are per instance, reset on restart, keyed on `x-forwarded-for`, and do not protect the expensive deep-audit endpoint. Production needs a shared limiter (Redis/Memorystore), trusted-proxy IP handling, Cloud Armor for volumetric attacks, and alerting on 429/5xx. |
| **Store — ledger and ops** | **Not ready** | Both the public `ledger.ndjson` and private `ops.ndjson` are single-writer append logs on the instance filesystem. `appendSync` assumes one process; `--max-instances 1` is mandatory. The loading path replays and verifies the chain, which is good, but there is no cross-instance lock, transactional sequence allocation, or failover. A GCS bucket mount survives cold starts but Cloud Storage FUSE is not a POSIX database and has no multi-writer locking. Remains: Firestore/Postgres adapter behind the same append/fold contract, transactionally allocated sequence numbers, leader election or a single-writer queue, concurrency/failover tests, and a migration/rollback plan. |
| **Anchors** | **Partial** | `LOCAL` mode writes a Merkle root as an `ANCHOR` event and never invents a transaction hash. `BASE_SEPOLIA` mode publishes to `contracts/AnchorRegistry.sol` through `src/lib/anchor/provider.ts`, records the real tx hash, chain id, contract, block number and explorer URL, and the deep audit checks the last Base anchor's `anchoredAt`. Remains: automatic/scheduled anchoring, an alert when the chain grows unanchored, verification of **every** historical anchor (not just the last), a publisher allowlist (the contract is ownerless — anyone may anchor), redundant RPC providers, gas monitoring, and a policy for reorg/failed-write reconciliation. |
| **Payroll** | **Partial** | Shifts and pay records live in a separate signed, hash-chained `ops.ndjson`; check-in uses a daily site QR plus a payroll-key signature; the weekly close publishes only a Merkle root and aggregate totals via `PAYROLL_ANCHORED`; workers can fetch a local inclusion proof tied to the anchored root. Remains: legal review of wage rules, statutory deductions/overtime compliance, maker-checker controls, payment-file integration and reconciliation, retention rules for pay data, a full admin payroll UI/audit, and the same multi-instance store work as the public ledger. The wage packs are demo rules, not legal advice. |
| **Observability** | **Not ready** | `/api/health` is a shallow process check (it deliberately does not touch the ledger), the ledger page exposes a deep audit, and server errors are logged. There are no metrics, traces, dashboards, alert policies, error reporting, or paging. Production needs Cloud Run 5xx/latency/instance alerts, a log-based alert on `Ledger integrity failure` and `Ops integrity failure`, uptime checks on `/api/health` plus a synthetic deep audit, anchor-failure alerts, and retention of security-relevant logs. |
| **Backups** | **Not ready** | The default `/tmp/fairshift` is ephemeral; a cold start or new revision reseeds a demo ledger. There is no scheduled backup, restore drill, offsite copy or documented RPO/RTO. A GCS mount with object versioning is the minimum stopgap, but it is not a backup strategy. Remains: snapshots of `ledger.ndjson` and `ops.ndjson`, versioned/offsite buckets, secret and key escrow, restore tests, and a rule that two chains are never merged. |
| **Tests** | **Partial** | 46 original unit/integration tests plus anchor, payroll and ops tests — **69 tests at the time of writing** — run through Vitest, including real Groth16 proofs. CI runs `typecheck`, `test` and `build` on Node 22. Remains: browser E2E (QR enrolment, IAP, admin closure, payslip proof), load/concurrency tests for the store, adversarial proof tests, fuzzing, dependency/SAST scanning, and a staging smoke run against the deployed revision. |
| **Accessibility** | **Partial** | Semantic buttons/forms, explicit labels, status focus handling, `aria` labels on key controls, three languages (English/Hindi/Tamil), and browser speech input/output. No formal WCAG 2.2 AA audit has been done. Remains: screen-reader testing, contrast checks, full keyboard path, focus traps in the enrolment modal, reduced-motion support, 200% zoom, error announcements, and translated validation text. |
| **Data retention / DPDP** | **Not ready** | The ledger is append-only with no delete path; sealed bodies and pseudonymous commitments are retained indefinitely; the public ledger is permanent by design. There is no DPIA, privacy notice, consent capture, retention schedule, erasure/crypto-shredding workflow, data-principal rights process, breach notification runbook, or processor agreement. These must be resolved before onboarding real workers under India's DPDP Act (and any other applicable law). |
| **Incident response** | **Partial** | The store fails closed on a broken chain, both logs are signed and hash-chained, and this repository now documents deployment, rotation and recovery. There is no on-call rota, severity matrix, paging, forensic preservation procedure, legal/comms plan, or post-incident review. The `ANCHOR` failure path warns the operator not to retry blindly after a confirmed on-chain write. |
| **Demo / production separation** | **Not ready** | An empty data directory **always** seeds the two-sector demo ledger, regardless of `NEXT_PUBLIC_DEMO_MODE`. The worker page still falls back to public demo crew slots when no device credential exists, and the admin page still shows the demo passphrase hint when built without the flag. `NEXT_PUBLIC_DEMO_MODE` is a build-time value; setting it only at runtime changes server config, not the already-built client bundle. A production build/seed path must remove demo seeding, demo identities and demo hints. |

## Explicitly not production-ready yet

These are the blockers that matter most. Do not schedule a real pilot until
they are closed and independently verified.

1. **Multi-instance store.** `ledger.ndjson` and `ops.ndjson` are single-writer
   files. Scaling beyond one Cloud Run instance can fork the chain. A
   Firestore/Postgres adapter must preserve the append contract, sequence
   allocation, replay verification and fail-closed behaviour.
2. **Distributed rate limiting.** In-process buckets disappear on restart and
   are not shared across instances. Login/enrolment/report throttling needs a
   shared store and Cloud Armor for volumetric abuse.
3. **Credential revocation.** A lost or sold phone cannot be un-enrolled. Real
   deployment needs revocation lists, short-lived credentials, or a
   re-enrolment/attestation protocol, plus a policy for old nullifiers.
4. **Independent security audit.** The protocol, key handling, IAP/header trust,
   GCS mount semantics, and payroll privacy model have not been reviewed by an
   external firm.
5. **Legal review of wage rules.** The construction/healthcare wage packs,
   overtime, night allowance and IST week boundaries are demo implementations,
   not a legal opinion. Payroll must be reviewed by Indian labour-law counsel
   and reconciled against statutory records.
6. **Demo removal.** Unconditional demo seeding and the public demo crew fallback
   must be removed or hard-disabled in a production build.
7. **IAP header trust.** `TRUST_IAP` and `ADMIN_EMAILS` are config placeholders;
   the admin middleware does not yet trust `x-goog-authenticated-user-email`.
   Keep the passphrase gate until that path is implemented and tested, and lock
   the service to the load balancer so the header cannot be spoofed.
8. **Key custody.** Move seeds, the seal key and the anchor wallet key to
   Secret Manager/KMS with offline escrow. Today the fallback is a local
   `keys.json` in the ephemeral data directory.
9. **Backups, observability and incident response.** Without these, an integrity
   failure or lost volume is unrecoverable and invisible until a user complains.
10. **DPDP / retention.** An append-only public ledger and indefinite sealed
    bodies need a privacy impact assessment, retention schedule and an
    erasure-compatible design (for example, crypto-shredding sealed bodies)
    before real personal data is processed.

## Suggested go-live gates

- [ ] Firestore/Postgres store adapter merged, with concurrent-writer and
      failover tests; `--max-instances` raised only after the tests pass.
- [ ] Redis/Cloud Armor rate limiting and a trusted client-IP model.
- [ ] IAP in front of `/admin` and `/api/admin`, direct `run.app` ingress
      blocked, header-trust path implemented and tested for spoofing.
- [ ] Demo seeding and demo credentials removed from the production build.
- [ ] Credential revocation and device-loss flow implemented.
- [ ] Secrets in Secret Manager/KMS, keys escrowed offline, rotation rehearsed.
- [ ] Nightly backups of both NDJSON logs, restore drill passed, RPO/RTO agreed.
- [ ] Cloud Monitoring alerts + uptime + log-based integrity alert + on-call.
- [ ] External security review and a privacy/DPDP review completed.
- [ ] Wage rules and payroll reconciliation signed off by counsel.
- [ ] Browser E2E, load and adversarial tests in CI/staging.
