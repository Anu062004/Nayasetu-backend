import "dotenv/config";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const forbiddenColumns = await client.query<{ table_name: string; column_name: string }>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'need_request' AND column_name ~* 'narrative|description|free.?text')
        OR (table_name = 'matter' AND column_name ~* 'narrative|document|evidence|advice|correspondence|note')
      )
  `);
  if (forbiddenColumns.rowCount) {
    throw new Error(`Forbidden content columns: ${JSON.stringify(forbiddenColumns.rows)}`);
  }

  const forbiddenTables = await client.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name ~* 'rating|ranking|portfolio|wallet|client_funds|escrow'
  `);
  if (forbiddenTables.rowCount) {
    throw new Error(`Forbidden tables: ${JSON.stringify(forbiddenTables.rows)}`);
  }

  process.stdout.write("Database boundary verification passed.\n");
} finally {
  await client.end();
}
