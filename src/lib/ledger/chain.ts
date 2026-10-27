import { canonicalJson, sha256Hex } from "@/lib/crypto/canonical";
import type { Actor, AnyLedgerEvent, EventMap, EventType } from "./types";

export const GENESIS_HASH = "0".repeat(64);

export interface HashableEvent {
  seq: number;
  ts: number;
  type: EventType;
  actor: Actor;
  payload: unknown;
  prevHash: string;
}

/**
 * The hash covers the semantic content of the event, not its signature.
 * Anything an auditor can read is committed to by the chain.
 */
export function eventHash(event: HashableEvent): string {
  return sha256Hex(
    canonicalJson({
      seq: event.seq,
      ts: event.ts,
      type: event.type,
      actor: event.actor,
      payload: event.payload,
      prevHash: event.prevHash,
    }),
  );
}

export function verifyEvent(
  event: AnyLedgerEvent,
  verifySignature: (actor: Actor, hash: string, sig: string) => boolean,
): boolean {
  const expected = eventHash(event);
  if (expected !== event.hash) return false;
  return verifySignature(event.actor, event.hash, event.sig);
}

export interface ChainVerification {
  valid: boolean;
  checked: number;
  head: string;
  brokenAt?: number;
  reason?: string;
  anchors: number;
}

/** Recompute the whole chain. Public, deterministic, no trust in the server. */
export function verifyChain(
  events: AnyLedgerEvent[],
  verifySignature: (actor: Actor, hash: string, sig: string) => boolean,
): ChainVerification {
  let prev = GENESIS_HASH;
  let anchors = 0;

  for (const [index, event] of events.entries()) {
    if (event.seq !== index + 1) {
      return {
        valid: false,
        checked: index,
        head: prev,
        brokenAt: event.seq,
        reason: "sequence gap",
        anchors,
      };
    }
    if (event.prevHash !== prev) {
      return {
        valid: false,
        checked: index,
        head: prev,
        brokenAt: event.seq,
        reason: "previous hash mismatch",
        anchors,
      };
    }
    if (!verifyEvent(event, verifySignature)) {
      return {
        valid: false,
        checked: index,
        head: prev,
        brokenAt: event.seq,
        reason: "hash or signature invalid",
        anchors,
      };
    }
    if (event.type === "ANCHOR") anchors += 1;
    prev = event.hash;
  }

  return { valid: true, checked: events.length, head: prev, anchors };
}

export function signedEvent<K extends EventType>(input: {
  seq: number;
  ts: number;
  type: K;
  actor: Actor;
  payload: EventMap[K];
  prevHash: string;
  sign: (actor: Actor, hash: string) => string;
  signer: string;
}): AnyLedgerEvent {
  const base: HashableEvent = {
    seq: input.seq,
    ts: input.ts,
    type: input.type,
    actor: input.actor,
    payload: input.payload,
    prevHash: input.prevHash,
  };
  const hash = eventHash(base);
  const event: AnyLedgerEvent = {
    ...base,
    hash,
    signer: input.signer,
    sig: input.sign(input.actor, hash),
  } as AnyLedgerEvent;
  return event;
}
