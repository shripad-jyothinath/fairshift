/**
 * Deploys AnchorRegistry to Base Sepolia.
 *
 * Usage (never commit the key):
 *   BASE_SEPOLIA_RPC_URL="https://..." \
 *   ANCHOR_PRIVATE_KEY="0x..." \
 *   node scripts/deploy-anchor.mjs
 *
 * Reads only public material from the generated artifact. The private key is
 * never printed; only the derived public address is shown.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const EXPLORER_URL = "https://sepolia.basescan.org";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const artifactPath = path.join(projectRoot, "src", "lib", "anchor", "artifact.ts");

function fail(message) {
  console.error(`\n\u2717 ${message}\n`);
  process.exit(1);
}

const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim();
const rawKey = process.env.ANCHOR_PRIVATE_KEY?.trim();

if (!rpcUrl) {
  fail(
    "BASE_SEPOLIA_RPC_URL is required. Example: BASE_SEPOLIA_RPC_URL=https://sepolia.base.org",
  );
}
if (!/^https?:\/\/\S+$/i.test(rpcUrl)) {
  fail("BASE_SEPOLIA_RPC_URL must be an http(s) URL.");
}
if (!rawKey) {
  fail(
    "ANCHOR_PRIVATE_KEY is required (0x-prefixed 32-byte hex). Export it in your shell; do not commit it.",
  );
}
if (!/^0x[0-9a-fA-F]{64}$/.test(rawKey)) {
  fail(
    `ANCHOR_PRIVATE_KEY is invalid: expected 0x-prefixed 32-byte hex (66 characters), received ${rawKey.length} characters. The value was not printed.`,
  );
}

let artifactSource;
try {
  artifactSource = await fs.readFile(artifactPath, "utf8");
} catch {
  fail(
    "src/lib/anchor/artifact.ts is missing. Run `node scripts/compile-contract.mjs` first.",
  );
}

const abiMatch = artifactSource.match(
  /export const ANCHOR_ABI = (\[[\s\S]*?\]) as const;/,
);
const bytecodeMatch = artifactSource.match(
  /export const ANCHOR_BYTECODE = "(0x[0-9a-fA-F]+)" as const;/,
);
if (!abiMatch || !bytecodeMatch) {
  fail(
    "Could not read ANCHOR_ABI / ANCHOR_BYTECODE from src/lib/anchor/artifact.ts. Re-run `node scripts/compile-contract.mjs`.",
  );
}

let abi;
try {
  abi = JSON.parse(abiMatch[1]);
} catch {
  fail("Generated ANCHOR_ABI is not valid JSON. Re-run `node scripts/compile-contract.mjs`.");
}
const bytecode = bytecodeMatch[1];

let account;
try {
  account = privateKeyToAccount(rawKey);
} catch {
  fail(
    "Could not derive an account from ANCHOR_PRIVATE_KEY. Check that it is a valid secp256k1 private key. The value was not printed.",
  );
}

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(rpcUrl),
});
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(rpcUrl),
});

console.log(`Deploying AnchorRegistry to Base Sepolia (chain ${baseSepolia.id})`);
console.log(`Deployer: ${account.address}`);

let txHash;
try {
  // deployContract is available on viem wallet clients; `abi` has no constructor.
  txHash = await walletClient.deployContract({ abi, bytecode, args: [] });
} catch (error) {
  fail(
    `Deployment transaction failed: ${error instanceof Error ? error.message : String(error)}`,
  );
}

console.log(`Transaction: ${EXPLORER_URL}/tx/${txHash}`);

let receipt;
try {
  receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
} catch (error) {
  fail(
    `Could not confirm transaction ${txHash}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

if (receipt.status !== "success") {
  fail(`Deployment reverted (status: ${receipt.status}). Transaction: ${txHash}`);
}
if (!receipt.contractAddress) {
  fail(`Transaction ${txHash} succeeded but returned no contract address.`);
}

console.log(`\nAnchorRegistry deployed to: ${receipt.contractAddress}`);
console.log(`Basescan: ${EXPLORER_URL}/address/${receipt.contractAddress}`);
console.log(`Block: ${receipt.blockNumber.toString()}`);
console.log(
  `\nSet ANCHOR_CONTRACT_ADDRESS=${receipt.contractAddress} in the server environment.`,
);
console.log("Do not commit the private key or the deployment env file.");
