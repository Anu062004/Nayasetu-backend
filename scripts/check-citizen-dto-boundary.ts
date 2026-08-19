import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const citizenSchemaRoot = path.join(
  repositoryRoot,
  "src",
  "interfaces",
  "http",
  "schemas",
  "citizen",
);

const exactForbidden = new Set([
  "score",
  "rank",
  "rating",
  "recommended",
  "topmatch",
  "creditbalance",
  "conductscore",
]);

function isForbidden(name: string): boolean {
  return (
    exactForbidden.has(name) ||
    name.includes("credit") ||
    name.includes("conduct") ||
    name.includes("grievance")
  );
}

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const candidate = path.join(root, entry.name);
      if (entry.isDirectory()) return sourceFiles(candidate);
      return entry.isFile() && candidate.endsWith(".ts") ? [candidate] : [];
    }),
  );
  return nested.flat();
}

const violations: string[] = [];
for (const file of await sourceFiles(citizenSchemaRoot)) {
  const lines = (await readFile(file, "utf8")).split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    // Citizen DTOs use one-property-per-line object/type declarations. Match identifiers and
    // quoted keys at the start of a declaration without scanning comments or string values.
    const property = line.match(/^\s*(?:["']([^"']+)["']|([A-Za-z_$][\w$]*))\s*[?:]/);
    const rawName = property?.[1] ?? property?.[2];
    if (!rawName) continue;
    const name = rawName.replaceAll(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (isForbidden(name)) {
      violations.push(
        `${path.relative(repositoryRoot, file)}:${index + 1} forbidden citizen DTO property '${name}'`,
      );
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Citizen DTO boundary check passed.\n");
}
