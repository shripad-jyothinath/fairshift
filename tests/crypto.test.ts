import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { getKeyRing } from "@/lib/crypto/keys";
import { GENESIS_HASH, signedEvent, verifyChain } from "@/lib/ledger/chain";

beforeAll(() => {
  process.env.FAIRSHIFT_DATA_DIR = path.join(tmpdir(), `fairshift-test-${randomUUID()}`);
});

describe("Ed25519 event signing", () => {
  it("signs and verifies with the actor key", () => {
    const ring = getKeyRing();
    const event = signedEvent({
      seq: 1,
      ts: 1000,
      type: "GENESIS",
      actor: "system",
      payload: { network: "test", version: "0" },
      prevHash: GENESIS_HASH,
      sign: ring.sign,
      signer: ring.signers.system,
    });

    expect(ring.verify("system", event.hash, event.sig)).toBe(true);
    expect(ring.verify("admin", event.hash, event.sig)).toBe(false);
  });

  it("rejects a signature made for a different hash", () => {
    const ring = getKeyRing();
    const event = signedEvent({
      seq: 1,
      ts: 1000,
      type: "GENESIS",
      actor: "system",
      payload: { network: "test", version: "0" },
      prevHash: GENESIS_HASH,
      sign: ring.sign,
      signer: ring.signers.system,
    });

    expect(ring.verify("system", event.hash.replace(/^./, "0"), event.sig)).toBe(false);
  });

  it("keeps the three roles on separate keys", () => {
    const { signers } = getKeyRing();
    expect(new Set(Object.values(signers)).size).toBe(3);
  });

  it("verifies a chain of real signatures", () => {
    const ring = getKeyRing();
    let prev = GENESIS_HASH;
    const events = [
      { type: "GENESIS" as const, payload: { network: "test", version: "0" } },
      { type: "ORG_REGISTERED" as const, payload: { orgId: "o", name: "Org" } },
    ].map((item, index) => {
      const event = signedEvent({
        seq: index + 1,
        ts: 1000 + index,
        type: item.type,
        actor: "system",
        payload: item.payload,
        prevHash: prev,
        sign: ring.sign,
        signer: ring.signers.system,
      });
      prev = event.hash;
      return event;
    });

    expect(verifyChain(events, ring.verify).valid).toBe(true);
  });
});
