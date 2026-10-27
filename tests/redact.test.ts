import { describe, expect, it } from "vitest";
import { redact } from "@/lib/security/redact";

describe("public-text redaction", () => {
  it("removes phone numbers in Indian formats", () => {
    const text = "Call me on 9876543210 or +91 91234 56789 if it happens again.";
    const clean = redact(text);
    expect(clean).not.toContain("9876543210");
    expect(clean).not.toContain("91234");
    expect(clean).toContain("[phone]");
  });

  it("removes email addresses", () => {
    expect(redact("Mail ramesh.k@example.co.in about it")).toContain("[email]");
  });

  it("removes Aadhaar-shaped identifiers", () => {
    const clean = redact("ID 1234 5678 9012 was written on the form");
    expect(clean).not.toContain("1234 5678 9012");
    expect(clean).toContain("[id]");
  });

  it("removes long numeric identifiers and links", () => {
    const clean = redact("Token 123456789012345 and https://example.com/x");
    expect(clean).toContain("[number]");
    expect(clean).toContain("[link]");
  });

  it("normalises whitespace and keeps the hazard description", () => {
    const clean = redact("  The    panel   is   wet.\n\nSomeone will get hurt.  ");
    expect(clean).toBe("The panel is wet. Someone will get hurt.");
  });
});
