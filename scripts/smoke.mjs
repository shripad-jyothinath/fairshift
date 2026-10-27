#!/usr/bin/env node
/**
 * Read-only production smoke test for FairShift.
 *
 * Usage:
 *   node scripts/smoke.mjs https://your-service.run.app
 *
 * Checks:
 *   1. GET /api/health                     -> 200, ok === true
 *   2. GET /api/state                      -> 200, chain.valid === true, chain.length > 0
 *   3. GET /api/ledger/verify?deep=1       -> 200, ok === true, proofs.invalid === 0
 *   4. GET /api/admin/issues (no cookie)   -> 401
 *
 * Each request has a 20 second timeout. Response bodies are never echoed:
 * they can contain sealed report material and ledger metadata.
 */
const TIMEOUT_MS = 20_000;

const rawBase = process.argv[2];
if (!rawBase) {
  console.error("Usage: node scripts/smoke.mjs https://your-service.run.app");
  process.exit(2);
}

const base = rawBase.replace(/\/+$/, "");
let parsedBase;
try {
  parsedBase = new URL(base);
} catch {
  console.error(`Invalid URL: ${rawBase}`);
  process.exit(2);
}
if (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:") {
  console.error("Base URL must use http:// or https://");
  process.exit(2);
}

const results = [];

function record(ok, name, detail) {
  results.push({ ok, name, detail });
  const label = ok ? "PASS" : "FAIL";
  console.log(`${label}  ${name}${detail ? `  — ${detail}` : ""}`);
}

function shortError(error) {
  if (error && error.name === "TimeoutError") return `timed out after ${TIMEOUT_MS / 1000}s`;
  if (error instanceof Error) return error.message;
  return String(error);
}

async function request(path) {
  return fetch(`${base}${path}`, {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function bodyJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function checkHealth() {
  try {
    const response = await request("/api/health");
    if (response.status !== 200) {
      return record(false, "GET /api/health", `expected 200, got ${response.status}`);
    }
    const body = await bodyJson(response);
    if (body?.ok !== true) {
      return record(false, "GET /api/health", "expected ok=true");
    }
    return record(true, "GET /api/health", "200 ok=true");
  } catch (error) {
    return record(false, "GET /api/health", shortError(error));
  }
}

async function checkState() {
  try {
    const response = await request("/api/state");
    if (response.status !== 200) {
      return record(false, "GET /api/state", `expected 200, got ${response.status}`);
    }
    const body = await bodyJson(response);
    const chain = body?.chain;
    if (chain?.valid !== true) {
      return record(false, "GET /api/state", "chain.valid is not true");
    }
    if (!Number.isFinite(chain.length) || chain.length <= 0) {
      return record(false, "GET /api/state", "chain.length is not greater than 0");
    }
    return record(true, "GET /api/state", `chain.valid=true length=${chain.length}`);
  } catch (error) {
    return record(false, "GET /api/state", shortError(error));
  }
}

async function checkDeepAudit() {
  try {
    const response = await request("/api/ledger/verify?deep=1");
    if (response.status !== 200) {
      return record(
        false,
        "GET /api/ledger/verify?deep=1",
        `expected 200, got ${response.status}`,
      );
    }
    const body = await bodyJson(response);
    if (body?.ok !== true) {
      return record(false, "GET /api/ledger/verify?deep=1", "expected ok=true");
    }
    const invalid = body?.proofs?.invalid;
    if (invalid !== 0) {
      return record(
        false,
        "GET /api/ledger/verify?deep=1",
        `expected proofs.invalid=0, got ${String(invalid)}`,
      );
    }
    const checked = body?.proofs?.checked;
    return record(
      true,
      "GET /api/ledger/verify?deep=1",
      `ok=true proofs.checked=${String(checked)} proofs.invalid=0`,
    );
  } catch (error) {
    return record(false, "GET /api/ledger/verify?deep=1", shortError(error));
  }
}

async function checkAdminRequiresAuth() {
  try {
    const response = await request("/api/admin/issues");
    if (response.status === 401) {
      return record(true, "GET /api/admin/issues (no cookie)", "401");
    }
    if (response.status >= 300 && response.status < 400) {
      return record(
        false,
        "GET /api/admin/issues (no cookie)",
        `expected 401, got ${response.status} redirect (IAP?)`,
      );
    }
    return record(
      false,
      "GET /api/admin/issues (no cookie)",
      `expected 401, got ${response.status}`,
    );
  } catch (error) {
    return record(false, "GET /api/admin/issues (no cookie)", shortError(error));
  }
}

console.log(`FairShift smoke test — ${base}`);
console.log(`Timeout: ${TIMEOUT_MS / 1000}s per request`);
console.log("");

await checkHealth();
await checkState();
await checkDeepAudit();
await checkAdminRequiresAuth();

const failures = results.filter((result) => !result.ok).length;
console.log("");
console.log(
  failures === 0
    ? `All ${results.length} checks passed.`
    : `${failures} of ${results.length} checks failed.`,
);

process.exit(failures === 0 ? 0 : 1);
