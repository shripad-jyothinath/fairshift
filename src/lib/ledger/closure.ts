import { CLOSURE_RULES, needsOversight } from "@/lib/domain";
import type { Issue } from "@/lib/ledger/types";

export interface ClosureCheck {
  ok: boolean;
  blockers: string[];
}

/**
 * The heart of the accountability model: an issue has exactly two exits.
 * Publish what you fixed, or publish who was held accountable and how.
 * High-severity exits additionally require an independent oversight signature.
 */
export function checkClosure(issue: Issue): ClosureCheck {
  const blockers: string[] = [];

  if (issue.status === "CLOSED") blockers.push("Issue is already closed.");
  if (!issue.resolution) {
    blockers.push("No resolution has been published on the chain.");
  } else {
    const { resolution } = issue;
    if (!CLOSURE_RULES.kinds.includes(resolution.kind)) {
      blockers.push("Resolution must be either a fix or a disciplinary action.");
    }
    if (resolution.summary.trim().length < CLOSURE_RULES.minSummaryLength) {
      blockers.push("Resolution summary is too short to be auditable.");
    }
    if (resolution.action.trim().length < CLOSURE_RULES.minActionLength) {
      blockers.push("Describe the concrete action taken.");
    }
    if (!/^[a-f0-9]{64}$/i.test(resolution.evidenceHash)) {
      blockers.push("Evidence hash must be a SHA-256 digest.");
    }
    if (resolution.kind === "DISCIPLINE" && !resolution.subjectRef.startsWith("sha256:")) {
      blockers.push("Disciplinary action must reference a hashed subject, never a name.");
    }
    if (needsOversight(issue.severity)) {
      if (!issue.attestation) {
        blockers.push("High-severity closure needs an independent oversight attestation.");
      } else if (issue.attestation.resolutionId !== resolution.resolutionId) {
        blockers.push("Oversight attestation does not match the published resolution.");
      } else if (issue.attestation.statement.trim().length < 10) {
        blockers.push("Oversight statement is too short.");
      }
    }
  }

  return { ok: blockers.length === 0, blockers };
}

export function assertClosable(issue: Issue): void {
  const check = checkClosure(issue);
  if (!check.ok) throw new Error(check.blockers.join(" "));
}
