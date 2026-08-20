import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { orderDirectoryCandidates } from "../../../modules/allocation/domain/directory-order.js";
import { writeAudit } from "../../../modules/audit/application/write-audit.js";
import { decideEligibility } from "../../../modules/eligibility/domain/route.js";
import { assertCitizenAuthority } from "../../../modules/identity/application/assert-citizen-authority.js";
import { assertInstitutionalRosterGrant } from "../../../modules/identity/application/assert-institutional-roster-grant.js";
import { redactIntakeNarrative } from "../../../modules/intake/domain/redact.js";
import { withTransaction } from "../../../shared/transaction.js";
import { requireActor } from "../actor-context.js";
import { AppError } from "../errors.js";
import {
  allocationResponseSchema,
  directoryResponseSchema,
  needCreatedResponseSchema,
  referralResponseSchema,
} from "../schemas/citizen/responses.js";
import { parseBody } from "../validation.js";

const needSchema = z.object({
  citizenUserId: z.uuid(),
  taxonomyCode: z.string().min(1).max(100).optional(),
  narrative: z.string().min(1).max(10_000).optional(),
  district: z.string().min(1).max(200),
  language: z.string().min(1).max(40),
  modePreference: z.string().min(1).max(40),
  feeCeiling: z.number().nonnegative().optional(),
  urgency: z.string().min(1).max(40),
  channel: z.string().min(1).max(40),
  selfDeclaredSection12Category: z.string().min(1).max(100).optional(),
});

const directoryQuerySchema = z.object({
  providerType: z.string().min(1).max(100),
  minimumTier: z.enum(["SELF_DECLARED", "DOCUMENT_VERIFIED", "FULLY_VERIFIED"]),
});

const selectSchema = z.object({ providerId: z.uuid() });
const rotateSchema = z.object({ rosterId: z.uuid() });

interface NeedRow {
  id: string;
  citizen_user_id: string;
  taxonomy_code: string;
  district: string;
  language: string;
  mode_pref: string;
  fee_ceiling: string | null;
  directory_provider_type: string | null;
  directory_minimum_tier: string | null;
  directory_generated_at: Date | null;
  route: "PAID" | "LEGAL_AID_REFERRAL" | "PRO_BONO_ROTATION";
}

interface DirectoryProviderRow {
  provider_id: string;
  display_name: string;
  tier: string;
  languages: string[];
  fee_min: string;
  fee_max: string;
  surfaced_count?: string;
}

