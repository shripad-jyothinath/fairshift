import { sha256Hex } from "@/lib/crypto/canonical";
import type { AnyLedgerEvent } from "./types";

/** Bitcoin-style Merkle root: pairwise SHA-256, odd leaf promoted. */
export function merkleRoot(hashes: string[]): string {
  if (hashes.length === 0) return "0".repeat(64);
  let level = [...hashes];
  while (level.length > 1) {
    if (level.length % 2 === 1) level.push(level[level.length - 1]);
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(sha256Hex(Buffer.from(level[i] + level[i + 1], "hex")));
    }
    level = next;
  }
  return level[0];
}

export interface LedgerBlock {
  index: number;
  fromSeq: number;
  toSeq: number;
  root: string;
  entries: number;
  ts: number;
  hash: string;
}

export function toBlocks(events: AnyLedgerEvent[], size = 16): LedgerBlock[] {
  const blocks: LedgerBlock[] = [];
  for (let i = 0; i < events.length; i += size) {
    const slice = events.slice(i, i + size);
    const root = merkleRoot(slice.map((event) => event.hash));
    blocks.push({
      index: Math.floor(i / size),
      fromSeq: slice[0].seq,
      toSeq: slice[slice.length - 1].seq,
      root,
      entries: slice.length,
      ts: slice[slice.length - 1].ts,
      hash: sha256Hex(
        `${slice[0].seq}:${slice[slice.length - 1].seq}:${root}`,
      ),
    });
  }
  return blocks.reverse();
}
