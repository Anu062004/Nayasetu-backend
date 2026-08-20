import type { PoolClient } from "pg";
import { type CredentialTierPolicy, parseCredentialTierPolicy } from "./credential-policy.js";

export async function loadActiveCredentialPolicy(
  client: PoolClient,
  providerType: string,
): Promise<CredentialTierPolicy> {
  const result = await client.query<{ version: string; policy_snapshot: unknown }>(
    `SELECT version, policy_snapshot
     FROM credential_policy
     WHERE provider_type = $1 AND active`,
    [providerType],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Active credential policy is not configured for '${providerType}'`);
  const policy = parseCredentialTierPolicy(row.policy_snapshot);
  if (policy.providerType !== providerType || policy.version !== row.version) {
    throw new Error("Credential policy registry metadata does not match its immutable snapshot");
  }
  return policy;
}
