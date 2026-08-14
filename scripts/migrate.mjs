// Creates/updates the Postgres schema and seeds initial inventory.
// Run via `npm run db:migrate` — a deliberate manual step, not part of the
// build (a transient DB issue during `next build` shouldn't fail deploys).
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "DATABASE_URL is not set in .env.local. See LAUNCH_CHECKLIST.md for how to create a free Neon Postgres database."
  );
  process.exit(1);
}

const sql = neon(connectionString);

// Initial stock levels — same illustrative values the app shipped with.
const INITIAL_INVENTORY = {
  "bpc-157": { quantity: 42, threshold: 20 },
  "tb-500": { quantity: 18, threshold: 20 },
  semaglutide: { quantity: 65, threshold: 25 },
  tirzepatide: { quantity: 12, threshold: 20 },
  epithalon: { quantity: 8, threshold: 15 },
  selank: { quantity: 30, threshold: 15 },
  "nad-plus": { quantity: 5, threshold: 15 },
  "ghk-cu": { quantity: 50, threshold: 20 },
  "aod-9604": { quantity: 22, threshold: 15 },
  "ipamorelin-cjc-1295-blend": { quantity: 9, threshold: 15 },
};

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL,
      saved_address TEXT,
      verification_token TEXT,
      verification_token_expires_at TEXT,
      reset_token TEXT,
      reset_token_expires_at TEXT,
      role TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      customer_id TEXT,
      customer TEXT NOT NULL,
      items TEXT NOT NULL,
      subtotal DOUBLE PRECISION NOT NULL,
      total DOUBLE PRECISION NOT NULL,
      crypto TEXT,
      paid_at TEXT,
      processing_at TEXT,
      shipped_at TEXT,
      delivered_at TEXT,
      cancelled_at TEXT,
      cancel_reason TEXT,
      carrier TEXT,
      tracking_number TEXT,
      stock_decremented BOOLEAN NOT NULL DEFAULT FALSE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS inventory (
      slug TEXT PRIMARY KEY,
      quantity INTEGER NOT NULL,
      threshold INTEGER NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket_key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      window_start DOUBLE PRECISION NOT NULL
    )
  `;

  console.log("[db:migrate] Schema is up to date.");

  const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM inventory`;
  if (count === 0) {
    for (const [slug, level] of Object.entries(INITIAL_INVENTORY)) {
      await sql`
        INSERT INTO inventory (slug, quantity, threshold)
        VALUES (${slug}, ${level.quantity}, ${level.threshold})
        ON CONFLICT DO NOTHING
      `;
    }
    console.log(`[db:migrate] Seeded initial inventory (${Object.keys(INITIAL_INVENTORY).length} products).`);
  }
}

main().catch((err) => {
  console.error("[db:migrate] Failed:", err);
  process.exit(1);
});
