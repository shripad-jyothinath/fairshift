import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/crypto/canonical";
import { messageForBody } from "@/lib/crypto/field";
import { clusterIdFor } from "@/lib/domain";
import { demoCommitments, demoIdentity } from "@/lib/demo/identities";
import { groupRoot, proveMembership } from "@/lib/zk/prover";
import { scopeForCluster, verifyMembership, verifyReportProof } from "@/lib/zk/verifier";

const SITE = "site-bridge";
const CLUSTER = clusterIdFor(SITE, "ELECTRICAL", "Block C");
const BODY = "The distribution board is standing in rainwater.";
const BODY_HASH = sha256Hex(BODY);

const artifacts = {
  wasm: path.join(process.cwd(), "public", "zk", "semaphore-4.wasm"),
  zkey: path.join(process.cwd(), "public", "zk", "semaphore-4.zkey"),
};
const ready = fs.existsSync(artifacts.wasm) && fs.existsSync(artifacts.zkey);

describe.skipIf(!ready)("Semaphore zero-knowledge membership", () => {
  it(
    "proves membership without revealing the commitment",
    async () => {
      const commitments = demoCommitments(SITE);
      const identity = demoIdentity(SITE, 0);

      const proof = await proveMembership({
        identity,
        commitments,
        message: messageForBody(BODY_HASH),
        scope: scopeForCluster(CLUSTER),
        artifacts,
      });

      expect(await verifyMembership(proof)).toBe(true);
      expect(JSON.stringify(proof)).not.toContain(identity.commitment.toString());
      expect(proof.merkleTreeRoot).toBe(groupRoot(commitments));
    },
    120_000,
  );

  it(
    "binds the proof to the exact report body and issue",
    async () => {
      const commitments = demoCommitments(SITE);
      const identity = demoIdentity(SITE, 1);
      const proof = await proveMembership({
        identity,
        commitments,
        message: messageForBody(BODY_HASH),
        scope: scopeForCluster(CLUSTER),
        artifacts,
      });

      const good = await verifyReportProof({
        proof,
        validRoots: new Set([groupRoot(commitments)]),
        clusterId: CLUSTER,
        bodyHash: BODY_HASH,
      });
      expect(good.ok).toBe(true);

      const edited = await verifyReportProof({
        proof,
        validRoots: new Set([groupRoot(commitments)]),
        clusterId: CLUSTER,
        bodyHash: sha256Hex("A different story entirely."),
      });
      expect(edited.ok).toBe(false);

      const unknownRoot = await verifyReportProof({
        proof,
        validRoots: new Set(["123"]),
        clusterId: CLUSTER,
        bodyHash: BODY_HASH,
      });
      expect(unknownRoot.ok).toBe(false);
    },
    120_000,
  );

  it(
    "gives one nullifier per credential per issue",
    async () => {
      const commitments = demoCommitments(SITE);
      const identity = demoIdentity(SITE, 2);
      const make = (clusterId: string) =>
        proveMembership({
          identity,
          commitments,
          message: messageForBody(BODY_HASH),
          scope: scopeForCluster(clusterId),
          artifacts,
        });

      const first = await make(CLUSTER);
      const second = await make(CLUSTER);
      const other = await make(clusterIdFor(SITE, "FIRE", "Block C"));

      expect(first.nullifier).toBe(second.nullifier);
      expect(other.nullifier).not.toBe(first.nullifier);
    },
    180_000,
  );
});
