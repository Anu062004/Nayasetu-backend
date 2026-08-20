import { randomUUID } from "node:crypto";
import { Client, type QueryResult } from "pg";
import { describe, expect, it } from "vitest";

const ownerDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeDatabaseUrl = process.env.DATABASE_URL;
const databaseSuite = ownerDatabaseUrl && runtimeDatabaseUrl ? describe : describe.skip;

interface SchedulingFixture {
  citizenId: string;
  otherCitizenId: string;
  providerId: string;
  otherProviderId: string;
  needIds: string[];
  allocationIds: string[];
}

async function expectPostgresError(
  client: Client,
  statement: string,
  values: readonly unknown[],
  expectedCode: string,
): Promise<void> {
  const savepoint = `scheduling_error_${randomUUID().replaceAll("-", "")}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  let result: QueryResult | undefined;
  let caught: unknown;
  try {
    result = await client.query(statement, [...values]);
  } catch (error) {
    caught = error;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  if (!caught) {
    throw new Error(
      `Expected PostgreSQL error ${expectedCode}, got ${result?.rowCount ?? 0} affected row(s)`,
    );
  }
  expect((caught as { code?: string }).code).toBe(expectedCode);
}

async function createSchedulingFixture(
  client: Client,
  allocationCount: number,
): Promise<SchedulingFixture> {
  const citizenId = randomUUID();
  const otherCitizenId = randomUUID();
  const providerUserId = randomUUID();
  const otherProviderUserId = randomUUID();
  const providerId = randomUUID();
  const otherProviderId = randomUUID();
  const needIds = Array.from({ length: allocationCount }, () => randomUUID());
  const allocationIds = Array.from({ length: allocationCount }, () => randomUUID());

  await client.query(
    `INSERT INTO user_account(id, status)
     VALUES ($1,'TEST'),($2,'TEST'),($3,'TEST'),($4,'TEST')`,
    [citizenId, otherCitizenId, providerUserId, otherProviderUserId],
  );
  await client.query(
    `INSERT INTO provider(
       id, user_id, provider_type, display_name, district, state, status
     ) VALUES
       ($1,$2,'TEST_TYPE','Scheduling provider','TEST_DISTRICT','TEST_STATE','TEST'),
       ($3,$4,'TEST_TYPE','Other scheduling provider','TEST_DISTRICT','TEST_STATE','TEST')`,
    [providerId, providerUserId, otherProviderId, otherProviderUserId],
  );

  for (const [index, needId] of needIds.entries()) {
    await client.query(
      `INSERT INTO need_request(
         id, citizen_user_id, taxonomy_code, district, language, mode_pref, urgency, channel
       ) VALUES ($1,$2,'TEST_TAXONOMY','TEST_DISTRICT','TEST_LANGUAGE','REMOTE','TEST','TEST')`,
      [needId, citizenId],
    );
    await client.query(
      `INSERT INTO allocation(id, need_request_id, provider_id, mode, seed, decided_by)
       VALUES ($1,$2,$3,'CITIZEN_CHOICE',$2::text,$4)`,
      [allocationIds[index], needId, providerId, citizenId],
    );
  }

  return {
    citizenId,
    otherCitizenId,
    providerId,
    otherProviderId,
    needIds,
    allocationIds,
  };
}

async function insertHeldBooking(
  client: Client,
  fixture: SchedulingFixture,
  index: number,
): Promise<string> {
  const bookingId = randomUUID();
  const startHour = 8 + index * 2;
  const startsAt = `2027-01-10T${String(startHour).padStart(2, "0")}:00:00.000Z`;
  const endsAt = `2027-01-10T${String(startHour + 1).padStart(2, "0")}:00:00.000Z`;
  await client.query(
    `INSERT INTO booking(
       id, need_request_id, allocation_id, provider_id, citizen_user_id, slot, status
     ) VALUES ($1,$2,$3,$4,$5,tstzrange($6,$7,'[)'),'HELD')`,
    [
      bookingId,
      fixture.needIds[index],
      fixture.allocationIds[index],
      fixture.providerId,
      fixture.citizenId,
      startsAt,
      endsAt,
    ],
  );
  return bookingId;
}

databaseSuite("PostgreSQL scheduling integrity", () => {
  it("validates booking slots and participant identity across allocations and matters", async () => {
    const client = new Client({ connectionString: ownerDatabaseUrl });
    await client.connect();
    await client.query("BEGIN");
    try {
      const fixture = await createSchedulingFixture(client, 3);

      await expectPostgresError(
        client,
        `INSERT INTO booking(
           need_request_id, allocation_id, provider_id, citizen_user_id, slot, status
         ) VALUES ($1,$2,$3,$4,tstzrange($5,$6,'[)'),'UNKNOWN')`,
        [
          fixture.needIds[0],
          fixture.allocationIds[0],
          fixture.providerId,
          fixture.citizenId,
          "2027-01-10T08:00:00.000Z",
          "2027-01-10T09:00:00.000Z",
        ],
        "23514",
      );
      await expectPostgresError(
        client,
        `INSERT INTO booking(
           need_request_id, allocation_id, provider_id, citizen_user_id, slot, status
         ) VALUES ($1,$2,$3,$4,tstzrange(NULL,$5,'[)'),'HELD')`,
        [
          fixture.needIds[0],
          fixture.allocationIds[0],
          fixture.providerId,
          fixture.citizenId,
          "2027-01-10T09:00:00.000Z",
        ],
        "23514",
      );
      await expectPostgresError(
        client,
        `INSERT INTO booking(
           need_request_id, allocation_id, provider_id, citizen_user_id, slot, status
         ) VALUES (
           $1,$2,$3,$4,
           tstzrange('-infinity'::timestamptz,$5,'[)'),'HELD'
         )`,
        [
          fixture.needIds[0],
          fixture.allocationIds[0],
          fixture.providerId,
          fixture.citizenId,
          "2027-01-10T09:00:00.000Z",
        ],
        "23514",
      );
      await expectPostgresError(
        client,
        `INSERT INTO booking(
           need_request_id, allocation_id, provider_id, citizen_user_id, slot, status
         ) VALUES (
           $1,$2,$3,$4,
           tstzrange($5,'infinity'::timestamptz,'[)'),'HELD'
         )`,
        [
          fixture.needIds[0],
          fixture.allocationIds[0],
          fixture.providerId,
          fixture.citizenId,
          "2027-01-10T08:00:00.000Z",
        ],
        "23514",
      );
      await expectPostgresError(
        client,
        `INSERT INTO booking(
           need_request_id, allocation_id, provider_id, citizen_user_id, slot, status
         ) VALUES ($1,$2,$3,$4,tstzrange($5,$6,'[)'),'HELD')`,
        [
          fixture.needIds[0],
          fixture.allocationIds[0],
          fixture.otherProviderId,
          fixture.citizenId,
          "2027-01-10T08:00:00.000Z",
          "2027-01-10T09:00:00.000Z",
        ],
        "23503",
      );
      await expectPostgresError(
        client,
        `INSERT INTO booking(
           need_request_id, allocation_id, provider_id, citizen_user_id, slot, status
         ) VALUES ($1,$2,$3,$4,tstzrange($5,$6,'[)'),'HELD')`,
        [
          fixture.needIds[0],
          fixture.allocationIds[0],
          fixture.providerId,
          fixture.otherCitizenId,
          "2027-01-10T08:00:00.000Z",
          "2027-01-10T09:00:00.000Z",
        ],
        "23503",
      );

      const bookingId = await insertHeldBooking(client, fixture, 0);
      await client.query(
        "UPDATE booking SET status = 'CONFIRMED', updated_at = now() WHERE id = $1",
        [bookingId],
      );
      await expectPostgresError(
        client,
        `INSERT INTO matter(allocation_id, provider_id, citizen_user_id, status)
         VALUES ($1,$2,$3,'OPEN')`,
        [fixture.allocationIds[0], fixture.otherProviderId, fixture.citizenId],
        "23503",
      );
      await expectPostgresError(
        client,
        `INSERT INTO matter(allocation_id, provider_id, citizen_user_id, status)
         VALUES ($1,$2,$3,'OPEN')`,
        [fixture.allocationIds[0], fixture.providerId, fixture.otherCitizenId],
        "23503",
      );
      await insertHeldBooking(client, fixture, 1);
      await expectPostgresError(
        client,
        `INSERT INTO matter(allocation_id, provider_id, citizen_user_id, status)
         VALUES ($1,$2,$3,'OPEN')`,
        [fixture.allocationIds[1], fixture.providerId, fixture.citizenId],
        "23514",
      );
      const matter = await client.query<{ id: string }>(
        `INSERT INTO matter(allocation_id, provider_id, citizen_user_id, status)
         VALUES ($1,$2,$3,'OPEN') RETURNING id`,
        [fixture.allocationIds[0], fixture.providerId, fixture.citizenId],
      );
      expect(matter.rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  it("enforces immutable booking identity and fail-closed lifecycle transitions", async () => {
    const client = new Client({ connectionString: ownerDatabaseUrl });
    await client.connect();
    await client.query("BEGIN");
    try {
      const fixture = await createSchedulingFixture(client, 3);
      await client.query(
        "UPDATE allocation SET status = 'CANCELLED', ended_at = now() WHERE id = $1",
        [fixture.allocationIds[2]],
      );
      await expectPostgresError(
        client,
        `INSERT INTO booking(
           need_request_id, allocation_id, provider_id, citizen_user_id, slot, status
         ) VALUES ($1,$2,$3,$4,tstzrange($5,$6,'[)'),'HELD')`,
        [
          fixture.needIds[2],
          fixture.allocationIds[2],
          fixture.providerId,
          fixture.citizenId,
          "2027-01-10T12:00:00.000Z",
          "2027-01-10T13:00:00.000Z",
        ],
        "23514",
      );
      await expectPostgresError(
        client,
        `INSERT INTO booking(
           need_request_id, allocation_id, provider_id, citizen_user_id, slot, status
         ) VALUES ($1,$2,$3,$4,tstzrange($5,$6,'[)'),'CONFIRMED')`,
        [
          fixture.needIds[0],
          fixture.allocationIds[0],
          fixture.providerId,
          fixture.citizenId,
          "2027-01-10T08:00:00.000Z",
          "2027-01-10T09:00:00.000Z",
        ],
        "23514",
      );

      const bookingId = await insertHeldBooking(client, fixture, 0);
      await expectPostgresError(
        client,
        `UPDATE booking
         SET slot = tstzrange('2027-01-11T08:00:00Z','2027-01-11T09:00:00Z','[)')
         WHERE id = $1`,
        [bookingId],
        "55000",
      );
      await expectPostgresError(
        client,
        "UPDATE booking SET status = 'SCHEDULED', updated_at = now() WHERE id = $1",
        [bookingId],
        "23514",
      );
      await client.query(
        "UPDATE booking SET status = 'CONFIRMED', updated_at = now() WHERE id = $1",
        [bookingId],
      );
      await expectPostgresError(
        client,
        "UPDATE allocation SET status = 'CANCELLED', ended_at = now() WHERE id = $1",
        [fixture.allocationIds[0]],
        "23514",
      );
      await expectPostgresError(
        client,
        "UPDATE booking SET status = 'CANCELLED', updated_at = now() WHERE id = $1",
        [bookingId],
        "23514",
      );

      const secondBookingId = await insertHeldBooking(client, fixture, 1);
      await client.query(
        "UPDATE booking SET status = 'CONFIRMED', updated_at = now() WHERE id = $1",
        [secondBookingId],
      );
      const matter = await client.query<{ id: string }>(
        `INSERT INTO matter(allocation_id, provider_id, citizen_user_id, status)
         VALUES ($1,$2,$3,'OPEN') RETURNING id`,
        [fixture.allocationIds[1], fixture.providerId, fixture.citizenId],
      );
      const matterId = matter.rows[0]?.id;
      if (!matterId) throw new Error("Matter fixture insert returned no id");
      await expectPostgresError(
        client,
        "UPDATE allocation SET status = 'COMPLETED', ended_at = now() WHERE id = $1",
        [fixture.allocationIds[1]],
        "23514",
      );
      await expectPostgresError(
        client,
        "UPDATE matter SET provider_id = $2 WHERE id = $1",
        [matterId, fixture.otherProviderId],
        "55000",
      );
      await expectPostgresError(
        client,
        "UPDATE matter SET status = 'CLOSED' WHERE id = $1",
        [matterId],
        "23514",
      );
      await client.query(
        `UPDATE matter
         SET status = 'CLOSED', closed_at = now(), close_reason = 'TEST_COMPLETION'
         WHERE id = $1`,
        [matterId],
      );
      await expectPostgresError(
        client,
        `UPDATE matter
         SET status = 'OPEN', closed_at = NULL, close_reason = NULL
         WHERE id = $1`,
        [matterId],
        "23514",
      );
      await client.query(
        "UPDATE allocation SET status = 'COMPLETED', ended_at = now() WHERE id = $1",
        [fixture.allocationIds[1]],
      );
      const completed = await client.query<{ allocation_status: string; matter_status: string }>(
        `SELECT allocation.status AS allocation_status, matter.status AS matter_status
         FROM allocation
         JOIN matter ON matter.allocation_id = allocation.id
         WHERE allocation.id = $1`,
        [fixture.allocationIds[1]],
      );
      expect(completed.rows[0]).toEqual({
        allocation_status: "COMPLETED",
        matter_status: "CLOSED",
      });
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  it("permits only narrow runtime booking transitions and matter insertion", async () => {
    const client = new Client({ connectionString: ownerDatabaseUrl });
    await client.connect();
    await client.query("BEGIN");
    try {
      const fixture = await createSchedulingFixture(client, 4);
      const bookingIds = await Promise.all(
        [0, 1, 2, 3].map((index) => insertHeldBooking(client, fixture, index)),
      );

      await client.query("SET LOCAL ROLE legal_service_runtime");
      await expectPostgresError(
        client,
        `INSERT INTO booking(
           need_request_id, allocation_id, provider_id, citizen_user_id, slot, status
         ) VALUES ($1,$2,$3,$4,tstzrange($5,$6,'[)'),'HELD')`,
        [
          fixture.needIds[3],
          fixture.allocationIds[3],
          fixture.providerId,
          fixture.citizenId,
          "2027-01-10T16:00:00.000Z",
          "2027-01-10T17:00:00.000Z",
        ],
        "42501",
      );
      await expectPostgresError(
        client,
        "DELETE FROM booking WHERE id = $1",
        [bookingIds[0]],
        "42501",
      );
      await expectPostgresError(client, "TRUNCATE booking", [], "42501");
      await expectPostgresError(
        client,
        "UPDATE booking SET allocation_id = $2 WHERE id = $1",
        [bookingIds[0], fixture.allocationIds[3]],
        "42501",
      );
      await expectPostgresError(
        client,
        `UPDATE booking
         SET slot = tstzrange('2027-01-11T08:00:00Z','2027-01-11T09:00:00Z','[)')
         WHERE id = $1`,
        [bookingIds[0]],
        "42501",
      );

      await client.query(
        "UPDATE booking SET status = 'CONFIRMED', updated_at = now() WHERE id = $1",
        [bookingIds[0]],
      );
      await client.query(
        "UPDATE booking SET status = 'DECLINED', updated_at = now() WHERE id = $1",
        [bookingIds[1]],
      );
      await client.query(
        "UPDATE booking SET status = 'CANCELLED', updated_at = now() WHERE id = $1",
        [bookingIds[2]],
      );
      await client.query(
        `UPDATE allocation
         SET status = 'DECLINED', ended_at = now(), decline_reason = 'TEST_DECLINE'
         WHERE id = $1`,
        [fixture.allocationIds[1]],
      );
      await client.query(
        "UPDATE allocation SET status = 'CANCELLED', ended_at = now() WHERE id = $1",
        [fixture.allocationIds[2]],
      );
      const matter = await client.query<{ id: string }>(
        `INSERT INTO matter(allocation_id, provider_id, citizen_user_id, status)
         VALUES ($1,$2,$3,'OPEN') RETURNING id`,
        [fixture.allocationIds[0], fixture.providerId, fixture.citizenId],
      );
      const matterId = matter.rows[0]?.id;
      if (!matterId) throw new Error("Runtime matter insert returned no id");
      await expectPostgresError(
        client,
        "UPDATE allocation SET status = 'COMPLETED', ended_at = now() WHERE id = $1",
        [fixture.allocationIds[0]],
        "23514",
      );

      await expectPostgresError(
        client,
        `UPDATE matter
         SET status = 'CLOSED', closed_at = now(), close_reason = 'FORBIDDEN'
         WHERE id = $1`,
        [matterId],
        "42501",
      );
      await expectPostgresError(client, "DELETE FROM matter WHERE id = $1", [matterId], "42501");
      await expectPostgresError(client, "TRUNCATE matter", [], "42501");

      await client.query(
        `CREATE TEMP TABLE booking(
           allocation_id uuid, provider_id uuid, citizen_user_id uuid, status text
         )`,
      );
      await client.query(
        `INSERT INTO booking(allocation_id, provider_id, citizen_user_id, status)
         VALUES ($1,$2,$3,'CONFIRMED')`,
        [fixture.allocationIds[3], fixture.providerId, fixture.citizenId],
      );
      await expectPostgresError(
        client,
        `INSERT INTO matter(allocation_id, provider_id, citizen_user_id, status)
         VALUES ($1,$2,$3,'OPEN')`,
        [fixture.allocationIds[3], fixture.providerId, fixture.citizenId],
        "23514",
      );
      await client.query("DROP TABLE booking");

      const states = await client.query<{ status: string }>(
        "SELECT status FROM booking WHERE id = ANY($1::uuid[]) ORDER BY status",
        [bookingIds],
      );
      expect(states.rows.map((row) => row.status)).toEqual([
        "CANCELLED",
        "CONFIRMED",
        "DECLINED",
        "HELD",
      ]);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
