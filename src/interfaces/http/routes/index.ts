import type { FastifyInstance } from "fastify";
import { registerCitizenProfileRoutes } from "./citizen-profile.js";
import { registerConductInstitutionalRoutes } from "./conduct-institutional.js";
import { registerGoogleAuthRoutes } from "./google-auth.js";
import { registerIdentityProviderRoutes } from "./identity-provider.js";
import { registerIntakeAllocationRoutes } from "./intake-allocation.js";
import { registerLedgerSettlementRoutes } from "./ledger-settlement.js";
import { registerSchedulingMatterRoutes } from "./scheduling-matter.js";

export async function registerProductRoutes(app: FastifyInstance): Promise<void> {
  await registerCitizenProfileRoutes(app);
  await registerGoogleAuthRoutes(app);
  await registerIdentityProviderRoutes(app);
  await registerIntakeAllocationRoutes(app);
  await registerSchedulingMatterRoutes(app);
  await registerLedgerSettlementRoutes(app);
  await registerConductInstitutionalRoutes(app);
}
