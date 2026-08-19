import { z } from "zod";
import { institutionalProviderRecordSchema, institutionalRosterMemberSchema } from "./common.js";

export { institutionalProviderRecordSchema };

export const institutionalRosterResponseSchema = z
  .object({
    rosterId: z.uuid(),
    district: z.string().min(1),
    taxonomyCode: z.string().min(1),
    providerType: z.string().min(1),
    mode: z.literal("ROTATION"),
    members: z.array(institutionalRosterMemberSchema),
  })
  .strict();

const districtMatterCountSchema = z
  .object({
    district: z.string().min(1),
    mattersServed: z.number().int().nonnegative(),
  })
  .strict();

const grievanceResolutionSchema = z
  .object({
    total: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
  })
  .strict();

export const publicStatsResponseSchema = z
  .object({
    mattersServedByDistrict: z.array(districtMatterCountSchema),
    proBonoServiceUnitsStatewide: z.number(),
    grievanceResolution: grievanceResolutionSchema.nullable(),
    privacyMinimumCellSize: z.number().int().positive(),
  })
  .strict();
