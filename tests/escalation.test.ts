import { describe, expect, it } from "vitest";
import { clusterIdFor } from "@/lib/domain";
import { applyEvent, fold, pendingEscalations } from "@/lib/ledger/fold";
import { makeChain, makeEvent, memberFixture, reportFixture, siteFixture } from "./helpers";

const clusterId = clusterIdFor("site-a", "ELECTRICAL", "Block A");

function fixture() {
  return makeChain([
    { type: "GENESIS", payload: { network: "test", version: "0" } },
    siteFixture,
    memberFixture,
    reportFixture({ nullifier: "1" }),
    reportFixture({ nullifier: "2" }),
    reportFixture({ nullifier: "3" }),
  ]);
}

describe("SLA reconciliation", () => {
  it("flags an issue whose deadline has passed", () => {
    const state = fold(fixture());
    const pending = pendingEscalations(state, Date.now());

    expect(pending).toHaveLength(1);
    expect(pending[0].clusterId).toBe(clusterId);
    expect(pending[0].reason).toBe("SLA_BREACH");
    expect(pending[0].tier).toBe(2);
  });

  it("stops escalating once the breach is written", () => {
    const events = fixture();
    const state = fold(events);
    const now = Date.now();
    const [next] = pendingEscalations(state, now);

    const escalation = makeEvent({
      seq: state.lastSeq + 1,
      ts: now,
      type: "ESCALATION_RAISED",
      actor: "system",
      payload: {
        clusterId: next.clusterId,
        tier: next.tier,
        reporters: next.reporters,
        reason: "SLA_BREACH",
        deadline: next.deadline,
      },
      prevHash: events.at(-1)!.hash,
    });

    const nextState = applyEvent(structuredClone(state), escalation);
    expect(pendingEscalations(nextState, now)).toHaveLength(0);
  });

  it("never escalates a closed issue", () => {
    const state = fold(fixture());
    for (const issue of state.issues.values()) issue.status = "CLOSED";
    expect(pendingEscalations(state, Date.now())).toHaveLength(0);
  });

  it("caps escalation at the public tier", () => {
    const state = fold(fixture());
    for (const issue of state.issues.values()) {
      issue.tier = 3;
      issue.deadline = 0;
    }
    expect(pendingEscalations(state, Date.now())).toHaveLength(0);
  });
});
