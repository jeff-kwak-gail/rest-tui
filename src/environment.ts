import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";

export interface Environment {
  name: string;
  filePath: string;
  variables: Record<string, string>;
}

export function listEnvironments(cwd: string): Environment[] {
  const files = readdirSync(cwd)
    .filter((f) => f.endsWith(".env") && !f.startsWith("."))
    .sort();

  return files.map((filename) => {
    const filePath = join(cwd, filename);
    const content = readFileSync(filePath, "utf-8");
    const variables = parse(content);

    // Derive name: "development.env" -> "development"
    const name = filename.slice(0, -4);

    return { name, filePath, variables };
  });
}

export function createEnvironment(cwd: string, name: string): Environment | null {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const filename = `${slug}.env`;
  const filePath = join(cwd, filename);
  if (existsSync(filePath)) return null;
  writeFileSync(filePath, "", "utf-8");
  return { name: slug, filePath, variables: {} };
}
