import { createHash, randomUUID } from "node:crypto";

/** Deterministic JSON: keys sorted, no whitespace. Hashes must be reproducible. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) out[key] = sortValue(record[key]);
    return out;
  }
  return value;
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Maps a hash into the BN254 scalar field used by Semaphore.
 * See ./field.ts (kept separate because it is browser-safe).
 */

export function randomId(prefix: string): string {
  return `${prefix}_${createHash("sha256")
    .update(randomUUID())
    .digest("hex")
    .slice(0, 16)}`;
}
