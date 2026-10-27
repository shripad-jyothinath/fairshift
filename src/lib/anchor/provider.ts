/**
 * Server-only Base Sepolia anchoring adapter for the FairShift ledger.
 *
 * `LOCAL` mode is a no-op: it returns `{ mode: "LOCAL" }` and deliberately does
 * not invent a transaction hash. `BASE_SEPOLIA` mode writes the Merkle root to
 * the AnchorRegistry contract and returns the real receipt metadata.
 *
 * NOTE: the `server-only` package is not resolvable in this workspace, so the
 * guard import is omitted. This module reads `process.env` and must never be
 * imported from a client component; it belongs in route handlers / server code.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { ANCHOR_ABI } from "./artifact";
import {
  HEDERA_TESTNET_CHAIN_ID,
  HEDERA_DEFAULT_RPC_URL,
  HEDERA_EXPLORER_BASE,
  HEDERA_NETWORK_NAME,
  publishHederaAnchor,
  verifyHederaAnchorOnchain,
} from "./hedera";

export type AnchorMode = "LOCAL" | "BASE_SEPOLIA" | "HEDERA_TESTNET" | "HEDERA";

export interface AnchorReceipt {
  mode: AnchorMode;
  txHash?: string;
  chainId?: number;
  contract?: string;
  blockNumber?: string;
  explorerUrl?: string;
  network?: string;
}

export interface AnchorConfig {
  mode: AnchorMode;
  configured: boolean;
  rpcUrl: string;
  /** Server-side secret. Never serialize this object or log this field. */
  privateKey?: Hex;
  contract?: Address;
  network?: string;
  explorerUrl?: string;
}

export interface AnchorStatus {
  mode: AnchorMode;
  configured: boolean;
  chainId: number;
  contract: Address | null;
  network?: string;
  explorerUrl?: string;
  rpcUrl?: string;
}

export interface AnchorVerification {
  configured: boolean;
  anchored: boolean;
  /**
   * Unix timestamp (seconds) from the contract's `anchoredAt` mapping. The
   * contract stores the block timestamp, not the block number.
   */
  anchoredAt?: string;
  /**
   * Reserved for adapters that can resolve the block number. The current
   * `anchoredAt` mapping cannot provide it without an extra log query.
   */
  blockNumber?: string;
}

const DEFAULT_RPC_URL = "https://sepolia.base.org";
const EXPLORER_URL = "https://sepolia.basescan.org";
const BASE_SEPOLIA_CHAIN_ID = 84532;
const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ROOT_PATTERN = /^[0-9a-fA-F]{64}$/;
const ZERO_ROOT: Hex = `0x${"0".repeat(64)}`;

