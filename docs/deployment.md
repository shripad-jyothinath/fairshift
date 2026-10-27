# Deploying FairShift

This is the operator runbook for the Cloud Run deployment in this repository.
It targets the current code: Next.js 16 standalone output, Node 22, Semaphore v4
artifacts fetched at image build, a single-writer NDJSON ledger (plus a private
payroll ops log), and optional Base Sepolia anchoring.

> **Read [`docs/production-readiness.md`](production-readiness.md) first.** This
> build is a pilot/hackathon release, not a service for real worker or payroll
> data. In particular, an empty data directory seeds the demo ledger, the demo
> worker path is still present, the store is single-writer, and IAP header trust
> is not wired yet. The deployment steps below are accurate for what the code
> actually does.

---

## 1. What gets deployed

| Piece | Detail |
|---|---|
| Runtime | Node 22 Alpine, Next.js 16 standalone, port `8080` |
| Container | `Dockerfile`; `.dockerignore` excludes `public/zk`, then the builder runs `npm run setup:zk` |
| ZK artifacts | ~30 MB of Semaphore v4 `.wasm`/`.zkey` files for tree depths 1–10, downloaded at image build from the PSS snark-artifacts repo |
| Public ledger | `ledger.ndjson` in `FAIRSHIFT_DATA_DIR` (default `/tmp/fairshift`) |
| Private ops log | `ops.ndjson` in the same directory (shifts, pay records, payroll closes) |
| Key material | `FAIRSHIFT_*_SEED` env vars, or a generated `keys.json` in the data dir; `FAIRSHIFT_SEAL_KEY` env or `seal.key` |
| Anchors | `ANCHOR` events; optional real writes to `AnchorRegistry` on Base Sepolia |
| Health | `GET /api/health` returns `{ ok: true, service: "fairshift" }` |

The image does **not** need a database. It does need durable storage if the
ledger must survive a cold start, a new revision, or a crash.

---

## 2. Prerequisites

### Local tooling

- Node.js 22 (the same major as the container and CI).
- `gcloud` CLI, authenticated.
- A Google Cloud project with billing enabled.
- Optional: Docker, if you want to build locally.

### Google Cloud setup

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

PowerShell has the same command shape:

```powershell
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

Link billing if it is not already linked:

```bash
gcloud billing accounts list
gcloud billing projects link YOUR_PROJECT_ID --billing-account=YOUR_BILLING_ACCOUNT_ID
```

Enable the APIs. `run`, `cloudbuild` and `artifactregistry` are required for a
source deploy. `storage` is only for a GCS volume; `secretmanager` is only for
the secrets option; `iap` and `compute` are only for IAP/load balancing.

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com

# Optional:
gcloud services enable storage.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable iap.googleapis.com
gcloud services enable compute.googleapis.com
```

Recommended roles for the deploying human: Cloud Run Admin, Cloud Build Editor,
Artifact Registry Writer, Service Account User, and Secret Manager Admin (if
using Secret Manager). For a team, grant these through IAM groups rather than a
shared account.

Set shell variables once:

```bash
export PROJECT_ID="YOUR_PROJECT_ID"
export REGION="asia-south1"
export SERVICE="fairshift"
gcloud config set project "$PROJECT_ID"
```

```powershell
$env:PROJECT_ID = "YOUR_PROJECT_ID"
$env:REGION = "asia-south1"
$env:SERVICE = "fairshift"
gcloud config set project $env:PROJECT_ID
```

### Local preflight (recommended)

```bash
npm ci
npm run setup:zk
npm run typecheck
npm test
npm run build
```

The same steps run in `.github/workflows/ci.yml` on every push or pull request
to `main`. CI uses a fixed **non-secret** test seal key and a temporary data
directory. Never copy that key into a deployment.

---

## 3. Generate secrets

Run the generator locally. It prints a `.env` block and a single-line
`--set-env-vars` value; it never writes a file and never calls the network.

```bash
node scripts/generate-secrets.mjs
```

```powershell
node scripts/generate-secrets.mjs
```

It generates:

| Variable | Purpose |
|---|---|
| `FAIRSHIFT_ADMIN_PASSPHRASE` | Opens the employer desk |
| `FAIRSHIFT_OVERSIGHT_PASSPHRASE` | Second key for `OVERSIGHT_ATTESTED` |
| `FAIRSHIFT_SESSION_SECRET` | HMAC key for the 8-hour admin session cookie |
| `FAIRSHIFT_ENROLMENT_SECRET` | HMAC key for 15-minute enrolment QRs |
| `FAIRSHIFT_CHECKIN_SECRET` | HMAC key for daily site check-in QRs |
| `FAIRSHIFT_SEAL_KEY` | 32-byte base64 AES-256-GCM key for sealed report bodies |
| `FAIRSHIFT_SYSTEM_SEED` | 32-byte base64 Ed25519 seed for system-signed events |
| `FAIRSHIFT_ADMIN_SEED` | 32-byte base64 Ed25519 seed for admin-signed events |
| `FAIRSHIFT_OVERSIGHT_SEED` | 32-byte base64 Ed25519 seed for oversight attestations |

