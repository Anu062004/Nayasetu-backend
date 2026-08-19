import type { Pool, PoolClient } from "pg";

export async function withTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
  isolation: "READ COMMITTED" | "SERIALIZABLE" = "READ COMMITTED",
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function withSerializableRetry<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
  maximumAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await withTransaction(pool, operation, "SERIALIZABLE");
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "40001" || attempt === maximumAttempts) throw error;
    }
  }
  throw new Error("Serializable retry loop exhausted");
}
