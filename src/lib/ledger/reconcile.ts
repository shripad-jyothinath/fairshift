import { getStore } from "./store";
import { pendingEscalations } from "./fold";

let inFlight: Promise<number> | null = null;

/**
 * Converts time-based SLA breaches into signed chain events.
 * Idempotent: once an escalation is written, the deadline moves forward.
 */
export function reconcile(): Promise<number> {
  if (!inFlight) {
    inFlight = run().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function run(): Promise<number> {
  const store = getStore();
  let written = 0;

  for (let guard = 0; guard < 100; guard += 1) {
    const [next] = pendingEscalations(store.state, Date.now());
    if (!next) break;

    await store.append("ESCALATION_RAISED", "system", {
      clusterId: next.clusterId,
      tier: next.tier,
      reporters: next.reporters,
      reason: next.reason,
      deadline: next.deadline,
    });
    written += 1;
  }

  return written;
}
