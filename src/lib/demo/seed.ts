import { Group } from "@semaphore-protocol/core";
import { sha256Hex } from "@/lib/crypto/canonical";
import { seal } from "@/lib/crypto/seal";
import { CATEGORIES, clusterIdFor } from "@/lib/domain";
import { redact } from "@/lib/security/redact";
import type { AppendSync } from "@/lib/ledger/store";
import type { AnyLedgerEvent, Category, Severity, ZkProof } from "@/lib/ledger/types";
import { messageForBody } from "@/lib/crypto/field";
import { scopeForCluster } from "@/lib/zk/verifier";
import { demoCommitments } from "./identities";
import seedProofs from "./seed-proofs.json";
import { DEMO_ORG, DEMO_REPORTS, DEMO_RESOLUTION, DEMO_SITE_DEFS } from "./scenario";

interface SeedProofEntry {
  reportId: string;
  workerIndex: number;
  nullifier: string;
  proof: ZkProof;
}

const HOUR = 60 * 60 * 1000;
const EVIDENCE_HASH = sha256Hex("fairshift-demo-evidence-mixer-guard");

/**
 * Seeds a deterministic two-sector demo into an empty ledger.
 * Proofs are precomputed (scripts/build-seed-proofs.ts) so cold starts stay fast.
 */
export function seedDemo(append: AppendSync): void {
  const now = Date.now();
  const base = now - 120 * HOUR;
  const proofs = new Map<string, SeedProofEntry>(
    (seedProofs.entries as SeedProofEntry[]).map((entry) => [
      `${entry.reportId}:${entry.workerIndex}`,
      entry,
    ]),
  );

  type Planned = { ts: number; commit: () => AnyLedgerEvent };
  const plan: Planned[] = [];
  const at = (ts: number, commit: () => AnyLedgerEvent) => plan.push({ ts, commit });

  at(base, () => append("ORG_REGISTERED", "system", DEMO_ORG, base));
  DEMO_SITE_DEFS.forEach((site, siteIndex) => {
    const ts = base + siteIndex * 1000;
    at(ts, () =>
      append(
        "SITE_REGISTERED",
        "system",
        {
          siteId: site.siteId,
          orgId: DEMO_ORG.orgId,
          name: site.name,
          sector: site.sector,
          zones: site.zones,
        },
        ts,
      ),
    );

    const commitments = demoCommitments(site.siteId);
    const group = new Group();
    commitments.forEach((commitment, index) => {
      group.addMember(commitment);
      const root = group.root.toString();
      const depth = group.depth;
      at(ts + 1000 + index, () =>
        append(
          "MEMBER_ADDED",
          "system",
          {
            siteId: site.siteId,
            commitment,
            index,
            root,
            depth,
          },
          ts + 1000 + index,
        ),
      );
    });
  });

  const ordered = [...DEMO_REPORTS].sort((a, b) => b.hoursAgo - a.hoursAgo);
  const seededClusters = new Set<string>();

  for (const report of ordered) {
    const clusterId = clusterIdFor(report.siteId, report.category, report.zone);
    const bodyHash = sha256Hex(report.body);
    const severity: Severity = CATEGORIES[report.category].severity;

    for (const [position, workerIndex] of report.workerIndices.entries()) {
      const entry = proofs.get(`${report.id}:${workerIndex}`);
      if (!entry) continue;
      if (
        entry.proof.message !== messageForBody(bodyHash) ||
        entry.proof.scope !== scopeForCluster(clusterId)
      ) {        throw new Error(
          `Seed proof ${report.id}:${workerIndex} does not match its body or issue. Regenerate it.`,
        );
      }

      const ts = now - report.hoursAgo * HOUR + position * 60_000;
      const payload = {
        reportId: `${report.id}-${position}`,
        clusterId,
        siteId: report.siteId,
        category: report.category as Category,
        severity,
        zone: report.zone,
        body: redact(report.body),
        bodyHash,
        sealedBody: seal(report.body),
        proof: entry.proof,
        nullifier: entry.nullifier,
      };

      at(ts, () => append("REPORT_FILED", "system", payload, ts));
      seededClusters.add(clusterId);
    }
  }

  // A fully closed example, so the chain shows the whole accountability loop.
  if (!seededClusters.has(clusterIdFor(
    DEMO_RESOLUTION.siteId,
    DEMO_RESOLUTION.category,
    DEMO_RESOLUTION.zone,
  ))) {
    plan.sort((a, b) => a.ts - b.ts).forEach((item) => item.commit());
    return;
  }
  const resolutionTs = now - DEMO_RESOLUTION.hoursAgo * HOUR;
  const clusterId = clusterIdFor(
    DEMO_RESOLUTION.siteId,
    DEMO_RESOLUTION.category,
    DEMO_RESOLUTION.zone,
  );
  const resolutionId = `res_${clusterId.replace(/[^a-z0-9]/gi, "").slice(0, 20)}`;
  const attestationId = `att_${resolutionId}`;

  at(resolutionTs, () =>
    append(
      "RESOLUTION_PUBLISHED",
      "admin",
      {
        resolutionId,
        clusterId,
        kind: DEMO_RESOLUTION.kind,
        summary: DEMO_RESOLUTION.summary,
        action: DEMO_RESOLUTION.action,
        accountableRole: DEMO_RESOLUTION.accountableRole,
        subjectRef: DEMO_RESOLUTION.subjectRef,
        evidenceHash: EVIDENCE_HASH,
      },
      resolutionTs,
    ),
  );

  at(resolutionTs + HOUR, () =>
    append(
      "OVERSIGHT_ATTESTED",
      "oversight",
      {
        attestationId,
        clusterId,
        resolutionId,
        statement: DEMO_RESOLUTION.attestation,
      },
      resolutionTs + HOUR,
    ),
  );

  at(resolutionTs + 2 * HOUR, () =>
    append(
      "ISSUE_CLOSED",
      "admin",
      {
        clusterId,
        resolutionId,
        attestationId,
        note: DEMO_RESOLUTION.closeNote,
      },
      resolutionTs + 2 * HOUR,
    ),
  );

  plan
    .sort((a, b) => a.ts - b.ts)
    .forEach((item) => item.commit());
}
