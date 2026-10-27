import path from "node:path";

/** Single place for runtime configuration. No secret ever lives in the repo. */
export const config = {
  get dataDir(): string {
    return process.env.FAIRSHIFT_DATA_DIR || path.join(process.cwd(), ".data");
  },
  get demoMode(): boolean {
    return process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
  },
  get adminPassphrase(): string {
    return process.env.FAIRSHIFT_ADMIN_PASSPHRASE || "fairshift-demo";
  },
  get oversightPassphrase(): string {
    return process.env.FAIRSHIFT_OVERSIGHT_PASSPHRASE || "fairshift-oversight";
  },
  get sessionSecret(): string {
    return (
      process.env.FAIRSHIFT_SESSION_SECRET ||
      "dev-only-session-secret-change-me-in-cloud-run"
    );
  },
} as const;
