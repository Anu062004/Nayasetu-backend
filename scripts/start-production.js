import { execSync } from "node:child_process";

console.log("==========================================");
console.log("  NyayaSetu Rails — Production Startup    ");
console.log("==========================================");

if (process.env.DATABASE_URL) {
  try {
    console.log("Applying database migrations...");
    execSync("npx tsx scripts/migrate.ts", { stdio: "inherit", env: process.env });
    console.log("Applying demonstration seed dataset...");
    execSync("npx tsx scripts/seed-dev.ts", { stdio: "inherit", env: process.env });
  } catch (err) {
    console.warn("Migration/seed notice:", err.message);
  }
} else {
  console.warn("DATABASE_URL is not configured.");
}

console.log("Starting Web API & Interface Server...");
execSync("node dist/bin/api.js", { stdio: "inherit", env: process.env });
