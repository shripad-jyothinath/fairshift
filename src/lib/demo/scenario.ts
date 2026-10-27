import type { Category, Sector, Severity } from "@/lib/ledger/types";

export interface DemoReport {
  id: string;
  siteId: string;
  category: Category;
  zone: string;
  /** How many distinct demo workers confirm this issue. */
  reporters: number;
  /** Unique worker index per reporter; first is the original filer. */
  workerIndices: number[];
  body: string;
  hoursAgo: number;
}

export interface DemoResolution {
  siteId: string;
  category: Category;
  zone: string;
  kind: "FIX" | "DISCIPLINE";
  summary: string;
  action: string;
  accountableRole: string;
  subjectRef: string;
  hoursAgo: number;
  attestation: string;
  closeNote: string;
}

export const DEMO_ORG = {
  orgId: "org-meridian",
  name: "Meridian Infra & Care Group",
};

export const DEMO_SITE_DEFS: Array<{
  siteId: string;
  name: string;
  sector: Sector;
  zones: string[];
}> = [
  {
    siteId: "site-bridge",
    name: "Kaveri Metro Extension — Site 4",
    sector: "CONSTRUCTION",
    zones: ["Foundation", "Scaffolding", "Block C", "Site Office"],
  },
  {
    siteId: "site-ward",
    name: "St. Mary's General Hospital",
    sector: "HEALTHCARE",
    zones: ["Ward 3", "ICU", "Laundry", "Kitchen"],
  },
];

export const DEMO_REPORTS: DemoReport[] = [
  {
    id: "rep-elec-blockc",
    siteId: "site-bridge",
    category: "ELECTRICAL",
    zone: "Block C",
    reporters: 4,
    workerIndices: [0, 1, 2, 3],
    body:
      "The temporary distribution board near Block C is standing in rainwater and the earth wire is loose. Workers are getting mild shocks when plugging in the mixers.",
    hoursAgo: 30,
  },
  {
    id: "rep-scaffold",
    siteId: "site-bridge",
    category: "STRUCTURAL",
    zone: "Scaffolding",
    reporters: 6,
    workerIndices: [4, 5, 6, 7, 8, 9],
    body:
      "The third-level scaffold has two missing cross-braces and the planks shift under load. It has been like this since Monday and the night shift still uses it.",
    hoursAgo: 42,
  },
  {
    id: "rep-toilet",
    siteId: "site-bridge",
    category: "SANITATION",
    zone: "Site Office",
    reporters: 1,
    workerIndices: [10],
    body:
      "Only one toilet is working for forty workers. The water tank has not been cleaned this month.",
    hoursAgo: 9,
  },
  {
    id: "rep-fire-exit",
    siteId: "site-bridge",
    category: "FIRE",
    zone: "Block C",
    reporters: 2,
    workerIndices: [11, 0],
    body:
      "A fire exit on the east side is chained shut and blocked with cement bags. If the generator catches fire there is no way out.",
    hoursAgo: 5,
  },
  {
    id: "rep-bleach",
    siteId: "site-ward",
    category: "CHEMICAL",
    zone: "Laundry",
    reporters: 5,
    workerIndices: [0, 1, 2, 3, 4],
    body:
      "Bleach and formaldehyde drums are stored next to the dryer with no labels or ventilation. Two staff felt dizzy after the afternoon shift.",
    hoursAgo: 20,
  },
  {
    id: "rep-retaliation",
    siteId: "site-ward",
    category: "HARASSMENT",
    zone: "Ward 3",
    reporters: 3,
    workerIndices: [5, 6, 7],
    body:
      "A senior supervisor threatens to cut shifts for anyone who reports the staffing shortage. People are afraid to speak in the daily huddle.",
    hoursAgo: 55,
  },
  {
    id: "rep-sharps",
    siteId: "site-ward",
    category: "SANITATION",
    zone: "ICU",
    reporters: 4,
    workerIndices: [8, 9, 10, 11],
    body:
      "Sharps bins in ICU are overflowing and the waste bags are being carried through the patient corridor.",
    hoursAgo: 14,
  },
  {
    id: "rep-icu-socket",
    siteId: "site-ward",
    category: "ELECTRICAL",
    zone: "ICU",
    reporters: 2,
    workerIndices: [0, 1],
    body:
      "The backup socket in ICU sparks when the ventilator is moved. Maintenance has been informed twice.",
    hoursAgo: 3,
  },
  {
    id: "rep-mixer",
    siteId: "site-bridge",
    category: "MACHINERY",
    zone: "Foundation",
    reporters: 3,
    workerIndices: [2, 3, 4],
    body:
      "The concrete mixer guard is broken and the emergency stop is taped down.",
    hoursAgo: 96,
  },
];

export const DEMO_RESOLUTION: DemoResolution = {
  siteId: "site-bridge",
  category: "MACHINERY",
  zone: "Foundation",
  kind: "FIX",
  summary:
    "Mixer guard replaced and emergency stop rewired; tool-box talk held with 42 workers.",
  action:
    "Guard refitted, e-stop tested under load, weekly inspection added to the checklist.",
  accountableRole: "Site mechanical supervisor",
  subjectRef: "sha256:7d0f4f2a4c5b6e7f8091a2b3c4d5e6f7",
  hoursAgo: 50,
  attestation:
    "Verified the replacement guard and the e-stop test log on site. Closure is consistent with the evidence.",
  closeNote:
    "Evidence hash published and verified by the works committee. Issue closed after 48 hours.",
};

export function severityOf(category: Category): Severity {
  switch (category) {
    case "STRUCTURAL":
    case "FIRE":
    case "CHEMICAL":
      return "CRITICAL";
    case "ELECTRICAL":
    case "MACHINERY":
    case "HARASSMENT":
      return "HIGH";
    case "SANITATION":
      return "MEDIUM";
    default:
      return "LOW";
  }
}
