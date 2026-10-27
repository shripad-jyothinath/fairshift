import { z } from "zod";
import { CATEGORIES } from "@/lib/domain";
import type { Category } from "@/lib/ledger/types";

const categoryValues = Object.keys(CATEGORIES) as [Category, ...Category[]];

export const fieldElement = z.string().regex(/^\d{1,78}$/, "expected a decimal field element");

export const zkProofSchema = z.object({
  merkleTreeDepth: z.number().int().min(1).max(10),
  merkleTreeRoot: fieldElement,
  nullifier: fieldElement,
  message: fieldElement,
  scope: fieldElement,
  points: z.array(fieldElement).length(8),
});

export const reportSchema = z.object({
  siteId: z.string().min(1).max(64),
  category: z.enum(categoryValues),
  zone: z.string().min(1).max(64),
  body: z.string().min(20, "Please describe the hazard in at least 20 characters.").max(2000),
  proof: zkProofSchema,
});

export const loginSchema = z.object({
  passphrase: z.string().min(1).max(200),
});

export const resolutionSchema = z.object({
  clusterId: z.string().min(1).max(200),
  kind: z.enum(["FIX", "DISCIPLINE"]),
  summary: z.string().min(12).max(1000),
  action: z.string().min(6).max(1000),
  accountableRole: z.string().min(3).max(120),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/i, "evidence hash must be SHA-256"),
  subjectRef: z
    .string()
    .regex(/^sha256:[a-f0-9]{16,64}$/i, "subject must be a salted hash")
    .optional()
    .or(z.literal("")),
});

export const attestSchema = z.object({
  clusterId: z.string().min(1).max(200),
  resolutionId: z.string().min(1).max(120),
  statement: z.string().min(10).max(500),
  oversightPassphrase: z.string().min(1).max(200),
});

export const closeSchema = z.object({
  clusterId: z.string().min(1).max(200),
  note: z.string().min(6).max(500),
});

export const enrolmentTokenSchema = z.object({
  siteId: z.string().min(1).max(64),
});

export const enrolSchema = z.object({
  token: z.string().min(10).max(4000),
  commitment: z.string().regex(/^\d{1,78}$/, "expected a field element"),
  payrollKey: z
    .string()
    .regex(/^[A-Za-z0-9+/]{43}=$/, "expected a 32-byte base64 public key"),
});
