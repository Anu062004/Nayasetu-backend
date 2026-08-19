import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import type { AppConfig } from "../app/config.js";

export type DatabaseClient = Pick<PoolClient, "query">;

export function createPool(config: AppConfig): Pool {
  return new Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    application_name: "legal-service-rails-backend",
  });
}

export async function queryOne<T extends QueryResultRow>(
  client: DatabaseClient,
  text: string,
  values: readonly unknown[] = [],
): Promise<T> {
  const result: QueryResult<T> = await client.query<T>(text, [...values]);
  const row = result.rows[0];
  if (!row) throw new Error("Expected database row was not returned");
  return row;
}
