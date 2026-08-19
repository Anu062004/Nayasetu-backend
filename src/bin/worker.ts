import "dotenv/config";
import { loadConfig } from "../app/config.js";
import { createPool } from "../shared/database.js";

const config = loadConfig();
const pool = createPool(config);

// Worker policies (credential freshness windows and notification delivery) are not supplied by the
// blueprint. Keep the process healthy without inventing policy-driven mutations.
await pool.query("SELECT 1");
process.stdout.write(
  "Worker ready; policy-driven jobs remain disabled until reviewed configuration exists.\n",
);

const shutdown = async () => {
  await pool.end();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
setInterval(() => undefined, 60_000);
