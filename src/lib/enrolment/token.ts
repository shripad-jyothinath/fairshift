import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface EnrolmentPayload {
  v: 1;
  siteId: string;
  orgId: string;
  exp: number;
  nonce: string;
}

export function createEnrolmentToken(siteId: string, orgId: string): {
  token: string;
  expiresAt: number;
  nonce: string;
} {
  const payload: EnrolmentPayload = {
    v: 1,
    siteId,
    orgId,
    exp: Date.now() + config.enrolmentTtlMs,
    nonce: randomUUID(),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    token: `${encoded}.${sign(encoded, config.enrolmentSecret)}`,
    expiresAt: payload.exp,
    nonce: payload.nonce,
  };
}

export type EnrolmentVerification =
  | { ok: true; payload: EnrolmentPayload }
  | { ok: false; reason: string };

export function verifyEnrolmentToken(token: string): EnrolmentVerification {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return { ok: false, reason: "Malformed enrolment token" };
  if (!safeEqual(signature, sign(encoded, config.enrolmentSecret))) {
    return { ok: false, reason: "Enrolment token signature is invalid" };
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as EnrolmentPayload;
    if (payload.v !== 1) return { ok: false, reason: "Unsupported token version" };
    if (payload.exp < Date.now()) return { ok: false, reason: "Enrolment token has expired" };
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "Enrolment token is unreadable" };
  }
}
