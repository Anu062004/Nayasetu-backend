import { z } from "zod";

export const providerCreditSummarySchema = z.object({
  providerId: z.string().uuid(),
  totalCredits: z.number(),
  periodCredits: z.number(),
  lastEventId: z.string().nullable(),
});
