// One-time helper: imports data from the old local SQLite database
// (data/vericert.db) into Postgres. Safe to run more than once — existing
// rows are skipped via ON CONFLICT DO NOTHING. Run via `npm run db:import-sqlite`.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { existsSync } from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set in .env.local. See LAUNCH_CHECKLIST.md.");
  process.exit(1);
}

const sqliteFile = path.join(process.cwd(), "data", "vericert.db");
if (!existsSync(sqliteFile)) {
  console.log("[db:import-sqlite] No data/vericert.db found — nothing to import.");
  process.exit(0);
}

const sqlite = new DatabaseSync(sqliteFile);
const sql = neon(connectionString);

async function main() {
  const users = sqlite.prepare("SELECT * FROM users").all();
  for (const u of users) {
    await sql`
      INSERT INTO users
        (id, email, password_hash, marketing_opt_in, email_verified, created_at, saved_address, verification_token, verification_token_expires_at, reset_token, reset_token_expires_at, role)
      VALUES
        (${u.id}, ${u.email}, ${u.passwordHash}, ${Boolean(u.marketingOptIn)}, ${Boolean(u.emailVerified)}, ${u.createdAt}, ${u.savedAddress ?? null}, ${u.verificationToken ?? null}, ${u.verificationTokenExpiresAt ?? null}, ${u.resetToken ?? null}, ${u.resetTokenExpiresAt ?? null}, ${u.role ?? null})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log(`[db:import-sqlite] Imported ${users.length} user(s).`);

  const orders = sqlite.prepare("SELECT * FROM orders").all();
  for (const o of orders) {
    await sql`
      INSERT INTO orders
        (id, reference, created_at, status, payment_method, customer_id, customer, items, subtotal, total, crypto, paid_at, processing_at, shipped_at, delivered_at, cancelled_at, cancel_reason, carrier, tracking_number, stock_decremented)
      VALUES
        (${o.id}, ${o.reference}, ${o.createdAt}, ${o.status}, ${o.paymentMethod}, ${o.customerId ?? null}, ${o.customer}, ${o.items}, ${o.subtotal}, ${o.total}, ${o.crypto ?? null}, ${o.paidAt ?? null}, ${o.processingAt ?? null}, ${o.shippedAt ?? null}, ${o.deliveredAt ?? null}, ${o.cancelledAt ?? null}, ${o.cancelReason ?? null}, ${o.carrier ?? null}, ${o.trackingNumber ?? null}, ${Boolean(o.stockDecremented)})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log(`[db:import-sqlite] Imported ${orders.length} order(s).`);

  const inventory = sqlite.prepare("SELECT * FROM inventory").all();
  for (const i of inventory) {
    await sql`
      INSERT INTO inventory (slug, quantity, threshold)
      VALUES (${i.slug}, ${i.quantity}, ${i.threshold})
      ON CONFLICT (slug) DO UPDATE SET quantity = EXCLUDED.quantity, threshold = EXCLUDED.threshold
    `;
  }
  console.log(`[db:import-sqlite] Synced ${inventory.length} inventory row(s).`);
}

main().catch((err) => {
  console.error("[db:import-sqlite] Failed:", err);
  process.exit(1);
});
