# Zero-knowledge reporting, end to end

This document explains exactly what FairShift proves, what it stores, and what it
deliberately cannot know. It is written so a judge (or an auditor) can challenge
the claims.

---

## 1. The statement

When a worker files a report, the system needs to be convinced of one thing:

> “I control one of the credentials enrolled for this site.”

It must **not** learn *which* credential. It must also make sure one credential
cannot inflate the reporter count for the same issue.

Semaphore v4 gives us exactly this shape:

```
proof proves:  commitment ∈ group  (without revealing commitment)
public:        merkleTreeRoot, nullifier, message, scope
```

---

## 2. Enrolment

An identity is two field elements generated on the worker's device:

```
secret      = (trapdoor, nullifierSecret)
commitment  = Poseidon(trapdoor, nullifierSecret)
```

Only the commitment is sent to the employer and published as `MEMBER_ADDED`.
The employer builds a LeanIMT (incremental Merkle tree) of commitments. Every
addition produces a new root; every historical root stays valid for proofs that
were generated against it.

In this prototype the demo commitments are derived from public strings so judges
can switch crew slots. That is a **demo affordance**, not the production model.
In production the device generates a random secret and the employer enrols only
the commitment (for example by scanning a QR displayed on the worker's phone).

---

## 3. Reporting

For a report with body `B` and issue id `C`:

```
bodyHash  = SHA-256(B)
message   = field(bodyHash)            // binds the proof to these exact words
scope     = field(SHA-256("fairshift:scope:" + C))   // one issue
nullifier = Poseidon(nullifierSecret, scope)
```

The browser fetches the site's public commitment list, builds the same tree, and
generates a Groth16 proof locally:

```
Public inputs:  merkleTreeRoot, nullifier, message, scope
Witness:        trapdoor, nullifierSecret, Merkle path
```

Then it POSTs `{ siteId, category, zone, body, proof }`.

### What the server checks

1. `proof.merkleTreeRoot` is one of the site's historical roots.
2. `proof.scope` equals the scope derived from this issue.
3. `proof.message` equals `field(SHA-256(body))` — the proof cannot be replayed
   with edited text.
4. `verifyProof(proof)` accepts the Groth16 proof (verification keys are local;
   no network call).
5. The `nullifier` has not been used for this issue.

Only then is `REPORT_FILED` signed and appended.

---

## 4. What each party learns

| Party | Learns | Does not learn |
|---|---|---|
| Public ledger | A credentialed worker reported; the redacted text; the proof; one nullifier | Which worker; the raw body; the credential |
| Server | Same as public, plus the sealed body when an admin requests it | Which worker; the secret |
| Employer | Who is **enrolled** (they verified employment) and the report details | Which enrolled worker filed a specific report |
| Worker | Their own secret and nullifier | Other workers' secrets |

The employer knows the set of commitments they enrolled, but not which commitment
produced a given proof. The proof reveals a membership fact, not a leaf.

The raw body is encrypted with AES-256-GCM before it is written. The public
redacted body is a separate field. `bodyHash` lets anyone verify that a revealed
body matches the one the proof committed to.

---

## 5. Why the nullifier matters

```
nullifier = Poseidon(nullifierSecret, scope)
```

- Same credential + same issue → **same** nullifier → duplicate rejected.
- Same credential + different issue → **different** nullifier → unlinkable across
  issues.
- Different credentials + same issue → different nullifiers → reporter count is
  a count of people, not submissions.

This is what makes the escalation ladder (3 / 5 / 10 unique reporters) meaningful.
Without it, one person could manufacture a public-tier escalation in a minute.

---

## 6. Anonymity set and its limits

The anonymity set is the number of commitments in the site group at the root used
by the proof. It is visible in the UI (`N verified credentials`). FairShift refuses
reports when the set is smaller than 3.

Honest limits:

- **Small groups are not anonymous.** A 3-person site is not a crowd.
- **Timing correlation.** An employer who watches who is on shift at 14:32 could
  narrow down a report filed at 14:32. Mitigations (delayed publication, batched
  submissions, mix networks) are out of scope for the prototype.
- **Content correlation.** The redactor removes phone numbers, emails, IDs and
  links, but unusual phrasing can still identify someone. The interface warns
  workers, and the raw body is sealed.
- **Demo identities are public.** Anyone can reproduce the demo crew secrets. This
  is why the demo picker is labelled and gated by `NEXT_PUBLIC_DEMO_MODE`.
- **No revocation.** If a phone is lost, the credential cannot be revoked in this
  prototype. Production needs revocation lists or short-lived credentials.

These are documented rather than hidden; the cryptographic core is real even
where the demo affordances are not.

---

## 7. Why the record cannot be rewritten

Each event is:

```
hash = SHA-256(seq, ts, type, actor, payload, prevHash)
sig  = Ed25519(hash, actorKey)
```

`prevHash` points at the previous event. Editing any field changes `hash`, which
breaks the `prevHash` of the next event, and so on. The public ledger endpoint
recomputes the entire chain and verifies every signature; the deep audit endpoint
also re-verifies every Groth16 proof.

Keys are separated by role:

- `system` signs reports and member additions after verification.
- `admin` signs resolutions, closures and anchors.
- `oversight` signs independent attestations.

A stolen admin session cannot produce a valid `OVERSIGHT_ATTESTED` event, and a
high-severity closure without one is rejected by both the API and the fold.

---

## 8. What is real vs. what is a seam

**Real**

- Groth16 membership proofs generated in the worker's browser.
- Nullifier uniqueness enforced at the state fold.
- Ed25519 signatures, hash chaining, Merkle anchors, deep verification.
- AES-256-GCM sealing, redaction, constant-time credential checks, rate limits.
- Full closure gate: fix or discipline + evidence hash + oversight for high severity.

**Seams (deliberate, documented)**

- The “blockchain” is a public, append-only, hash-chained log with Merkle anchors.
  The `ANCHOR` event is the seam where a Base/Polygon contract write would go.
  The demo does not pay gas or claim an L1 transaction.
- Demo credentials are public strings.
- The store is a single-writer NDJSON file for one Cloud Run instance.
- Rate limits are per process.

The security claims are about what the code actually does, not about a future
architecture diagram.