Treat the output as live secrets. Do not commit it, paste it into a ticket, or
put it in a screenshot. The table in
[`SECURITY.md`](../SECURITY.md#key-rotation) explains what breaks if each value
is rotated.

`FAIRSHIFT_PAY_SESSION_SECRET` is optional and falls back to
`FAIRSHIFT_SESSION_SECRET`; generate a separate value if you want payroll
sessions to rotate independently.

### Option A — environment variables (fastest, least private)

This is convenient for a demo project. Anyone who can read the Cloud Run
revision configuration can read these values, and they can leak through shell
history. Use it only when you accept that.

Bash:

```bash
export FAIRSHIFT_ADMIN_PASSPHRASE='...'
export FAIRSHIFT_OVERSIGHT_PASSPHRASE='...'
export FAIRSHIFT_SESSION_SECRET='...'
export FAIRSHIFT_ENROLMENT_SECRET='...'
export FAIRSHIFT_CHECKIN_SECRET='...'
export FAIRSHIFT_SEAL_KEY='...'
export FAIRSHIFT_SYSTEM_SEED='...'
export FAIRSHIFT_ADMIN_SEED='...'
export FAIRSHIFT_OVERSIGHT_SEED='...'

gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --max-instances 1 \
  --min-instances 1 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 60 \
  --set-env-vars "FAIRSHIFT_ADMIN_PASSPHRASE=$FAIRSHIFT_ADMIN_PASSPHRASE,FAIRSHIFT_OVERSIGHT_PASSPHRASE=$FAIRSHIFT_OVERSIGHT_PASSPHRASE,FAIRSHIFT_SESSION_SECRET=$FAIRSHIFT_SESSION_SECRET,FAIRSHIFT_ENROLMENT_SECRET=$FAIRSHIFT_ENROLMENT_SECRET,FAIRSHIFT_CHECKIN_SECRET=$FAIRSHIFT_CHECKIN_SECRET,FAIRSHIFT_SEAL_KEY=$FAIRSHIFT_SEAL_KEY,FAIRSHIFT_SYSTEM_SEED=$FAIRSHIFT_SYSTEM_SEED,FAIRSHIFT_ADMIN_SEED=$FAIRSHIFT_ADMIN_SEED,FAIRSHIFT_OVERSIGHT_SEED=$FAIRSHIFT_OVERSIGHT_SEED,FAIRSHIFT_DATA_DIR=/tmp/fairshift,NEXT_PUBLIC_DEMO_MODE=false"
```

PowerShell (one line; PowerShell uses backticks for continuation, not `\`):

```powershell
gcloud run deploy $env:SERVICE --source . --region $env:REGION --allow-unauthenticated --max-instances 1 --min-instances 1 --memory 1Gi --cpu 1 --timeout 60 --set-env-vars "FAIRSHIFT_ADMIN_PASSPHRASE=$env:FAIRSHIFT_ADMIN_PASSPHRASE,FAIRSHIFT_OVERSIGHT_PASSPHRASE=$env:FAIRSHIFT_OVERSIGHT_PASSPHRASE,FAIRSHIFT_SESSION_SECRET=$env:FAIRSHIFT_SESSION_SECRET,FAIRSHIFT_ENROLMENT_SECRET=$env:FAIRSHIFT_ENROLMENT_SECRET,FAIRSHIFT_CHECKIN_SECRET=$env:FAIRSHIFT_CHECKIN_SECRET,FAIRSHIFT_SEAL_KEY=$env:FAIRSHIFT_SEAL_KEY,FAIRSHIFT_SYSTEM_SEED=$env:FAIRSHIFT_SYSTEM_SEED,FAIRSHIFT_ADMIN_SEED=$env:FAIRSHIFT_ADMIN_SEED,FAIRSHIFT_OVERSIGHT_SEED=$env:FAIRSHIFT_OVERSIGHT_SEED,FAIRSHIFT_DATA_DIR=/tmp/fairshift,NEXT_PUBLIC_DEMO_MODE=false"
```

### Option B — Secret Manager (recommended)

Enable Secret Manager and create one secret per value. Secret versions are
immutable; rotation means adding a new version and redeploying.

Bash example (repeat for each name):

```bash
gcloud secrets create fairshift-admin-passphrase \
  --replication-policy=automatic \
  --labels=app=fairshift

read -rsp "Paste FAIRSHIFT_ADMIN_PASSPHRASE: " SECRET_VALUE; echo
printf '%s' "$SECRET_VALUE" | gcloud secrets versions add fairshift-admin-passphrase --data-file=-
unset SECRET_VALUE
```

PowerShell example:

```powershell
$secure = Read-Host "Paste FAIRSHIFT_ADMIN_PASSPHRASE" -AsSecureString
$plain = [System.Net.NetworkCredential]::new("", $secure).Password
$plain | gcloud secrets versions add fairshift-admin-passphrase --data-file=-
Remove-Variable plain, secure
```

Create these names:

```text
fairshift-admin-passphrase
fairshift-oversight-passphrase
fairshift-session-secret
fairshift-enrolment-secret
fairshift-checkin-secret
fairshift-seal-key
fairshift-system-seed
fairshift-admin-seed
fairshift-oversight-seed
# only for Base Sepolia:
fairshift-anchor-private-key
```

Create a dedicated runtime service account and grant it access to the secrets
it needs. Do not run the service as the broad default compute account.

```bash
gcloud iam service-accounts create fairshift-run \
  --display-name="FairShift Cloud Run runtime"

RUNTIME_SA="fairshift-run@${PROJECT_ID}.iam.gserviceaccount.com"

# Least privilege: grant only on the secrets this service reads.
for SECRET in fairshift-admin-passphrase fairshift-oversight-passphrase \
  fairshift-session-secret fairshift-enrolment-secret fairshift-checkin-secret \
  fairshift-seal-key fairshift-system-seed fairshift-admin-seed fairshift-oversight-seed; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

Deploy with `--set-secrets`:

```bash
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --max-instances 1 \
  --min-instances 1 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 60 \
  --service-account "$RUNTIME_SA" \
  --set-env-vars "FAIRSHIFT_DATA_DIR=/tmp/fairshift,NEXT_PUBLIC_DEMO_MODE=false,ANCHOR_MODE=LOCAL" \
  --set-secrets "FAIRSHIFT_ADMIN_PASSPHRASE=fairshift-admin-passphrase:latest,FAIRSHIFT_OVERSIGHT_PASSPHRASE=fairshift-oversight-passphrase:latest,FAIRSHIFT_SESSION_SECRET=fairshift-session-secret:latest,FAIRSHIFT_ENROLMENT_SECRET=fairshift-enrolment-secret:latest,FAIRSHIFT_CHECKIN_SECRET=fairshift-checkin-secret:latest,FAIRSHIFT_SEAL_KEY=fairshift-seal-key:latest,FAIRSHIFT_SYSTEM_SEED=fairshift-system-seed:latest,FAIRSHIFT_ADMIN_SEED=fairshift-admin-seed:latest,FAIRSHIFT_OVERSIGHT_SEED=fairshift-oversight-seed:latest"
```

PowerShell one-line equivalent (same flags):

```powershell
gcloud run deploy $env:SERVICE --source . --region $env:REGION --allow-unauthenticated --max-instances 1 --min-instances 1 --memory 1Gi --cpu 1 --timeout 60 --service-account "fairshift-run@$env:PROJECT_ID.iam.gserviceaccount.com" --set-env-vars "FAIRSHIFT_DATA_DIR=/tmp/fairshift,NEXT_PUBLIC_DEMO_MODE=false,ANCHOR_MODE=LOCAL" --set-secrets "FAIRSHIFT_ADMIN_PASSPHRASE=fairshift-admin-passphrase:latest,FAIRSHIFT_OVERSIGHT_PASSPHRASE=fairshift-oversight-passphrase:latest,FAIRSHIFT_SESSION_SECRET=fairshift-session-secret:latest,FAIRSHIFT_ENROLMENT_SECRET=fairshift-enrolment-secret:latest,FAIRSHIFT_CHECKIN_SECRET=fairshift-checkin-secret:latest,FAIRSHIFT_SEAL_KEY=fairshift-seal-key:latest,FAIRSHIFT_SYSTEM_SEED=fairshift-system-seed:latest,FAIRSHIFT_ADMIN_SEED=fairshift-admin-seed:latest,FAIRSHIFT_OVERSIGHT_SEED=fairshift-oversight-seed:latest"
```

> **`NEXT_PUBLIC_DEMO_MODE` is a build-time value for client code.** Setting it
> only in `--set-env-vars` changes the server's `config.demoMode` (and therefore
> ops seeding), but the checked-in Dockerfile builds with the demo UI still
> enabled. The public ledger also seeds the demo scenario on an empty data
> directory regardless of this flag. See the production-readiness blockers
> before treating the service as demo-free.

---

## 4. Why `--max-instances 1` today

`ledger.ndjson` and `ops.ndjson` are append-only logs with an in-process append
queue. Each instance loads the file into memory, verifies the chain, and appends
with `fs.appendFileSync`. There is no cross-process lock, sequence allocator, or
leader election.

Two instances would create two divergent in-memory histories, both writing to
the same file or to separate files. That breaks the single hash chain and can
make the ledger unverifiable.

`--min-instances 1` additionally avoids a cold start for the demo. It is **not**
a durability feature: a deploy, crash, or instance replacement still resets
`/tmp`.

### Scale path

Replace `src/lib/ledger/store.ts` (and the ops store) with a Firestore or
Postgres adapter that preserves the same append contract:

1. Verify the event and its signature before writing.
2. Allocate the next sequence number atomically with the previous hash
   (a transaction or a single-writer queue).
3. Append the event and update the materialised state in the same transaction
   where possible.
4. Keep replay verification and fail-closed loading.
5. Keep `ANCHOR` events and payload shapes unchanged so old proofs and anchors
   remain verifiable.

Only after concurrent-writer/failover tests pass should `--max-instances` be
raised. Keeping the NDJSON log as an export/backup is fine; it is not the
production source of truth in a multi-instance design.

---

## 5. Persistence and Cloud Storage

Default: `FAIRSHIFT_DATA_DIR=/tmp/fairshift` inside the container.

Consequences:

- A cold start, revision replacement, or crash starts from an empty directory.
- An empty directory seeds the public demo ledger (and the ops demo if
  `NEXT_PUBLIC_DEMO_MODE` is not `false` at runtime).
- All reports, enrolments, shifts and payroll records from the previous instance
  are gone.

`--min-instances 1` reduces the frequency of this but does not prevent it.

### GCS volume mount (stopgap)

Create a bucket with object versioning and grant the runtime service account
access:

```bash
export RUNTIME_SA="fairshift-run@${PROJECT_ID}.iam.gserviceaccount.com"
export BUCKET="${PROJECT_ID}-fairshift-data"

gcloud storage buckets create "gs://${BUCKET}" \
  --location="$REGION" \
  --uniform-bucket-level-access
gcloud storage buckets update "gs://${BUCKET}" --versioning

gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/storage.objectAdmin"
```

Deploy with the volume and mount:

```bash
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --max-instances 1 \
  --min-instances 1 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 60 \
  --execution-environment gen2 \
  --service-account "$RUNTIME_SA" \
  --add-volume "name=fairshift-data,type=cloud-storage,bucket=${BUCKET}" \
  --add-volume-mount "volume=fairshift-data,mount-path=/mnt/fairshift" \
  --set-env-vars "FAIRSHIFT_DATA_DIR=/mnt/fairshift,NEXT_PUBLIC_DEMO_MODE=false,ANCHOR_MODE=LOCAL" \
  --set-secrets "FAIRSHIFT_ADMIN_PASSPHRASE=fairshift-admin-passphrase:latest,FAIRSHIFT_OVERSIGHT_PASSPHRASE=fairshift-oversight-passphrase:latest,FAIRSHIFT_SESSION_SECRET=fairshift-session-secret:latest,FAIRSHIFT_ENROLMENT_SECRET=fairshift-enrolment-secret:latest,FAIRSHIFT_CHECKIN_SECRET=fairshift-checkin-secret:latest,FAIRSHIFT_SEAL_KEY=fairshift-seal-key:latest,FAIRSHIFT_SYSTEM_SEED=fairshift-system-seed:latest,FAIRSHIFT_ADMIN_SEED=fairshift-admin-seed:latest,FAIRSHIFT_OVERSIGHT_SEED=fairshift-oversight-seed:latest"
```

PowerShell: use one line, replacing `\` continuation with a backtick or no
continuation at all.

### Cloud Storage FUSE limits — read this before trusting the mount

Cloud Run mounts buckets through Cloud Storage FUSE, not a block device or a
database.

- **No file locking / no multi-writer safety.** Two writers can lose updates;
  the last write wins. Keep `--max-instances 1`.
- **Not fully POSIX.** Rename, append, mmap, and metadata semantics differ from a
  local disk.
- **Append is a rewrite.** Appending a line to a large NDJSON object can rewrite
  the object in the background. This gets slower as the ledger grows.
- **Crash consistency is not a database transaction.** A crash during a rewrite
  can leave a partial or stale object; object versioning helps recover but does
  not make the file transactional.
- **The app's in-memory state is authoritative while running.** A GCS mount
  preserves bytes across restarts; it does not make the store multi-instance.
- **Latency.** Every filesystem operation is a network operation. Deep audits,
  large payloads and payroll closes will feel it.

If you need durability *and* scale, use the Firestore/Postgres adapter path in
section 4 rather than stretching GCS FUSE.

### What to include in a backup

If using a GCS mount, the data directory contains:

- `ledger.ndjson` — public accountability log
- `ops.ndjson` — private shifts/payroll log
- `keys.json` — generated Ed25519 seeds (if env seeds are absent)
- `seal.key` — generated AES key (if `FAIRSHIFT_SEAL_KEY` is absent)

In production, set all seeds and the seal key from Secret Manager so those
files are never the only copy. Backup the ciphertext files **and** escrow the
keys; ciphertext without the seal key is unrecoverable.

---

## 6. IAP for `/admin` and `/api/admin`

The public worker card and ledger must stay reachable without a Google account.
The employer desk must not. Two workable patterns:

### Pattern A — protect the entire service (admin-only / staging)

Cloud Run supports IAP directly. This is the simplest setup, but it gates
**every** path, including `/worker` and `/ledger`, so it is only suitable for a
staging or internal deployment.

```bash
gcloud run services update "$SERVICE" \
  --region "$REGION" \
  --iap \
  --no-allow-unauthenticated

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
gcloud run services add-iam-policy-binding "$SERVICE" \
  --region "$REGION" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-iap.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

gcloud iap web add-iam-policy-binding \
  --member="user:security@example.org" \
  --role="roles/iap.httpsResourceAccessor" \
  --resource-type=cloud-run \
  --service="$SERVICE" \
  --region="$REGION"
```

Add each reviewer. If this is the first IAP setup in a project without an
organization, the console may need to configure the OAuth consent screen once;
`gcloud` can warn about this.

### Pattern B — public app, admin paths behind IAP (production shape)

Use an external Application Load Balancer with two serverless NEGs pointing at
the same Cloud Run service:

1. **Public backend** — no IAP; serves `/`, `/worker`, `/ledger`, `/api/health`,
   `/api/state`, `/api/ledger`, `/api/reports`, `/api/enroll`, `/api/shifts`,
   `/api/pay`.
2. **Admin backend** — IAP enabled; serves `/admin`, `/admin/*`, `/api/admin`,
   `/api/admin/*`.
3. The URL map routes the admin paths to the admin backend and everything else
   to the public backend. Make sure there is no fall-through from an admin path
   to the public backend.
4. Set Cloud Run ingress to `internal-and-cloud-load-balancing` so the default
   `run.app` URL cannot be used to bypass the load balancer. The load balancer
   must be the only public entry point.
5. Grant `roles/iap.httpsResourceAccessor` only to the people who need the
   employer or oversight desk.

The load-bearing gcloud objects are:

```bash
# Two NEGs, both pointing at the same Cloud Run service.
gcloud compute network-endpoint-groups create fairshift-public-neg \
  --region="$REGION" --network-endpoint-type=serverless \
  --cloud-run-service="$SERVICE"
gcloud compute network-endpoint-groups create fairshift-admin-neg \
  --region="$REGION" --network-endpoint-type=serverless \
  --cloud-run-service="$SERVICE"

# Two backend services; enable IAP on the admin one in the console or with
# the IAP/backend-service commands for your OAuth client.
gcloud compute backend-services create fairshift-public --global
gcloud compute backend-services create fairshift-admin --global

# URL map: default -> public, /admin* and /api/admin* -> admin.
# Add the target proxy, managed certificate, DNS record and forwarding rule
# in the console/Terraform; the exact certificate/DNS steps depend on your domain.
```

The last step is intentionally a design instruction rather than a blind copy:
load-balancer IAP requires an OAuth client and the exact `gcloud` syntax varies
with whether IAP is configured at the backend-service or service level. Verify
the routing with:

```bash
# no cookie / no IAP session: should be a Google sign-in redirect or 403,
# never a 200 from the employer desk.
curl -i "https://admin.example.org/api/admin/issues"
```

### Trusting the IAP email header — planned/optional

Cloud Run passes `x-goog-authenticated-user-email` for requests that passed
IAP. The intended application contract is:

```text
TRUST_IAP=true
ADMIN_EMAILS=security@example.org,ops@example.org
```

When enabled, the admin gate should accept the IAP-asserted email only if
`TRUST_IAP` is exactly `true`, `ADMIN_EMAILS` is non-empty, and the service is
reachable only through IAP. The configuration getters exist in
`src/lib/config.ts`, but **the current `requireRole()` still authenticates only
the signed passphrase cookie**; the header-trust branch is not wired in this
snapshot. Do not rely on it for security yet.

Even after it is wired, keep the passphrase as defence in depth until the IAP
path has been tested for header spoofing, direct-URL bypass and confused-deputy
behaviour. A client-supplied `x-goog-authenticated-user-email` on a directly
reachable service is an admin bypass.

---

## 7. Base Sepolia anchoring

The app works in **LOCAL** anchor mode with no chain configuration. The admin
"Anchor chain" button writes an `ANCHOR` event containing the Merkle root and
`mode: "LOCAL"`; it never fabricates a transaction hash.

For a public timestamp, deploy `contracts/AnchorRegistry.sol` to Base Sepolia
(chain id `84532`) and switch the service to `BASE_SEPOLIA` mode.

### 7.1 Compile the contract

The contract is compiled from source into a viem-ready artifact:

```bash
node scripts/compile-contract.mjs
```

This reads `contracts/AnchorRegistry.sol`, compiles with `solc` 0.8.30
(optimizer 200 runs, EVM Cancun) and writes
`src/lib/anchor/artifact.ts`. The artifact contains ABI and bytecode only — no
key and no address — so it is safe to commit.

### 7.2 Create and fund a deployer key

Use a dedicated testnet-only wallet. Do not reuse an admin Ed25519 seed, a
personal wallet, or a key with mainnet funds.

```bash
# Put the key in the environment for the deploy process only.
export BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"
export ANCHOR_PRIVATE_KEY="0x..."   # 0x + 64 hex characters
```

PowerShell:

```powershell
$env:BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org"
$env:ANCHOR_PRIVATE_KEY = "0x..."
```

Fund the deployer address with Base Sepolia ETH from an official Base Sepolia
faucet. The deploy script prints the public address before sending anything.
Testnet ETH has no value but is required for gas; if the faucet is rate-limited,
use another official faucet or ask the project's testnet funding contact.

### 7.3 Deploy

```bash
node scripts/deploy-anchor.mjs
```

The script:

1. reads the generated artifact;
2. derives the deployer address from `ANCHOR_PRIVATE_KEY` (never logging the
   key);
3. deploys `AnchorRegistry` with no constructor arguments;
4. waits for the receipt and prints the contract address, Basescan link and
   block number.

Record the printed address. Fund only enough testnet ETH for the anchor calls
you plan to make; the contract has no owner, no upgrade path, and no withdrawal
function.

### 7.4 Configure the service

Add `ANCHOR_MODE=BASE_SEPOLIA`, the RPC URL, the contract address, and the
private key (as a secret, not in plain env vars):

```bash
gcloud run services update "$SERVICE" \
  --region "$REGION" \
  --update-env-vars "ANCHOR_MODE=BASE_SEPOLIA,BASE_SEPOLIA_RPC_URL=https://sepolia.base.org,ANCHOR_CONTRACT_ADDRESS=0xYourContractAddress" \
  --update-secrets "ANCHOR_PRIVATE_KEY=fairshift-anchor-private-key:latest"
```

Use a provider RPC URL if `sepolia.base.org` is rate-limited; if the URL
contains an API key, put it in Secret Manager too instead of `--set-env-vars`.

The app requires the **exact** shape:

| Variable | Requirement |
|---|---|
| `ANCHOR_MODE` | `LOCAL` (default) or `BASE_SEPOLIA` (case-insensitive) |
| `BASE_SEPOLIA_RPC_URL` | `http(s)://…`; defaults to `https://sepolia.base.org` |
| `ANCHOR_PRIVATE_KEY` | `0x` + 64 hex characters; 32-byte secp256k1 key |
| `ANCHOR_CONTRACT_ADDRESS` | 20-byte `0x` address of the deployed `AnchorRegistry` |

If the mode is `BASE_SEPOLIA` but any value is missing or malformed, the anchor
request fails with a clear 502 and writes nothing. It does not silently fall
back to `LOCAL`.

### 7.5 Verify the source on Basescan

Open the contract address on `https://sepolia.basescan.org` and use
**Contract → Verify & Publish**. Supply:

- Compiler: `0.8.30` (the artifact header records the exact commit)
- Optimization: **enabled**, runs **200**
- EVM version: **cancun**
- License: MIT
- Constructor arguments: none
- Source: `contracts/AnchorRegistry.sol`

If you use Foundry, the equivalent is roughly:

```bash
forge verify-contract YOUR_CONTRACT_ADDRESS \
  contracts/AnchorRegistry.sol:AnchorRegistry \
  --chain base-sepolia \
  --verifier etherscan \
  --verifier-url https://api-sepolia.basescan.org/api \
  --etherscan-api-key "$BASESCAN_API_KEY" \
  --compiler-version 0.8.30 \
  --num-of-optimizations 200 \
  --evm-version cancun
```

Flags vary by Foundry version; the Basescan UI is the fallback.

### 7.6 How anchors behave

- The admin "Anchor chain" button anchors all events since the previous anchor
  under one Merkle root.
- In `BASE_SEPOLIA` mode the service simulates, sends, waits for a successful
  receipt, and stores the tx hash, chain id, contract, block number and
  explorer URL in the `ANCHOR` event.
- If the transaction succeeds but the ledger append fails, the API returns the
  tx hash and warns you not to retry blindly. Reconcile the on-chain root with
  the event range before trying again.
- The deep audit (`/api/ledger/verify?deep=1`) checks the **last** anchor's
  `anchoredAt` mapping when the last anchor used `BASE_SEPOLIA`.
- An RPC outage can make the deep audit report `ok: false`; the smoke script will
  then fail. Check the RPC and the anchor transaction before assuming the chain
  is broken.
- The contract is ownerless: anyone can publish a root. It is a timestamp
  registry, not an access-controlled authority. A production contract should
  allowlist the publisher without allowing rewrites.

---

## 8. Enrolment and check-in QRs

### Enrol a worker (15-minute, one-time)

1. Sign in to `/admin` with the admin passphrase.
2. Click **Enrol worker**.
3. Choose the site.
4. Click **Create enrolment QR**.
5. Show the QR to the worker. The URL contains a signed token with site id,
   org id, expiry (15 minutes) and a random nonce.
6. The worker scans it, opens `/worker/enrol?token=…`, and taps **Create my
   credential**. The phone generates a Semaphore identity and a payroll Ed25519
   key locally; only the commitment and payroll public key are sent.
7. The server appends `MEMBER_ADDED` with `method: "QR"` and
   `enrollmentId: "enrol:<nonce>"`. The fold rejects a reused nonce or a
   duplicate commitment.

Operational rules:

- A token is a bearer secret. Do not post the QR in a group chat or leave it on
  a shared screen longer than needed.
- One token = one device/commitment. If the token is used or expires, mint a
  fresh one.
- The site group is capped at 1,024 commitments (tree depth 10).
- A worker re-enrolling replaces the credential stored on that phone; the old
  commitment remains in the public ledger and there is no revocation in this
  build.
- Set `FAIRSHIFT_ENROLMENT_SECRET` explicitly and keep it stable across
  revisions. If it is absent, the app falls back to the session secret.
- The QR token TTL is server-side (`config.enrolmentTtlMs = 15 min`); do not
  lengthen it for convenience.

### Daily check-in

The admin payroll desk can mint a per-site check-in QR. The token is HMAC-signed
and valid for the current IST day; yesterday is accepted for overnight shifts.
The worker scans it at `/worker/shifts?checkin=…` and signs the check-in with the
payroll key. The private ops log records the shift; the public ledger records
nothing until the payroll close is anchored.

---

## 9. Post-deploy checks

### 9.1 Smoke test

```bash
node scripts/smoke.mjs https://your-service.run.app
```

PowerShell:

```powershell
node scripts/smoke.mjs https://your-service.run.app
```

The script checks:

1. `GET /api/health` → 200 and `ok: true`
2. `GET /api/state` → 200, `chain.valid: true`, `chain.length > 0`
3. `GET /api/ledger/verify?deep=1` → 200, `ok: true`, `proofs.invalid: 0`
4. `GET /api/admin/issues` with no cookie → **401**

Each request has a 20-second timeout. It never prints response bodies.

If admin paths are behind IAP, the fourth check will usually see a 302 to Google
sign-in instead of a 401. That means the request never reached the app; it is the
expected edge behaviour, not a pass of the app-level check. Run the first three
checks against the public URL and verify the app-level 401 separately during a
staging run, or temporarily test the admin backend without IAP. Do not weaken IAP
just to make the script green.

A local run against a dev server should look like:

```text
PASS  GET /api/health  — 200 ok=true
PASS  GET /api/state  — chain.valid=true length=...
PASS  GET /api/ledger/verify?deep=1  — ok=true proofs.checked=... proofs.invalid=0
PASS  GET /api/admin/issues (no cookie)  — 401
All 4 checks passed.
```

### 9.2 Public ledger

Open `/ledger` and click **Verify chain + all proofs**. Confirm:

- the chain is valid and every event hash is recomputed;
- every Groth16 membership proof is valid;
- the anchor count matches the admin desk;
- if `BASE_SEPOLIA` is configured, the on-chain badge shows the last root as
  anchored.

### 9.3 Health and state

```bash
curl -s https://your-service.run.app/api/health
curl -s https://your-service.run.app/api/state | head -c 400
```

```powershell
Invoke-RestMethod https://your-service.run.app/api/health | ConvertTo-Json
(Invoke-RestMethod https://your-service.run.app/api/state).chain | ConvertTo-Json
```

`/api/health` is deliberately shallow. It proves the process is up; it does not
prove the ledger is healthy. The state and deep-audit checks are the integrity
checks.

### 9.4 Enrolment and anchor

- Enrol one test device from the admin desk and file a test report from it.
- Confirm the reporter count rises and the public ledger shows the event.
- Click **Anchor chain** in the admin desk.
- In `LOCAL` mode, confirm the `ANCHOR` event has `mode: "LOCAL"` and no tx hash.
- In `BASE_SEPOLIA` mode, open the Basescan tx link and confirm the root matches
  the `ANCHOR` event's `merkleRoot`.

---

## 10. Monitoring and alerts

### Metrics and thresholds

| What | Signal | Suggested alert |
|---|---|---|
| 5xx rate | `run.googleapis.com/request_count` filtered to `response_code_class="5xx"` | > 1% of requests over 5 min, or > 5 absolute, paged |
| Latency | `run.googleapis.com/request_latencies` (p50/p95/p99) | p95 > 5 s for 10 min; investigate `/api/ledger/verify?deep=1` separately because it is intentionally CPU-heavy |
| Instance count | `run.googleapis.com/container/instance_count` | > 1 for 5 min (must not happen while the store is single-writer), or 0 while `min-instances=1` |
| CPU / memory | `run.googleapis.com/container/cpu/utilizations`, `.../memory/utilizations` | > 80% sustained; 1 GiB may be tight for deep audits |
| Startup / request logs | Cloud Logging `severity>=ERROR` | Alert on new error classes, not every line |
| Ledger / ops integrity | log-based metric on `Ledger integrity failure` and `Ops integrity failure` | Any occurrence = page immediately |
| Anchor failure | log-based metric on `[fairshift:anchor]` and `Anchoring failed` | > 0 in 10 min |
| Uptime | HTTPS check on `/api/health` | Any 2 consecutive failures |

`/api/health` is a shallow probe, so pair it with a synthetic deep-audit check
(for example a Cloud Run job or an external checker that calls
`/api/ledger/verify?deep=1` and requires `ok: true`). A process can be healthy
while its data directory is unreadable; the store fails closed on the first
request that loads it.

### Create the log-based metric

```bash
gcloud logging metrics create fairshift_integrity_failures \
  --description="FairShift ledger/ops integrity failure" \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="fairshift" AND (textPayload:"Ledger integrity failure" OR jsonPayload.message:"Ledger integrity failure" OR textPayload:"Ops integrity failure" OR jsonPayload.message:"Ops integrity failure")'
```

Then create an alerting policy in Cloud Monitoring on
`logging/user/fairshift_integrity_failures` with threshold `> 0` for one minute,
notification channel = your on-call email/PagerDuty. In the console:
**Monitoring → Alerting → Create policy → Metric → User-defined log-based
metric**.

### Uptime check

```bash
gcloud monitoring uptime create fairshift-health \
  --resource-type=uptime-url \
  --resource-labels="host=your-service.run.app,project_id=${PROJECT_ID}" \
  --protocol=https \
  --path=/api/health \
  --port=443 \
  --period=1 \
  --timeout=10
```

If your provider does not support `gcloud monitoring uptime create`, create the
same check in the Cloud Monitoring console.

### Useful log queries

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="fairshift" AND severity>=ERROR' \
  --limit=50 --format='value(timestamp,textPayload,jsonPayload.message)'

gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="fairshift" AND ("Ledger integrity failure" OR "Ops integrity failure")' \
  --limit=20
```

Anchor failures are logged by `[fairshift:anchor]`; a failed write before the
chain call is safe to retry, a confirmed tx that failed to reach the ledger is
not.

---

## 11. Backup, rollback and migration

### Keep the data directory durable

At minimum, use the GCS mount from section 5 with object versioning. For a real
pilot, schedule snapshots of both NDJSON logs and keep them outside the same
bucket/project failure domain.

Suggested backup commands (run with writes quiesced; a GCS object generation is
a better snapshot than a live append):

```bash
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
gcloud storage cp "gs://${BUCKET}/ledger.ndjson" "gs://${BUCKET}/backups/ledger-${STAMP}.ndjson"
gcloud storage cp "gs://${BUCKET}/ops.ndjson"    "gs://${BUCKET}/backups/ops-${STAMP}.ndjson"
```

PowerShell uses the same `gcloud storage cp` command with a timestamp variable:

```powershell
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
gcloud storage cp "gs://$env:BUCKET/ledger.ndjson" "gs://$env:BUCKET/backups/ledger-$stamp.ndjson"
gcloud storage cp "gs://$env:BUCKET/ops.ndjson"    "gs://$env:BUCKET/backups/ops-$stamp.ndjson"
```

Back up secrets separately in Secret Manager/offline escrow. A backup of
`ops.ndjson` or `sealedBody` ciphertext is useless without the corresponding
keys.

Restore procedure:

1. Stop writes (maintenance page or route traffic away).
2. Preserve the current files and logs; do not delete them.
3. Restore a known-good object generation into a **new** empty directory.
4. Start a revision with `FAIRSHIFT_DATA_DIR` pointing at the restored copy.
5. Run the deep audit and compare the head/anchor roots with the last known
   good values.
6. Only then move traffic back. Never merge two chains.

### Cloud Run revision rollback

```bash
gcloud run revisions list --service "$SERVICE" --region "$REGION"
gcloud run services update-traffic "$SERVICE" \
  --region "$REGION" \
  --to-revisions fairshift-00005-abc=100
```

Keep the previous revision image available. You can also deploy a new revision
with `--no-traffic --tag=canary`, test the tagged URL, then shift traffic.

**State compatibility matters.** The fold is strict: an older revision may not
understand new event types or payload fields. `PAYROLL_ANCHORED` is a newer event
than the original five-event demo. If you roll back code after such an event
exists, the old store may fail with an integrity error. Roll back only when the
older revision can replay the current log, or roll back both code and data.

### NDJSON → Firestore/Postgres migration path

1. Quiesce writes and snapshot `ledger.ndjson` + `ops.ndjson`.
2. Import every event in order, preserving `seq`, `ts`, `type`, `actor`,
   `payload`, `prevHash`, `hash`, `signer` and `sig`.
3. Verify the imported chain with the same `verifyChain` and fold logic before
   switching traffic.
4. Add an adapter with an atomic append (transaction/queue) and replay-on-start.
5. Run old and new stores in read-only comparison against a fixture chain.
6. Cut over in a maintenance window; keep the NDJSON files as an export.
7. Re-run the deep audit and a Base Sepolia anchor check.

Do not run two writable stores in parallel. That is how chains fork.

---

## 12. Cost notes

Cloud Run pricing changes; treat this as a shape, not a quote.

- **Minimum instance:** `--min-instances 1` keeps 1 GiB/1 vCPU warm 24×7. You pay
  for that even with no traffic. `--min-instances 0` removes the baseline but
  reintroduces cold starts; with `/tmp` it also means losing the ledger on every
  scale-to-zero. Do not use 0 until you have a durable store.
- **Requests:** low traffic is cheap, but deep audits are CPU-heavy and can be
  slow (and cost more) on a large ledger.
- **Build:** the first Cloud Build downloads ~30 MB of ZK artifacts and compiles
  Next.js. Expect a several-minute build; subsequent builds reuse the Artifact
  Registry layer cache.
- **Artifact Registry:** stores the image(s); keep a small retention policy.
- **GCS:** storage, operations and noncurrent versions. Versioning keeps deleted
  objects, so add a lifecycle rule or budget for old versions.
- **Load balancer:** if you use Pattern B for IAP, the external Application Load
  Balancer has a fixed monthly cost plus forwarding rules; this can exceed the
  Cloud Run cost at low traffic.
- **Secret Manager:** per-secret/version and access operations; small at this
  scale.
- **Egress:** worker traffic and ZK artifact downloads leave Cloud Run; the
  artifacts are served from the same origin, so egress is modest.
- **Base Sepolia:** testnet gas only. The deploy and each anchor are
  transactions; fund the wallet with testnet ETH, never mainnet funds.

Set a Cloud Billing budget and a budget alert before the first deploy. Keep
`--max-instances 1` until the store supports concurrency, which also caps
runaway spend.

---

## 13. Troubleshooting

### "Proof artifacts are missing on this server. Run npm run setup:zk."

The browser requested `/zk/semaphore-<depth>.wasm` and got a non-2xx.

- Confirm the image build ran `npm run setup:zk` (the Dockerfile does).
- Check `public/zk` contains `semaphore-1..10.wasm` and `.zkey` pairs.
- If you built a custom image, do not copy a `public/zk` directory that was
  emptied by `.dockerignore`; re-run the download inside the builder.
- A stale GitHub Actions cache can hide a broken download. Change the cache key
  or delete the cache entry and rerun CI.
- Test locally: `curl -I http://localhost:3000/zk/semaphore-3.wasm`.

### 401 from `/api/admin/issues` even after signing in to IAP

IAP and the app are two separate gates.

- IAP 302 to `accounts.google.com` means no IAP session; sign in through the
  load balancer URL, not the raw `run.app` URL.
- IAP 403 means the Google identity is not in the IAP access policy; add it with
  `gcloud iap web add-iam-policy-binding` (or the console).
- IAP 200 but app 401 means the app's `fairshift_session` cookie is missing or
  expired. Sign in at `/admin` with the admin passphrase; the session lasts 8
  hours.
- If the cookie is set but never sent, check that you are on HTTPS (the cookie
  is `Secure` in production), that the load balancer preserves the original
  host, and that `Origin`/`Host` match for write requests.
- If you enabled `TRUST_IAP` expecting it to replace the passphrase: it does not
  yet. Keep the passphrase gate until the header trust path is implemented.
- Confirm the path matcher sends `/api/admin/*` to the IAP backend. A public
  backend fall-through is a security bug, not just a 401.
- The smoke script's fourth check expects a 401. Behind IAP it will normally see
  302/Google; see section 9.1.

### Cold start reset the ledger (or seeded demo data again)

Symptoms: `chain.length` is back at the demo size, the admin desk shows the two
demo sites, earlier reports are gone, or a new revision has an empty ledger.

- `/tmp/fairshift` is ephemeral. `--min-instances 1` only reduces cold starts; it
  does not make the data durable.
- Check `FAIRSHIFT_DATA_DIR` and, if using a volume, that `/mnt/fairshift`
  contains `ledger.ndjson` and `ops.ndjson`.
- An empty data directory seeds the demo ledger unconditionally. This is the
  current code, not a storage failure.
- Fix: mount a GCS bucket and set `FAIRSHIFT_DATA_DIR=/mnt/fairshift`, or move to
  Firestore/Postgres. Do not "fix" it by deleting the volume and starting over.

### "Ledger integrity failure at seq N: …"

The store refuses to load because an event hash, signature, sequence or previous
hash did not verify. Possible causes:

- a line was edited, truncated, duplicated or removed;
- a partial write / interrupted GCS FUSE rewrite;
- a different `FAIRSHIFT_SYSTEM_SEED` / admin / oversight seed was deployed;
- two instances wrote to the same log;
- a code change altered event serialisation.

Do **not** truncate the file, delete the offending line, or redeploy with new
seeds to make it load. Preserve the file and logs, compare the head and the last
anchor, restore a known-good object generation, and re-run the deep audit. If
the seed is wrong, restore the original seed from Secret Manager/escrow. A
tampered ledger is an incident, not a repair task.

### "Ops integrity failure at seq N: …"

The private payroll log is also signed and hash-chained. Check for the same
causes. The ops log uses the system key. Restore it together with the public
ledger from the same point in time; a payroll anchor root that no longer matches
the ops data is a hard error, and `/api/pay/proof` will refuse to issue a
misleading proof.

### Anchor returns 502 / "BASE_SEPOLIA anchoring requires …"

- `ANCHOR_MODE` must be exactly `BASE_SEPOLIA` (case-insensitive) to use the
  chain. `LOCAL` is the default.
- `ANCHOR_PRIVATE_KEY` must be `0x` + 64 hex characters. The error reports the
  length, never the value.
- `ANCHOR_CONTRACT_ADDRESS` must be a 20-byte `0x` address.
- The RPC URL must be `http(s)://…`. Check provider rate limits.
- Fund the deployer address with Base Sepolia ETH; a zero-balance key fails at
  simulation/send.
- If the tx succeeded but the API says it could not record the anchor, keep the
  tx hash, inspect the `ANCHOR` event range and reconcile manually. Do not
  blindly send a second anchor for the same range.

### 429 Too Many Requests

Rate limits are in-process fixed windows keyed on `x-forwarded-for`. They reset
when the instance restarts and are not shared across instances. Wait for the
window, or reduce retries. On a single instance, a 429 from one client should
not block others; if it does, check that the proxy is forwarding a real client
IP and not collapsing everyone to one address. A shared limiter is on the
production-readiness list.

### Build fails while downloading ZK artifacts

The builder fetches from GitHub raw. Check Cloud Build egress/proxy policy,
retry the build, or pre-populate a private artifact bucket. Do not commit the
`.wasm`/`.zkey` files to the repository; `.gitignore` and `.dockerignore`
deliberately exclude them.

### "FAIRSHIFT_SEAL_KEY must be 32 base64 bytes" / "Ed25519 seed must be 32 bytes"

Use the generator. Base64 has padding; do not truncate it while copying from a
terminal. The seal key and each Ed25519 seed must decode to exactly 32 bytes.
If you change the seal key without re-encrypting existing sealed bodies, those
bodies become unreadable.

### Deep audit times out

`/api/ledger/verify?deep=1` re-verifies every Groth16 proof and may call the
Base Sepolia RPC. On a large ledger or a slow RPC it can exceed the 20-second
smoke timeout or the Cloud Run 60-second request timeout. Use it during a
maintenance window, raise `--timeout` only if you understand the cost, or add a
background audit job. A timeout is not proof of corruption; check `/api/state`
and the chain head first.
