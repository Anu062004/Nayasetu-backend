import "dotenv/config";
import { buildApp } from "../app/build-app.js";
import { loadConfig } from "../app/config.js";
import { assertDatabaseRuntimeIdentity } from "../shared/database.js";

const config = loadConfig();
const app = await buildApp({ config });
await assertDatabaseRuntimeIdentity(app.db, config.databaseExpectedUser);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: config.host, port: config.port });
