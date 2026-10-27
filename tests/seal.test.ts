import { beforeAll, describe, expect, it } from "vitest";
import { openSealed, seal } from "@/lib/crypto/seal";

beforeAll(() => {
  // Deterministic 32-byte key for the test process only.
  process.env.FAIRSHIFT_SEAL_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("sealed report bodies", () => {
  it("round-trips a body", () => {
    const body = "The distribution board is standing in water.";
    const sealed = seal(body);
    expect(sealed).not.toContain("distribution");
    expect(openSealed(sealed)).toBe(body);
  });

  it("uses a fresh IV for every seal", () => {
    expect(seal("same")).not.toBe(seal("same"));
  });

  it("fails closed when the ciphertext is tampered with", () => {
    const sealed = seal("very sensitive");
    const bytes = Buffer.from(sealed, "base64");
    bytes[bytes.length - 1] ^= 0xff;
    expect(() => openSealed(bytes.toString("base64"))).toThrow();
  });
});
