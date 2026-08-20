import { z } from "zod";

const mode = z.enum(["LIVE", "MOCK", "OFF"]);
const optionalPositiveIntegerString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .optional(),
);
const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalUuidString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.uuid().optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().min(1),
  DATABASE_EXPECTED_USER: optionalNonEmptyString,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  AUTH_MODE: z.enum(["SESSION", "HEADER", "OFF"]).default("OFF"),
  SESSION_TOKEN_PEPPER: z.string().optional(),
  CREDENTIAL_DIGILOCKER_MODE: mode.default("OFF"),
  CREDENTIAL_BAR_MODE: mode.default("OFF"),
  CREDENTIAL_AIBE_MODE: mode.default("OFF"),
  CASE_STATUS_MODE: z.enum(["LIVE", "LINK_ONLY", "OFF"]).default("LINK_ONLY"),
  PAYMENTS_MODE: z.enum(["LIVE", "SANDBOX", "OFF"]).default("OFF"),
  IVR_MODE: mode.default("OFF"),
  WHATSAPP_MODE: mode.default("OFF"),
  INSTITUTIONAL_EXPORT_MODE: z.enum(["LOCAL", "LIVE", "OFF"]).default("LOCAL"),
  ECOURTS_PUBLIC_URL: z.url().default("https://services.ecourts.gov.in/"),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  EVIDENCE_SIGNING_SECRET: z.string().optional(),
  TAXONOMY_CODES: z.string().default(""),
  PROVIDER_INITIAL_STATUS: optionalNonEmptyString,
  PROVIDER_ACTIVE_STATUSES: z.string().default(""),
  DISTRICT_FEE_FLOORS_JSON: z.string().default("{}"),
  CREDENTIAL_REVALIDATION_ACTOR_ID: optionalUuidString,
  PUBLIC_STATS_MIN_CELL_SIZE: optionalPositiveIntegerString,
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = environmentSchema.parse(environment);
  const mockCapabilities = [
    parsed.CREDENTIAL_DIGILOCKER_MODE,
    parsed.CREDENTIAL_BAR_MODE,
    parsed.CREDENTIAL_AIBE_MODE,
    parsed.IVR_MODE,
    parsed.WHATSAPP_MODE,
  ].filter((value) => value === "MOCK");

  if (parsed.NODE_ENV === "production" && mockCapabilities.length > 0) {
    throw new Error("Production startup rejects MOCK capability modes");
  }
  if (parsed.NODE_ENV === "production" && parsed.AUTH_MODE !== "SESSION") {
    throw new Error("Production startup requires database-backed session authentication");
  }
  if (parsed.NODE_ENV === "production" && !parsed.DATABASE_EXPECTED_USER) {
    throw new Error("Production startup requires DATABASE_EXPECTED_USER");
  }
  if (
    parsed.AUTH_MODE === "SESSION" &&
    (!parsed.SESSION_TOKEN_PEPPER || parsed.SESSION_TOKEN_PEPPER.length < 32)
  ) {
    throw new Error("SESSION_TOKEN_PEPPER must contain at least 32 characters in SESSION mode");
  }

  let districtFeeFloors: Record<string, number>;
  try {
    districtFeeFloors = z
      .record(z.string(), z.number().nonnegative())
      .parse(JSON.parse(parsed.DISTRICT_FEE_FLOORS_JSON));
  } catch {
    throw new Error("DISTRICT_FEE_FLOORS_JSON must be a JSON object of non-negative numbers");
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    databaseExpectedUser: parsed.DATABASE_EXPECTED_USER,
    databasePoolMax: parsed.DATABASE_POOL_MAX,
    logLevel: parsed.LOG_LEVEL,
    authMode: parsed.AUTH_MODE,
    sessionTokenPepper: parsed.SESSION_TOKEN_PEPPER,
    taxonomyCodes: new Set(
      parsed.TAXONOMY_CODES.split(",")
        .map((code) => code.trim())
        .filter(Boolean),
    ),
    providerInitialStatus: parsed.PROVIDER_INITIAL_STATUS,
    providerActiveStatuses: parsed.PROVIDER_ACTIVE_STATUSES.split(",")
      .map((status) => status.trim())
      .filter(Boolean),
    districtFeeFloors,
    credentialRevalidationActorId: parsed.CREDENTIAL_REVALIDATION_ACTOR_ID,
    publicStatsMinimumCellSize: parsed.PUBLIC_STATS_MIN_CELL_SIZE
      ? Number(parsed.PUBLIC_STATS_MIN_CELL_SIZE)
      : undefined,
    capabilities: {
      credentialDigiLocker: parsed.CREDENTIAL_DIGILOCKER_MODE,
      credentialBar: parsed.CREDENTIAL_BAR_MODE,
      credentialAibe: parsed.CREDENTIAL_AIBE_MODE,
      caseStatus: parsed.CASE_STATUS_MODE,
      payments: parsed.PAYMENTS_MODE,
      ivr: parsed.IVR_MODE,
      whatsapp: parsed.WHATSAPP_MODE,
      institutionalExport: parsed.INSTITUTIONAL_EXPORT_MODE,
    },
    ecourtsPublicUrl: parsed.ECOURTS_PUBLIC_URL,
    paymentWebhookSecret: parsed.PAYMENT_WEBHOOK_SECRET,
    evidenceSigningSecret: parsed.EVIDENCE_SIGNING_SECRET,
  };
}
