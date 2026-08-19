import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeAudit } from "../../../modules/audit/application/write-audit.js";
import { assertCitizenAuthority } from "../../../modules/identity/application/assert-citizen-authority.js";
import { assertInstitutionalConsent } from "../../../modules/identity/application/assert-institutional-consent.js";
import { assertInstitutionalRosterGrant } from "../../../modules/identity/application/assert-institutional-roster-grant.js";
import { withTransaction } from "../../../shared/transaction.js";
import { requireActor } from "../actor-context.js";
import { AppError } from "../errors.js";
import { grievanceSubmissionResponseSchema } from "../schemas/citizen/responses.js";
import {
  institutionalProviderRecordSchema,
  institutionalRosterResponseSchema,
  publicStatsResponseSchema,
} from "../schemas/institutional/responses.js";
import { parseBody } from "../validation.js";

const grievanceSchema = z.object({
  subjectProviderId: z.uuid(),
  category: z.string().min(1).max(100),
});

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function registerConductInstitutionalRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/grievances", async (request, reply) => {
    const actor = requireActor(request, ["CITIZEN", "OPERATOR"]);
    const body = parseBody(grievanceSchema, request.body);
    const complainantUserId = actor.onBehalfOfCitizenId ?? actor.actorId;
    const grievance = await withTransaction(app.db, async (client) => {
      await assertCitizenAuthority(client, actor, complainantUserId);
      const result = await client.query<{ id: string; opened_at: Date }>(
        `INSERT INTO grievance(complainant_user_id, subject_provider_id, category)
         VALUES ($1,$2,$3) RETURNING id, opened_at`,
        [complainantUserId, body.subjectProviderId, body.category],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Grievance insert returned no row");
      await writeAudit(client, actor, {
        action: "grievance.opened",
        entityType: "grievance",
        entityId: row.id,
        afterSummary: {
          subjectProviderId: body.subjectProviderId,
          category: body.category,
          status: "OPEN",
        },
      });
      return row;
    });
    return reply.code(201).send(
      grievanceSubmissionResponseSchema.parse({
        submissionId: grievance.id,
        status: "OPEN",
        openedAt: grievance.opened_at.toISOString(),
      }),
    );
  });

  app.get<{ Params: { id: string } }>("/v1/institutional/providers/:id/record", async (request) => {
    const actor = requireActor(request, ["INSTITUTION"]);
    return withTransaction(app.db, async (client) => {
      const consentRef = await assertInstitutionalConsent(
        client,
        actor,
        request.params.id,
        "providers:record:read",
        headerValue(request.headers["x-consent-ref"]),
      );
      const record = await client.query<{
        provider_id: string;
        tier: string;
        total_credits: string;
        objective_signals: unknown[];
      }>(
        `SELECT p.id AS provider_id, p.tier, COALESCE(cb.total_credits, 0) AS total_credits,
                COALESCE(json_agg(json_build_object(
                  'type', cs.signal_type, 'value', cs.value, 'recordedAt', cs.recorded_at
                )) FILTER (WHERE cs.id IS NOT NULL), '[]') AS objective_signals
         FROM provider p LEFT JOIN credit_balance cb ON cb.provider_id = p.id
         LEFT JOIN conduct_signal cs ON cs.provider_id = p.id
         WHERE p.id = $1 GROUP BY p.id, cb.total_credits`,
        [request.params.id],
      );
      const row = record.rows[0];
      if (!row) throw new AppError(404, "PROVIDER_NOT_FOUND", "Provider was not found");
      await writeAudit(client, actor, {
        action: "institutional.provider_record_accessed",
        entityType: "provider",
        entityId: row.provider_id,
        reasonCode: consentRef,
      });
      return institutionalProviderRecordSchema.parse({
        providerId: row.provider_id,
        tier: row.tier,
        serviceCredits: Number(row.total_credits),
        objectiveSignals: row.objective_signals,
        consentRef,
      });
    });
  });

  app.get<{ Params: { id: string } }>("/v1/institutional/rosters/:id", async (request) => {
    const actor = requireActor(request, ["INSTITUTION", "ADMIN"]);
    await assertInstitutionalRosterGrant(app.db, actor, request.params.id, "rosters:read");
    const roster = await app.db.query<{
      id: string;
      district: string;
      taxonomy_code: string;
      provider_type: string;
      mode: string;
      members: unknown[];
    }>(
      `SELECT r.id, r.district, r.taxonomy_code, r.provider_type, r.mode,
              COALESCE(json_agg(json_build_object(
                'providerId', rm.provider_id, 'status', rm.status, 'capacity', rm.capacity,
                'activeMatters', rm.active_matters, 'lastAssignedAt', rm.last_assigned_at
              )) FILTER (WHERE rm.provider_id IS NOT NULL), '[]') AS members
       FROM roster r LEFT JOIN roster_membership rm ON rm.roster_id = r.id
       WHERE r.id = $1 GROUP BY r.id`,
      [request.params.id],
    );
    const row = roster.rows[0];
    if (!row) throw new AppError(404, "ROSTER_NOT_FOUND", "Roster was not found");
    return institutionalRosterResponseSchema.parse({
      rosterId: row.id,
      district: row.district,
      taxonomyCode: row.taxonomy_code,
      providerType: row.provider_type,
      mode: row.mode,
      members: row.members,
    });
  });

  app.get("/v1/public/stats", async () => {
    const minimumCellSize = app.config.publicStatsMinimumCellSize;
    if (minimumCellSize === undefined) {
      throw new AppError(
        503,
        "PRIVACY_POLICY_NOT_CONFIGURED",
        "Public aggregate suppression policy is not configured",
      );
    }
    const districtMatters = await app.db.query<{ district: string; matters_served: string }>(
      `SELECT n.district, count(*)::text AS matters_served
       FROM matter m JOIN allocation a ON a.id = m.allocation_id
       JOIN need_request n ON n.id = a.need_request_id
       WHERE m.status = 'CLOSED' GROUP BY n.district
       HAVING count(*) >= $1 ORDER BY n.district`,
      [minimumCellSize],
    );
    const proBono = await app.db.query<{ total: string }>(
      `SELECT COALESCE(sum(units), 0)::text AS total FROM credit_event
       WHERE event_type IN ('PRO_BONO_MATTER_CLOSED','LEGAL_AID_TIER_MATTER_CLOSED')`,
    );
    const grievanceRates = await app.db.query<{ total: string; resolved: string }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE status IN (
                'PLATFORM_RESOLVED','REFERRED_TO_BAR_COUNCIL','REFERRED_TO_DLSA'
              ))::text AS resolved FROM grievance`,
    );
    return publicStatsResponseSchema.parse({
      mattersServedByDistrict: districtMatters.rows.map((row) => ({
        district: row.district,
        mattersServed: Number(row.matters_served),
      })),
      proBonoServiceUnitsStatewide: Number(proBono.rows[0]?.total ?? 0),
      grievanceResolution:
        Number(grievanceRates.rows[0]?.total ?? 0) >= minimumCellSize
          ? {
              total: Number(grievanceRates.rows[0]?.total ?? 0),
              resolved: Number(grievanceRates.rows[0]?.resolved ?? 0),
            }
          : null,
      privacyMinimumCellSize: minimumCellSize,
    });
  });
}
