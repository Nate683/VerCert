// READ-ONLY (owner-authorized 2026-11-21): the CJC-1295 products' names in production, exactly as stored.
// One transaction opened READ ONLY, so Postgres refuses any write. Run from the repo root.
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);
console.log("database host:", new URL(process.env.DATABASE_URL).hostname);
const [rows] = await sql.transaction((tx) => [
  tx`SELECT slug, name, active, alternate_names, updated_at FROM products WHERE slug LIKE 'cjc-1295%' ORDER BY slug`,
], { readOnly: true });
for (const r of rows) console.log(JSON.stringify(r));
console.log("Read-only: nothing was written.");
