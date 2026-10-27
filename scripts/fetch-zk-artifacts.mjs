/**
 * Fetches the Semaphore Groth16 artifacts used by the browser prover.
 *
 * Why vendor them: the canonical CDN (snark-artifacts.pse.dev) can be blocked
 * or rate-limited at demo time. Artifacts are ~30 MB total for depths 1–10, so
 * they are downloaded at Docker build time and never committed to the repo.
 */
import fs from "node:fs/promises";
import path from "node:path";

const DEPTHS = Array.from({ length: 10 }, (_, index) => index + 1);
const BASE =
  "https://raw.githubusercontent.com/privacy-scaling-explorations/snark-artifacts/main/packages/semaphore";
const OUT = path.join(process.cwd(), "public", "zk");

await fs.mkdir(OUT, { recursive: true });

async function download(depth) {
  for (const extension of ["wasm", "zkey"]) {
    const name = `semaphore-${depth}.${extension}`;
    const target = path.join(OUT, name);
    try {
      const stat = await fs.stat(target);
      if (stat.size > 100_000) {
        console.log(`✓ ${name} (cached)`);
        continue;
      }
    } catch {
      // Not cached yet.
    }

    const response = await fetch(`${BASE}/${name}`);
    if (!response.ok) {
      throw new Error(`${name}: HTTP ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(target, bytes);
    console.log(`✓ ${name} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);
  }
}

for (const depth of DEPTHS) {
  await download(depth);
}

console.log("ZK artifacts ready in public/zk");
