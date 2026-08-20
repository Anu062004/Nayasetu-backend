import "dotenv/config";
import { loadConfig } from "../app/config.js";
import { assertDatabaseRuntimeIdentity, createPool } from "../shared/database.js";
import { runCredentialRevalidationBatch } from "../workers/credential-revalidation.js";

const config = loadConfig();
const pool = createPool(config);
await assertDatabaseRuntimeIdentity(pool, config.databaseExpectedUser);

const revalidationActorId = config.credentialRevalidationActorId;
let revalidationRunning = false;
const runCredentialRevalidation = async () => {
  if (!revalidationActorId || revalidationRunning) return;
  revalidationRunning = true;
  try {
    const result = await runCredentialRevalidationBatch({
      database: pool,
      adminActorId: revalidationActorId,
    });
    if (result.processed > 0) {
      process.stdout.write(`Credential revalidation degraded ${result.processed} stale tier(s).\n`);
    }
  } finally {
    revalidationRunning = false;
  }
};

if (revalidationActorId) {
  await runCredentialRevalidation();
  process.stdout.write("Worker ready; credential revalidation is enabled.\n");
} else {
  await pool.query("SELECT 1");
  process.stdout.write(
    "Worker ready; credential revalidation is disabled without an ADMIN automation identity.\n",
  );
}

const interval = setInterval(() => {
  void runCredentialRevalidation().catch((error: unknown) => {
    process.stderr.write(
      `Credential revalidation failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
  });
}, 60_000);

const shutdown = async () => {
  clearInterval(interval);
  await pool.end();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
