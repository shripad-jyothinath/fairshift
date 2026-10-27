import type { Category, Sector, Severity, Tier } from "./ledger/types";

export const SECTORS: Record<Sector, { label: string; short: string }> = {
  CONSTRUCTION: { label: "Construction site", short: "Construction" },
  HEALTHCARE: { label: "Hospital & sanitation", short: "Healthcare" },
};

export const CATEGORIES: Record<
  Category,
  { label: string; severity: Severity; icon: string; prompt: string }
> = {
  ELECTRICAL: {
    label: "Electrical hazard",
    severity: "HIGH",
    icon: "bolt",
    prompt: "Exposed wiring, wet panels, sparks, missing earthing",
  },
  FIRE: {
    label: "Fire & evacuation",
    severity: "CRITICAL",
    icon: "fire",
    prompt: "Blocked exits, missing extinguishers, alarms down",
  },
  STRUCTURAL: {
    label: "Structural risk",
    severity: "CRITICAL",
    icon: "crack",
    prompt: "Cracks, unstable scaffolding, unsafe floors or lifts",
  },
  CHEMICAL: {
    label: "Chemical exposure",
    severity: "CRITICAL",
    icon: "flask",
    prompt: "Fumes, spills, missing PPE, unlabelled containers",
  },
  MACHINERY: {
    label: "Machinery & guards",
    severity: "HIGH",
    icon: "gear",
    prompt: "Missing guards, broken brakes, unsafe equipment",
  },
  SANITATION: {
    label: "Sanitation & hygiene",
    severity: "MEDIUM",
    icon: "drop",
    prompt: "No clean water, blocked toilets, unsafe waste handling",
  },
  HARASSMENT: {
    label: "Harassment & retaliation",
    severity: "HIGH",
    icon: "shield",
    prompt: "Threats, withheld pay, retaliation for speaking up",
  },
  OTHER: {
    label: "Something else",
    severity: "LOW",
    icon: "dots",
    prompt: "Describe the hazard in your own words",
  },
};

/** Deterministic tier from the number of unique, ZK-verified reporters. */
export function countTier(reporters: number): Tier {
  if (reporters >= 10) return 3;
  if (reporters >= 5) return 2;
  if (reporters >= 3) return 1;
  return 0;
}

/** Serious categories cannot wait for a crowd to form. */
export function severityTier(severity: Severity): Tier {
  if (severity === "CRITICAL") return 2;
  if (severity === "HIGH") return 1;
  return 0;
}

export function computeTier(
  reporters: number,
  severity: Severity,
  slaTier: Tier,
): Tier {
  const crowd = countTier(reporters);
  const gravity = severityTier(severity);
  return Math.max(crowd, gravity, slaTier) as Tier;
}

export const TIERS: Record<
  Tier,
  { label: string; owner: string; slaHours: number; accent: string }
> = {
  0: { label: "Supervisor", owner: "Site supervisor", slaHours: 72, accent: "tier-0" },
  1: { label: "Site manager", owner: "Site manager", slaHours: 48, accent: "tier-1" },
  2: { label: "Regional", owner: "Regional safety lead", slaHours: 24, accent: "tier-2" },
  3: { label: "Public", owner: "Public + oversight board", slaHours: 12, accent: "tier-3" },
};

export function deadlineFor(tier: Tier, from: number): number {
  return from + TIERS[tier].slaHours * 60 * 60 * 1000;
}

/** Cluster key is coarse on purpose: same site + category + zone merges. */
export function clusterIdFor(
  siteId: string,
  category: Category,
  zone: string,
): string {
  return `${siteId}.${category}.${zone.toLowerCase().replace(/\s+/g, "-")}`;
}

export const CLOSURE_RULES = {
  /** FIX and DISCIPLINE are the only two ways to close an issue. */
  kinds: ["FIX", "DISCIPLINE"] as const,
  /** High and critical issues need a second, independent signature. */
  dualSignOffSeverities: ["HIGH", "CRITICAL"] as Severity[],
  minSummaryLength: 12,
  minActionLength: 6,
};

export function needsOversight(severity: Severity): boolean {
  return CLOSURE_RULES.dualSignOffSeverities.includes(severity);
}
