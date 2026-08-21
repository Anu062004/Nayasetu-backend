import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import type { ActorContext } from "../../../interfaces/http/actor-context.js";
import { digestSessionToken } from "../../../interfaces/http/actor-context.js";
import { withTransaction } from "../../../shared/transaction.js";
import { writeAudit } from "../../audit/application/write-audit.js";

export interface IssuedGoogleSession {
  userId: string;
  sessionToken: string;
  expiresAt: Date;
  accountCreated: boolean;
  accountStatus: string;
}

export async function issueGoogleCitizenSession(
  pool: Pool,
  input: {
    email: string;
    pepper: string;
    ttlHours: number;
    requestId: string;
  },
): Promise<IssuedGoogleSession> {
  const sessionToken = randomBytes(32).toString("base64url");
  const tokenDigest = digestSessionToken(sessionToken, input.pepper);
  return withTransaction(pool, async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO user_account(email, status) VALUES ($1, 'PENDING_PROFILE')
       ON CONFLICT (email) DO NOTHING RETURNING id`,
      [input.email],
    );
    let userId = inserted.rows[0]?.id;
    let accountCreated = true;
    let accountStatus = "PENDING_PROFILE";
    if (!userId) {
      accountCreated = false;
      const existing = await client.query<{ id: string; status: string }>(
        "SELECT id, status FROM user_account WHERE email = $1",
        [input.email],
      );
      const row = existing.rows[0];
      if (!row) throw new Error("Google identity could not be resolved to a user account");
      userId = row.id;
      accountStatus = row.status ?? "PENDING_PROFILE";
    }
    await client.query(
      `INSERT INTO role_grant(user_id, role, scope) VALUES ($1, 'CITIZEN', '')
       ON CONFLICT (user_id, role, scope) DO NOTHING`,
      [userId],
    );
    const expiresAt = new Date(Date.now() + input.ttlHours * 3_600_000);
    const session = await client.query<{ id: string }>(
      `INSERT INTO auth_session(user_id, token_digest, expires_at)
       VALUES ($1, $2, $3) RETURNING id`,
      [userId, tokenDigest, expiresAt],
    );
    const sessionId = session.rows[0]?.id;
    if (!sessionId) throw new Error("Session insert returned no identifier");
    const actor: ActorContext = {
      actorId: userId,
      actorType: "CITIZEN",
      scopes: [],
      requestId: input.requestId,
    };
    await writeAudit(client, actor, {
      action: "auth.google_session_issued",
      entityType: "auth_session",
      entityId: sessionId,
      afterSummary: { accountCreated, accountStatus },
    });
    return { userId, sessionToken, expiresAt, accountCreated, accountStatus };
  });
}
