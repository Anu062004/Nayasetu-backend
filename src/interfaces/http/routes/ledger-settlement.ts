import { createHash, createHmac, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeAudit } from "../../../modules/audit/application/write-audit.js";
import { assertCitizenAuthority } from "../../../modules/identity/application/assert-citizen-authority.js";
import { evidenceDisclaimer, redemptionKinds } from "../../../modules/redemption/domain/kinds.js";
import type { DatabaseClient } from "../../../shared/database.js";
import { withTransaction } from "../../../shared/transaction.js";
import { requireActor } from "../actor-context.js";
import { AppError } from "../errors.js";
import { parseBody } from "../validation.js";

const redemptionSchema = z.object({ kind: z.enum(redemptionKinds) });
const quoteSchema = z.object({
  matterId: z.uuid(),
  amount: z.number().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  feeBreakdown: z.object({
    professionalFee: z.number().nonnegative(),
    processingFee: z.number().nonnegative(),
    platformCommission: z.literal(0),
  }),
  expiresAt: z.iso.datetime(),
});
const intentSchema = z.object({ matterId: z.uuid(), quoteId: z.uuid() });
async function assertMatterAccess(
  database: DatabaseClient,
  actor: ReturnType<typeof requireActor>,
  matterId: string,
) {
  const result = await database.query<{
    citizen_user_id: string;
    provider_user_id: string;
    route: string;
  }>(
    `SELECT m.citizen_user_id, p.user_id AS provider_user_id, e.route
     FROM matter m JOIN provider p ON p.id = m.provider_id
     JOIN allocation a ON a.id = m.allocation_id
     JOIN eligibility_decision e ON e.need_request_id = a.need_request_id
     WHERE m.id = $1`,
    [matterId],
  );
  const matter = result.rows[0];
  if (!matter) throw new AppError(404, "MATTER_NOT_FOUND", "Matter was not found");
  if (actor.actorType === "ADMIN") return matter;
  if (actor.actorType === "PROVIDER" && actor.actorId === matter.provider_user_id) return matter;
  if (actor.actorType === "CITIZEN" && actor.actorId === matter.citizen_user_id) return matter;
  if (actor.actorType === "OPERATOR") {
    await assertCitizenAuthority(database, actor, matter.citizen_user_id);
    return matter;
  }
  throw new AppError(403, "FORBIDDEN", "Matter belongs to another actor");
}

async function providerIdForActor(app: FastifyInstance, actorId: string): Promise<string> {
  const result = await app.db.query<{ id: string }>("SELECT id FROM provider WHERE user_id = $1", [
    actorId,
  ]);
  const row = result.rows[0];
  if (!row) throw new AppError(404, "PROVIDER_NOT_FOUND", "Provider profile was not found");
  return row.id;
}

async function evidencePayload(app: FastifyInstance, providerId: string, kind: string) {
  const events = await app.db.query<{
    id: string;
    event_type: string;
    units: string;
    credits: string;
    weight_version: string;
    evidence_ref: string;
    occurred_at: Date;
    hash: Buffer;
  }>(
    `SELECT id, event_type, units, credits, weight_version, evidence_ref, occurred_at, hash
     FROM credit_event WHERE provider_id = $1 ORDER BY id`,
    [providerId],
  );
  return {
    artifactId: randomUUID(),
    kind,
    providerId,
    issuedAt: new Date().toISOString(),
    disclaimer: evidenceDisclaimer(kind as (typeof redemptionKinds)[number]),
    events: events.rows.map((event) => ({
      id: event.id,
      eventType: event.event_type,
      units: event.units,
      credits: event.credits,
      weightVersion: event.weight_version,
      evidenceRef: event.evidence_ref,
      occurredAt: event.occurred_at.toISOString(),
      hash: event.hash.toString("hex"),
    })),
  };
}

function signEvidence(payload: Record<string, unknown>, secret: string) {
  const serialized = JSON.stringify(payload);
  return {
    payload,
    signatureAlgorithm: "HMAC-SHA256",
    signature: createHmac("sha256", secret).update(serialized).digest("hex"),
  };
}

