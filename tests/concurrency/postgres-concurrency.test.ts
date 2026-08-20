import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

const ownerDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeDatabaseUrl = process.env.DATABASE_URL;
const databaseSuite = ownerDatabaseUrl && runtimeDatabaseUrl ? describe : describe.skip;

databaseSuite("PostgreSQL concurrency invariants", () => {
  it("commits one of two overlapping active bookings and rejects the other with 23P01", async () => {
    const owner = new Pool({ connectionString: ownerDatabaseUrl, max: 4 });
    const citizenId = randomUUID();
    const providerUserId = randomUUID();
    const providerId = randomUUID();
    const needIds = [randomUUID(), randomUUID()];
    const allocationIds = [randomUUID(), randomUUID()];
    try {
      await owner.query(`INSERT INTO user_account(id, status) VALUES ($1, 'TEST'), ($2, 'TEST')`, [
        citizenId,
        providerUserId,
      ]);
      await owner.query(
        `INSERT INTO provider(id, user_id, provider_type, display_name, district, state, status)
           VALUES ($1,$2,'TEST_TYPE','Concurrency fixture','TEST_DISTRICT','TEST_STATE','TEST')`,
        [providerId, providerUserId],
      );
      for (const [index, needId] of needIds.entries()) {
        await owner.query(
          `INSERT INTO need_request(
               id, citizen_user_id, taxonomy_code, district, language, mode_pref, urgency, channel
             ) VALUES ($1,$2,'TEST_TAXONOMY','TEST_DISTRICT','TEST_LANGUAGE','REMOTE','TEST','TEST')`,
          [needId, citizenId],
        );
        await owner.query(
          `INSERT INTO eligibility_decision(need_request_id, self_declared, route)
             VALUES ($1,false,'PAID')`,
          [needId],
        );
        await owner.query(
          `INSERT INTO allocation(id, need_request_id, provider_id, mode, seed, decided_by)
             VALUES ($1,$2,$3,'CITIZEN_CHOICE',$2::text,$4)`,
          [allocationIds[index], needId, providerId, citizenId],
        );
      }

      const insertBooking = (index: number) =>
        owner.query(
          `INSERT INTO booking(
               need_request_id, allocation_id, provider_id, citizen_user_id, slot, status
             ) VALUES ($1,$2,$3,$4,tstzrange($5,$6,'[)'),'HELD')`,
          [
            needIds[index],
            allocationIds[index],
            providerId,
            citizenId,
            "2026-09-01T10:00:00.000Z",
            "2026-09-01T11:00:00.000Z",
          ],
        );
      const outcomes = await Promise.allSettled([insertBooking(0), insertBooking(1)]);
      expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejection = outcomes.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      expect(rejection).toBeDefined();
      if (!rejection) throw new Error("Expected one booking insertion to be rejected");
      expect((rejection.reason as { code?: string }).code).toBe("23P01");
    } finally {
      await owner.query("DELETE FROM booking WHERE allocation_id = ANY($1::uuid[])", [
        allocationIds,
      ]);
      await owner.query("DELETE FROM allocation WHERE id = ANY($1::uuid[])", [allocationIds]);
      await owner.query(
        "DELETE FROM eligibility_decision WHERE need_request_id = ANY($1::uuid[])",
        [needIds],
      );
      await owner.query("DELETE FROM need_request WHERE id = ANY($1::uuid[])", [needIds]);
      await owner.query("DELETE FROM provider WHERE id = $1", [providerId]);
      await owner.query("DELETE FROM user_account WHERE id = ANY($1::uuid[])", [
        [citizenId, providerUserId],
      ]);
      await owner.end();
    }
  }, 60_000);

  it("distributes 50 simultaneous capacity-one roster claims without duplicate providers", async () => {
    const owner = new Pool({ connectionString: ownerDatabaseUrl, max: 4 });
    const runtime = new Pool({ connectionString: runtimeDatabaseUrl, max: 50 });
    const citizenId = randomUUID();
    const rosterId = randomUUID();
    const providerUserIds = Array.from({ length: 50 }, () => randomUUID());
    const providerIds = Array.from({ length: 50 }, () => randomUUID());
    const needIds = Array.from({ length: 50 }, () => randomUUID());
    try {
      await owner.query("INSERT INTO user_account(id, status) VALUES ($1, 'TEST')", [citizenId]);
      for (let index = 0; index < 50; index += 1) {
        await owner.query("INSERT INTO user_account(id, status) VALUES ($1, 'TEST')", [
          providerUserIds[index],
        ]);
        await owner.query(
          `INSERT INTO provider(
               id, user_id, provider_type, display_name, district, state, status
             ) VALUES ($1,$2,'TEST_TYPE',$3,'TEST_DISTRICT','TEST_STATE','TEST')`,
          [providerIds[index], providerUserIds[index], `Fixture ${index}`],
        );
        await owner.query(
          `INSERT INTO provider_service(provider_id, taxonomy_code, fee_min, fee_max, pro_bono_available)
             VALUES ($1,'TEST_TAXONOMY',0,0,true)`,
          [providerIds[index]],
        );
        await owner.query(
          `INSERT INTO need_request(
               id, citizen_user_id, taxonomy_code, district, language, mode_pref, urgency, channel
             ) VALUES ($1,$2,'TEST_TAXONOMY','TEST_DISTRICT','TEST_LANGUAGE','REMOTE','TEST','TEST')`,
          [needIds[index], citizenId],
        );
        await owner.query(
          `INSERT INTO eligibility_decision(need_request_id, self_declared, route)
             VALUES ($1,true,'PRO_BONO_ROTATION')`,
          [needIds[index]],
        );
      }
      await owner.query(
        `INSERT INTO roster(id, district, taxonomy_code, provider_type, mode, minimum_tier)
           VALUES ($1,'TEST_DISTRICT','TEST_TAXONOMY','TEST_TYPE','ROTATION','SELF_DECLARED')`,
        [rosterId],
      );
      for (const providerId of providerIds) {
        await owner.query(
          `INSERT INTO roster_membership(roster_id, provider_id, status, capacity)
             VALUES ($1,$2,'AVAILABLE',1)`,
          [rosterId, providerId],
        );
      }

      const claim = async (needId: string) => {
        const client = await runtime.connect();
        try {
          await client.query("BEGIN");
          const selected = await client.query<{ provider_id: string }>(
            `SELECT provider_id FROM roster_membership
               WHERE roster_id = $1 AND status = 'AVAILABLE' AND active_matters < capacity
               ORDER BY active_matters, last_assigned_at NULLS FIRST
               FOR UPDATE SKIP LOCKED LIMIT 1`,
            [rosterId],
          );
          const providerId = selected.rows[0]?.provider_id;
          if (!providerId) throw new Error("No provider was available for the fixture claim");
          await client.query(
            `INSERT INTO allocation(need_request_id, provider_id, mode, roster_id, decided_by)
               VALUES ($1,$2,'ROTATION',$3,$4)`,
            [needId, providerId, rosterId, citizenId],
          );
          await client.query(
            `UPDATE roster_membership
               SET active_matters = active_matters + 1, last_assigned_at = now()
               WHERE roster_id = $1 AND provider_id = $2`,
            [rosterId, providerId],
          );
          await client.query("COMMIT");
          return providerId;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      };

      const assignedProviderIds = await Promise.all(needIds.map((needId) => claim(needId)));
      expect(assignedProviderIds).toHaveLength(50);
      expect(new Set(assignedProviderIds).size).toBe(50);
    } finally {
      await owner.query("DELETE FROM allocation WHERE roster_id = $1", [rosterId]);
      await owner.query("DELETE FROM roster_membership WHERE roster_id = $1", [rosterId]);
      await owner.query("DELETE FROM roster WHERE id = $1", [rosterId]);
      await owner.query(
        "DELETE FROM eligibility_decision WHERE need_request_id = ANY($1::uuid[])",
        [needIds],
      );
      await owner.query("DELETE FROM need_request WHERE id = ANY($1::uuid[])", [needIds]);
      await owner.query("DELETE FROM provider_service WHERE provider_id = ANY($1::uuid[])", [
        providerIds,
      ]);
      await owner.query("DELETE FROM provider WHERE id = ANY($1::uuid[])", [providerIds]);
      await owner.query("DELETE FROM user_account WHERE id = ANY($1::uuid[])", [
        [citizenId, ...providerUserIds],
      ]);
      await runtime.end();
      await owner.end();
    }
  }, 60_000);
});
