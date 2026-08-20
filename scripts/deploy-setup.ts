import { execSync } from "node:child_process";

function run(command: string) {
  process.stdout.write(`> ${command}\n`);
  execSync(command, { stdio: "inherit", env: process.env });
}

try {
  run("npm run db:migrate");
  run("npm run db:validate-credential-constraints");
  run("npm run db:apply-runtime-role");
  run("npm run db:verify");
  process.stdout.write("Deploy setup completed successfully.\n");
} catch (error) {
  process.stderr.write(
    `Deploy setup failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exit(1);
}
