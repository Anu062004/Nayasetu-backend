import { z } from "zod";
import { citizenProviderSummarySchema } from "./common.js";

const uuid = z.uuid();

export const needCreatedResponseSchema = z
  .object({
    requestId: uuid,
    route: z.enum(["PAID", "LEGAL_AID_REFERRAL", "PRO_BONO_ROTATION"]),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const referralResponseSchema = z
  .object({
    requestId: uuid,
    route: z.enum(["LEGAL_AID_REFERRAL", "PRO_BONO_ROTATION"]),
    status: z.literal("REFERRAL_REQUIRED"),
  })
  .strict();

export const directoryResponseSchema = z
  .object({
    requestId: uuid,
    filterSummary: z
      .object({
        category: z.string(),
        district: z.string(),
        language: z.string(),
        feeCeiling: z.number().nonnegative().nullable(),
      })
      .strict(),
    providerCount: z.number().int().nonnegative(),
    providers: z.array(citizenProviderSummarySchema),
    ordering: z.literal("ROTATED"),
    seed: z.string(),
  })
  .strict();

export const allocationResponseSchema = z.discriminatedUnion("mode", [
  z.object({ allocationId: uuid, mode: z.literal("CITIZEN_CHOICE") }).strict(),
  z.object({ allocationId: uuid, providerId: uuid, mode: z.literal("ROTATION") }).strict(),
]);

export const providerSlotsResponseSchema = z
  .object({
    providerId: uuid,
    availabilityPolicy: z.literal("NOT_CONFIGURED"),
    slots: z.array(z.never()),
  })
  .strict();

export const bookingStateResponseSchema = z
  .object({
    bookingId: uuid,
    status: z.enum(["HELD", "DECLINED", "CANCELLED"]),
  })
  .strict();

export const matterCloseResponseSchema = z
  .object({
    matterId: uuid,
    status: z.literal("CLOSED"),
  })
  .strict();

const caseStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("LINK_REQUIRED"), url: z.url() }).strict(),
  z.object({ status: z.literal("UNAVAILABLE") }).strict(),
  z.object({ status: z.literal("LIVE_RESULT"), data: z.record(z.string(), z.unknown()) }).strict(),
]);

export const matterStatusResponseSchema = z
  .object({
    matterId: uuid,
    matterStatus: z.string(),
    caseStatus: caseStatusSchema,
  })
  .strict();

export const grievanceSubmissionResponseSchema = z
  .object({
    submissionId: uuid,
    status: z.literal("OPEN"),
    openedAt: z.iso.datetime(),
  })
  .strict();

export const paymentStatusResponseSchema = z
  .object({
    paymentId: uuid,
    matterId: uuid,
    paymentProvider: z.string(),
    providerIntentReference: z.string(),
    amount: z.number().nonnegative(),
    status: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
