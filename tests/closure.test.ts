import { describe, expect, it } from "vitest";
import { checkClosure } from "@/lib/ledger/closure";
import type { Issue } from "@/lib/ledger/types";

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    clusterId: "c1",
    siteId: "s1",
    category: "ELECTRICAL",
    zone: "Block A",
    severity: "MEDIUM",
    firstSeq: 1,
    firstTs: 1,
    lastTs: 1,
    reporters: 3,
    reportSeqs: [1, 2, 3],
    slaTier: 0,
    tier: 1,
    tierSince: 1,
    deadline: Date.now() + 1_000_000,
    status: "OPEN",
    slaBreaches: 0,
    ...overrides,
  };
}

const goodResolution = {
  resolutionId: "res_1",
  clusterId: "c1",
  kind: "FIX" as const,
  summary: "Board replaced and earth wire tested.",
  action: "Board replaced and re-tested.",
  accountableRole: "Site supervisor",
  subjectRef: "",
  evidenceHash: "a".repeat(64),
  ts: 2,
  seq: 2,
};

describe("closure gate", () => {
  it("blocks an issue with no resolution", () => {
    const result = checkClosure(issue());
    expect(result.ok).toBe(false);
    expect(result.blockers.join(" ")).toContain("No resolution");
  });

  it("allows a medium issue with a complete fix", () => {
    const result = checkClosure(issue({ resolution: goodResolution }));
    expect(result.ok).toBe(true);
  });

  it("requires an oversight signature for high severity", () => {
    const result = checkClosure(issue({ severity: "HIGH", resolution: goodResolution }));
    expect(result.ok).toBe(false);
    expect(result.blockers.join(" ")).toContain("oversight");
  });

  it("accepts a matching oversight attestation", () => {
    const result = checkClosure(
      issue({
        severity: "HIGH",
        resolution: goodResolution,
        attestation: {
          attestationId: "att_1",
          clusterId: "c1",
          resolutionId: "res_1",
          statement: "Verified the repair on site.",
          ts: 3,
          seq: 3,
        },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a non-matching attestation", () => {
    const result = checkClosure(
      issue({
        severity: "CRITICAL",
        resolution: goodResolution,
        attestation: {
          attestationId: "att_1",
          clusterId: "c1",
          resolutionId: "res_other",
          statement: "Verified the repair on site.",
          ts: 3,
          seq: 3,
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("requires disciplinary actions to use a hashed subject", () => {
    const result = checkClosure(
      issue({
        severity: "MEDIUM",
        resolution: { ...goodResolution, kind: "DISCIPLINE", subjectRef: "Ramesh" },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.blockers.join(" ")).toContain("hashed subject");
  });

  it("requires a SHA-256 evidence digest", () => {
    const result = checkClosure(
      issue({ resolution: { ...goodResolution, evidenceHash: "not-a-hash" } }),
    );
    expect(result.ok).toBe(false);
    expect(result.blockers.join(" ")).toContain("Evidence hash");
  });

  it("blocks an already closed issue", () => {
    const result = checkClosure(
      issue({ status: "CLOSED", resolution: goodResolution }),
    );
    expect(result.ok).toBe(false);
    expect(result.blockers.join(" ")).toContain("already closed");
  });
});
