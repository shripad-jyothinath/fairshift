import type { Issue, LedgerState, Tier } from "./types";
import { checkClosure } from "./closure";

export interface PublicIssue {
  clusterId: string;
  siteId: string;
  category: string;
  zone: string;
  severity: string;
  reporters: number;
  tier: Tier;
  tierLabel: string;
  status: "OPEN" | "CLOSED";
  firstTs: number;
  lastTs: number;
  deadline: number;
  overdue: boolean;
  slaBreaches: number;
  resolution: Issue["resolution"] | null;
  attestation: Issue["attestation"] | null;
  blockers: string[];
  comments?: Array<{
    commentId: string;
    body: string;
    authorBadgeMask: string;
    ts: number;
    nullifier: string;
  }>;
}

export function toPublicIssue(issue: Issue, now: number): PublicIssue {
  return {
    clusterId: issue.clusterId,
    siteId: issue.siteId,
    category: issue.category,
    zone: issue.zone,
    severity: issue.severity,
    reporters: issue.reporters,
    tier: issue.tier,
    tierLabel: ["Supervisor", "Site manager", "Regional", "Public"][issue.tier],
    status: issue.status,
    firstTs: issue.firstTs,
    lastTs: issue.lastTs,
    deadline: issue.deadline,
    overdue: issue.status === "OPEN" && now > issue.deadline,
    slaBreaches: issue.slaBreaches,
    resolution: issue.resolution ?? null,
    attestation: issue.attestation ?? null,
    blockers: issue.status === "OPEN" ? checkClosure(issue).blockers : [],
    comments: issue.comments ?? [],
  };
}

export function publicIssues(state: LedgerState, now: number): PublicIssue[] {
  return [...state.issues.values()]
    .map((issue) => toPublicIssue(issue, now))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "OPEN" ? -1 : 1;
      if (b.tier !== a.tier) return b.tier - a.tier;
      return a.deadline - b.deadline;
    });
}

export function statsFor(state: LedgerState, now: number) {
  const issues = [...state.issues.values()];
  const open = issues.filter((issue) => issue.status === "OPEN");
  return {
    openIssues: open.length,
    closedIssues: issues.length - open.length,
    overdue: open.filter((issue) => now > issue.deadline).length,
    breaches: issues.reduce((sum, issue) => sum + issue.slaBreaches, 0),
    reporters: issues.reduce((sum, issue) => sum + issue.reporters, 0),
    sites: state.sites.length,
    members: [...state.members.values()].reduce((sum, list) => sum + list.length, 0),
  };
}
