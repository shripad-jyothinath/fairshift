/**
 * Fetches the Semaphore Groth16 artifacts used by the browser prover.
 *
 * Why vendor them: the canonical CDN (snark-artifacts.pse.dev) can be blocked
 * or rate-limited at demo time. Artifacts are ~30 MB total for depths 1–10.
 * For deployment speed and reliability, depths 1-4 are pre-fetched (covers groups up to 16 members).
 * Never fails the build if the network is flaky or offline.
 */
import fs from "node:fs/promises";
import path from "node:path";

const DEPTHS = [1, 2, 3, 4];
const BASE =
  "https://raw.githubusercontent.com/privacy-scaling-explorations/snark-artifacts/main/packages/semaphore";
const OUT = path.join(process.cwd(), "public", "zk");

try {
  await fs.mkdir(OUT, { recursive: true });
} catch {
  // ignore
}

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

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${BASE}/${name}`, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) {
        console.warn(`Warning: ${name} returned HTTP ${response.status}`);
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(target, bytes);
      console.log(`✓ ${name} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);
    } catch (err) {
      console.warn(`Note: Could not download ${name} (${err.message}); will use CDN fallback.`);
    }
  }
}

try {
  for (const depth of DEPTHS) {
    await download(depth);
  }
} catch (err) {
  console.warn("Artifact prefetch completed with warnings:", err.message);
}

console.log("ZK artifacts ready in public/zk");
process.exit(0);
