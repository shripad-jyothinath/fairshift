import { Identity } from "@semaphore-protocol/core";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { demoSecret } from "@/lib/demo/secret";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function newPayrollSecret(): Uint8Array {
  return ed25519.utils.randomSecretKey();
}

function deriveDemoPayroll(secret: string): Uint8Array {
  return sha256(new TextEncoder().encode(`fairshift-payroll:v1:${secret}`));
}

function payrollPublicKey(secretKey: Uint8Array): string {
  return bytesToBase64(ed25519.getPublicKey(secretKey));
}

/**
 * Device-held credentials. localStorage is used because this is a PWA-style
 * worker app with no server session; a production build should wrap this in
 * WebCrypto where available and add a device passcode. The XSS surface is
 * reduced by the CSP and the absence of third-party scripts.
 */
export interface DeviceIdentity {
  v: 1;
  siteId: string;
  commitment: string;
  /** Semaphore Identity.export() for QR identities; demo secret for demo slots. */
  semaphoreSecret: string;
  payrollSecret: string;
  payrollKey: string;
  enrolledAt: number;
  method: "QR" | "DEMO";
}

const STORAGE_KEY = "fairshift_identity_v1";

export function loadIdentity(): DeviceIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as DeviceIdentity;
    if (
      value.v !== 1 ||
      !value.siteId ||
      !value.commitment ||
      !value.semaphoreSecret ||
      !value.payrollSecret ||
      !value.payrollKey ||
      (value.method !== "QR" && value.method !== "DEMO")
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: DeviceIdentity): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function clearIdentity(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function createQrIdentity(siteId: string): DeviceIdentity {
  const identity = new Identity();
  const payrollSecret = newPayrollSecret();
  return {
    v: 1,
    siteId,
    commitment: identity.commitment.toString(),
    semaphoreSecret: identity.export(),
    payrollSecret: bytesToBase64(payrollSecret),
    payrollKey: payrollPublicKey(payrollSecret),
    enrolledAt: Date.now(),
    method: "QR",
  };
}

export function createDemoIdentity(siteId: string, workerIndex: number): DeviceIdentity {
  const secret = demoSecret(siteId, workerIndex);
  const identity = new Identity(secret);
  const payrollSecret = deriveDemoPayroll(secret);
  return {
    v: 1,
    siteId,
    commitment: identity.commitment.toString(),
    semaphoreSecret: secret,
    payrollSecret: bytesToBase64(payrollSecret),
    payrollKey: payrollPublicKey(payrollSecret),
    enrolledAt: Date.now(),
    method: "DEMO",
  };
}

export function semaphoreIdentity(device: DeviceIdentity): Identity {
  return device.method === "DEMO"
    ? new Identity(device.semaphoreSecret)
    : Identity.import(device.semaphoreSecret);
}

export function payrollSecretOf(device: DeviceIdentity): Uint8Array {
  return base64ToBytes(device.payrollSecret);
}
