#!/usr/bin/env node
/**
 * Generates fresh FairShift secrets and prints them to stdout.
 *
 * It never writes a file, never calls a network service, and never logs
 * anything except generated values. Treat the output as sensitive.
 *
 * Usage:
 *   node scripts/generate-secrets.mjs
 */
import { randomBytes } from "node:crypto";

const base64 = (bytes) => randomBytes(bytes).toString("base64");
const base64url = (bytes) => randomBytes(bytes).toString("base64url");

/**
 * Base64url for passphrases and HMAC secrets: no shell metacharacters, no
 * padding, 128+ bits of entropy. Base64 32-byte values are required by the
 * app for the AES-GCM seal key and the Ed25519 seeds.
 */
const values = {
  FAIRSHIFT_ADMIN_PASSPHRASE: base64url(24),
  FAIRSHIFT_OVERSIGHT_PASSPHRASE: base64url(24),
  FAIRSHIFT_SESSION_SECRET: base64url(48),
  FAIRSHIFT_ENROLMENT_SECRET: base64url(32),
  FAIRSHIFT_CHECKIN_SECRET: base64url(32),
  FAIRSHIFT_SEAL_KEY: base64(32),
  FAIRSHIFT_SYSTEM_SEED: base64(32),
  FAIRSHIFT_ADMIN_SEED: base64(32),
  FAIRSHIFT_OVERSIGHT_SEED: base64(32),
};

const entries = Object.entries(values);

console.error(`
╔══════════════════════════════════════════════════════════════════════════╗
║  SECRETS — do not commit, paste into chat, or post in a ticket.          ║
║  Anyone with these values can sign ledger events, open sealed reports,   ║
║  mint enrolment QRs, or forge an admin session. Store them in Secret     ║
║  Manager (or equivalent) and keep an offline backup.                     ║
║                                                                          ║
║  Every run generates new values. Replacing seeds or the seal key makes   ║
║  existing ledger signatures or sealed report bodies unreadable.          ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

console.log("# ===========================================================================");
console.log("# FairShift — .env block");
console.log("# Generated with Node.js crypto.randomBytes on " + new Date().toISOString());
console.log("# ===========================================================================");
for (const [key, value] of entries) {
  console.log(`${key}=${value}`);
}
console.log("");
console.log("# NEXT_PUBLIC_DEMO_MODE is a build-time flag for client bundles; it is not a secret.");
console.log("# Set FAIRSHIFT_DATA_DIR separately, e.g. /tmp/fairshift locally or /mnt/fairshift on Cloud Run.");
console.log("");

console.log("# ===========================================================================");
console.log("# FairShift — single-line --set-env-vars value");
console.log("# Copy the line between the markers, not the markers.");
console.log("# ===========================================================================");
console.log(entries.map(([key, value]) => `${key}=${value}`).join(","));
console.log("");
console.log("# Example:");
console.log('#   gcloud run deploy fairshift --source . --region asia-south1 \\');
console.log('#     --set-env-vars "<paste the single line above>"');
console.log("");
console.log("# Prefer --set-secrets for production. Environment variables are visible to");
console.log("# anyone who can read the Cloud Run revision configuration.");
