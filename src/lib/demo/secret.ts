export const DEMO_WORKERS_PER_SITE = 12;

/** Public demo passphrase. Clearly non-production; see demo/identities.ts. */
export function demoSecret(siteId: string, workerIndex: number): string {
  return `fairshift-demo::${siteId}::worker-${workerIndex + 1}`;
}
