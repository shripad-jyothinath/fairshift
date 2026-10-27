import { describe, expect, it } from "vitest";
import {
  clusterIdFor,
  computeTier,
  countTier,
  deadlineFor,
  needsOversight,
  severityTier,
  TIERS,
} from "@/lib/domain";

describe("escalation rules", () => {
  it("escalates on unique reporter thresholds", () => {
    expect(countTier(1)).toBe(0);
    expect(countTier(2)).toBe(0);
    expect(countTier(3)).toBe(1);
    expect(countTier(4)).toBe(1);
    expect(countTier(5)).toBe(2);
    expect(countTier(9)).toBe(2);
    expect(countTier(10)).toBe(3);
  });

  it("escalates immediately for severe categories", () => {
    expect(severityTier("LOW")).toBe(0);
    expect(severityTier("MEDIUM")).toBe(0);
    expect(severityTier("HIGH")).toBe(1);
    expect(severityTier("CRITICAL")).toBe(2);
  });

  it("takes the highest of crowd, severity and SLA", () => {
    expect(computeTier(1, "LOW", 0)).toBe(0);
    expect(computeTier(3, "LOW", 0)).toBe(1);
    expect(computeTier(1, "CRITICAL", 0)).toBe(2);
    expect(computeTier(1, "LOW", 3)).toBe(3);
  });

  it("shrinks the deadline as the tier rises", () => {
    expect(deadlineFor(0, 0)).toBe(TIERS[0].slaHours * 3_600_000);
    expect(deadlineFor(3, 0)).toBe(12 * 3_600_000);
    expect(TIERS[0].slaHours).toBeGreaterThan(TIERS[3].slaHours);
  });

  it("requires oversight only for high and critical issues", () => {
    expect(needsOversight("HIGH")).toBe(true);
    expect(needsOversight("CRITICAL")).toBe(true);
    expect(needsOversight("MEDIUM")).toBe(false);
    expect(needsOversight("LOW")).toBe(false);
  });

  it("merges reports by site, category and zone", () => {
    expect(clusterIdFor("s1", "FIRE", "Block C")).toBe("s1.FIRE.block-c");
    expect(clusterIdFor("s1", "FIRE", "block  c")).toBe("s1.FIRE.block-c");
    expect(clusterIdFor("s1", "FIRE", "Block D")).not.toBe(
      clusterIdFor("s1", "FIRE", "Block C"),
    );
  });
});
