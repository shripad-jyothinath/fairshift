import { GENESIS_HASH, signedEvent } from "@/lib/ledger/chain";
import { clusterIdFor } from "@/lib/domain";
import type {
  Actor,
  AnyLedgerEvent,
  EventMap,
  EventType,
} from "@/lib/ledger/types";

const fakeSign = () => "test-signature";

export function makeEvent<K extends EventType>(input: {
  seq: number;
  ts: number;
  type: K;
  payload: EventMap[K];
  prevHash?: string;
  actor?: Actor;
}): AnyLedgerEvent {
  return signedEvent({
    seq: input.seq,
    ts: input.ts,
    type: input.type,
    actor: input.actor ?? "system",
    payload: input.payload,
    prevHash: input.prevHash ?? GENESIS_HASH,
    sign: fakeSign,
    signer: "test-key",
  });
}

/** Chain a list of events with correct sequence and previous hashes. */
export function makeChain(
  items: Array<{
    type: EventType;
    payload: unknown;
    ts?: number;
    actor?: Actor;
  }>,
): AnyLedgerEvent[] {
  const events: AnyLedgerEvent[] = [];
  let prev: string = GENESIS_HASH;

  items.forEach((item, index) => {
    const event = makeEvent({
      seq: index + 1,
      ts: item.ts ?? 1_700_000_000_000 + index * 1000,
      // The helper is intentionally permissive for fixture construction.
      type: item.type as never,
      payload: item.payload as never,
      prevHash: prev,
      actor: item.actor,
    });
    events.push(event);
    prev = event.hash;
  });

  return events;
}

export const dummyProof = {
  merkleTreeDepth: 4,
  merkleTreeRoot: "123456789",
  nullifier: "111",
  message: "222",
  scope: "333",
  points: ["1", "2", "3", "4", "5", "6", "7", "8"],
};

export const siteFixture = {
  type: "SITE_REGISTERED" as const,
  payload: {
    siteId: "site-a",
    orgId: "org-a",
    name: "Test site",
    sector: "CONSTRUCTION" as const,
    zones: ["Block A", "Block B"],
  },
};

export const memberFixture = {
  type: "MEMBER_ADDED" as const,
  payload: {
    siteId: "site-a",
    commitment: "commitment-1",
    index: 0,
    root: "root-1",
    depth: 1,
    enrollmentId: "seed:site-a:0",
    method: "SEED" as const,
    payrollKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  },
};

export function reportFixture(input: {
  clusterId?: string;
  nullifier: string;
  category?: EventMap["REPORT_FILED"]["category"];
  zone?: string;
  severity?: EventMap["REPORT_FILED"]["severity"];
}): { type: "REPORT_FILED"; payload: EventMap["REPORT_FILED"] } {
  const category = input.category ?? "ELECTRICAL";
  const zone = input.zone ?? "Block A";
  const clusterId = input.clusterId ?? clusterIdFor("site-a", category, zone);
  return {
    type: "REPORT_FILED",
    payload: {
      reportId: `rep-${input.nullifier}`,
      clusterId,
      siteId: "site-a",
      category,
      severity: input.severity ?? "HIGH",
      zone,
      body: "A hazard was reported near the panel.",
      bodyHash: "a".repeat(64),
      sealedBody: "ciphertext",
      proof: { ...dummyProof, nullifier: input.nullifier },
      nullifier: input.nullifier,
    },
  };
}
