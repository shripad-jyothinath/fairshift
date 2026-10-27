import {
  computeTier,
  deadlineFor,
  severityTier,
} from "@/lib/domain";
import type {
  AnyLedgerEvent,
  Issue,
  LedgerState,
  Tier,
} from "./types";

export class LedgerInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerInvariantError";
  }
}

export function emptyState(): LedgerState {
  return {
    sites: [],
    members: new Map(),
    roots: new Map(),
    issues: new Map(),
    nullifiers: new Set(),
    resolutions: new Map(),
    attestations: new Map(),
    enrollments: new Set(),
    payrollKeys: new Map(),
    memberSites: new Map(),
    lastSeq: 0,
    lastTs: 0,
  };
}

/**
 * Applies one event. Used both for full replay and for incremental append,
 * so the live state can never drift from a fresh replay.
 */
export function applyEvent(state: LedgerState, event: AnyLedgerEvent): LedgerState {
  state.lastSeq = event.seq;
  state.lastTs = event.ts;

  switch (event.type) {
    case "GENESIS":
    case "ORG_REGISTERED":
    case "ANCHOR":
      break;

    case "SITE_REGISTERED": {
      if (state.sites.some((site) => site.siteId === event.payload.siteId)) {
        throw new LedgerInvariantError(`duplicate site ${event.payload.siteId}`);
      }
      state.sites.push({
        siteId: event.payload.siteId,
        orgId: event.payload.orgId,
        name: event.payload.name,
        sector: event.payload.sector,
        zones: event.payload.zones,
      });
      state.members.set(event.payload.siteId, []);
      state.roots.set(event.payload.siteId, new Set());
      break;
    }

    case "MEMBER_ADDED": {
      const members = state.members.get(event.payload.siteId);
      const roots = state.roots.get(event.payload.siteId);
      if (!members || !roots) throw new LedgerInvariantError("unknown site");
      if (members.includes(event.payload.commitment)) {
        throw new LedgerInvariantError("duplicate commitment");
      }
      if (members.length !== event.payload.index) {
        throw new LedgerInvariantError("member index out of order");
      }
      if (state.enrollments.has(event.payload.enrollmentId)) {
        throw new LedgerInvariantError("enrolment token already used");
      }
      // 32-byte Ed25519 public key, base64.
      if (Buffer.from(event.payload.payrollKey, "base64").length !== 32) {
        throw new LedgerInvariantError("invalid payroll key");
      }
      members.push(event.payload.commitment);
      roots.add(event.payload.root);
      state.enrollments.add(event.payload.enrollmentId);
      state.payrollKeys.set(event.payload.commitment, event.payload.payrollKey);
      state.memberSites.set(event.payload.commitment, event.payload.siteId);
      break;
    }

    case "REPORT_FILED": {
      const { clusterId, nullifier, severity, siteId, category, zone } = event.payload;
      const nullifierKey = `${clusterId}:${nullifier}`;
      if (state.nullifiers.has(nullifierKey)) {
        throw new LedgerInvariantError("nullifier already used for this issue");
      }
      state.nullifiers.add(nullifierKey);

      const existing = state.issues.get(clusterId);
      if (!existing) {
        const tier = computeTier(1, severity, 0);
        state.issues.set(clusterId, {
          clusterId,
          siteId,
          category,
          zone,
          severity,
          firstSeq: event.seq,
          firstTs: event.ts,
          lastTs: event.ts,
          reporters: 1,
          reportSeqs: [event.seq],
          slaTier: 0,
          tier,
          tierSince: event.ts,
          deadline: deadlineFor(tier, event.ts),
          status: "OPEN",
          slaBreaches: 0,
        });
        break;
      }

      existing.reporters += 1;
      existing.lastTs = event.ts;
      existing.reportSeqs.push(event.seq);
      if (severityTier(severity) > severityTier(existing.severity)) {
        existing.severity = severity;
      }
      const nextTier = computeTier(existing.reporters, existing.severity, existing.slaTier);
      if (nextTier !== existing.tier) {
        existing.tier = nextTier;
        existing.tierSince = event.ts;
        existing.deadline = deadlineFor(nextTier, event.ts);
      }
      break;
    }

    case "ESCALATION_RAISED": {
      const issue = state.issues.get(event.payload.clusterId);
      if (!issue) throw new LedgerInvariantError("escalation for unknown issue");
      if (event.payload.reason === "SLA_BREACH") {
        issue.slaBreaches += 1;
        issue.slaTier = Math.max(issue.slaTier, event.payload.tier) as Tier;
      }
      issue.tier = Math.max(issue.tier, event.payload.tier) as Tier;
      issue.tierSince = event.ts;
      issue.deadline = event.payload.deadline;
      break;
    }

    case "RESOLUTION_PUBLISHED": {
      if (state.resolutions.has(event.payload.clusterId)) {
        throw new LedgerInvariantError("resolution already published");
      }
      const record = {
        resolutionId: event.payload.resolutionId,
        clusterId: event.payload.clusterId,
        kind: event.payload.kind,
        summary: event.payload.summary,
        action: event.payload.action,
        accountableRole: event.payload.accountableRole,
        subjectRef: event.payload.subjectRef,
        evidenceHash: event.payload.evidenceHash,
        ts: event.ts,
        seq: event.seq,
      };
      state.resolutions.set(event.payload.clusterId, record);
      const issue = state.issues.get(event.payload.clusterId);
      if (issue) issue.resolution = record;
      break;
    }

    case "OVERSIGHT_ATTESTED": {
      const record = {
        attestationId: event.payload.attestationId,
        clusterId: event.payload.clusterId,
        resolutionId: event.payload.resolutionId,
        statement: event.payload.statement,
        ts: event.ts,
        seq: event.seq,
      };
      state.attestations.set(event.payload.clusterId, record);
      const issue = state.issues.get(event.payload.clusterId);
      if (issue) issue.attestation = record;
      break;
    }

    case "ISSUE_CLOSED": {
      const issue = state.issues.get(event.payload.clusterId);
      if (!issue) throw new LedgerInvariantError("close for unknown issue");
      if (!issue.resolution) {
        throw new LedgerInvariantError("issue cannot close without a resolution");
      }
      if (issue.severity === "HIGH" || issue.severity === "CRITICAL") {
        if (!issue.attestation) {
          throw new LedgerInvariantError("high severity closure needs oversight attestation");
        }
      }
      issue.status = "CLOSED";
      issue.closedAt = event.ts;
      issue.closedNote = event.payload.note;
      break;
    }

    default: {
      const unreachable: never = event;
      throw new LedgerInvariantError(`unknown event ${JSON.stringify(unreachable)}`);
    }
  }

  return state;
}

export function fold(events: AnyLedgerEvent[]): LedgerState {
  return events.reduce(applyEvent, emptyState());
}

export interface EscalationView {
  clusterId: string;
  tier: Tier;
  reason: "THRESHOLD" | "SEVERITY" | "SLA_BREACH";
  reporters: number;
  deadline: number;
}

/** Which issues must be escalated right now because their SLA has expired. */
export function pendingEscalations(
  state: LedgerState,
  now: number,
): EscalationView[] {
  const out: EscalationView[] = [];

  for (const issue of state.issues.values()) {
    if (issue.status === "CLOSED") continue;
    if (issue.tier >= 3) continue;
    if (now <= issue.deadline) continue;

    const nextTier = Math.min(3, issue.tier + 1) as Tier;
    out.push({
      clusterId: issue.clusterId,
      tier: nextTier,
      reason: "SLA_BREACH",
      reporters: issue.reporters,
      deadline: deadlineFor(nextTier, now),
    });
  }

  return out;
}

export function openIssues(state: LedgerState): Issue[] {
  return [...state.issues.values()].filter((issue) => issue.status === "OPEN");
}
