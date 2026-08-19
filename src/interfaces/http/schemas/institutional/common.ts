import { z } from "zod";

export const institutionalProviderRecordSchema = z.object({
  providerId: z.string().uuid(),
  tier: z.enum(["SELF_DECLARED", "DOCUMENT_VERIFIED", "FULLY_VERIFIED"]),
  serviceCredits: z.number(),
  objectiveSignals: z.array(
    z.object({
      type: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
      recordedAt: z.iso.datetime(),
    }),
  ),
});
