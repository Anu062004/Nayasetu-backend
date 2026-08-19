import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(repositoryRoot, "db", "migrations");
const files = (await readdir(migrationsDirectory))
  .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
  .sort();

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const file of files) {
    const applied = await client.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM schema_migration WHERE name = $1) AS exists",
      [file],
    );
    if (applied.rows[0]?.exists) continue;

    const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migration(name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      process.stdout.write(`Applied ${file}\n`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}
