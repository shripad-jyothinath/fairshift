import fs from "node:fs";
import path from "node:path";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  type KeyObject,
} from "node:crypto";
import { config } from "@/lib/config";
import type { Actor } from "@/lib/ledger/types";

const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export interface KeyRing {
  signers: Record<Actor, string>;
  sign(actor: Actor, hash: string): string;
  verify(actor: Actor, hash: string, signature: string): boolean;
}

interface StoredKeys {
  system: string;
  admin: string;
  oversight: string;
}

function privateKeyFromSeed(seed: Buffer): KeyObject {
  if (seed.length !== 32) throw new Error("Ed25519 seed must be 32 bytes");
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
}

function rawPublicKey(privateKey: KeyObject): string {
  const der = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  return Buffer.from(der).subarray(-32).toString("base64");
}

function publicKeyFromRaw(raw: string): KeyObject {
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(raw, "base64")]),
    format: "der",
    type: "spki",
  });
}

function readOrCreateSeeds(): StoredKeys {
  const file = path.join(config.dataDir, "keys.json");
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8")) as StoredKeys;
  }
  fs.mkdirSync(config.dataDir, { recursive: true });
  const seeds: StoredKeys = {
    system: generateKeyPairSync("ed25519").privateKey
      .export({ format: "der", type: "pkcs8" })
      .subarray(-32)
      .toString("base64"),
    admin: generateKeyPairSync("ed25519").privateKey
      .export({ format: "der", type: "pkcs8" })
      .subarray(-32)
      .toString("base64"),
    oversight: generateKeyPairSync("ed25519").privateKey
      .export({ format: "der", type: "pkcs8" })
      .subarray(-32)
      .toString("base64"),
  };
  fs.writeFileSync(file, JSON.stringify(seeds, null, 2), { mode: 0o600 });
  return seeds;
}

let cached: KeyRing | null = null;

export function getKeyRing(): KeyRing {
  if (cached) return cached;

  const seeds = readOrCreateSeeds();
  const privateKeys: Record<Actor, KeyObject> = {
    system: privateKeyFromSeed(
      Buffer.from(process.env.FAIRSHIFT_SYSTEM_SEED || seeds.system, "base64"),
    ),
    admin: privateKeyFromSeed(
      Buffer.from(process.env.FAIRSHIFT_ADMIN_SEED || seeds.admin, "base64"),
    ),
    oversight: privateKeyFromSeed(
      Buffer.from(process.env.FAIRSHIFT_OVERSIGHT_SEED || seeds.oversight, "base64"),
    ),
  };

  const signers = {
    system: rawPublicKey(privateKeys.system),
    admin: rawPublicKey(privateKeys.admin),
    oversight: rawPublicKey(privateKeys.oversight),
  } satisfies Record<Actor, string>;

  cached = {
    signers,
    sign(actor, hash) {
      return edSign(null, Buffer.from(hash, "hex"), privateKeys[actor]).toString("base64");
    },
    verify(actor, hash, signature) {
      try {
        return edVerify(
          null,
          Buffer.from(hash, "hex"),
          publicKeyFromRaw(signers[actor]),
          Buffer.from(signature, "base64"),
        );
      } catch {
        return false;
      }
    },
  };
  return cached;
}
