import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { AppConfig } from "./config.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    db: Pool;
  }
}

export type AppInstance = FastifyInstance;
