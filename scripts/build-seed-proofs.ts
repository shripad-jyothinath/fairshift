/**
 * Precomputes real Semaphore proofs for the seeded demo.
 *
 * The output is safe to commit: it contains public commitments, nullifiers and
 * proofs — no identity secrets. Proving is slow enough (~0.8 s each) that we do
 * it once here instead of on every Cloud Run cold start.
 *
 * Run: npm run setup:zk && npm run seed:proofs
 */
import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "../src/lib/crypto/canonical";
import { messageForBody } from "../src/lib/crypto/field";
import { clusterIdFor } from "../src/lib/domain";
import { demoCommitments, demoIdentity } from "../src/lib/demo/identities";
import { DEMO_REPORTS } from "../src/lib/demo/scenario";
import { proveMembership } from "../src/lib/zk/prover";
import { scopeForCluster, verifyMembership } from "../src/lib/zk/verifier";
import type { ZkProof } from "../src/lib/ledger/types";

interface Entry {
  reportId: string;
  workerIndex: number;
  nullifier: string;
  proof: ZkProof;
}

async function main(): Promise<void> {
  const entries: Entry[] = [];
  const usedPerCluster = new Map<string, Set<number>>();

  for (const report of DEMO_REPORTS) {
    const clusterId = clusterIdFor(report.siteId, report.category, report.zone);
    const commitments = demoCommitments(report.siteId);
    const bodyHash = sha256Hex(report.body);
    const used = usedPerCluster.get(clusterId) ?? new Set<number>();

    for (const workerIndex of report.workerIndices) {
      if (used.has(workerIndex)) {
        throw new Error(`Duplicate reporter ${workerIndex} in ${clusterId}`);
      }
      used.add(workerIndex);

      const identity = demoIdentity(report.siteId, workerIndex);
      const depth = Math.max(1, Math.ceil(Math.log2(commitments.length)));
      const artifacts = {
        wasm: path.join(process.cwd(), "public", "zk", `semaphore-${depth}.wasm`),
        zkey: path.join(process.cwd(), "public", "zk", `semaphore-${depth}.zkey`),
      };

      const proof = await proveMembership({
        identity,
        commitments,
        message: messageForBody(bodyHash),
        scope: scopeForCluster(clusterId),
        artifacts,
      });

      const valid = await verifyMembership(proof);
      if (!valid) {
        throw new Error(`Generated proof failed verification: ${report.id}:${workerIndex}`);
      }

      entries.push({ reportId: report.id, workerIndex, nullifier: proof.nullifier, proof });
      process.stdout.write(`✓ ${report.id} worker ${workerIndex}\n`);
    }

    usedPerCluster.set(clusterId, used);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    note: "Public demo proofs. No identity secrets are contained in this file.",
    entries,
  };

  fs.writeFileSync(
    path.join(process.cwd(), "src", "lib", "demo", "seed-proofs.json"),
    `${JSON.stringify(output, null, 2)}\n`,
  );

  console.log(`Wrote ${entries.length} proofs.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
