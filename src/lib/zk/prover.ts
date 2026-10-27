import { Identity, Group, generateProof } from "@semaphore-protocol/core";
import type { ZkProof } from "@/lib/ledger/types";

/**
 * Browser-safe prover. Deliberately has no imports from node:crypto, so the
 * identity secret can stay in the worker's browser.
 */
export const MIN_ANONYMITY_SET = 3;

export function createIdentity(secret?: string): Identity {
  return new Identity(secret);
}

/** Restores a device-held identity exported with Identity.export(). */
export function importIdentity(exported: string): Identity {
  return Identity.import(exported);
}

export function commitmentOf(identity: Identity): string {
  return identity.commitment.toString();
}

export function groupFor(commitments: string[]): Group {
  return new Group(commitments);
}

export function groupRoot(commitments: string[]): string {
  return groupFor(commitments).root.toString();
}

export function zkArtifacts(depth: number): { wasm: string; zkey: string } {
  return {
    wasm: `/zk/semaphore-${depth}.wasm`,
    zkey: `/zk/semaphore-${depth}.zkey`,
  };
}

export async function proveMembership(input: {
  identity: Identity;
  commitments: string[];
  /** Decimal field element binding the proof to the report body. */
  message: string;
  /** Decimal field element binding the proof to one issue. */
  scope: string;
  /** Node-side seeding passes local paths; the browser uses /zk/*. */
  artifacts?: { wasm: string; zkey: string };
}): Promise<ZkProof> {
  const group = groupFor(input.commitments);
  const depth = Math.max(1, group.depth);
  const proof = await generateProof(
    input.identity,
    group,
    BigInt(input.message),
    BigInt(input.scope),
    depth,
    input.artifacts ?? zkArtifacts(depth),
  );

  return {
    merkleTreeDepth: proof.merkleTreeDepth,
    merkleTreeRoot: proof.merkleTreeRoot.toString(),
    nullifier: proof.nullifier.toString(),
    message: proof.message.toString(),
    scope: proof.scope.toString(),
    points: proof.points,
  };
}
