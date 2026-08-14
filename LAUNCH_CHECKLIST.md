# VeriCert — Launch Checklist

Everything below is stuff a person (not code) has to do before this can take a
real order. Grouped by what kind of decision/action it is.

## 1. Accounts to create

- **Neon Postgres** (database) — neon.tech. Create a free project, copy its
  connection string into `DATABASE_URL`. This is what makes the app
  deployable to Vercel (see Infrastructure below).
- **Coinbase Commerce** (crypto payments) — commerce.coinbase.com. Create an
  account, get an API key, and create a webhook subscription pointed at
  `https://yourdomain.com/api/webhooks/coinbase` to get a webhook shared
  secret.
- **A real bank account** for ACH/wire transfers (business checking, ideally
  under the same legal entity that's selling). You'll put its account/routing
  numbers into the app (see `src/lib/bank-details.ts` — currently placeholder
  data).
- **SMTP provider** for transactional email (order confirmations, shipping
  notices, password resets) — e.g. Postmark, SES, SendGrid, or your own
  mailbox's SMTP. Without this, emails just get logged to the server console.
- **Resend** (resend.com) — only needed if you want the marketing "Compose
  Email" feature in the executive terminals to actually send.
- **Anthropic** (console.anthropic.com) — only needed for the executive
  "Assistant" chat tab.
- **A domain + hosting** (see Infrastructure below).

## 2. Business decisions

- Real bank transfer details (account name/number/routing/SWIFT) to replace
  the placeholder in `src/lib/bank-details.ts`.
- Shipping: what carriers you'll actually use, turnaround time, whether you
  print labels through a carrier API later (right now tracking numbers are
  entered manually by staff in the executive terminal).
- Refund/cancellation policy — the app supports cancelling an order (restocks
  inventory) but has no automated refund flow for money already sent
  (crypto/bank transfers are non-reversible by nature; you'll handle refunds
  manually/off-platform).
- Legal: Terms & Privacy Policy content (footer currently just labels these,
  no real policy page), business registration/entity, and — given the
  product category — confirm which states/countries you will and won't ship
  research chemicals to, and any required licensing.
- Sales tax / international duties handling (not calculated anywhere in
  checkout today — currently a flat "Calculated at next step" placeholder).
- Who holds the two executive accounts long-term: currently
  `nate.robson0@gmail.com` (Command) and `ryancalpacific@aol.com` (Office).

## 3. Environment variables to fill in (`.env.local` in production)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string from your Neon project |
| `NEXT_PUBLIC_SITE_URL` | Your real domain (used in emails, redirects, webhooks) |
| `COINBASE_COMMERCE_API_KEY` | From Coinbase Commerce dashboard |
| `COINBASE_COMMERCE_WEBHOOK_SECRET` | From the webhook you create in Coinbase |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `EMAIL_FROM` | Your transactional email provider |
| `SESSION_SECRET` | A long random string — **generate a real one**, don't use the dev fallback in production |
| `COMMAND_PASSWORD` / `OFFICE_PASSWORD` | Only used to seed each executive's account the very first time they log in — after that, they control their password via the normal "Forgot password" flow. Set these to strong one-time values before the first real login. |
| `RESEND_API_KEY` / `MARKETING_EMAIL_FROM` | Optional — marketing email compose feature |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Optional — executive Assistant tab |

## 4. Infrastructure

- **Database**: hosted Postgres on Neon, accessed via the serverless HTTP
  driver (`@neondatabase/serverless`) — no connection pooling to manage, and
  it works from Vercel serverless functions, a VPS, or anywhere else without
  changes. Run `npm run db:migrate` once after setting `DATABASE_URL` (and
  again after pulling any future schema change) to create/update the schema.
  This is a deliberate manual step, not part of `build` — a transient DB
  connectivity issue during a Vercel build shouldn't be able to fail your
  whole deployment.
- **Deploying on Vercel**: for the tightest integration, add Postgres from
  the Vercel dashboard's Storage tab (this provisions a Neon database and
  auto-populates `DATABASE_URL` for all environments) — or create the Neon
  project directly at neon.tech and add `DATABASE_URL` yourself via
  `vercel env add`. Either way, Vercel's serverless filesystem is fine now
  since nothing is written to local disk anymore.
- **Back up your Neon database regularly** (Neon supports point-in-time
  restore on paid plans — check the retention window on your plan). It's the
  entire business: orders, customers, inventory.
- **Run behind HTTPS** (required for real payment webhooks and cookie
  security — cookies are only marked `secure` when `NODE_ENV=production`).
  Vercel does this automatically.
- **Rate limiting is backed by Postgres**, so it stays correct even across
  multiple serverless function instances/regions, since they all share the
  same database.
- If you sit behind a reverse proxy/load balancer (or Vercel, which does this
  for you), make sure `X-Forwarded-For` is set correctly — the rate limiter
  and IP-based checks trust that header.

## 5. Before flipping the switch

- Place a real, small end-to-end test order through **both** payment paths
  (a real crypto payment for a few dollars, and a real bank transfer) and
  confirm: the webhook/status polling marks it paid, stock decrements,
  confirmation/payment-confirmed emails actually arrive (not just console
  logs), and the executive terminal shows it correctly.
- Change the executive account passwords away from the `COMMAND_PASSWORD`
  `OFFICE_PASSWORD` seed values via the normal "Forgot password" flow once
  live.
- Clear out test data before real customers arrive — either start from a
  fresh Neon database/branch, or `DELETE FROM orders; DELETE FROM users
  WHERE role IS NULL;` to wipe test accounts/orders while keeping the two
  executive accounts.
- Double check the seeded stock quantities in `scripts/migrate.mjs`
  (`INITIAL_INVENTORY`) reflect your real starting inventory — they're
  currently illustrative placeholder numbers (only applied the first time
  the `inventory` table is empty; update the table directly if you've
  already migrated).
- Review the rate limit thresholds in each `checkRateLimit(...)` call
  (`src/app/api/auth/*`, `src/app/api/orders/route.ts`) and tune to taste.

## What's already handled

- Real Coinbase Commerce integration (charge creation, webhook signature
  verification, and polling fallback reconciliation).
- Bank transfer flow with a unique reference, emailed instructions, and
  manual "mark paid" from either executive terminal.
- Payment layer is abstracted (`src/lib/payments/`) so a card processor can
  be added later as a new provider without touching checkout.
- Full order pipeline: awaiting payment → paid → processing → shipped
  (with carrier/tracking) → delivered, plus cancel (auto-restocks), all
  from either executive terminal.
- Order confirmation, payment-received, and shipping-notification emails.
- A public order tracking page (`/order/[reference]`) that works after a
  closed browser/refresh since it's server-rendered from the database.
- Hosted Postgres persistence (Neon) for orders, customers, and inventory —
  works on Vercel serverless out of the box. `npm run db:migrate` creates the
  schema; `npm run db:import-sqlite` is a one-off helper to bring over data
  from an old local `data/vericert.db` file, if you have one.
- Rate limiting on login, signup, forgot-password, and order creation.
- Zod input validation on every money-path and auth request body.
