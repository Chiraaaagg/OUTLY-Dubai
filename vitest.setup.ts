import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Vitest loads no env by default. The database integrity tests need
 * DATABASE_URL / DIRECT_URL from .env.local, so parse it here the same way
 * `node --env-file` does: KEY=VALUE lines, optional surrounding quotes, `#`
 * comments ignored, and never override a variable already in the environment
 * (CI sets its own). Nothing here is logged.
 */
function loadDotEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    const quoted = value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
    if (quoted) value = value.slice(1, -1);
    else {
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv(path.resolve(process.cwd(), ".env.local"));
