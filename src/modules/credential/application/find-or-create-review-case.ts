import type { PoolClient } from "pg";

export async function findOrCreateReviewRequiredCase(
  client: PoolClient,
  providerId: string,
): Promise<{ id: string; created: boolean }> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [providerId]);
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM verification_case
     WHERE provider_id = $1 AND status = 'REVIEW_REQUIRED' AND decided_at IS NULL
     ORDER BY submitted_at DESC, id DESC
     LIMIT 1 FOR UPDATE`,
    [providerId],
  );
  const active = existing.rows[0];
  if (active) return { id: active.id, created: false };

  const inserted = await client.query<{ id: string }>(
    "INSERT INTO verification_case(provider_id, status) VALUES ($1,'REVIEW_REQUIRED') RETURNING id",
    [providerId],
  );
  const created = inserted.rows[0];
  if (!created) throw new Error("Verification case insert returned no row");
  return { id: created.id, created: true };
}
