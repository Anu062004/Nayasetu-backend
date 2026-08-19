import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyError, LogController } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { resolveActorFromRequest } from "../interfaces/http/actor-context.js";
import { AppError } from "../interfaces/http/errors.js";
import { registerHealthRoutes } from "../interfaces/http/routes/health.js";
import { registerProductRoutes } from "../interfaces/http/routes/index.js";
import { createPool } from "../shared/database.js";
import type { AppConfig } from "./config.js";
import "./types.js";

export interface BuildAppOptions {
  config: AppConfig;
  pool?: Pool;
}

export async function buildApp(options: BuildAppOptions) {
  const app = Fastify({
    logger: options.config.logLevel === "silent" ? false : { level: options.config.logLevel },
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 1_048_576,
  });

  app.decorate("config", options.config);
  app.decorate("db", options.pool ?? createPool(options.config));
  app.decorateRequest("actor", undefined);

  await app.register(helmet, { global: true });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: { files: 1, fileSize: 5 * 1024 * 1024, fields: 10 },
  });

  app.addHook("onRequest", async (request) => {
    request.actor = await resolveActorFromRequest(request, options.config, app.db);
  });

  app.addHook("preValidation", async (request) => {
    const params = request.params;
    if (
      typeof params === "object" &&
      params !== null &&
      "id" in params &&
      !z.uuid().safeParse((params as { id?: unknown }).id).success
    ) {
      throw new AppError(400, "INVALID_IDENTIFIER", "The path identifier must be a UUID");
    }
  });

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    const postgresCode = (error as FastifyError & { code?: string }).code;
    if (postgresCode === "22P02") {
      return reply.code(400).send({
        error: {
          code: "INVALID_IDENTIFIER",
          message: "An identifier has an invalid format",
          requestId: request.id,
        },
      });
    }
    if (postgresCode === "23503") {
      return reply.code(409).send({
        error: {
          code: "REFERENCE_CONFLICT",
          message: "A referenced record does not exist or is still in use",
          requestId: request.id,
        },
      });
    }
    if (postgresCode === "23P01" || postgresCode === "23505") {
      return reply.code(409).send({
        error: {
          code: "CONFLICT",
          message: "The operation conflicts with existing state",
          requestId: request.id,
        },
      });
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
          ...(error.details ? { details: error.details } : {}),
        },
      });
    }
    if ((error as FastifyError).validation) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          requestId: request.id,
        },
      });
    }
    request.log.error({ err: error, requestId: request.id }, "Unhandled request error");
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred",
        requestId: request.id,
      },
    });
  });

  app.addHook("onClose", async () => {
    if (!options.pool) await app.db.end();
  });

  await registerHealthRoutes(app);
  await registerProductRoutes(app);
  return app;
}
