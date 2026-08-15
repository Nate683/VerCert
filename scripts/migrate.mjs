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
    CREATE TABLE IF NOT EXISTS products (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      cas_number TEXT NOT NULL,
      molecular_formula TEXT NOT NULL,
      molecular_weight TEXT NOT NULL,
      purity_percent DOUBLE PRECISION NOT NULL,
      sequence_or_form TEXT NOT NULL,
      storage TEXT NOT NULL,
      sizes TEXT NOT NULL,
      batch_numbers TEXT NOT NULL,
      summary TEXT NOT NULL,
      description TEXT NOT NULL,
      primary_image_url TEXT,
      gallery_image_urls TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
}

main().catch((err) => {
  console.error("[db:migrate] Failed:", err);
  process.exit(1);
});
