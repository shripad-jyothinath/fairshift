import { describe, expect, it } from "vitest";
import { fold, LedgerInvariantError } from "@/lib/ledger/fold";
import { clusterIdFor } from "@/lib/domain";
import { makeChain, memberFixture, reportFixture, siteFixture } from "./helpers";

const clusterId = clusterIdFor("site-a", "ELECTRICAL", "Block A");

function chainWithReports(count: number, severity: "HIGH" | "CRITICAL" | "MEDIUM" = "HIGH") {
  return makeChain([
    { type: "GENESIS", payload: { network: "test", version: "0" } },
    siteFixture,
    memberFixture,
    ...Array.from({ length: count }, (_, index) =>
      reportFixture({
        nullifier: String(index + 1),
        severity,
      }),
    ),
  ]);
}

describe("ledger fold", () => {
  it("counts unique reporters and derives the tier", () => {
    const state = fold(chainWithReports(3));
    const issue = state.issues.get(clusterId);

    expect(issue).toBeDefined();
    expect(issue?.reporters).toBe(3);
    expect(issue?.tier).toBe(1);
    expect(issue?.status).toBe("OPEN");
    expect(issue?.severity).toBe("HIGH");
  });

  it("rejects a reused nullifier for the same issue", () => {
    const events = makeChain([
      { type: "GENESIS", payload: { network: "test", version: "0" } },
      siteFixture,
      memberFixture,
      reportFixture({ nullifier: "same" }),
      reportFixture({ nullifier: "same" }),
    ]);

    expect(() => fold(events)).toThrow(LedgerInvariantError);
  });

  it("allows the same nullifier on a different issue", () => {
    const events = makeChain([
      { type: "GENESIS", payload: { network: "test", version: "0" } },
      siteFixture,
      memberFixture,
      reportFixture({ nullifier: "same" }),
      reportFixture({ nullifier: "same", category: "FIRE", zone: "Block B" }),
    ]);

    const state = fold(events);
    expect(state.issues.size).toBe(2);
  });

  it("cannot close an issue without a published resolution", () => {
    const events = makeChain([
      { type: "GENESIS", payload: { network: "test", version: "0" } },
      siteFixture,
      memberFixture,
      reportFixture({ nullifier: "1" }),
      {
        type: "ISSUE_CLOSED",
        actor: "admin",
        payload: {
          clusterId,
          resolutionId: "res_missing",
          note: "All done, trust us.",
        },
      },
    ]);

    expect(() => fold(events)).toThrow("without a resolution");
  });

  it("completes the full accountability loop", () => {
    const resolution = {
      resolutionId: "res_1",
      clusterId,
      kind: "FIX" as const,
      summary: "Distribution board replaced and earthed correctly.",
      action: "Board replaced, earth tested, area cordoned.",
      accountableRole: "Site electrical supervisor",
      subjectRef: "",
      evidenceHash: "b".repeat(64),
    };

    const events = makeChain([
      { type: "GENESIS", payload: { network: "test", version: "0" } },
      siteFixture,
      memberFixture,
      reportFixture({ nullifier: "1" }),
      { type: "RESOLUTION_PUBLISHED", actor: "admin", payload: resolution },
      {
        type: "OVERSIGHT_ATTESTED",
        actor: "oversight",
        payload: {
          attestationId: "att_1",
          clusterId,
          resolutionId: "res_1",
          statement: "Verified the replacement board on site.",
        },
      },
      {
        type: "ISSUE_CLOSED",
        actor: "admin",
        payload: {
          clusterId,
          resolutionId: "res_1",
          attestationId: "att_1",
          note: "Closed after oversight verification.",
        },
      },
    ]);

    const issue = fold(events).issues.get(clusterId);
    expect(issue?.status).toBe("CLOSED");
    expect(issue?.resolution?.kind).toBe("FIX");
    expect(issue?.attestation?.resolutionId).toBe("res_1");
  });
});
