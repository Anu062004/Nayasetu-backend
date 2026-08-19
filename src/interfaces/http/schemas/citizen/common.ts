import { z } from "zod";

export const citizenErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        requestId: z.string(),
        details: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();

export const citizenProviderSummarySchema = z
  .object({
    providerId: z.string().uuid(),
    displayName: z.string(),
    tier: z.enum(["SELF_DECLARED", "DOCUMENT_VERIFIED", "FULLY_VERIFIED"]),
    feeRange: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
    languages: z.array(z.string()),
    nextSlot: z.iso.datetime().nullable(),
  })
  .strict();

export type CitizenProviderSummary = z.infer<typeof citizenProviderSummarySchema>;
