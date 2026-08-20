import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "../shared/database.js";

const DEFAULT_BATCH_SIZE = 100;

export interface CredentialRevalidationBatchInput {
  database: DatabaseClient;
  adminActorId: string;
  batchSize?: number;
}

export interface CredentialRevalidationBatchResult {
  processed: number;
  providerIds: readonly string[];
}

export async function runCredentialRevalidationBatch(
  input: CredentialRevalidationBatchInput,
): Promise<CredentialRevalidationBatchResult> {
  const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new Error("Credential revalidation batch size must be a positive integer");
  }
  const result = await input.database.query<{ provider_id: string }>(
    `SELECT provider_id::text
     FROM degrade_expired_provider_tiers($1,$2,$3)`,
    [input.adminActorId, batchSize, `worker:credential-revalidation:${randomUUID()}`],
  );
  const providerIds = result.rows.map((row) => row.provider_id);
  return { processed: providerIds.length, providerIds };
}
