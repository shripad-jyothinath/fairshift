import { describe, expect, it } from "vitest";
import { eventHash, GENESIS_HASH, verifyChain } from "@/lib/ledger/chain";
import { makeChain } from "./helpers";

const accept = () => true;

describe("hash chain", () => {
  it("accepts a well-formed chain", () => {
    const events = makeChain([
      { type: "GENESIS", payload: { network: "test", version: "0" } },
      { type: "ORG_REGISTERED", payload: { orgId: "o1", name: "Org" } },
      { type: "SITE_REGISTERED", payload: { siteId: "s1", orgId: "o1", name: "Site", sector: "CONSTRUCTION", zones: ["A"] } },
    ]);

    const result = verifyChain(events, accept);
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(3);
    expect(result.head).toBe(events[2].hash);
  });

  it("detects an edited payload", () => {
    const events = makeChain([
      { type: "GENESIS", payload: { network: "test", version: "0" } },
      { type: "ORG_REGISTERED", payload: { orgId: "o1", name: "Org" } },
    ]);

    const tampered = structuredClone(events);
    (tampered[1].payload as { name: string }).name = "Another org";

    const result = verifyChain(tampered, accept);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
    expect(result.reason).toBe("hash or signature invalid");
  });

  it("detects a broken previous-hash link", () => {
    const events = makeChain([
      { type: "GENESIS", payload: { network: "test", version: "0" } },
      { type: "ORG_REGISTERED", payload: { orgId: "o1", name: "Org" } },
    ]);

    const tampered = structuredClone(events);
    tampered[1].prevHash = GENESIS_HASH;

    const result = verifyChain(tampered, accept);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
  });

  it("rejects a removed event", () => {
    const events = makeChain([
      { type: "GENESIS", payload: { network: "test", version: "0" } },
      { type: "ORG_REGISTERED", payload: { orgId: "o1", name: "Org" } },
      { type: "ANCHOR", payload: { fromSeq: 1, toSeq: 2, merkleRoot: "a".repeat(64), label: "b" } },
    ]);

    const result = verifyChain([events[0], events[2]], accept);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(3);
    expect(result.reason).toBe("sequence gap");
  });

  it("produces a deterministic hash for the same content", () => {
    const base = {
      seq: 1,
      ts: 123,
      type: "GENESIS" as const,
      actor: "system" as const,
      payload: { network: "n", version: "v" },
      prevHash: GENESIS_HASH,
    };
    expect(eventHash(base)).toBe(eventHash({ ...base }));
    expect(eventHash(base)).not.toBe(eventHash({ ...base, ts: 124 }));
  });
});
