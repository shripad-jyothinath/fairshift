import { Identity } from "@semaphore-protocol/core";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { DEMO_WORKERS_PER_SITE, demoSecret } from "./secret";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * DEMO CREDENTIALS.
 *
 * These identities are derived from public strings so a judge can open two
 * browser tabs and act as two different workers. They are gated behind
 * NEXT_PUBLIC_DEMO_MODE and are NOT the production onboarding path.
 *
 * In production, the worker's device generates the identity and only the
 * commitment is sent to the employer. The secret never leaves the device.
 */
export { DEMO_WORKERS_PER_SITE, demoSecret };

export function demoIdentity(siteId: string, workerIndex: number): Identity {
  return new Identity(demoSecret(siteId, workerIndex));
}

export function demoCommitments(siteId: string): string[] {
  return Array.from({ length: DEMO_WORKERS_PER_SITE }, (_, index) =>
    demoIdentity(siteId, index).commitment.toString(),
  );
}

/** Deterministic payroll keypair for a demo crew slot. */
export function demoPayroll(siteId: string, workerIndex: number): {
  secretKey: Uint8Array;
  publicKey: string;
} {
  const secretKey = sha256(new TextEncoder().encode(`fairshift-payroll:v1:${demoSecret(siteId, workerIndex)}`));
  return { secretKey, publicKey: bytesToBase64(ed25519.getPublicKey(secretKey)) };
}
