import { z } from "zod";
import { providerTierSchema } from "../provider/common.js";

export const institutionalObjectiveSignalSchema = z
  .object({
    type: z.enum([
      "FIRST_RESPONSE_MINUTES",
      "NO_SHOW",
      "FEE_DISCLOSED_UPFRONT",
      "QUOTE_HONOURED",
      "UNILATERAL_WITHDRAWAL",
      "ROTATION_DECLINE",
    ]),
    value: z.json(),
    recordedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const institutionalProviderRecordSchema = z
  .object({
    providerId: z.uuid(),
    tier: providerTierSchema,
    serviceCredits: z.number(),
    objectiveSignals: z.array(institutionalObjectiveSignalSchema),
    consentRef: z.string().min(1),
  })
  .strict();

export const institutionalRosterMemberSchema = z
  .object({
    providerId: z.uuid(),
    status: z.string().min(1),
    capacity: z.number().int().nonnegative(),
    activeMatters: z.number().int().nonnegative(),
    lastAssignedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
