import path from "node:path";

const DEV_SESSION_SECRET = "dev-only-session-secret-change-me-in-cloud-run";

function secret(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

/** Single place for runtime configuration. No secret ever lives in the repo. */
export const config = {
  get dataDir(): string {
    if (process.env.FAIRSHIFT_DATA_DIR) {
      return process.env.FAIRSHIFT_DATA_DIR;
    }
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      return "/tmp/.data";
    }
    return path.join(process.cwd(), ".data");
  },
  get demoMode(): boolean {
    return process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
  },
  get strictEnv(): boolean {
    return process.env.FAIRSHIFT_STRICT_ENV === "true";
  },
  get adminPassphrase(): string {
    return process.env.FAIRSHIFT_ADMIN_PASSPHRASE || "fairshift-demo";
  },
  get oversightPassphrase(): string {
    return process.env.FAIRSHIFT_OVERSIGHT_PASSPHRASE || "fairshift-oversight";
  },
  get sessionSecret(): string {
    return secret("FAIRSHIFT_SESSION_SECRET", DEV_SESSION_SECRET);
  },
  get enrolmentSecret(): string {
    return secret("FAIRSHIFT_ENROLMENT_SECRET", this.sessionSecret);
  },
  get enrolmentTtlMs(): number {
    return 15 * 60 * 1000;
  },
  get trustIap(): boolean {
    return process.env.TRUST_IAP === "true";
  },
  get adminEmails(): string[] {
    return (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
  },
  get anchorMode(): "LOCAL" | "BASE_SEPOLIA" {
    return process.env.ANCHOR_MODE === "BASE_SEPOLIA" ? "BASE_SEPOLIA" : "LOCAL";
  },
};
