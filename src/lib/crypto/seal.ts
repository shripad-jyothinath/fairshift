import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "@/lib/config";

let cachedKey: Buffer | null = null;

/** 32-byte AES key from the environment, or an ephemeral persisted key file. */
export function sealKey(): Buffer {
  if (cachedKey) return cachedKey;

  const fromEnv = process.env.FAIRSHIFT_SEAL_KEY;
  if (fromEnv) {
    const key = Buffer.from(fromEnv, "base64");
    if (key.length !== 32) throw new Error("FAIRSHIFT_SEAL_KEY must be 32 base64 bytes");
    cachedKey = key;
    return key;
  }

  const file = path.join(config.dataDir, "seal.key");
  if (fs.existsSync(file)) {
    cachedKey = Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64");
    return cachedKey;
  }

  fs.mkdirSync(config.dataDir, { recursive: true });
  const key = randomBytes(32);
  fs.writeFileSync(file, key.toString("base64"), { mode: 0o600 });
  cachedKey = key;
  return key;
}

/** AES-256-GCM. Returns base64(iv | authTag | ciphertext). */
export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function openSealed(sealed: string): string {
  const packed = Buffer.from(sealed, "base64");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", sealKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
