import { Identity } from "@semaphore-protocol/core";
import { DEMO_WORKERS_PER_SITE, demoSecret } from "./secret";

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
