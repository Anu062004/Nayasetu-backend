import "dotenv/config";
import { Client } from "pg";

const databaseUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required");

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("BEGIN");

  // 1. Seed user accounts for all core persona roles
  const users = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      role: "CITIZEN",
      email: "citizen@nyayasetu.local",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      role: "PROVIDER",
      email: "advocate@nyayasetu.local",
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      role: "OPERATOR",
      email: "operator@nyayasetu.local",
    },
    {
      id: "00000000-0000-4000-8000-000000000004",
      role: "INSTITUTION",
      email: "institution@nyayasetu.local",
    },
    { id: "00000000-0000-4000-8000-000000000005", role: "ADMIN", email: "admin@nyayasetu.local" },
    {
      id: "00000000-0000-4000-8000-000000000012",
      role: "PROVIDER",
      email: "mediator@nyayasetu.local",
    },
    {
      id: "00000000-0000-4000-8000-000000000013",
      role: "PROVIDER",
      email: "arbitrator@nyayasetu.local",
    },
    {
      id: "00000000-0000-4000-8000-000000000014",
      role: "PROVIDER",
      email: "notary@nyayasetu.local",
    },
    {
      id: "00000000-0000-4000-8000-000000000015",
      role: "PROVIDER",
      email: "docwriter@nyayasetu.local",
    },
  ];

  for (const user of users) {
    await client.query(
      `INSERT INTO user_account(id, email, status)
       VALUES ($1, $2, 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE'`,
      [user.id, user.email],
    );

    await client.query(
      `INSERT INTO role_grant(user_id, role, scope)
       VALUES ($1, $2, '')
       ON CONFLICT (user_id, role, scope) DO NOTHING`,
      [user.id, user.role],
    );
  }

  // 2. Seed verified profiles across all 5 legal service provider categories
  const providerProfiles = [
    {
      id: "00000000-0000-4000-8000-000000000020",
      userId: "00000000-0000-4000-8000-000000000002",
      type: "ADVOCATE",
      name: "Adv. Ananya Sharma",
      district: "Bengaluru Urban",
      state: "Karnataka",
      languages: ["English", "Hindi", "Kannada"],
      services: [
        { code: "CIVIL_PROPERTY_DISPUTE", min: 1500, max: 3500, proBono: true },
        { code: "FAMILY_MAINTENANCE", min: 1000, max: 2500, proBono: true },
        { code: "LABOUR_WAGES_DISPUTE", min: 1200, max: 3000, proBono: true },
        { code: "CONSUMER_DISPUTE", min: 1000, max: 2000, proBono: false },
        { code: "CRIMINAL_BAIL_DEFENSE", min: 2000, max: 5000, proBono: false },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000000022",
      userId: "00000000-0000-4000-8000-000000000012",
      type: "MEDIATOR",
      name: "Shri Rajeshwar Rao (Certified Mediator)",
      district: "Bengaluru Urban",
      state: "Karnataka",
      languages: ["English", "Hindi", "Kannada", "Telugu"],
      services: [
        { code: "FAMILY_MAINTENANCE", min: 800, max: 2000, proBono: true },
        { code: "CIVIL_PROPERTY_DISPUTE", min: 1200, max: 2800, proBono: true },
        { code: "CONSUMER_DISPUTE", min: 750, max: 1800, proBono: true },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000000023",
      userId: "00000000-0000-4000-8000-000000000013",
      type: "ARBITRATOR",
      name: "Justice (Retd.) K. S. Murthy",
      district: "Bengaluru Urban",
      state: "Karnataka",
      languages: ["English", "Hindi", "Kannada"],
      services: [
        { code: "CIVIL_PROPERTY_DISPUTE", min: 3000, max: 7500, proBono: true },
        { code: "LABOUR_WAGES_DISPUTE", min: 2500, max: 6000, proBono: false },
        { code: "CONSUMER_DISPUTE", min: 2000, max: 5000, proBono: true },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000000024",
      userId: "00000000-0000-4000-8000-000000000014",
      type: "NOTARY",
      name: "Smt. Meenakshi Sundaram (Notary Public)",
      district: "Bengaluru Urban",
      state: "Karnataka",
      languages: ["English", "Hindi", "Kannada", "Tamil"],
      services: [
        { code: "CIVIL_PROPERTY_DISPUTE", min: 300, max: 800, proBono: true },
        { code: "CIVIL_GENERAL", min: 200, max: 600, proBono: true },
        { code: "FAMILY_MAINTENANCE", min: 250, max: 700, proBono: true },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000000025",
      userId: "00000000-0000-4000-8000-000000000015",
      type: "DOCUMENT_WRITER",
      name: "Shri Vijay Kumar Patel (Licensed Deed Writer)",
      district: "Bengaluru Urban",
      state: "Karnataka",
      languages: ["English", "Hindi", "Kannada", "Marathi"],
      services: [
        { code: "CIVIL_PROPERTY_DISPUTE", min: 500, max: 1500, proBono: true },
        { code: "CIVIL_GENERAL", min: 400, max: 1200, proBono: true },
        { code: "CONSUMER_DISPUTE", min: 350, max: 1000, proBono: true },
      ],
    },
  ];

  for (const p of providerProfiles) {
    const existing = await client.query("SELECT id FROM provider WHERE id = $1", [p.id]);
    if (!existing.rows.length) {
      await client.query(
        `INSERT INTO provider(
           id, user_id, provider_type, display_name, district, state,
           languages, service_modes, status, tier
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', 'DOCUMENT_VERIFIED')
         ON CONFLICT (id) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             provider_type = EXCLUDED.provider_type,
             district = EXCLUDED.district,
             state = EXCLUDED.state,
             languages = EXCLUDED.languages,
             status = 'ACTIVE'`,
        [
          p.id,
          p.userId,
          p.type,
          p.name,
          p.district,
          p.state,
          p.languages,
          ["HYBRID", "ONLINE", "IN_PERSON"],
        ],
      );
    }

    for (const s of p.services) {
      await client.query(
        `INSERT INTO provider_service(provider_id, taxonomy_code, fee_min, fee_max, pro_bono_available)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (provider_id, taxonomy_code) DO UPDATE
         SET fee_min = EXCLUDED.fee_min, fee_max = EXCLUDED.fee_max, pro_bono_available = EXCLUDED.pro_bono_available`,
        [p.id, s.code, s.min, s.max, s.proBono],
      );
    }

    await client.query(
      `INSERT INTO credit_balance(provider_id)
       VALUES ($1)
       ON CONFLICT (provider_id) DO NOTHING`,
      [p.id],
    );

    await client.query(
      `INSERT INTO provider_surface_counter(provider_id)
       VALUES ($1)
       ON CONFLICT (provider_id) DO NOTHING`,
      [p.id],
    );
  }

  // 3. Seed demonstration matter for direct fee quote generation
  const activeProviderId = "00000000-0000-4000-8000-000000000020";
  const citizenUserId = "00000000-0000-4000-8000-000000000001";
  const sampleNeedId = "00000000-0000-4000-8000-000000000010";
  const sampleAllocationId = "00000000-0000-4000-8000-000000000005";
  const sampleMatterBookingId = "00000000-0000-4000-8000-000000000003";
  const sampleMatterId = "00000000-0000-4000-8000-000000000007";

  const samplePendingNeedId = "00000000-0000-4000-8000-000000000011";
  const samplePendingAllocationId = "00000000-0000-4000-8000-000000000006";
  const samplePendingBookingId = "00000000-0000-4000-8000-000000000004";

  await client.query(
    `INSERT INTO need_request(id, citizen_user_id, taxonomy_code, district, language, mode_pref, urgency, channel)
     VALUES ($1, $2, 'CIVIL_PROPERTY_DISPUTE', 'Bengaluru Urban', 'English', 'HYBRID', 'STANDARD', 'WEB')
     ON CONFLICT (id) DO NOTHING`,
    [sampleNeedId, citizenUserId],
  );

  await client.query(
    `INSERT INTO eligibility_decision(need_request_id, self_declared, route)
     VALUES ($1, false, 'PAID')
     ON CONFLICT (need_request_id) DO NOTHING`,
    [sampleNeedId],
  );

  await client.query(
    `INSERT INTO allocation(id, need_request_id, provider_id, mode, seed, decided_by)
     VALUES ($1, $2, $3, 'CITIZEN_CHOICE', $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [sampleAllocationId, sampleNeedId, activeProviderId, sampleNeedId, citizenUserId],
  );

  const existingMatterBooking = await client.query("SELECT 1 FROM booking WHERE id = $1", [
    sampleMatterBookingId,
  ]);
  if (!existingMatterBooking.rowCount) {
    await client.query(
      `INSERT INTO booking(id, need_request_id, allocation_id, provider_id, citizen_user_id, slot, status)
       VALUES ($1, $2, $3, $4, $5, tstzrange('2027-03-10T08:00:00Z', '2027-03-10T09:00:00Z', '[)'), 'HELD')`,
      [sampleMatterBookingId, sampleNeedId, sampleAllocationId, activeProviderId, citizenUserId],
    );
    await client.query(
      "UPDATE booking SET status = 'CONFIRMED', updated_at = now() WHERE id = $1",
      [sampleMatterBookingId],
    );
  }

  await client.query(
    `INSERT INTO matter(id, allocation_id, provider_id, citizen_user_id, status)
     VALUES ($1, $2, $3, $4, 'OPEN')
     ON CONFLICT (id) DO NOTHING`,
    [sampleMatterId, sampleAllocationId, activeProviderId, citizenUserId],
  );

  // 4. Seed a pending HELD booking (for Booking Action Center demo)
  await client.query(
    `INSERT INTO need_request(id, citizen_user_id, taxonomy_code, district, language, mode_pref, urgency, channel)
     VALUES ($1, $2, 'CIVIL_PROPERTY_DISPUTE', 'Bengaluru Urban', 'English', 'HYBRID', 'STANDARD', 'WEB')
     ON CONFLICT (id) DO NOTHING`,
    [samplePendingNeedId, citizenUserId],
  );

  await client.query(
    `INSERT INTO eligibility_decision(need_request_id, self_declared, route)
     VALUES ($1, false, 'PAID')
     ON CONFLICT (need_request_id) DO NOTHING`,
    [samplePendingNeedId],
  );

  await client.query(
    `INSERT INTO allocation(id, need_request_id, provider_id, mode, seed, decided_by)
     VALUES ($1, $2, $3, 'CITIZEN_CHOICE', $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [
      samplePendingAllocationId,
      samplePendingNeedId,
      activeProviderId,
      samplePendingNeedId,
      citizenUserId,
    ],
  );

  const existingPendingBooking = await client.query("SELECT 1 FROM booking WHERE id = $1", [
    samplePendingBookingId,
  ]);
  if (!existingPendingBooking.rowCount) {
    await client.query(
      `INSERT INTO booking(id, need_request_id, allocation_id, provider_id, citizen_user_id, slot, status)
       VALUES ($1, $2, $3, $4, $5, tstzrange('2027-03-11T10:00:00Z', '2027-03-11T11:00:00Z', '[)'), 'HELD')`,
      [
        samplePendingBookingId,
        samplePendingNeedId,
        samplePendingAllocationId,
        activeProviderId,
        citizenUserId,
      ],
    );
  }

  await client.query("COMMIT");
  process.stdout.write(
    "Seeded all 5 provider classifications (Advocate, Mediator, Arbitrator, Notary, Document Writer), demo matters, and bookings successfully.\n",
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
