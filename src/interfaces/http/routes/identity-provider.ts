import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeAudit } from "../../../modules/audit/application/write-audit.js";
import { recordUnavailableSourceCheck } from "../../../modules/credential/application/record-source-unavailable.js";
import { assertInstitutionalConsent } from "../../../modules/identity/application/assert-institutional-consent.js";
import { assertProviderWriteAuthority } from "../../../modules/identity/application/assert-provider-authority.js";
import type { DatabaseClient } from "../../../shared/database.js";
import { withTransaction } from "../../../shared/transaction.js";
import { requireActor } from "../actor-context.js";
import { AppError } from "../errors.js";
import {
  issuerFetchResponseSchema,
  providerCreatedResponseSchema,
  providerVerificationResponseSchema,
} from "../schemas/provider/responses.js";
import { parseBody } from "../validation.js";

const delegationSchema = z.object({
  citizenUserId: z.uuid(),
  consentRef: z.string().min(1).max(500),
});

const providerSchema = z.object({
  userId: z.uuid(),
  providerType: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  district: z.string().min(1).max(200),
  state: z.string().min(1).max(200),
  languages: z.array(z.string().min(1).max(40)).max(30),
  serviceModes: z.array(z.string().min(1).max(40)).max(20),
  services: z
    .array(
      z.object({
        taxonomyCode: z.string().min(1).max(100),
        feeMin: z.number().nonnegative(),
        feeMax: z.number().nonnegative(),
        proBonoAvailable: z.boolean(),
      }),
    )
    .max(100),
});