export async function registerIntakeAllocationRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/needs", async (request, reply) => {
    const actor = requireActor(request, ["CITIZEN", "OPERATOR"]);
    const body = parseBody(needSchema, request.body);
    if (!body.taxonomyCode) {
      if (body.narrative) redactIntakeNarrative(body.narrative);
      throw new AppError(
        503,
        "CLASSIFIER_UNAVAILABLE",
        "A reviewed taxonomy code is required because no LLM classifier adapter is configured",
      );
    }
    if (app.config.taxonomyCodes.size === 0) {
      throw new AppError(
        503,
        "TAXONOMY_NOT_CONFIGURED",
        "The reviewed taxonomy dataset is not configured",
      );
    }
    if (!app.config.taxonomyCodes.has(body.taxonomyCode)) {
      throw new AppError(
        422,
        "UNKNOWN_TAXONOMY_CODE",
        "Taxonomy code is outside the configured closed set",
      );
    }

    if (body.narrative) redactIntakeNarrative(body.narrative);
    const floorKey = `${body.district}:${body.taxonomyCode}`;
    const floor = app.config.districtFeeFloors[floorKey];
    if (
      !body.selfDeclaredSection12Category &&
      body.feeCeiling !== undefined &&
      floor === undefined
    ) {
      throw new AppError(
        503,
        "ELIGIBILITY_POLICY_NOT_CONFIGURED",
        "District fee floor is required before routing this request",
      );
    }
    const decision = decideEligibility({
      ...(body.selfDeclaredSection12Category
        ? { selfDeclaredSection12Category: body.selfDeclaredSection12Category }
        : {}),
      ...(body.feeCeiling !== undefined ? { feeCeiling: body.feeCeiling } : {}),
      ...(floor !== undefined ? { districtFloor: floor } : {}),
    });

    const result = await withTransaction(app.db, async (client) => {
      await assertCitizenAuthority(client, actor, body.citizenUserId);
      const need = await client.query<{ id: string; created_at: Date }>(
        `INSERT INTO need_request(
           citizen_user_id, operator_delegation_id, taxonomy_code, district, language,
           mode_pref, fee_ceiling, urgency, channel
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, created_at`,
        [
          body.citizenUserId,
          actor.delegationId ?? null,
          body.taxonomyCode,
          body.district,
          body.language,
          body.modePreference,
          body.feeCeiling ?? null,
          body.urgency,
          body.channel,
        ],
      );
      const row = need.rows[0];
      if (!row) throw new Error("Need insert returned no row");
      await client.query(
        `INSERT INTO eligibility_decision(
           need_request_id, section12_category, self_declared, route
         ) VALUES ($1,$2,$3,$4)`,
        [row.id, decision.section12Category ?? null, decision.selfDeclared, decision.route],
      );
      await writeAudit(client, actor, {
        action: "need.created_and_routed",
        entityType: "need_request",
        entityId: row.id,
        afterSummary: {
          taxonomyCode: body.taxonomyCode,
          district: body.district,
          channel: body.channel,
          route: decision.route,
        },
      });
      return row;
    });
    return reply.code(201).send(
      needCreatedResponseSchema.parse({
        requestId: result.id,
        route: decision.route,
        createdAt: result.created_at.toISOString(),
      }),
    );
  });

  app.get<{ Params: { id: string } }>("/v1/needs/:id/referral", async (request) => {
    const actor = requireActor(request, ["CITIZEN", "OPERATOR"]);
    const result = await app.db.query<NeedRow>(
      `SELECT n.*, e.route FROM need_request n
       JOIN eligibility_decision e ON e.need_request_id = n.id WHERE n.id = $1`,
      [request.params.id],
    );
    const need = result.rows[0];
    if (!need) throw new AppError(404, "NEED_NOT_FOUND", "Need request was not found");
    await assertCitizenAuthority(app.db, actor, need.citizen_user_id);
    if (need.route === "PAID")
      throw new AppError(409, "REFERRAL_NOT_APPLICABLE", "Request is routed to paid directory");
    return referralResponseSchema.parse({
      requestId: need.id,
      route: need.route,
      status: "REFERRAL_REQUIRED",
    });
  });

  app.get<{ Params: { id: string }; Querystring: unknown }>(
    "/v1/needs/:id/directory",
    async (request) => {
      const actor = requireActor(request, ["CITIZEN", "OPERATOR"]);
      const query = parseBody(directoryQuerySchema, request.query);
      const needResult = await app.db.query<NeedRow>(
        `SELECT n.*, e.route FROM need_request n
       JOIN eligibility_decision e ON e.need_request_id = n.id WHERE n.id = $1`,
        [request.params.id],
      );
      const need = needResult.rows[0];
      if (!need) throw new AppError(404, "NEED_NOT_FOUND", "Need request was not found");
      await assertCitizenAuthority(app.db, actor, need.citizen_user_id);
      if (need.route !== "PAID") {
        throw new AppError(
          409,
          "DIRECTORY_NOT_ALLOWED",
          "This request is routed away from paid directory",
        );
      }
      if (app.config.providerActiveStatuses.length === 0) {
        throw new AppError(
          503,
          "PROVIDER_STATUS_POLICY_NOT_CONFIGURED",
          "Directory-visible provider statuses have not been supplied",
        );
      }

      const providers = await withTransaction(app.db, async (client) => {
        await assertCitizenAuthority(client, actor, need.citizen_user_id);
        const lockedNeed = await client.query<{
          directory_provider_type: string | null;
          directory_minimum_tier: string | null;
          directory_generated_at: Date | null;
        }>(
          `SELECT directory_provider_type, directory_minimum_tier, directory_generated_at
           FROM need_request WHERE id = $1 FOR UPDATE`,
          [need.id],
        );
        const directoryState = lockedNeed.rows[0];
        if (!directoryState)
          throw new AppError(404, "NEED_NOT_FOUND", "Need request was not found");
        if (
          directoryState.directory_provider_type !== null &&
          (directoryState.directory_provider_type !== query.providerType ||
            directoryState.directory_minimum_tier !== query.minimumTier)
        ) {
          throw new AppError(
            409,
            "DIRECTORY_FILTER_MISMATCH",
            "The persisted directory was generated with different filters",
          );
        }
        if (directoryState.directory_generated_at) {
          const existing = await client.query<{ provider_snapshot: DirectoryProviderRow }>(
            `SELECT provider_snapshot FROM directory_surface
             WHERE need_request_id = $1 ORDER BY position`,
            [need.id],
          );
          return existing.rows.map((row) => row.provider_snapshot);
        }
        await client.query(
          `UPDATE need_request SET directory_provider_type = $2, directory_minimum_tier = $3
           WHERE id = $1`,
          [need.id, query.providerType, query.minimumTier],
        );

        const candidates = await client.query<DirectoryProviderRow & { surfaced_count: string }>(
          `SELECT p.id AS provider_id, p.display_name, p.tier, p.languages,
                ps.fee_min, ps.fee_max, COALESCE(sc.surfaced_count, 0) AS surfaced_count
         FROM provider p
         JOIN provider_service ps ON ps.provider_id = p.id
         LEFT JOIN provider_surface_counter sc ON sc.provider_id = p.id
         WHERE p.provider_type = $1
           AND p.status = ANY($8::text[])
           AND ps.taxonomy_code = $2
           AND p.district = $3
           AND $4 = ANY(p.languages)
           AND $5 = ANY(p.service_modes)
           AND ($6::numeric IS NULL OR ps.fee_min <= $6)
           AND (CASE p.tier WHEN 'SELF_DECLARED' THEN 1 WHEN 'DOCUMENT_VERIFIED' THEN 2
                            WHEN 'FULLY_VERIFIED' THEN 3 ELSE 0 END) >=
               (CASE $7 WHEN 'SELF_DECLARED' THEN 1 WHEN 'DOCUMENT_VERIFIED' THEN 2
                        WHEN 'FULLY_VERIFIED' THEN 3 ELSE 4 END)
           AND (
             p.tier <> 'FULLY_VERIFIED' OR
             p.tier_expires_at > now()
           )`,
          [
            query.providerType,
            need.taxonomy_code,
            need.district,
            need.language,
            need.mode_pref,
            need.fee_ceiling,
            query.minimumTier,
            app.config.providerActiveStatuses,
          ],
        );
        const ordered = orderDirectoryCandidates(
          need.id,
          candidates.rows.map((candidate) => ({
            providerId: candidate.provider_id,
            surfacedCount: Number(candidate.surfaced_count),
          })),
        );
        for (const [index, candidate] of ordered.entries()) {
          const source = candidates.rows.find((row) => row.provider_id === candidate.providerId);
          if (!source) throw new Error("Ordered directory candidate was not found");
          const providerSnapshot = {
            provider_id: source.provider_id,
            display_name: source.display_name,
            tier: source.tier,
            fee_min: source.fee_min,
            fee_max: source.fee_max,
            languages: source.languages,
          };
          await client.query(
            `INSERT INTO directory_surface(
             need_request_id, provider_id, position, seed, surfaced_count_snapshot,
             provider_snapshot, filter_snapshot
           ) VALUES ($1,$2,$3,$1,$4,$5,$6)`,
            [
              need.id,
              candidate.providerId,
              index + 1,
              candidate.surfacedCount,
              providerSnapshot,
              { providerType: query.providerType, minimumTier: query.minimumTier },
            ],
          );
          await client.query(
            `UPDATE provider_surface_counter SET surfaced_count = surfaced_count + 1 WHERE provider_id = $1`,
            [candidate.providerId],
          );
        }
        await client.query("UPDATE need_request SET directory_generated_at = now() WHERE id = $1", [
          need.id,
        ]);
        await writeAudit(client, actor, {
          action: "directory.surfaced",
          entityType: "need_request",
          entityId: need.id,
          afterSummary: { providerCount: ordered.length, ordering: "ROTATED", seed: need.id },
        });
        const rowById = new Map(
          candidates.rows.map((candidate) => [candidate.provider_id, candidate]),
        );
        return ordered.map((candidate) => {
          const row = rowById.get(candidate.providerId);
          if (!row) throw new Error("Ordered directory candidate was not found");
          return row;
        });
      });

      return directoryResponseSchema.parse({
        requestId: need.id,
        filterSummary: {
          category: need.taxonomy_code,
          district: need.district,
          language: need.language,
          feeCeiling: need.fee_ceiling === null ? null : Number(need.fee_ceiling),
        },
        providerCount: providers.length,
        providers: providers.map((provider) => ({
          providerId: provider.provider_id,
          displayName: provider.display_name,
          tier: provider.tier,
          feeRange: [Number(provider.fee_min), Number(provider.fee_max)],
          languages: provider.languages,
          nextSlot: null,
        })),
        ordering: "ROTATED",
        seed: need.id,
      });
    },
  );

  app.post<{ Params: { id: string } }>("/v1/needs/:id/select", async (request, reply) => {
    const actor = requireActor(request, ["CITIZEN", "OPERATOR"]);
    const body = parseBody(selectSchema, request.body);
    const result = await withTransaction(app.db, async (client) => {
      const needResult = await client.query<NeedRow>(
        `SELECT n.*, e.route FROM need_request n JOIN eligibility_decision e ON e.need_request_id = n.id
         WHERE n.id = $1 FOR UPDATE`,
        [request.params.id],
      );
      const need = needResult.rows[0];
      if (!need) throw new AppError(404, "NEED_NOT_FOUND", "Need request was not found");
      await assertCitizenAuthority(client, actor, need.citizen_user_id);
      if (need.route !== "PAID")
        throw new AppError(409, "CITIZEN_SELECTION_NOT_ALLOWED", "Request uses rotation/referral");
      const surface = await client.query<{ position: number; seed: string }>(
        "SELECT position, seed FROM directory_surface WHERE need_request_id = $1 AND provider_id = $2",
        [need.id, body.providerId],
      );
      const surfaced = surface.rows[0];
      if (!surfaced)
        throw new AppError(
          400,
          "PROVIDER_NOT_SURFACED",
          "Provider was not in the persisted directory",
        );
      if (!need.directory_provider_type || !need.directory_minimum_tier) {
        throw new AppError(
          409,
          "DIRECTORY_STATE_INCOMPLETE",
          "The persisted directory filters are incomplete",
        );
      }
      const currentEligibility = await client.query<{ eligible: boolean }>(
        `SELECT true AS eligible
           FROM provider p
           JOIN provider_service ps ON ps.provider_id = p.id
           WHERE p.id = $1
             AND p.provider_type = $2
             AND p.status = ANY($3::text[])
             AND ps.taxonomy_code = $4
             AND p.district = $5
             AND $6 = ANY(p.languages)
             AND $7 = ANY(p.service_modes)
             AND ($8::numeric IS NULL OR ps.fee_min <= $8)
             AND (CASE p.tier WHEN 'SELF_DECLARED' THEN 1 WHEN 'DOCUMENT_VERIFIED' THEN 2
                              WHEN 'FULLY_VERIFIED' THEN 3 ELSE 0 END) >=
                 (CASE $9 WHEN 'SELF_DECLARED' THEN 1 WHEN 'DOCUMENT_VERIFIED' THEN 2
                          WHEN 'FULLY_VERIFIED' THEN 3 ELSE 4 END)
             AND (p.tier <> 'FULLY_VERIFIED' OR p.tier_expires_at > now())
           FOR UPDATE OF p`,
        [
          body.providerId,
          need.directory_provider_type,
          app.config.providerActiveStatuses,
          need.taxonomy_code,
          need.district,
          need.language,
          need.mode_pref,
          need.fee_ceiling,
          need.directory_minimum_tier,
        ],
      );
      if (!currentEligibility.rows[0]?.eligible) {
        throw new AppError(
          409,
          "PROVIDER_NO_LONGER_ELIGIBLE",
          "The selected provider no longer satisfies the persisted directory filters",
        );
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO allocation(need_request_id, provider_id, mode, seed, position, decided_by)
         VALUES ($1,$2,'CITIZEN_CHOICE',$3,$4,$5) RETURNING id`,
        [need.id, body.providerId, surfaced.seed, surfaced.position, actor.actorId],
      );
      const allocation = inserted.rows[0];
      if (!allocation) throw new Error("Allocation insert returned no row");
      await writeAudit(client, actor, {
        action: "allocation.citizen_selected",
        entityType: "allocation",
        entityId: allocation.id,
        afterSummary: {
          needRequestId: need.id,
          providerId: body.providerId,
          position: surfaced.position,
        },
      });
      return allocation;
    });
    return reply
      .code(201)
      .send(allocationResponseSchema.parse({ allocationId: result.id, mode: "CITIZEN_CHOICE" }));
  });

  app.post<{ Params: { id: string } }>("/v1/needs/:id/rotate", async (request, reply) => {
    const actor = requireActor(request, ["CITIZEN", "OPERATOR", "INSTITUTION"]);
    const body = parseBody(rotateSchema, request.body);
    const allocation = await withTransaction(app.db, async (client) => {
      const needResult = await client.query<NeedRow>(
        `SELECT n.*, e.route FROM need_request n JOIN eligibility_decision e ON e.need_request_id = n.id
         WHERE n.id = $1 FOR UPDATE`,
        [request.params.id],
      );
      const need = needResult.rows[0];
      if (!need) throw new AppError(404, "NEED_NOT_FOUND", "Need request was not found");
      if (actor.actorType !== "INSTITUTION")
        await assertCitizenAuthority(client, actor, need.citizen_user_id);
      else await assertInstitutionalRosterGrant(client, actor, body.rosterId, "rosters:allocate");
      if (need.route === "PAID" && actor.actorType !== "OPERATOR") {
        throw new AppError(
          409,
          "ROTATION_NOT_ALLOWED",
          "Paid citizen-choice requests do not use rotation",
        );
      }
      if (app.config.providerActiveStatuses.length === 0) {
        throw new AppError(
          503,
          "PROVIDER_STATUS_POLICY_NOT_CONFIGURED",
          "Roster-eligible provider statuses have not been supplied",
        );
      }
      const member = await client.query<{ provider_id: string }>(
        `SELECT rm.provider_id
         FROM roster_membership rm
         JOIN roster r ON r.id = rm.roster_id
         JOIN provider p ON p.id = rm.provider_id
         JOIN provider_service ps ON ps.provider_id = p.id AND ps.taxonomy_code = r.taxonomy_code
         WHERE rm.roster_id = $1 AND r.district = $2 AND r.taxonomy_code = $3
           AND rm.status = 'AVAILABLE' AND rm.active_matters < rm.capacity
           AND rm.conflict_blocked = false
           AND r.minimum_tier IS NOT NULL
           AND p.status = ANY($5::text[]) AND p.provider_type = r.provider_type
           AND ($4 = 'PAID' OR ps.pro_bono_available = true)
           AND (CASE p.tier WHEN 'SELF_DECLARED' THEN 1 WHEN 'DOCUMENT_VERIFIED' THEN 2
                            WHEN 'FULLY_VERIFIED' THEN 3 ELSE 0 END) >=
               (CASE r.minimum_tier WHEN 'SELF_DECLARED' THEN 1 WHEN 'DOCUMENT_VERIFIED' THEN 2
                                    WHEN 'FULLY_VERIFIED' THEN 3 ELSE 4 END)
           AND (
             p.tier <> 'FULLY_VERIFIED' OR
             p.tier_expires_at > now()
           )
         ORDER BY rm.active_matters ASC, rm.last_assigned_at ASC NULLS FIRST
         FOR UPDATE OF rm, p SKIP LOCKED LIMIT 1`,
        [
          body.rosterId,
          need.district,
          need.taxonomy_code,
          need.route,
          app.config.providerActiveStatuses,
        ],
      );
      const selected = member.rows[0];
      if (!selected)
        throw new AppError(
          409,
          "NO_ROSTER_PROVIDER_AVAILABLE",
          "No eligible roster member is available",
        );
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO allocation(need_request_id, provider_id, mode, roster_id, decided_by)
         VALUES ($1,$2,'ROTATION',$3,$4) RETURNING id`,
        [need.id, selected.provider_id, body.rosterId, actor.actorId],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Allocation insert returned no row");
      await client.query(
        `UPDATE roster_membership SET active_matters = active_matters + 1, last_assigned_at = now()
         WHERE roster_id = $1 AND provider_id = $2`,
        [body.rosterId, selected.provider_id],
      );
      await writeAudit(client, actor, {
        action: "allocation.rotation_assigned",
        entityType: "allocation",
        entityId: row.id,
        afterSummary: {
          needRequestId: need.id,
          providerId: selected.provider_id,
          rosterId: body.rosterId,
        },
      });
      return { ...row, providerId: selected.provider_id };
    });
    return reply.code(201).send(
      allocationResponseSchema.parse({
        allocationId: allocation.id,
        providerId: allocation.providerId,
        mode: "ROTATION",
      }),
    );
  });
}
