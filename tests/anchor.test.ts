import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decodeFunctionData, encodeFunctionData } from "viem";
import { ANCHOR_ABI } from "@/lib/anchor/artifact";
import {
  anchorStatus,
  publishAnchor,
  verifyAnchorOnchain,
} from "@/lib/anchor/provider";

const ENV_KEYS = [
  "ANCHOR_MODE",
  "BASE_SEPOLIA_RPC_URL",
  "ANCHOR_PRIVATE_KEY",
  "ANCHOR_CONTRACT_ADDRESS",
] as const;

const ROOT = "ab".repeat(32);
const CONTRACT = "0x0000000000000000000000000000000000000001";

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("AnchorRegistry artifact", () => {
  it("exposes the anchor function and Anchored event", () => {
    expect(ANCHOR_ABI).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "function", name: "anchor" }),
        expect.objectContaining({ type: "event", name: "Anchored" }),
      ]),
    );
  });

  it("encodes a 32-byte root and label for anchor()", () => {
    const root = `0x${"11".repeat(32)}` as const;
    const label = "block-0001-0002";

    const data = encodeFunctionData({
      abi: ANCHOR_ABI,
      functionName: "anchor",
      args: [root, label],
    });

    expect(data).toMatch(/^0x[0-9a-f]+$/i);

    const decoded = decodeFunctionData({ abi: ANCHOR_ABI, data });
    expect(decoded.functionName).toBe("anchor");
    expect(decoded.args).toEqual([root, label]);
  });
});

describe("publishAnchor", () => {
  it("is a no-op in LOCAL mode and never invents a tx hash", async () => {
    process.env.ANCHOR_MODE = "LOCAL";

    const receipt = await publishAnchor({
      root: ROOT,
      label: "block-0001-0002",
    });

    expect(receipt).toEqual({ mode: "LOCAL" });
    expect(receipt.txHash).toBeUndefined();
  });

  it("fails clearly in BASE_SEPOLIA mode when the key is missing, without touching the network", async () => {
    process.env.ANCHOR_MODE = "BASE_SEPOLIA";
    process.env.BASE_SEPOLIA_RPC_URL = "http://127.0.0.1:1";
    process.env.ANCHOR_CONTRACT_ADDRESS = CONTRACT;

    await expect(
      publishAnchor({ root: ROOT, label: "block-0001-0002" }),
    ).rejects.toThrow(/ANCHOR_PRIVATE_KEY/);
  });
});

describe("verifyAnchorOnchain", () => {
  it("reports unconfigured in LOCAL mode without a network call", async () => {
    process.env.ANCHOR_MODE = "LOCAL";

    await expect(verifyAnchorOnchain(ROOT)).resolves.toEqual({
      configured: false,
      anchored: false,
    });
  });
});

describe("anchorStatus", () => {
  it("returns public-safe LOCAL status", () => {
    process.env.ANCHOR_MODE = "LOCAL";

    expect(anchorStatus()).toEqual({
      mode: "LOCAL",
      configured: false,
      chainId: 84532,
      contract: null,
    });
  });
});
