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
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`;

  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket_key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      window_start DOUBLE PRECISION NOT NULL
    )
  `;

  // Promotions: codes + a per-order redemption ledger (usage/limit checks
  // and "revenue attributed" stats are derived from the ledger, never from
  // a mutable counter, so cancelled/rolled-back redemptions stay accurate).
  await sql`
    CREATE TABLE IF NOT EXISTS promo_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      value DOUBLE PRECISION NOT NULL DEFAULT 0,
      min_order_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
      usage_limit INTEGER,
      per_customer_limit INTEGER,
      starts_at TEXT,
      ends_at TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      restricted_product_slugs TEXT,
      restricted_categories TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS promo_redemptions (
      id TEXT PRIMARY KEY,
      promo_code_id TEXT NOT NULL,
      order_id TEXT NOT NULL UNIQUE,
      customer_id TEXT,
      discount_amount DOUBLE PRECISION NOT NULL,
      created_at TEXT NOT NULL
    )
  `;

  // Orders: promo/discount fields (added via ALTER since the table already
  // exists in production).
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code TEXT`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code_id TEXT`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount DOUBLE PRECISION NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS free_shipping BOOLEAN NOT NULL DEFAULT FALSE`;

  // Generic key/value store for editable site copy (hero, about, faq,
  // contact, policies, sale banner) — one JSON blob per key, no schema
  // migration needed when new editable fields are added later.
  await sql`
    CREATE TABLE IF NOT EXISTS site_content (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  // One uploaded COA file (PDF/image) per batch number, in addition to the
  // auto-generated text COA.
  await sql`
    CREATE TABLE IF NOT EXISTS coa_documents (
      batch_number TEXT PRIMARY KEY,
      file_url TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    )
  `;

  // Cost of goods per product, for margin reporting (nullable — margin is
  // simply omitted for products where cost hasn't been entered yet).
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_usd DOUBLE PRECISION`;

  // Refunds are tracked separately from cancellation (which is pre-fulfillment) —
  // a refund can happen on an already-shipped/delivered order.
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at TEXT`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_reason TEXT`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount DOUBLE PRECISION`;

  // Affiliates can optionally be linked to a promo code for attribution —
  // when a customer uses that code, the order counts toward the affiliate.
  await sql`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS affiliate_id TEXT`;

  await sql`
    CREATE TABLE IF NOT EXISTS affiliates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      payment_method TEXT,
      notes TEXT,
      commission_type TEXT NOT NULL DEFAULT 'percent',
      commission_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
      commission_flat_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
      promo_code_id TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  // Commission payment ledger — balance owed is always derived as
  // (commission earned from qualifying orders) - (sum of payouts here).
  await sql`
    CREATE TABLE IF NOT EXISTS affiliate_payouts (
      id TEXT PRIMARY KEY,
      affiliate_id TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      paid_at TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    )
  `;

  // Self-service affiliate portal: a separate code (not the customer-facing
  // promo code) an affiliate enters at login to reach their own /affiliate page.
  await sql`ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS portal_code TEXT`;

  // Tier assigned on application approval (standard/associate/principal/
  // managing_principal/partner) — nullable since affiliates created via the
  // direct-invite path don't require one.
  await sql`ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS tier TEXT`;

  // Public affiliate applications submitted at /partner/apply — reviewed
  // from /command before any real affiliate account or promo code exists.
  await sql`
    CREATE TABLE IF NOT EXISTS affiliate_applications (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      promotion_method TEXT,
      payment_method TEXT,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      verification_token TEXT,
      verification_token_expires_at TEXT,
      reject_note TEXT,
      affiliate_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  // Lightweight funnel/analytics events (page_view, add_to_cart,
  // checkout_started, order_completed) — enough for conversion-funnel
  // reporting without a third-party analytics vendor.
  await sql`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      session_id TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    )
  `;

  // Executive activity log — /command-only visibility, but any executive
  // action (either realm) can be logged here.
  await sql`
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    )
  `;

  // Customer notes (executive-facing only, never shown to the customer).
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS notes TEXT`;

  // Self-service email change — new address is verified before it replaces
  // the account's email so login/notifications never break mid-change.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email_token TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email_token_expires_at TIMESTAMPTZ`;

  // Display name — collected at signup (unified customer/affiliate form).
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT`;

  // Single-use affiliate invite codes generated from /command. The code
  // text doubles as the affiliate's permanent referral/promo code once
  // redeemed, so there's no separate "assign a promo code" step at signup.
  await sql`
    CREATE TABLE IF NOT EXISTS affiliate_invite_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      bound_email TEXT,
      tier TEXT NOT NULL,
      customer_discount_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
      used_by_affiliate_id TEXT,
      used_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL
    )
  `;

  // /hq shared workspace — executives + active affiliates only.
  await sql`
    CREATE TABLE IF NOT EXISTS hq_messages (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_kind TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS hq_announcements (
      id TEXT PRIMARY KEY,
      author_name TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      pinned BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS hq_resources (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      file_url TEXT NOT NULL,
      file_type TEXT,
      uploaded_by TEXT,
      created_at TEXT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS hq_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `;

  // Financial ledger — manual bookkeeping entries. All amounts are USD.
  await sql`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      vendor TEXT,
      amount DOUBLE PRECISION NOT NULL,
      payment_method TEXT,
      notes TEXT,
      receipt_url TEXT,
      recurring BOOLEAN NOT NULL DEFAULT FALSE,
      recurring_frequency TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cogs_entries (
      id TEXT PRIMARY KEY,
      product_slug TEXT,
      batch_number TEXT,
      purchase_price_usd DOUBLE PRECISION NOT NULL,
      supplier TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      date_received TEXT NOT NULL,
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ledger_assets (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      value_usd DOUBLE PRECISION NOT NULL,
      as_of_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ledger_liabilities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      value_usd DOUBLE PRECISION NOT NULL,
      as_of_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS owner_transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      amount_usd DOUBLE PRECISION NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    )
  `;

  console.log("[db:migrate] Schema is up to date.");
}

main().catch((err) => {
  console.error("[db:migrate] Failed:", err);
  process.exit(1);
});
