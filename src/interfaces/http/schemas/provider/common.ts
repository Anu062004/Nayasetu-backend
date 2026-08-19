import { z } from "zod";

export const providerTierSchema = z.enum(["SELF_DECLARED", "DOCUMENT_VERIFIED", "FULLY_VERIFIED"]);

const canonicalDecimalSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);

export const providerCreditSummarySchema = z
  .object({
    providerId: z.uuid(),
    totalCredits: z.number(),
    periodCredits: z.number(),
    lastEventId: z.string().regex(/^\d+$/).nullable(),
  })
  .strict();

export const verificationCheckResponseSchema = z
  .object({
    checkType: z.string().min(1),
    sourceId: z.string().min(1),
    sourceMode: z.enum(["LIVE", "MOCK", "OFF"]),
    result: z.enum(["PASS", "MISMATCH", "NOT_FOUND", "CONFLICT", "UNAVAILABLE"]),
    demoOnly: z.boolean(),
    checkedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const providerEvidenceEventSchema = z
  .object({
    id: z.string().regex(/^\d+$/),
    eventType: z.enum([
      "PRO_BONO_MATTER_CLOSED",
      "LEGAL_AID_TIER_MATTER_CLOSED",
      "ASPIRATIONAL_BLOCK_SERVICE",
      "ROTATION_DUTY_COMPLETED",
      "FIRST_RESPONSE_SLA_MET",
      "CLE_MODULE_COMPLETED",
      "LOK_ADALAT_SETTLEMENT",
    ]),
    units: canonicalDecimalSchema,
    credits: canonicalDecimalSchema,
    weightVersion: z.string().min(1),
    evidenceRef: z.string().min(1),
    occurredAt: z.iso.datetime(),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
