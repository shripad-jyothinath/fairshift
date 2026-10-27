import { verifyProof } from "@semaphore-protocol/core";
import { sha256Hex } from "@/lib/crypto/canonical";
import { hashToField, messageForBody } from "@/lib/crypto/field";
import type { ZkProof } from "@/lib/ledger/types";

/**
 * Server-side verifier. Groth16 verification needs no secret and no network:
 * the verification keys are embedded in @semaphore-protocol/utils.
 */

/** Scope is derived from the issue, so one credential = one report per issue. */
export function scopeForCluster(clusterId: string): string {
  return hashToField(sha256Hex(`fairshift:scope:${clusterId}`)).toString();
}

export async function verifyMembership(proof: ZkProof): Promise<boolean> {
  try {
    // ZkProof is the JSON-safe projection of SemaphoreProof (packed points).
    return await verifyProof(proof as unknown as Parameters<typeof verifyProof>[0]);
  } catch {
    return false;
  }
}

/** Ties the proof to this site's root, this issue, and this exact body. */
export async function verifyReportProof(input: {
  proof: ZkProof;
  validRoots: Set<string>;
  clusterId: string;
  bodyHash: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { proof } = input;

  if (!input.validRoots.has(proof.merkleTreeRoot)) {
    return { ok: false, reason: "proof root is not a known site root" };
  }
  if (proof.scope !== scopeForCluster(input.clusterId)) {
    return { ok: false, reason: "proof scope does not match this issue" };
  }
  if (proof.message !== messageForBody(input.bodyHash)) {
    return { ok: false, reason: "proof does not commit to this report body" };
  }
  if (proof.merkleTreeDepth < 1 || proof.merkleTreeDepth > 10) {
    return { ok: false, reason: "unsupported tree depth" };
  }

  const valid = await verifyMembership(proof);
  return valid ? { ok: true } : { ok: false, reason: "invalid zero-knowledge proof" };
}