function readMode(): AnchorMode {
  const raw = process.env.ANCHOR_MODE?.trim();
  if (!raw) return "LOCAL";

  const normalized = raw.toUpperCase();
  if (normalized === "LOCAL") return "LOCAL";
  if (normalized === "BASE_SEPOLIA") return "BASE_SEPOLIA";
  if (normalized === "HEDERA_TESTNET" || normalized === "HEDERA") return "HEDERA_TESTNET";

  throw new Error(
    `Invalid ANCHOR_MODE "${raw}". Expected "LOCAL", "BASE_SEPOLIA", or "HEDERA_TESTNET".`,
  );
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

/**
 * Reads anchoring configuration at call time. No module-level env snapshot, so
 * tests and runtime config changes are honoured.
 */
export function anchorConfig(): AnchorConfig {
  const mode = readMode();
  if (mode === "HEDERA_TESTNET" || mode === "HEDERA") {
    const rpcUrl = process.env.HEDERA_RPC_URL?.trim() || HEDERA_DEFAULT_RPC_URL;
    const rawKey =
      process.env.HEDERA_PRIVATE_KEY?.trim() ||
      process.env.ANCHOR_PRIVATE_KEY?.trim();
    const rawContract =
      process.env.HEDERA_CONTRACT_ADDRESS?.trim() ||
      process.env.ANCHOR_CONTRACT_ADDRESS?.trim();

    const privateKey =
      rawKey && PRIVATE_KEY_PATTERN.test(rawKey) ? (rawKey as Hex) : undefined;
    const contract =
      rawContract && isAddress(rawContract, { strict: false })
        ? (rawContract as Address)
        : undefined;

    return {
      mode: "HEDERA_TESTNET",
      rpcUrl,
      privateKey,
      contract,
      configured: isHttpUrl(rpcUrl),
      network: HEDERA_NETWORK_NAME,
      explorerUrl: HEDERA_EXPLORER_BASE,
    };
  }

  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim() || DEFAULT_RPC_URL;
  const rawKey = process.env.ANCHOR_PRIVATE_KEY?.trim();
  const rawContract = process.env.ANCHOR_CONTRACT_ADDRESS?.trim();

  const privateKey =
    rawKey && PRIVATE_KEY_PATTERN.test(rawKey) ? (rawKey as Hex) : undefined;
  const contract =
    rawContract && isAddress(rawContract, { strict: false })
      ? (rawContract as Address)
      : undefined;

  return {
    mode,
    rpcUrl,
    privateKey,
    contract,
    configured:
      mode === "BASE_SEPOLIA" &&
      isHttpUrl(rpcUrl) &&
      privateKey !== undefined &&
      contract !== undefined,
  };
}

function requireBaseSepoliaConfig(config: AnchorConfig): {
  privateKey: Hex;
  contract: Address;
  rpcUrl: string;
} {
  if (config.mode !== "BASE_SEPOLIA") {
    throw new Error(
      'BASE_SEPOLIA anchoring requires ANCHOR_MODE="BASE_SEPOLIA".',
    );
  }

  const rawKey = process.env.ANCHOR_PRIVATE_KEY?.trim();
  if (!rawKey) {
    throw new Error(
      "BASE_SEPOLIA anchoring requires ANCHOR_PRIVATE_KEY, a 0x-prefixed 32-byte hex private key. Set it in the server environment; it is never logged.",
    );
  }
  if (!config.privateKey) {
    throw new Error(
      `ANCHOR_PRIVATE_KEY is invalid: expected 0x-prefixed 32-byte hex (66 characters), received ${rawKey.length} characters. The value was not logged.`,
    );
  }

  const rawContract = process.env.ANCHOR_CONTRACT_ADDRESS?.trim();
  if (!rawContract) {
    throw new Error(
      "BASE_SEPOLIA anchoring requires ANCHOR_CONTRACT_ADDRESS, the deployed AnchorRegistry address.",
    );
  }
  if (!config.contract) {
    throw new Error(
      `ANCHOR_CONTRACT_ADDRESS is invalid: expected a 20-byte Ethereum address, received "${rawContract}".`,
    );
  }

  if (!isHttpUrl(config.rpcUrl)) {
    throw new Error(
      "BASE_SEPOLIA_RPC_URL is invalid: expected an http(s) RPC URL.",
    );
  }

  return {
    privateKey: config.privateKey,
    contract: config.contract,
    rpcUrl: config.rpcUrl,
  };
}

/** Accepts the ledger's 64-char, no-0x Merkle root and returns a bytes32 hex. */
function normalizeRoot(root: string): Hex {
  const trimmed = root.trim();
  const body = trimmed.replace(/^0x/i, "");

  if (!ROOT_PATTERN.test(body)) {
    throw new Error(
      `Anchor root must be 64 hex characters, optionally 0x-prefixed (received ${trimmed.length} characters).`,
    );
  }

  const normalized = `0x${body.toLowerCase()}` as Hex;
  if (normalized === ZERO_ROOT) {
    throw new Error("Anchor root must not be zero.");
  }

  return normalized;
}

/**
 * Publishes one Merkle root.
 *
 * LOCAL: no-op, returns `{ mode: "LOCAL" }` with no fabricated tx hash.
 * BASE_SEPOLIA: simulates, sends, waits for the receipt, and returns real
 * transaction metadata. Never logs the private key.
 */
export async function publishAnchor({
  root,
  label,
}: {
  root: string;
  label: string;
}): Promise<AnchorReceipt> {
  const config = anchorConfig();
  if (config.mode === "LOCAL") {
    return { mode: "LOCAL" };
  }

  if (config.mode === "HEDERA_TESTNET" || config.mode === "HEDERA") {
    return publishHederaAnchor({
      root,
      label,
      options: {
        rpcUrl: config.rpcUrl,
        privateKey: config.privateKey,
        contract: config.contract,
      },
    });
  }

  const { privateKey, contract, rpcUrl } = requireBaseSepoliaConfig(config);
  const rootHex = normalizeRoot(root);
  const normalizedLabel = label.trim();
  if (!normalizedLabel) {
    throw new Error(
      "Anchor label must not be empty when anchoring to Base Sepolia.",
    );
  }

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  const { request } = await publicClient.simulateContract({
    account,
    address: contract,
    abi: ANCHOR_ABI,
    functionName: "anchor",
    args: [rootHex, normalizedLabel],
  });

  const txHash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== "success") {
    throw new Error(
      `Anchor transaction ${txHash} did not succeed (status: ${receipt.status}).`,
    );
  }

  return {
    mode: "BASE_SEPOLIA",
    txHash,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    contract,
    blockNumber: receipt.blockNumber.toString(),
    explorerUrl: `${EXPLORER_URL}/tx/${txHash}`,
  };
}

/**
 * Checks whether a root is already anchored. Returns `configured: false`
 * without touching the network when Base Sepolia is not fully configured.
 */
export async function verifyAnchorOnchain(
  root: string,
): Promise<AnchorVerification> {
  const config = anchorConfig();
  if (config.mode === "HEDERA_TESTNET" || config.mode === "HEDERA") {
    return verifyHederaAnchorOnchain(root, config.contract, config.rpcUrl);
  }

  if (!config.configured || !config.contract) {
    return { configured: false, anchored: false };
  }

  const rootHex = normalizeRoot(root);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(config.rpcUrl),
  });

  const anchoredAt = await publicClient.readContract({
    address: config.contract,
    abi: ANCHOR_ABI,
    functionName: "anchoredAt",
    args: [rootHex],
  });

  if (anchoredAt === 0n) {
    return { configured: true, anchored: false };
  }

  return {
    configured: true,
    anchored: true,
    anchoredAt: anchoredAt.toString(),
  };
}

/** Public-safe anchor status for the UI/API. Never includes secrets. */
export function anchorStatus(): AnchorStatus {
  const config = anchorConfig();
  if (config.mode === "HEDERA_TESTNET" || config.mode === "HEDERA") {
    return {
      mode: "HEDERA_TESTNET",
      configured: config.configured,
      chainId: HEDERA_TESTNET_CHAIN_ID,
      contract: config.contract ?? null,
      network: HEDERA_NETWORK_NAME,
      explorerUrl: HEDERA_EXPLORER_BASE,
      rpcUrl: config.rpcUrl,
    };
  }

  return {
    mode: config.mode,
    configured: config.configured,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    contract: config.contract ?? null,
  };
}
