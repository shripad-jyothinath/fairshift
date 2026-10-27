/**
 * Redaction runs before anything is written to the public ledger.
 * Workers own the full text; the chain only ever receives this redacted view.
 */
const PATTERNS: Array<[RegExp, string]> = [
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]"],
  // Indian mobiles: 9876543210, +91 91234 56789, 0-98765-43210.
  [/(?:\+?91[\s-]?|0[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g, "[phone]"],
  [/\b\d{12,}\b/g, "[number]"],
  // Aadhaar-shaped 12 digit groups, with or without spaces.
  [/\b\d{4}\s\d{4}\s\d{4}\b/g, "[id]"],
  [/https?:\/\/\S+/gi, "[link]"],
];

export function redact(input: string): string {
  let output = input;
  for (const [pattern, replacement] of PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  return output.replace(/\s+/g, " ").trim();
}