const issuerFetchSchema = z.object({
  source: z.enum(["DIGILOCKER", "BAR", "AIBE"]),
  checkType: z.string().min(1).max(100),
});

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function registerIdentityProviderRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/v1/auth/otp/request",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async () => {
      throw new AppError(503, "CAPABILITY_UNAVAILABLE", "No OTP provider adapter is configured");
    },
  );

  app.post(
    "/v1/auth/otp/verify",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async () => {
      throw new AppError(503, "CAPABILITY_UNAVAILABLE", "No OTP provider adapter is configured");
    },
  );

  app.post("/v1/auth/delegation", async (request, reply) => {
    const actor = requireActor(request, ["OPERATOR"]);
    const body = parseBody(delegationSchema, request.body);
    const result = await withTransaction(app.db, async (client) => {
      const citizen = await client.query(
        "SELECT 1 FROM role_grant WHERE user_id = $1 AND role = 'CITIZEN'",
        [body.citizenUserId],
      );
      if (!citizen.rowCount)
        throw new AppError(404, "CITIZEN_NOT_FOUND", "Citizen role was not found");
      const inserted = await client.query<{ id: string; started_at: Date }>(
        `INSERT INTO operator_delegation(operator_user_id, citizen_user_id, consent_ref)
         VALUES ($1,$2,$3) RETURNING id, started_at`,
        [actor.actorId, body.citizenUserId, body.consentRef],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Delegation insert returned no row");
      await writeAudit(client, actor, {
        action: "delegation.opened",
        entityType: "operator_delegation",
        entityId: row.id,
        afterSummary: { citizenUserId: body.citizenUserId, consentRef: body.consentRef },
      });
      return row;
    });
    return reply
      .code(201)
      .send({ delegationId: result.id, startedAt: result.started_at.toISOString() });
  });

  app.delete<{ Params: { id: string } }>("/v1/auth/delegation/:id", async (request) => {
    const actor = requireActor(request, ["OPERATOR"]);
    return withTransaction(app.db, async (client) => {
      const result = await client.query<{ id: string; ended_at: Date }>(
        `UPDATE operator_delegation SET ended_at = now()
         WHERE id = $1 AND operator_user_id = $2 AND ended_at IS NULL
         RETURNING id, ended_at`,
        [request.params.id, actor.actorId],
      );
      const row = result.rows[0];
      if (!row)
        throw new AppError(404, "ACTIVE_DELEGATION_NOT_FOUND", "Active delegation was not found");
      await writeAudit(client, actor, {
        action: "delegation.closed",
        entityType: "operator_delegation",
        entityId: row.id,
      });
      return { delegationId: row.id, endedAt: row.ended_at.toISOString() };
    });
  });

  app.post("/v1/providers", async (request, reply) => {
    const actor = requireActor(request, ["PROVIDER", "ADMIN"]);
    const body = parseBody(providerSchema, request.body);
    if (!app.config.providerInitialStatus) {
      throw new AppError(
        503,
        "PROVIDER_STATUS_POLICY_NOT_CONFIGURED",
        "The initial provider status policy has not been supplied",
      );
    }
    if (actor.actorType === "PROVIDER" && actor.actorId !== body.userId) {
      throw new AppError(403, "FORBIDDEN", "Providers may create only their own profile");
    }
    for (const service of body.services) {
      if (service.feeMax < service.feeMin) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "feeMax must be greater than or equal to feeMin",
        );
      }
      if (app.config.taxonomyCodes.size === 0) {
        throw new AppError(
          503,
          "TAXONOMY_NOT_CONFIGURED",
          "Provider services require a configured taxonomy dataset",
        );
      }
      if (!app.config.taxonomyCodes.has(service.taxonomyCode)) {
        throw new AppError(
          422,
          "UNKNOWN_TAXONOMY_CODE",
          "A provider service uses a code outside the configured taxonomy",
        );
      }
    }
    const provider = await withTransaction(app.db, async (client) => {
      const providerRole = await client.query(
        "SELECT 1 FROM role_grant WHERE user_id = $1 AND role = 'PROVIDER'",
        [body.userId],
      );
      if (!providerRole.rowCount) {
        throw new AppError(404, "PROVIDER_ROLE_NOT_FOUND", "Provider role grant was not found");
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO provider(
           user_id, provider_type, display_name, district, state, languages, service_modes, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          body.userId,
          body.providerType,
          body.displayName,
          body.district,
          body.state,
          body.languages,
          body.serviceModes,
          app.config.providerInitialStatus,
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Provider insert returned no row");
      for (const service of body.services) {
        await client.query(
          `INSERT INTO provider_service(provider_id, taxonomy_code, fee_min, fee_max, pro_bono_available)
           VALUES ($1,$2,$3,$4,$5)`,
          [row.id, service.taxonomyCode, service.feeMin, service.feeMax, service.proBonoAvailable],
        );
      }
      await client.query("INSERT INTO credit_balance(provider_id) VALUES ($1)", [row.id]);
      await client.query("INSERT INTO provider_surface_counter(provider_id) VALUES ($1)", [row.id]);
      await writeAudit(client, actor, {
        action: "provider.created",
        entityType: "provider",
        entityId: row.id,
        afterSummary: {
          providerType: body.providerType,
          district: body.district,
          state: body.state,
        },
      });
      return row;
    });
    return reply.code(201).send(
      providerCreatedResponseSchema.parse({
        providerId: provider.id,
        tier: "SELF_DECLARED",
        status: app.config.providerInitialStatus,
      }),
    );
  });

  app.post<{ Params: { id: string } }>(
    "/v1/providers/:id/credentials/issuer-fetch",
    async (request, reply) => {
      const actor = requireActor(request, ["PROVIDER", "ADMIN"]);
      const body = parseBody(issuerFetchSchema, request.body);
      await assertProviderWriteAuthority(app.db, actor, request.params.id);
      const configuredMode = {
        DIGILOCKER: app.config.capabilities.credentialDigiLocker,
        BAR: app.config.capabilities.credentialBar,
        AIBE: app.config.capabilities.credentialAibe,
      }[body.source];
      if (configuredMode === "LIVE") {
        throw new AppError(
          503,
          "ADAPTER_NOT_IMPLEMENTED",
          "A live authorized adapter has not been supplied",
        );
      }
      const result = await withTransaction(app.db, (client) =>
        recordUnavailableSourceCheck(client, actor, {
          providerId: request.params.id,
          checkType: body.checkType,
          sourceId: body.source,
          sourceMode: configuredMode,
        }),
      );
      return reply.code(202).send(
        issuerFetchResponseSchema.parse({
          verificationCaseId: result.verificationCaseId,
          status: "REVIEW_REQUIRED",
          sourceMode: configuredMode,
          result: "UNAVAILABLE",
          demoOnly: configuredMode === "MOCK",
        }),
      );
    },
  );

  app.post<{ Params: { id: string } }>("/v1/providers/:id/credentials/upload", async (request) => {
    const actor = requireActor(request, ["PROVIDER", "ADMIN"]);
    await assertProviderWriteAuthority(app.db, actor, request.params.id);
    throw new AppError(
      503,
      "CREDENTIAL_PROCESSOR_NOT_CONFIGURED",
      "No approved synchronous credential processor or encrypted review store is configured",
    );
  });

  app.get<{ Params: { id: string } }>("/v1/providers/:id/verification", async (request) => {
    const actor = requireActor(request, ["PROVIDER", "ADMIN", "INSTITUTION"]);
    if (actor.actorType === "PROVIDER") {
      await assertProviderWriteAuthority(app.db, actor, request.params.id);
    }
    const readVerification = async (database: DatabaseClient) => {
      const result = await database.query<{
        id: string;
        status: string;
        tier_outcome: string | null;
        policy_version: string | null;
        decision_reasons: string[];
        tier_expires_at: Date | null;
        current_tier: string;
        current_tier_expires_at: Date | null;
        submitted_at: Date;
        decided_at: Date | null;
        checks: unknown[];
      }>(
        `SELECT vc.id, vc.status, vc.tier_outcome, vc.policy_version, vc.decision_reasons,
                vc.tier_expires_at, vc.submitted_at, vc.decided_at,
                CASE
                  WHEN p.tier = 'FULLY_VERIFIED'
                    AND (p.tier_expires_at IS NULL OR p.tier_expires_at <= now())
                    THEN 'DOCUMENT_VERIFIED'
                  ELSE p.tier
                END AS current_tier,
                CASE
                  WHEN p.tier = 'FULLY_VERIFIED'
                    AND (p.tier_expires_at IS NULL OR p.tier_expires_at <= now())
                    THEN NULL
                  ELSE p.tier_expires_at
                END AS current_tier_expires_at,
                COALESCE(json_agg(json_build_object(
                  'checkType', chk.check_type, 'sourceId', chk.source_id,
                  'sourceMode', chk.source_mode, 'result', chk.result,
                  'demoOnly', chk.demo_only, 'checkedAt', chk.checked_at
                )) FILTER (WHERE chk.id IS NOT NULL), '[]') AS checks
         FROM verification_case vc
         JOIN provider p ON p.id = vc.provider_id
         LEFT JOIN verification_check chk ON chk.case_id = vc.id
         WHERE vc.provider_id = $1
         GROUP BY vc.id, p.tier, p.tier_expires_at
         ORDER BY vc.submitted_at DESC LIMIT 1`,
        [request.params.id],
      );
      const row = result.rows[0];
      if (!row)
        throw new AppError(404, "VERIFICATION_NOT_FOUND", "Verification case was not found");
      return row;
    };
    const row =
      actor.actorType === "INSTITUTION"
        ? await withTransaction(app.db, async (client) => {
            const consentRef = await assertInstitutionalConsent(
              client,
              actor,
              request.params.id,
              "providers:record:read",
              headerValue(request.headers["x-consent-ref"]),
            );
            const verification = await readVerification(client);
            await writeAudit(client, actor, {
              action: "institutional.provider_verification_accessed",
              entityType: "provider",
              entityId: request.params.id,
              reasonCode: consentRef,
            });
            return verification;
          })
        : await readVerification(app.db);
    return providerVerificationResponseSchema.parse({
      verificationCaseId: row.id,
      status: row.status,
      tierOutcome: row.tier_outcome,
      currentTier: row.current_tier,
      policyVersion: row.policy_version,
      decisionReasons: row.decision_reasons,
      tierExpiresAt: row.tier_expires_at?.toISOString() ?? null,
      currentTierExpiresAt: row.current_tier_expires_at?.toISOString() ?? null,
      submittedAt: row.submitted_at.toISOString(),
      decidedAt: row.decided_at?.toISOString() ?? null,
      checks: row.checks,
    });
  });
}