export async function registerLedgerSettlementRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/me/credits", async (request) => {
    const actor = requireActor(request, ["PROVIDER"]);
    const providerId = await providerIdForActor(app, actor.actorId);
    const balance = await app.db.query<{
      total_credits: string;
      period_credits: string;
      last_event_id: string | null;
    }>(
      "SELECT total_credits, period_credits, last_event_id FROM credit_balance WHERE provider_id = $1",
      [providerId],
    );
    const row = balance.rows[0];
    if (!row) throw new AppError(404, "CREDIT_BALANCE_NOT_FOUND", "Credit balance was not found");
    return {
      providerId,
      totalCredits: Number(row.total_credits),
      periodCredits: Number(row.period_credits),
      lastEventId: row.last_event_id,
    };
  });

  app.post("/v1/me/redemptions", async (request, reply) => {
    const actor = requireActor(request, ["PROVIDER"]);
    const body = parseBody(redemptionSchema, request.body);
    if (!app.config.evidenceSigningSecret) {
      throw new AppError(503, "SIGNING_NOT_CONFIGURED", "Evidence signing is not configured");
    }
    const providerId = await providerIdForActor(app, actor.actorId);
    const payload = await evidencePayload(app, providerId, body.kind);
    const signed = signEvidence(payload, app.config.evidenceSigningSecret);
    const artefactRef = createHash("sha256").update(JSON.stringify(signed)).digest("hex");
    const redemption = await withTransaction(app.db, async (client) => {
      const result = await client.query<{ id: string; issued_at: Date }>(
        `INSERT INTO redemption(provider_id, kind, credits_spent, artefact_ref)
         VALUES ($1,$2,0,$3) RETURNING id, issued_at`,
        [providerId, body.kind, artefactRef],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Redemption insert returned no row");
      await writeAudit(client, actor, {
        action: "redemption.evidence_issued",
        entityType: "redemption",
        entityId: row.id,
        afterSummary: { kind: body.kind, creditsSpent: 0, artefactRef },
      });
      return row;
    });
    return reply.code(201).send({
      redemptionId: redemption.id,
      issuedAt: redemption.issued_at.toISOString(),
      ...signed,
    });
  });

  app.get("/v1/me/service-record", async (request) => {
    const actor = requireActor(request, ["PROVIDER"]);
    if (!app.config.evidenceSigningSecret)
      throw new AppError(503, "SIGNING_NOT_CONFIGURED", "Evidence signing is not configured");
    return signEvidence(
      await evidencePayload(
        app,
        await providerIdForActor(app, actor.actorId),
        "SERVICE_RECORD_EXPORT",
      ),
      app.config.evidenceSigningSecret,
    );
  });

  app.get("/v1/me/panel-evidence", async (request) => {
    const actor = requireActor(request, ["PROVIDER"]);
    if (!app.config.evidenceSigningSecret)
      throw new AppError(503, "SIGNING_NOT_CONFIGURED", "Evidence signing is not configured");
    return signEvidence(
      await evidencePayload(
        app,
        await providerIdForActor(app, actor.actorId),
        "PANEL_APPLICATION_EVIDENCE_PACKET",
      ),
      app.config.evidenceSigningSecret,
    );
  });

  app.post("/v1/payments/quotes", async (request, reply) => {
    const actor = requireActor(request, ["PROVIDER", "ADMIN"]);
    const body = parseBody(quoteSchema, request.body);
    const sum = body.feeBreakdown.professionalFee + body.feeBreakdown.processingFee;
    if (Math.abs(sum - body.amount) > 0.000001) {
      throw new AppError(
        400,
        "FEE_BREAKDOWN_MISMATCH",
        "Amount must equal professional and processing fees",
      );
    }
    const quote = await withTransaction(app.db, async (client) => {
      const matter = await client.query<{
        provider_id: string;
        route: string;
        provider_user_id: string;
      }>(
        `SELECT m.provider_id, p.user_id AS provider_user_id, e.route
         FROM matter m JOIN provider p ON p.id = m.provider_id
         JOIN allocation a ON a.id = m.allocation_id
         JOIN eligibility_decision e ON e.need_request_id = a.need_request_id
         WHERE m.id = $1`,
        [body.matterId],
      );
      const row = matter.rows[0];
      if (!row) throw new AppError(404, "MATTER_NOT_FOUND", "Matter was not found");
      if (actor.actorType === "PROVIDER" && row.provider_user_id !== actor.actorId) {
        throw new AppError(403, "FORBIDDEN", "Matter belongs to another provider");
      }
      if (row.route !== "PAID") {
        throw new AppError(
          409,
          "PAYMENT_NOT_ALLOWED",
          "Legal-aid and pro-bono routes cannot be quoted for payment",
        );
      }
      const result = await client.query<{ id: string }>(
        `INSERT INTO payment_quote(matter_id, provider_id, amount, currency, fee_breakdown_json, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          body.matterId,
          row.provider_id,
          body.amount,
          body.currency,
          body.feeBreakdown,
          body.expiresAt,
        ],
      );
      const inserted = result.rows[0];
      if (!inserted) throw new Error("Quote insert returned no row");
      await writeAudit(client, actor, {
        action: "payment.quote_created",
        entityType: "payment_quote",
        entityId: inserted.id,
        afterSummary: {
          matterId: body.matterId,
          amount: body.amount,
          currency: body.currency,
          platformCommission: 0,
        },
      });
      return inserted;
    });
    return reply.code(201).send({
      quoteId: quote.id,
      amount: body.amount,
      currency: body.currency,
      feeBreakdown: body.feeBreakdown,
    });
  });

  app.post("/v1/payments/intents", async (request) => {
    requireActor(request, ["CITIZEN", "OPERATOR"]);
    parseBody(intentSchema, request.body);
    if (app.config.capabilities.payments === "OFF") {
      throw new AppError(503, "PAYMENTS_UNAVAILABLE", "Online payment provider capability is off");
    }
    throw new AppError(
      503,
      "PAYMENT_ADAPTER_NOT_IMPLEMENTED",
      "No authorized payment provider adapter is supplied",
    );
  });

  app.get<{ Params: { id: string } }>("/v1/payments/:id", async (request) => {
    const actor = requireActor(request, ["CITIZEN", "OPERATOR", "PROVIDER", "ADMIN"]);
    const result = await app.db.query<{
      id: string;
      matter_id: string;
      payment_provider: string;
      provider_intent_ref: string;
      amount: string;
      status: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, matter_id, payment_provider, provider_intent_ref, amount, status, created_at, updated_at
       FROM payment_intent WHERE id = $1`,
      [request.params.id],
    );
    const row = result.rows[0];
    if (!row) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment intent was not found");
    await assertMatterAccess(app.db, actor, row.matter_id);
    return {
      paymentId: row.id,
      matterId: row.matter_id,
      paymentProvider: row.payment_provider,
      providerIntentReference: row.provider_intent_ref,
      amount: Number(row.amount),
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  });

  app.post<{ Params: { provider: string } }>("/v1/payments/webhooks/:provider", async () => {
    // Provider-specific raw-body signature rules and state maps are intentionally not guessed.
    throw new AppError(
      503,
      "PAYMENT_ADAPTER_NOT_IMPLEMENTED",
      "No verified provider webhook adapter is supplied",
    );
  });

  app.post<{ Params: { id: string } }>("/v1/payments/:id/offline-ack", async (request) => {
    requireActor(request, ["CITIZEN", "OPERATOR", "PROVIDER", "ADMIN"]);
    throw new AppError(
      503,
      "OFFLINE_ACK_POLICY_NOT_CONFIGURED",
      "Offline acknowledgement identity and evidence policy has not been supplied",
    );
  });
}
