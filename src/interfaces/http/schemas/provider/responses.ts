import { z } from "zod";
import { redemptionKinds } from "../../../../modules/redemption/domain/kinds.js";
import {
  providerCreditSummarySchema,
  providerEvidenceEventSchema,
  providerTierSchema,
  verificationCheckResponseSchema,
} from "./common.js";

const reviewRequiredResponseSchema = z
  .object({
    verificationCaseId: z.uuid(),
    status: z.literal("REVIEW_REQUIRED"),
  })
  .strict();

export const providerCreatedResponseSchema = z
  .object({
    providerId: z.uuid(),
    tier: z.literal("SELF_DECLARED"),
    status: z.string().min(1),
  })
  .strict();

export const issuerFetchResponseSchema = reviewRequiredResponseSchema
  .extend({
    sourceMode: z.enum(["LIVE", "MOCK", "OFF"]),
    result: z.literal("UNAVAILABLE"),
    demoOnly: z.boolean(),
  })
  .strict();

export const credentialUploadResponseSchema = reviewRequiredResponseSchema;

export const providerVerificationResponseSchema = z
  .object({
    verificationCaseId: z.uuid(),
    status: z.string().min(1),
    tierOutcome: providerTierSchema.nullable(),
    submittedAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
    checks: z.array(verificationCheckResponseSchema),
  })
  .strict();

export { providerCreditSummarySchema };

export const evidencePayloadSchema = z
  .object({
    artifactId: z.uuid(),
    kind: z.enum(redemptionKinds),
    providerId: z.uuid(),
    issuedAt: z.iso.datetime(),
    disclaimer: z.string().min(1),
    events: z.array(providerEvidenceEventSchema),
  })
  .strict();

export const signedEvidenceResponseSchema = z
  .object({
    payload: evidencePayloadSchema,
    signatureAlgorithm: z.literal("HMAC-SHA256"),
    signature: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const redemptionResponseSchema = z
  .object({
    redemptionId: z.uuid(),
    issuedAt: z.iso.datetime(),
    payload: evidencePayloadSchema,
    signatureAlgorithm: z.literal("HMAC-SHA256"),
    signature: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const paymentQuoteResponseSchema = z
  .object({
    quoteId: z.uuid(),
    amount: z.number().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    feeBreakdown: z
      .object({
        professionalFee: z.number().nonnegative(),
        processingFee: z.number().nonnegative(),
        platformCommission: z.literal(0),
      })
      .strict(),
  })
  .strict();
