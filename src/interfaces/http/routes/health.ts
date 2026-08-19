import type { FastifyInstance } from "fastify";
import { assertDatabaseRuntimeIdentity } from "../../../shared/database.js";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health/live", async () => ({ status: "ok" }));

  app.get("/health/ready", async (_request, reply) => {
    try {
      await assertDatabaseRuntimeIdentity(app.db, app.config.databaseExpectedUser);
      if (!app.config.databaseExpectedUser) await app.db.query("SELECT 1");
      return {
        status: "ready",
        capabilities: app.config.capabilities,
      };
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
  });
}
