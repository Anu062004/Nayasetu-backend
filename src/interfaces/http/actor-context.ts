import { createHmac } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../../app/config.js";
import type { DatabaseClient } from "../../shared/database.js";
import { AppError } from "./errors.js";

const roleSchema = z.enum(["CITIZEN", "PROVIDER", "OPERATOR", "INSTITUTION", "ADMIN"]);

export interface ActorContext {
  actorId: string;
  actorType: z.infer<typeof roleSchema>;
  scopes: readonly string[];
  requestId: string;
  onBehalfOfCitizenId?: string;
  delegationId?: string;
  accountStatus?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    actor: ActorContext | undefined;
  }
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function actorFromRequest(
  request: FastifyRequest,
  config: AppConfig,
): ActorContext | undefined {
  if (config.authMode !== "HEADER") return undefined;
  const actorId = singleHeader(request.headers["x-actor-id"]);
  const role = roleSchema.safeParse(singleHeader(request.headers["x-actor-role"]));
  if (!actorId || !z.uuid().safeParse(actorId).success || !role.success) return undefined;

  const requestedCitizenId = singleHeader(request.headers["x-on-behalf-of-citizen-id"]);
  const requestedDelegationId = singleHeader(request.headers["x-delegation-id"]);
  if (role.data !== "OPERATOR" && (requestedCitizenId || requestedDelegationId)) return undefined;
  if (Boolean(requestedCitizenId) !== Boolean(requestedDelegationId)) return undefined;
  if (
    (requestedCitizenId && !z.uuid().safeParse(requestedCitizenId).success) ||
    (requestedDelegationId && !z.uuid().safeParse(requestedDelegationId).success)
  ) {
    return undefined;
  }
  const scopes = (singleHeader(request.headers["x-actor-scopes"]) ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  return {
    actorId,
    actorType: role.data,
    scopes,
    requestId: request.id,
    ...(requestedCitizenId ? { onBehalfOfCitizenId: requestedCitizenId } : {}),
    ...(requestedDelegationId ? { delegationId: requestedDelegationId } : {}),
  };
}

export function digestSessionToken(token: string, pepper: string): Buffer {
  return createHmac("sha256", pepper).update(token).digest();
}

function bearerToken(request: FastifyRequest): string | undefined {
  const authorization = singleHeader(request.headers.authorization);
  if (!authorization?.startsWith("Bearer ")) return undefined;
  const token = authorization.slice("Bearer ".length);
  return token.length >= 32 ? token : undefined;
}

export async function resolveActorFromRequest(
  request: FastifyRequest,
  config: AppConfig,
  database: DatabaseClient,
): Promise<ActorContext | undefined> {
  if (config.authMode === "HEADER") return actorFromRequest(request, config);
  if (config.authMode !== "SESSION" || !config.sessionTokenPepper) return undefined;

  const token = bearerToken(request);
  const requestedRole = roleSchema.safeParse(singleHeader(request.headers["x-actor-role"]));
  if (!token || !requestedRole.success) return undefined;
  const result = await database.query<{
    user_id: string;
    role: ActorContext["actorType"];
    scopes: string[];
    account_status: string | null;
  }>(
    `SELECT s.user_id, rg.role, u.status AS account_status,
            COALESCE(array_agg(rg.scope) FILTER (WHERE rg.scope <> ''), '{}') AS scopes
     FROM auth_session s
     JOIN role_grant rg ON rg.user_id = s.user_id AND rg.role = $2
     JOIN user_account u ON u.id = s.user_id
     WHERE s.token_digest = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
     GROUP BY s.user_id, rg.role, u.status`,
    [digestSessionToken(token, config.sessionTokenPepper), requestedRole.data],
  );
  const session = result.rows[0];
  if (!session) return undefined;

  const requestedCitizenId = singleHeader(request.headers["x-on-behalf-of-citizen-id"]);
  const requestedDelegationId = singleHeader(request.headers["x-delegation-id"]);
  if (session.role !== "OPERATOR" && (requestedCitizenId || requestedDelegationId))
    return undefined;
  if (Boolean(requestedCitizenId) !== Boolean(requestedDelegationId)) return undefined;
  if (
    (requestedCitizenId && !z.uuid().safeParse(requestedCitizenId).success) ||
    (requestedDelegationId && !z.uuid().safeParse(requestedDelegationId).success)
  ) {
    return undefined;
  }

  return {
    actorId: session.user_id,
    actorType: session.role,
    scopes: session.scopes,
    requestId: request.id,
    ...(session.account_status ? { accountStatus: session.account_status } : {}),
    ...(requestedCitizenId ? { onBehalfOfCitizenId: requestedCitizenId } : {}),
    ...(requestedDelegationId ? { delegationId: requestedDelegationId } : {}),
  };
}

export function requireActor(
  request: FastifyRequest,
  roles?: readonly ActorContext["actorType"][],
) {
  const actor = request.actor;
  if (!actor) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required");
  if (roles && !roles.includes(actor.actorType)) {
    throw new AppError(403, "FORBIDDEN", "The actor is not authorized for this operation");
  }
  return actor;
}

export function requireScope(actor: ActorContext, scope: string): void {
  if (!actor.scopes.includes(scope)) {
    throw new AppError(403, "MISSING_SCOPE", `Required scope '${scope}' is missing`);
  }
}
