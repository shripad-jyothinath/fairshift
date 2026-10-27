import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";
import { LedgerStore } from "@/lib/ledger/store";

const dataDir = path.join(tmpdir(), `fairshift-store-${randomUUID()}`);
const ledgerFile = path.join(dataDir, "ledger.ndjson");

beforeAll(() => {
  process.env.FAIRSHIFT_DATA_DIR = dataDir;
  process.env.FAIRSHIFT_SEAL_KEY = Buffer.alloc(32, 3).toString("base64");
});

describe("append-only store", () => {
  it("seeds once and replays to the same head", () => {
    const first = new LedgerStore(ledgerFile);
    expect(first.events.length).toBeGreaterThan(40);
    expect(first.state.issues.size).toBeGreaterThan(0);

    const second = new LedgerStore(ledgerFile);
    expect(second.events.length).toBe(first.events.length);
    expect(second.head().hash).toBe(first.head().hash);
  });

  it("fails closed if a single byte of history is edited", () => {
    const copy = path.join(dataDir, "tampered.ndjson");
    const lines = fs.readFileSync(ledgerFile, "utf8").trim().split("\n");

    const index = lines.findIndex((line) => line.includes("REPORT_FILED"));
    expect(index).toBeGreaterThan(-1);

    const event = JSON.parse(lines[index]);
    event.payload.body = `${event.payload.body} (edited after the fact)`;
    lines[index] = JSON.stringify(event);
    fs.writeFileSync(copy, `${lines.join("\n")}\n`);

    expect(() => new LedgerStore(copy)).toThrow(/integrity failure/i);
  });

  it("refuses to append an event from the wrong actor", () => {
    const copy = path.join(dataDir, "wrong-actor.ndjson");
    fs.copyFileSync(ledgerFile, copy);
    const store = new LedgerStore(copy);

    expect(() =>
      store.appendSync("ISSUE_CLOSED", "system", {
        clusterId: "does.not.matter",
        resolutionId: "res",
        note: "nope",
      }),
    ).toThrow(/may not publish/i);
  });
});
