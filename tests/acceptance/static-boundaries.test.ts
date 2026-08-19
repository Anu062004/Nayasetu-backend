import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const migrationPath = path.join(repositoryRoot, "db", "migrations", "001_foundation.sql");
const hardeningMigrationPath = path.join(
  repositoryRoot,
  "db",
  "migrations",
  "002_integrity_hardening.sql",
);
const grievanceMigrationPath = path.join(
  repositoryRoot,
  "db",
  "migrations",
  "003_grievance_state_machine.sql",
);
const runtimeRolePath = path.join(repositoryRoot, "db", "roles", "runtime.sql");

describe("static blueprint storage boundaries", () => {
  it("does not add narrative or privileged-content columns", async () => {
    const migration = (await readFile(migrationPath, "utf8")).toLowerCase();
    const needDefinition = migration.match(/create table need_request \(([\s\S]*?)\n\);/)?.[1];
    const matterDefinition = migration.match(/create table matter \(([\s\S]*?)\n\);/)?.[1];
    expect(needDefinition).toBeDefined();
    expect(matterDefinition).toBeDefined();
    expect(needDefinition).not.toMatch(/narrative|description|free_text/);
    expect(matterDefinition).not.toMatch(/document|evidence|advice|correspondence|notes?/);
  });

  it("defines no rating, ranking, portfolio, escrow, or client-wallet table", async () => {
    const migration = (await readFile(migrationPath, "utf8")).toLowerCase();
    const tables = [...migration.matchAll(/create table ([a-z_]+)/g)].map((match) => match[1]);
    expect(tables.join(" ")).not.toMatch(/rating|ranking|portfolio|wallet|client_funds|escrow/);
  });

  it("enforces append-only audit and credit tables", async () => {
    const migration = await readFile(migrationPath, "utf8");
    expect(migration).toContain("CREATE TRIGGER credit_event_append_only");
    expect(migration).toContain("CREATE TRIGGER audit_event_append_only");
    expect(migration).toContain("BEFORE UPDATE OR DELETE ON credit_event");
  });

  it("allows ledger writes only through the audited database writer", async () => {
    const hardening = await readFile(hardeningMigrationPath, "utf8");
    const runtimeRole = await readFile(runtimeRolePath, "utf8");
    expect(runtimeRole).toContain("REVOKE INSERT ON credit_event");
    expect(runtimeRole).toContain("REVOKE UPDATE, DELETE, TRUNCATE ON credit_balance");
    expect(runtimeRole).toContain("REVOKE ALL ON schema_migration");
    expect(runtimeRole).toContain("GRANT EXECUTE ON FUNCTION append_credit_event");
    expect(hardening).toContain("'credit_event.appended', 'credit_event'");
    expect(hardening).toContain("INSERT INTO public.audit_event");
  });

  it("stores only a keyed session-token digest", async () => {
    const hardening = (await readFile(hardeningMigrationPath, "utf8")).toLowerCase();
    const sessionDefinition = hardening.match(/create table auth_session \(([\s\S]*?)\n\);/)?.[1];
    expect(sessionDefinition).toBeDefined();
    expect(sessionDefinition).toContain("token_digest bytea");
    expect(sessionDefinition).not.toMatch(/token_plain|raw_token|bearer_token/);
  });

  it("enforces the grievance path in PostgreSQL", async () => {
    const grievanceMigration = await readFile(grievanceMigrationPath, "utf8");
    expect(grievanceMigration).toContain("OLD.status = 'OPEN' AND NEW.status = 'TRIAGED'");
    expect(grievanceMigration).toContain("OLD.status = 'TRIAGED' AND NEW.status IN");
    expect(grievanceMigration).toContain("CREATE TRIGGER grievance_status_transition");
  });
});
