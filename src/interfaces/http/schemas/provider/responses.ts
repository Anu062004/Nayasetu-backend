import { z } from "zod";
import { redemptionKinds } from "../../../../modules/redemption/domain/kinds.js";
import { MONEY_AMOUNT_PATTERN } from "../../../../modules/settlement/domain/quote-money.js";
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

export const providerVerificationResponseSchema = z
  .object({
    verificationCaseId: z.uuid(),
    status: z.string().min(1),
    tierOutcome: providerTierSchema.nullable(),
    currentTier: providerTierSchema,
    policyVersion: z.string().min(1).nullable(),
    decisionReasons: z.array(z.string().min(1)),
    tierExpiresAt: z.iso.datetime().nullable(),
    currentTierExpiresAt: z.iso.datetime().nullable(),
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
    amount: z.string().regex(MONEY_AMOUNT_PATTERN),
    currency: z.string().regex(/^[A-Z]{3}$/),
    feeBreakdown: z
      .object({
        professionalFee: z.string().regex(MONEY_AMOUNT_PATTERN),
        processingFee: z.string().regex(MONEY_AMOUNT_PATTERN),
        platformCommission: z.literal("0.00"),
      })
      .strict(),
  })
  .strict();

export const providerPaymentStatusResponseSchema = z
  .object({
    paymentId: z.uuid(),
    matterId: z.uuid(),
    paymentProvider: z.string().min(1),
    providerIntentReference: z.string().min(1),
    amount: z.string().regex(MONEY_AMOUNT_PATTERN),
    status: z.string().min(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const providerBookingAcceptedResponseSchema = z
  .object({
    bookingId: z.uuid(),
    status: z.literal("CONFIRMED"),
    matterId: z.uuid(),
  })
  .strict();

export const providerBookingDeclinedResponseSchema = z
  .object({
    bookingId: z.uuid(),
    status: z.literal("DECLINED"),
  })
  .strict();

export const providerBookingCancelledResponseSchema = z
  .object({
    bookingId: z.uuid(),
    status: z.literal("CANCELLED"),
  })
  .strict();
