import { Client } from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("PostgreSQL schema boundaries", () => {
  it("has no privileged-content or client-funds storage", async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const columns = await client.query<{ table_name: string; column_name: string }>(`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND (
          (table_name = 'need_request' AND column_name ~* 'narrative|description|free.?text') OR
          (table_name = 'matter' AND column_name ~* 'document|evidence|advice|correspondence|note')
        )
      `);
      const tables = await client.query<{ table_name: string }>(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name ~* 'rating|ranking|portfolio|wallet|client_funds|escrow'
      `);
      expect(columns.rows).toEqual([]);
      expect(tables.rows).toEqual([]);
    } finally {
      await client.end();
    }
  });
});
