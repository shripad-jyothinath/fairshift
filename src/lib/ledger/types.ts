/**
 * The public event vocabulary of the FairShift accountability ledger.
 *
 * Nothing in here may contain PII. Reports carry a redacted public body and an
 * AES-256-GCM sealed body; the reporter is represented only by a Semaphore
 * nullifier, which is unique per (credential, issue) and reveals nothing else.
 */

export type Sector = "CONSTRUCTION" | "HEALTHCARE";

export type Category =
  | "ELECTRICAL"
  | "FIRE"
  | "STRUCTURAL"
  | "CHEMICAL"
  | "MACHINERY"
  | "SANITATION"
  | "HARASSMENT"
  | "OTHER";

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type Actor = "system" | "admin" | "oversight";

export type Tier = 0 | 1 | 2 | 3;

export interface ZkProof {
  merkleTreeDepth: number;
  merkleTreeRoot: string;
  nullifier: string;
  message: string;
  scope: string;
  /** Packed Groth16 calldata: eight decimal strings. */
  points: string[];
}

export interface SiteView {
  siteId: string;
  orgId: string;
  name: string;
  sector: Sector;
  zones: string[];
}

export interface EventMap {
  GENESIS: {
    network: string;
    version: string;
  };
  ORG_REGISTERED: {
    orgId: string;
    name: string;
  };
  SITE_REGISTERED: {
    siteId: string;
    orgId: string;
    name: string;
    sector: Sector;
    zones: string[];
  };
  MEMBER_ADDED: {
    siteId: string;
    commitment: string;
    index: number;
    root: string;
    depth: number;
    /** One-time enrolment nonce; prevents replaying a QR token. */
    enrollmentId: string;
    method: "SEED" | "QR";
    /** Ed25519 public key used only for shifts and payslips. */
    payrollKey: string;
  };
  REPORT_FILED: {
    reportId: string;
    clusterId: string;
    siteId: string;
    category: Category;
    severity: Severity;
    zone: string;
    /** Redacted, publicly readable text. */
    body: string;
    /** SHA-256 of the raw text, so integrity can be checked after decryption. */
    bodyHash: string;
    /** AES-256-GCM ciphertext of the raw text. Only admins can open it. */
    sealedBody: string;
    /** Semaphore Groth16 proof of membership in the site's credential group. */
    proof: ZkProof;
    /** Per-issue nullifier. Prevents one credential inflating reporter counts. */
    nullifier: string;
  };
  ESCALATION_RAISED: {
    clusterId: string;
    tier: Tier;
    reporters: number;
    reason: "THRESHOLD" | "SEVERITY" | "SLA_BREACH";
    deadline: number;
  };
  RESOLUTION_PUBLISHED: {
    resolutionId: string;
    clusterId: string;
    kind: "FIX" | "DISCIPLINE";
    summary: string;
    action: string;
    /** Role, never a person's name. */
    accountableRole: string;
    /** Salted hash of the subject reference. Never the raw identifier. */
    subjectRef: string;
    evidenceHash: string;
  };
  OVERSIGHT_ATTESTED: {
    attestationId: string;
    clusterId: string;
    resolutionId: string;
    statement: string;
  };
  ISSUE_CLOSED: {
    clusterId: string;
    resolutionId: string;
    attestationId?: string;
    note: string;
  };
  COMMENT_ADDED: {
    commentId: string;
    clusterId: string;
    siteId: string;
    body: string;
    authorBadgeMask: string;
    nullifier: string;
  };
  FATIGUE_ALERT_RAISED: {
    alertId: string;
    siteId: string;
    shiftHours: number;
    riskLevel: "MODERATE" | "HIGH" | "CRITICAL";
    note: string;
    nullifier: string;
  };
  ANCHOR: {
    fromSeq: number;
    toSeq: number;
    merkleRoot: string;
    label: string;
    mode: "LOCAL" | "BASE_SEPOLIA" | "HEDERA_TESTNET";
    txHash?: string;
    chainId?: number;
    contract?: string;
    blockNumber?: string;
    explorerUrl?: string;
  };
}

export type EventType = keyof EventMap;

export interface LedgerEvent<K extends EventType = EventType> {
  seq: number;
  ts: number;
  type: K;
  actor: Actor;
  payload: EventMap[K];
  prevHash: string;
  hash: string;
  signer: string;
  sig: string;
}

export type AnyLedgerEvent = {
  [K in EventType]: LedgerEvent<K>;
}[EventType];

export interface ResolutionRecord {
  resolutionId: string;
  clusterId: string;
  kind: "FIX" | "DISCIPLINE";
  summary: string;
  action: string;
  accountableRole: string;
  subjectRef: string;
  evidenceHash: string;
  ts: number;
  seq: number;
}

export interface AttestationRecord {
  attestationId: string;
  clusterId: string;
  resolutionId: string;
  statement: string;
  ts: number;
  seq: number;
}

export interface Issue {
  clusterId: string;
  siteId: string;
  category: Category;
  zone: string;
  severity: Severity;
  firstSeq: number;
  firstTs: number;
  lastTs: number;
  reporters: number;
  reportSeqs: number[];
  /** Tier explicitly forced upward by an SLA breach. */
  slaTier: Tier;
  tier: Tier;
  tierSince: number;
  deadline: number;
  status: "OPEN" | "CLOSED";
  slaBreaches: number;
  resolution?: ResolutionRecord;
  attestation?: AttestationRecord;
  closedAt?: number;
  closedNote?: string;
  comments?: Array<{
    commentId: string;
    body: string;
    authorBadgeMask: string;
    ts: number;
    nullifier: string;
  }>;
}

export interface LedgerState {
  sites: SiteView[];
  members: Map<string, string[]>;
  roots: Map<string, Set<string>>;
  issues: Map<string, Issue>;
  /** `${clusterId}:${nullifier}` */
  nullifiers: Set<string>;
  resolutions: Map<string, ResolutionRecord>;
  attestations: Map<string, AttestationRecord>;
  enrollments: Set<string>;
  payrollKeys: Map<string, string>;
  memberSites: Map<string, string>;
  fatigueAlerts: Array<{
    alertId: string;
    siteId: string;
    shiftHours: number;
    riskLevel: "MODERATE" | "HIGH" | "CRITICAL";
    note: string;
    ts: number;
  }>;
  lastSeq: number;
  lastTs: number;
}
