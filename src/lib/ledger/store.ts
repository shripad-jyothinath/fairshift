import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";
import { getKeyRing } from "@/lib/crypto/keys";
import { seedDemo } from "@/lib/demo/seed";
import { GENESIS_HASH, signedEvent, verifyChain } from "./chain";
import { applyEvent, emptyState } from "./fold";
import type {
  Actor,
  AnyLedgerEvent,
  EventMap,
  EventType,
  LedgerEvent,
  LedgerState,
} from "./types";

/** Who is allowed to author which event. Enforced before signing. */
const ALLOWED_ACTORS: Record<EventType, Actor[]> = {
  GENESIS: ["system"],
  ORG_REGISTERED: ["system", "admin"],
  SITE_REGISTERED: ["system", "admin"],
  MEMBER_ADDED: ["system"],
  REPORT_FILED: ["system"],
  ESCALATION_RAISED: ["system"],
  RESOLUTION_PUBLISHED: ["admin"],
  OVERSIGHT_ATTESTED: ["oversight"],
  ISSUE_CLOSED: ["admin"],
  ANCHOR: ["admin"],
};

export type AppendSync = <K extends EventType>(
  type: K,
  actor: Actor,
  payload: EventMap[K],
  ts?: number,
) => LedgerEvent<K>;

export class LedgerStore {
  readonly events: AnyLedgerEvent[] = [];
  state: LedgerState = emptyState();

  private readonly file: string;
  private queue: Promise<AnyLedgerEvent> = Promise.resolve({} as AnyLedgerEvent);

  constructor(file = path.join(config.dataDir, "ledger.ndjson")) {
    this.file = file;
    this.load();
  }

  private load(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (!fs.existsSync(this.file)) fs.writeFileSync(this.file, "");

    const lines = fs
      .readFileSync(this.file, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0);

    const events = lines.map((line, index) => {
      try {
        return JSON.parse(line) as AnyLedgerEvent;
      } catch {
        throw new Error(`Ledger integrity failure: unreadable line ${index + 1}`);
      }
    });

    const keys = getKeyRing();
    const verification = verifyChain(events, keys.verify);
    if (!verification.valid) {
      // Fail closed. A tampered ledger must never be silently repaired.
      throw new Error(
        `Ledger integrity failure at seq ${verification.brokenAt}: ${verification.reason}`,
      );
    }

    this.events.push(...events);
    this.state = events.reduce(applyEvent, emptyState());

    if (this.events.length === 0) {
      this.appendSync(
        "GENESIS",
        "system",
        {
          network: "fairshift-devnet",
          version: "0.1.0",
        },
        Date.now() - 121 * 60 * 60 * 1000,
      );
      seedDemo(this.appendSync);
    }
  }

  appendSync = <K extends EventType>(
    type: K,
    actor: Actor,
    payload: EventMap[K],
    ts = Date.now(),
  ): LedgerEvent<K> => {
    if (!ALLOWED_ACTORS[type].includes(actor)) {
      throw new Error(`Actor ${actor} may not publish ${type}`);
    }

    const seq = this.events.length + 1;
    const prevHash = this.events.at(-1)?.hash ?? GENESIS_HASH;
    const keys = getKeyRing();

    const event = signedEvent({
      seq,
      ts,
      type,
      actor,
      payload,
      prevHash,
      sign: keys.sign,
      signer: keys.signers[actor],
    }) as LedgerEvent<K>;

    // Apply to a copy first: state and log must not diverge if an invariant fails.
    const nextState = structuredClone(this.state);
    applyEvent(nextState, event as AnyLedgerEvent);

    fs.appendFileSync(this.file, `${JSON.stringify(event)}\n`, { mode: 0o600 });

    this.events.push(event as AnyLedgerEvent);
    this.state = nextState;
    return event;
  };

  append<K extends EventType>(
    type: K,
    actor: Actor,
    payload: EventMap[K],
  ): Promise<LedgerEvent<K>> {
    const next = this.queue.then(() => this.appendSync(type, actor, payload));
    this.queue = next.catch(() => ({}) as AnyLedgerEvent) as Promise<AnyLedgerEvent>;
    return next;
  }

  head(): { seq: number; hash: string; ts: number } {
    const last = this.events.at(-1);
    return last
      ? { seq: last.seq, hash: last.hash, ts: last.ts }
      : { seq: 0, hash: GENESIS_HASH, ts: 0 };
  }
}

const globalStore = globalThis as unknown as { __fairshiftStore?: LedgerStore };

export function getStore(): LedgerStore {
  if (!globalStore.__fairshiftStore) {
    globalStore.__fairshiftStore = new LedgerStore();
  }
  return globalStore.__fairshiftStore;
}
