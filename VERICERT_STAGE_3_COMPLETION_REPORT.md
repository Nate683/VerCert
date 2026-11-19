# VeriCert Peptides — Stage 3 Completion Report
## Checkout ↔ Inventory, Order Management, Lot Tracking, Payment Architecture, Stage 2 Correction

**Status: built and tested LOCALLY ONLY. Not committed, not pushed, not deployed. No production migration was run, not
even a dry run. Production data was not read or written at any point.**

Local checkpoint: tag `stage3-checkpoint` → `023cdf6` (the last commit before Stage 3). All Stage 3 work is uncommitted
in the working tree.

Owner decisions this stage is built on (2026-11-18):
- **A1, option 2:** existing stock goes into one quarantined reconciliation lot per strength (`RECON-<SKU>`). It is
  not approved and not sellable.
- **Q1:** a refund after shipment restores no stock; goods come back only through a recorded return.
- **Q2:** the existing "bank transfer" stays a separate manual method; ACH is a new provider-backed method, switched off.
- **Q3:** for Zelle, an amount mismatch is refused and the order goes to Administrative Review.
- **Q4:** an administrator may void a Zelle or bank-transfer confirmation, before shipment only.

Further owner decisions (2026-11-18, final-corrections round):
- **D7 reversed:** manual bank transfer **and** Zelle stay unavailable to customers until you explicitly authorize
  them. Every method is now off by default.
- **Expiry:** request-time expiry is the primary mechanism, with a daily sweep as the backstop. Expired reservations
  are evaluated every time available-to-sell is calculated, not only at purchase.

> **Updated 2026-11-18 (final-corrections round).** Part 0 below covers the corrections and the current test results.
> Where an older section conflicts with Part 0, Part 0 is current. The superseded statements are corrected inline.

---

## 0A. Owner decisions on the corrections (round 3, 2026-11-18) — current

| # | Decision | Status |
|---|---|---|
| Hold copy (§0.2) | **Approved.** Re-checked against your criteria: neither the email nor the order-page text mentions stock levels, internal review, or the reason. Neither asks the customer to reply (the email points to the Contact page). The hold-email test fails if the email contains stock, inventory, insufficient, review, quarantine, lot, reason, reply, suspect, fraud or verify-your-identity wording. | Final |
| D2 | **Keep:** any refund removes the order from commission (`qualifiesForCommission`). | Unchanged, as built |
| D3 | **Approved:** Stage 2 partial refunds are shown as partially refunded and counted at net revenue (listed in the dry run). | As built |
| D4 | **Built:** a lot can't be approved without a **VeriCert lot number**, whatever its testing status, including the reconciliation and returns lots. Enforced in the database (`vc_lot_update`). The Stock tab blocks the Approve save and says why. | Engine 3 checks; API 2; browser 1 |
| D5 | **Built:** when removing approval from a lot puts unshipped **paid** orders on hold, each customer gets the approved hold message once (payment received, shipping held pending a check), with nothing about the lot, quarantine or the reason. A failed reallocation on the same hold doesn't send it again. An ACH payment still "processing" hasn't been received, so that customer isn't told it was. | Engine 1; API 4 |
| D6, D7, D8 | Holding | — |

**Note on D5:** when a hold is lifted (lot re-approved, or reallocation succeeds), no "back on track" email is
sent; the customer's next message is the shipping notification. A separate "hold lifted" email would need copy from
you.

**Test results after round 3** (fresh database, final code): migration 15/15 · engine **125/125** · API A
**131/131** · browser **43/43** · Stage 2 rebuilt 35/35 · regression 36/36 · API B 38/38. **Total 423/423.**
TypeScript 0 errors; ESLint 0 errors, 0 warnings over 76 files; `next build` succeeds. One failure during the run was
a test fault (it expected "pending" for a lot the script had already quarantined) and was fixed in the test.

---

## 0. Final corrections (round 2)

### 0.1 What changed

| # | Correction | What was built | Tested by |
|---|---|---|---|
| 1 | **Lots shown to customers** | New order lines carry no lot at checkout. The order page and the payment-confirmed and shipping emails show only the VeriCert lot(s) each line was **actually filled from**, taken from committed allocations, with quantities when one line spans several lots. Nothing is shown before stock is allocated. A lot number stored on an older line (the product's first listed batch at checkout) is no longer shown to customers; the stored data is untouched. Allocation history is unchanged and complete. | API A: allocated lot shown; listed batch not shown; stored assumed lot not shown; email names the allocated lot |
| 2 | **Payment received, order on hold** | If payment is verified but the order can't go to fulfillment (insufficient stock, late payment, or a failed reallocation), the customer gets **one** "payment received, we're completing a final check" email **instead of** "your order is now processing", and the order page says the same. The "processing" email follows only once the hold is resolved and stock is allocated. Each message is once-only, guaranteed by a unique row in the order's history. The internal reason is never shown. The administrative indicator is unchanged (Needs review badge, review banner, filter). **The copy is a draft for your approval: §0.2.** | API A: 1 hold message and 0 processing messages; processing exactly once after resolution; order page wording; email wording (dev email log); API A reallocation hold: 1 message |
| 3 | **Partial refunds** | New append-only `order_refunds` table, one row per refund with its amount and running total. `refund_amount` is cumulative. The total can never exceed the amount paid, enforced in the database. "Partially refunded" while below that; "Fully refunded" when it reaches it. Only the completing refund cancels and restocks an unshipped order; after shipment nothing restocks. Blank amount means the remaining balance. Each submission has an idempotency key. One shared revenue rule (`lib/orders/revenue.ts`): partially refunded orders count at their **net** amount in the overview, financials, ledger and customer lifetime value; fully refunded, cancelled and reversed orders count nothing. | Engine: partial 5, duplicate, partial 10, over-refund refused, completing refund, history 5→15→20, append-only, shipped partial/partial/full with no stock change. API A: partials, duplicate, over-refund 400, revenue −20 net, then −total when full. |
| 4 | **Controlled reallocation** | A new atomic action (`vc_order_reallocate`, **Reallocate to approved lots…** on the order). It only applies before shipment, and only to allocations whose lot is no longer eligible. Units go back to their own lot, where the lot's status still applies, and the same quantity is taken FIFO from **approved lots of the same strength**. The original allocation is kept as `restored` with the reason; each new allocation records which one it replaced (`replaces_allocation_id`). The reason must be at least 10 characters, and the actor and time are recorded. If approved stock is short, nothing moves, the order stays on hold, and the customer gets the hold message once. **New:** removing approval from a lot automatically puts every unshipped order filled from it into review, so it can't be shipped by mistake; re-approving the lot lifts those automatic holds. | Engine: 13 checks (multi-lot, history, SKU total unchanged, movements, short stock goes on hold with nothing moved, refused when all lots approved, refused after shipment). API A: 7 checks. |
| 5 | **Reconciliation lots / initial quantities** | Checked that an administrator can reduce a `RECON-<SKU>` lot to any value, including 0, by count or removal, using the new reasons "Not physically received (planned quantity)" and "Not physically received". The SKU total follows, the movement is recorded, and the lot stays quarantined. Actual stock can be received into a lot identified **only by its VeriCert lot number**, with no manufacturer lot needed; it starts pending and isn't sellable. Nothing is approved automatically. No purchasing system was built. | Engine: 6 checks. API A: 3 checks. |
| 6 | **Payment-method activation** | Every method is off by default, including bank transfer and Zelle (`DEFAULT_PAYMENT_CONFIG.enabled = {}`). Bank transfer and Zelle stay separate, and ACH stays separate from bank transfer. All eight integration points are kept. Subscription renewals wait while bank transfer is off. | API A: none offered by default; bank transfer and Zelle "ready but off"; **all 10 methods refused on a direct API request while off**; no order saved |
| 7 | **Reservation expiry** | Every read of available-to-sell (shop, product page, catalog, checkout, and now the Stock tab's Available figure) treats a hold whose time has run out as free **at the moment of reading**, without writing anything. Checkout releases expired holds on the strengths it touches, and the order page releases its own. **Daily backstop** added to `vercel.json` (`/api/cron/reservations` at 14:30 UTC, allowed on every plan); it is not deployed. The heartbeat warning now fires when the daily run is more than 26 hours old, or has never run. `CRON_SECRET` is required: the route refuses without it. | API B: product page before any sweep shows the stock (not Out of Stock); Stock-tab Available counts the expired hold; nothing released by reading; checkout and order-page release; cron release; heartbeat; manual release. API A: cron without or with a wrong secret → 401. |
| 8 | **Migration safety** | The dry run prints a **content manifest** of the database it runs on (every product with CAS, formula and a content fingerprint; every strength with SKU, id, label, price, active, status and quantity). The fingerprint check now runs **inside the transaction**: any change to products, strengths, stock rows, existing movements, legacy inventory, certificate records, lots or files, subscriptions, or orders other than the listed status mappings rolls the whole migration back. The migration **stops** if BPC-157 20mg is active, never changes it, and asserts it is still deactivated afterwards. Stage 2 partial refunds are mapped to "partially refunded" and listed. | Migration suite (15): dry run writes nothing; manifest; partial refunds listed; BPC active → stop; **planted mid-migration product edit → whole migration rolled back**; clean apply leaves products, strengths, prices, SKUs, stock and certificates byte-identical; mappings; re-run does nothing |
| 9 | **Stage 2 coverage rebuilt** | `scripts/stage3-tests/t-stage2.mjs` (35 checks): adjustments; 12 invalid inputs; duplicate submission; concurrency (+20 exactly; 25 removals against 21 → 21 succeed, floor 0); stale count; movement chain, actor and reason, append-only; thresholds and levels; stock never changes status; deactivate/reactivate/rename; authorization; no admin data in public pages; and in the browser: Stock search and filters and product totals, B1, B2, B3, and B4 (measured **4.64:1**). See §0.4 for what could not be reconstructed. | itself |

### 0.2 Customer copy for your approval (draft — not final)

**Email** (subject: `Payment received — VeriCert order VC-XXXXXX`):

> Hi {first name},
>
> Thank you — we've received your payment of ${amount} USD for order {reference}.
>
> Before your order ships, we're completing a final check on it. There's nothing you need to do. We'll email you as
> soon as it's on its way, or contact you directly if anything about your order needs to change.
>
> If you have a question in the meantime, contact us at {site}/contact.
>
> Order number · Items · Total paid · link to the order page · "For research use only…" · — VeriCert Peptides

**Order page** while on hold: eyebrow "Payment Received", heading "We're completing a final check before shipping." Next steps:
1. "We've received your payment for this order."
2. "Before it ships, we're completing a final check. There's nothing you need to do."
3. "We'll email you as soon as it's on its way, or contact you directly if anything about your order needs to change."

The copy doesn't mention stock, review, verification or the internal reason; the test checks for none of those
words. I wrote "contact us at …/contact" rather than "reply to this email" because I don't know that replies to the
sending address reach anyone. The existing SMS ("Payment received for order … ($…)") is still sent once; it is true
either way.

### 0.3 Answers to the section B questions

- **Vercel plan:** it can't be determined from the project. `.vercel/` holds only `repo.json`, and there is no CLI.
  Check vercel.com → team → **Settings → Billing**. The design doesn't depend on the plan: request-time expiry is
  primary, and the sweep runs daily, which every plan allows.
  - **Measured local cost:** about +0.7 ms (0 live reservations) to +1.2 ms (500 live reservations) on each stock
    read, and about 0.26 ms on each checkout.
  - It adds no queries and no round trips; the work happens inside queries that already run.
- **Phantom inventory:** quantity **does** drive customer-facing display wherever a strength is In Stock:
  - the product page's "Low stock: only N left"
  - catalog cards
  - **signed-out homepage featured cards** (`withPublicPrice` keeps the product-level stock)
  - JSON-LD availability, Add to Cart, the quantity cap, and checkout and renewals

  After the migration the shop reads only sellable (approved-lot) units. While stock exists only in reconciliation
  lots, API A confirms that the signed-out home, signed-in home, catalog and product page show no count and no
  in-stock state.
- **Production content drift:** the migration copies nothing from the local snapshot and writes no product content.
  The manifest lets you confirm production's content before approving, and the in-transaction guard rolls back any
  change (§0.1 #8).
- **Subscriptions:** production had **0** at the Stage 1 run (2026-11-14, Stage 1 report). They're only created by a
  successful checkout, which is refused while ordering is off. I haven't read production since. To confirm, run this
  read-only query, or authorize me to:
  `SELECT (SELECT count(*) FROM subscriptions) AS subscriptions, (SELECT value FROM site_content WHERE key = 'ordering') AS ordering;`

### 0.4 Stage 2 coverage: what could not be reconstructed

The rebuilt suite is written from the Stage 2 report's descriptions. It is **not** the original 43 checks, whose
code was lost. Not rebuilt, and not claimed:
- the separate Stage 2-era suites: catalog/product page (87), typography (80), UI (43), auth (35), change password
  (24), reset (18), catalog gate (13), certificates API (79) and browser (24). `t-regress.mjs` covers parts of these.
- "Reserved is always 0": obsolete by design.
- The production reconciliation (47/47): it read production.

### 0.5 Test results (final run, fresh database, final code)

| Suite | Checks | Result |
|---|---|---|
| Migration safety (`t-migration.mjs`) | 15 | **15/15** |
| Engine (`t-engine.mjs`) | 121 | **121/121** |
| API, simulation off (`t-api.mjs` Part A) | 126 | **126/126** |
| Browser (`t-ui.mjs`) | 42 | **42/42** |
| Stage 2 rebuilt (`t-stage2.mjs`) | 35 | **35/35** |
| Stage 1/2 regression (`t-regress.mjs`) | 36 | **36/36** |
| API, simulation on (`t-api.mjs` Part B) | 38 | **38/38** |
| **Total** | **413** | **413/413** |
| TypeScript | — | 0 errors |
| ESLint, 76 changed/new files | — | 0 errors, 0 warnings |
| `next build` | — | succeeds |

**Failures during this round, all fixed and re-run:**
- **Real gap:** re-approving a lot didn't lift the automatic "reallocation needed" holds it had caused. Fixed in
  `vc_lot_update`.
- **Expected change:** an existing ship-refusal check now sees the review message first, because quarantine now
  holds the order.
- **Test faults:**
  - the existing 20-orders-per-hour limit was tripped twice (the limit is unchanged; the test now resets it)
  - deactivated the only strength of a product (refused by the existing rule)
  - "semax" also matches "semax-selank-blend"
  - missed CSS uppercasing and collapsed strength panels in the editor
  - my B4 test parsed an `oklab()` colour as RGB and reported 4.00:1. The browser's own sRGB conversion gives
    4.64:1, matching a hand calculation and Stage 2's 4.62:1. The badge was never below AA.

### 0.6 Remaining limitations and decisions

| # | Item | Current behaviour | Your decision |
|---|---|---|---|
| D1 | Hold copy (§0.2) | Draft in place | Approve or edit |
| D2 | Commission on a partially refunded order | **Unchanged from before Stage 3:** any refund removes the order from commission | Keep, or pay commission on the net amount |
| D3 | Stage 2 partial refunds in production (the dry run lists them) | Mapped to "partially refunded", so revenue reports count them at **net** instead of excluding the whole order | Approve the mapping when you review the dry run |
| D4 | A lot with no VeriCert lot number | Can be approved; customers then see no lot number for units from it | Keep, or require a VeriCert lot number before a lot can be approved |
| D5 | Hold email when a lot is quarantined | Not sent automatically, because an administrator may reallocate straight away. Sent if a reallocation fails, or at payment time. | Keep, or email on the automatic hold too |
| D6 | Refund dates in reports | A refund reduces revenue on the **sale's** date, not the refund date | Keep, or report refunds by refund date |
| D7 | Product-level margin | Partial refunds reduce order-level revenue; per-product margin stays gross (a refund isn't tied to a line) | Keep |
| D8 | Vercel plan, `CRON_SECRET`, Zelle recipient, payment providers | Unconfirmed / unset | As before |

**Production prerequisites (unchanged except as noted):**
1. You approve.
2. Dry run against production (read-only; it now includes the content manifest). You approve it.
3. `--apply`.
4. Push. The push now also carries the daily cron entry in `vercel.json`.
5. In Vercel → Project → Settings → Environment Variables (Production), add `CRON_SECRET`, a long random value.
   Vercel sends it to cron routes automatically; the subscriptions cron uses the same variable. Redeploy.
6. You reduce, split and approve lots, then switch payment methods and ordering on.

None of this has been done.

---

## 1. Executive summary

- **Orders and stock are now connected.**
  - A reserving method (the three crypto methods, 30 minutes by default) holds stock at checkout. Creating the order
    and holding the stock happen in one transaction, so if the hold is refused there is no order.
  - Zelle and bank transfer hold nothing. Stock is deducted FIFO from approved lots when an administrator confirms
    the payment.
  - If stock is short at that moment, the payment is still recorded but nothing is deducted; the order goes to
    **Administrative Review** instead of being oversold.
- **All stock logic now lives in Postgres functions.** Every stock change is one call, so it is atomic, idempotent
  and lock-ordered. The Neon HTTP driver can't hold a transaction open across round trips, so this is the only way to
  get atomicity. The database also refuses, at commit, any state where a SKU's totals differ from the sum of its lots.
- **Lots.**
  - Lots are linked to the permanent strength ID and allocated FIFO.
  - Only approved, not-failed, unexpired lots can be sold.
  - Nothing is approved automatically. Approving an untested lot, or the reconciliation lot, needs a written
    justification.
- **Payment status and fulfillment status are now separate columns.** The old `status` column is derived from them by
  the database, so every existing page and email keeps working.
- **Zelle and bank-transfer confirmation** requires the confirmation reference or transaction ID, the amount, the
  date received and an attestation. The reference is stored on the order with the administrator and time, and one
  reference can never confirm two orders. **Mark Paid and Bulk Mark Paid are removed** (governance C).
- **Reservations are visible and releasable** (governance B): a new Executive Office tab lists every live hold,
  flags the stuck ones, allows a manual release with a reason, and shows the expiry job's heartbeat.
- **No payment method has a live integration.** The architecture for all eight is built. Provider methods can't
  reach a customer even when switched on (see §6).
- **Stage 2 correction:** opening a SKU in the Stock tab scrolls its panel into view (see §2).
- **Tests:** *(superseded: now 413 checks across 7 suites, all passing; see §0.5.)* The first round had 283
  automated checks across 5 suites, all passing, plus TypeScript (0 errors), ESLint (0 errors, 0 warnings, 65 files)
  and a successful production build. All of it was local (see §10).

**Before production, the one consequence to understand:** the migration moves every existing unit (2,377 in
production as of Stage 2) into quarantined reconciliation lots. Until administrators split those into real lots and
approve them, or approve a reconciliation lot with a justification, **sellable stock is 0 for every SKU**. Signed-in
customers will see Out of Stock everywhere. Online ordering is currently off, so no one can buy today either way.

---

## 2. Stage 2 correction: Stock tab scrolling

| Requirement | Implementation | Tested |
|---|---|---|
| Selecting a SKU scrolls its panel into view | **Open** scrolls the panel's top to 12px below the top of the window | desktop 1366×860, mobile 390×844: panel top 12.3px |
| Correct position below sticky headers | Measures any fixed/sticky full-width bar pinned to the top and scrolls below it. The Executive Office has none today. | with an injected 64px fixed header: panel top 76.3px (64 + 12) |
| Smooth, predictable | Smooth scroll; instant when reduced motion is set. Opening the same SKU again scrolls again. | reduced motion: jump lands on the first frame; re-open: 12.3px |
| Selected SKU kept after refresh | `?strength=` (from Stage 2). On reload, the panel scrolls into view once the table has loaded. | refresh: SKU kept, panel 12.3px |
| No scrolling on unrelated interactions | Only the Open button and the `?strength=` load can request a scroll. Adjustments, search, filters and reloads can't. | search typing: 0px change. Adjustment submit: 0px change. Filter change: no programmatic scroll (see note). |
| Accessibility | Focus moves to the panel without a second scroll | focus check passes |

Files: `src/lib/scroll-into-view.ts` (new) and `src/components/executive/StockPanel.tsx`.

Notes on what the tests can and can't show:
- The filter check allows up to 300px of layout reflow, because filtering removes table rows above the panel. It
  shows there was no programmatic scroll; it doesn't show a pixel-perfect position.
- Typing into an off-screen search box makes the browser itself scroll the box into view. That's native browser
  behaviour, not this feature, so the test first scrolls to the box as a person would.

---

## 3. Features implemented

**Executive Office → Orders** (rewritten around an order detail view):
- Search by order number, customer name, email or SKU. SKU search also matches lines from before Stage 1 by
  product and label.
- Filters for payment status, fulfillment status, method, needs-review and date range.
- The order detail shows:
  - customer and shipping address, and lines with SKU, permanent strength ID, quantity, unit price and line total
  - totals and discount
  - the payment record: method, verification type, status, reference, amount, date, who confirmed it and when, and
    the source (admin / provider / simulated / legacy)
  - reservations and deductions per lot, with each lot's batch and VeriCert lot number
  - returns, every inventory movement the order caused, and its full activity history
- Actions, each shown only when allowed and re-checked on the server: confirm payment, void confirmation, mark
  processing, record shipment (tracking required), mark delivered, cancel, record refund, record return, allocate
  stock now, close review.
- Kept: board view and bulk cancel. Removed: Mark Paid and Bulk Mark Paid.

**Executive Office → Reservations** (new tab): covered in §7.

**Executive Office → Payments** (new tab):
- Each method's switch, whether it is ready, whether customers are actually offered it, its reservation window, and
  what activating it requires.
- The ACH fulfilment policy setting.
- A standing notice that no payment provider is connected.

**Executive Office → Stock** (extended):
- New Sellable column, and stock levels now use sellable units.
- A lots table in FIFO order showing testing and release status, whether each lot is sellable, and the certificate
  records filed under its VeriCert lot number (read only).
- Actions: Receive new lot (it starts pending and untested), Manage (status and details), and Split (moves units out
  of a lot, typically RECON, into a new lot with real batch details).
- Adjustments now apply to a chosen lot, and the movement history shows the lot and the reserved change.

**Checkout and customer pages:**
- Checkout shows only the methods the server offers.
- Each checkout attempt carries an idempotency key: a double click or a retry returns the same order.
- New order-page panel for the Stage 3 methods:
  - Zelle shows the recipient only if it is configured.
  - Provider methods say plainly that no provider is connected.
- The confirmation email no longer tells non-bank methods to "complete your crypto payment".

---

## 4. Database changes and migration plan

Script: `scripts/stage3-orders.mjs` (definitions in `scripts/stage3-sql.mjs`).
- `node scripts/stage3-orders.mjs` is a read-only dry run. It prints the full plan: every reconciliation lot, every
  order's status mapping, and the preconditions.
- `--apply` runs everything in one transaction.
- `--refresh-functions` re-installs the functions only.

The script refuses to run if:
- Stage 3 objects already exist,
- any strength has `reserved > 0`,
- any order has an unknown status, or
- the movement-type CHECK constraint isn't named `inventory_movements_movement_type_check`. Production's name has
  not been verified, because production wasn't read.

**New tables**

| Table | Purpose |
|---|---|
| `inventory_lots` | A lot of a strength. Fields: `lot_code` (`LOT-00001` from a sequence, `RECON-<SKU>`, `RETURNS-<SKU>`), kind, manufacturer lot, VeriCert lot number, received / physical / reserved quantities, received / manufactured / expiry dates, testing status, release status, who changed the release status, when and why, notes, version. CHECKs: no quantity below 0; reserved never above physical; a failed lot can never be approved. Deletes are rejected by trigger. |
| `inventory_allocations` | One row per order line per lot. States: reserved → committed (paid), or released (expired / cancelled / admin); committed → restored. Holds the expiry and the release / restore actor and reason. Deletes are rejected. |
| `order_events` | Append-only order history: actor, source, payment and fulfillment state before and after, details, provider event ID. The (provider, event ID) pair is unique, so a repeated notification is recorded once. |
| `order_returns` | Append-only: line, lot, quantity, condition, decision (restock / quarantine / discard), reason, who decided, idempotency key. |
| `job_runs` | Heartbeat of the reservation sweep. |
| `inventory_lot_seq` | Sequence for lot codes. |

**Changed tables (additive only)**
- `inventory_movements`, still the only ledger:
  - New columns: `lot_id`, `lot_code`, `order_id`, `reserved_change`, `previous_reserved`, `resulting_reserved`, and
    the lot's own change, previous and resulting physical and reserved figures.
  - The movement-type CHECK is widened to add: reserved, released, committed, lot_reconciliation, lot_status,
    lot_updated, lot_transfer_out, lot_transfer_in, return_restocked, return_quarantined.
  - Two new arithmetic CHECKs. The append-only trigger is unchanged and no existing row is rewritten.
- `orders`:
  - New columns: `payment_status`, `fulfillment_status`, `idempotency_key`, `reservation_expires_at`,
    `payment_reference`, `payment_amount_received`, `payment_received_on`, `payment_confirmed_by`,
    `payment_confirmed_at`, `payment_source`, `provider_payment_id`, `needs_review`, `review_reason`,
    `review_opened_at`, `returned_at`.
  - CHECKs, plus unique indexes: one on (method, upper(reference)) and one on the idempotency key.
  - A trigger derives `status` from payment and fulfillment status.
- `strength_inventory`: no column change. New deferred constraint triggers (with lots and allocations) enforce
  that SKU totals equal the sum of the lots, and that a lot's reserved count equals its live reservations.

**What the migration does to existing data**
- Each existing order is mapped from its status to payment and fulfillment status. Paid orders are marked
  `payment_source = 'legacy'`.
- **One mapping changes the legacy `status`:** an order that Stage 2 refunded before shipment (status
  paid/processing with `refunded_at` set) becomes `cancelled`. Stage 2 had already restored its stock, so it would
  otherwise look shippable. The dry run lists every such order. Locally that was 1 order (VC-LEG005, test data).
  Production is unknown.
- Each strength with stock gets one quarantined, untested `RECON-<SKU>` lot. A `lot_reconciliation` movement moves
  the units into it; the SKU total doesn't change.
- Unchanged, and verified by fingerprint before and after: products, product_strengths, strength_inventory, existing
  movements, the legacy inventory table, coa_records and coa_lots. Orders' columns other than `status` are also
  unchanged.

**Order of operations for production (when authorized):**
1. Dry run against production and send it to the owner.
2. Owner approves.
3. `--apply`.
4. Push the code.
5. Owner splits and approves lots.
6. Turn ordering on.

Without the migration, the new code fails, because it reads `vc_sellable()` and the new columns.

---

## 5. Files

**New (23, plus the test harness):**
- Migration: `scripts/stage3-orders.mjs`, `scripts/stage3-sql.mjs`
- Libraries: `src/lib/payments/methods.ts`, `src/lib/payments/config.ts`, `src/lib/payments/stage3-providers.ts`,
  `src/lib/executive/route-helpers.ts`, `src/lib/scroll-into-view.ts`
- Routes: `src/app/api/executive/orders/[id]/route.ts`, plus `confirm-payment/`, `void-payment/`, `return/`, `review/`
  under the same folder
- Routes: `src/app/api/executive/reservations/` (list and sweep), `src/app/api/executive/reservations/[id]/release/`
- Routes: `src/app/api/executive/inventory/[strengthId]/lots/`, `src/app/api/executive/lots/[lotId]/` (detail and
  update), `src/app/api/executive/lots/[lotId]/split/`
- Routes: `src/app/api/executive/payment-methods/`, `src/app/api/executive/payments/simulate/` (local simulation
  only), `src/app/api/cron/reservations/`
- UI: `src/components/executive/OrderDetail.tsx`, `ReservationsPanel.tsx`, `PaymentsPanel.tsx`, `LotsSection.tsx`;
  `src/app/order/[reference]/PendingPaymentPanel.tsx`
- `scripts/stage3-tests/`: the local test harness and suites, with a README. Local only.

**Modified (30):**
- Inventory and orders: `src/lib/inventory.ts` (every write is now a database-function call; adds sellable, lots,
  reservations), `src/lib/inventory-shared.ts`, `src/lib/orders/lifecycle.ts` (rewritten), `src/lib/orders/store.ts`
  (new columns, atomic create with idempotency, search)
- Shared: `src/lib/types.ts`, `src/lib/validation.ts`, `src/lib/payments/index.ts`, `src/lib/executive/require-auth.ts`
  (adds `requireExecutiveActor`), `src/lib/email.ts`
- `src/lib/subscriptions/run.ts`: renewals respect the bank-transfer switch
- `src/lib/executive/stats.ts`, `src/lib/ledger/reports.ts`: a reversed payment is no longer counted as revenue
- Checkout and orders: `src/app/api/orders/route.ts`, `src/app/api/orders/[reference]/status/route.ts`,
  `src/app/api/webhooks/coinbase/route.ts`, `src/app/checkout/page.tsx`, `src/app/checkout/CheckoutForm.tsx`,
  `src/app/order/[reference]/page.tsx`, `src/app/order/[reference]/OrderStatusTimeline.tsx`,
  `src/app/account/page.tsx`
- Executive routes: `src/app/api/executive/orders/route.ts`, `src/app/api/executive/orders/[id]/cancel|refund|status`,
  `src/app/api/executive/inventory/[strengthId]/route.ts`, `src/app/api/executive/inventory/[strengthId]/adjustments/route.ts`,
  `src/app/api/executive/content/route.ts` (refuses the payment-config key)
- UI: `src/components/executive/ExecutiveTerminal.tsx`, `OrderTable.tsx` (rewritten), `StockPanel.tsx`

**Deleted (1):** `src/app/api/executive/orders/[id]/mark-paid/route.ts`. Governance C: a bare toggle.

---

## 6. Payment architecture, method by method (governance D)

**Every method is simulated in testing. None has a live integration. No provider, credential, API key, wallet
address, confirmation threshold or processor behaviour was invented.** A provider method is offered to customers only
when it is switched on *and* its adapter has a live integration, and none does. The one exception is local simulation,
which needs all three of: `PAYMENT_SIMULATION=local-test-only`, a database host under the reserved `.invalid` domain,
and not running on Vercel. It records `source = simulated` on every event.

| Method | Architecture built | How tested | Live integration | What activation requires |
|---|---|---|---|---|
| **Bitcoin** | Switch; reserve at checkout (30 min default, configurable); provider-notification interface (`ProviderPaymentEvent`); duplicate-notification and late-payment handling | **Simulated** with a local test adapter and simulated events (`t-api` Part B) | **None** | An approved crypto payment provider (none chosen), its account, API credentials and webhook signing secret. Its confirmation rules are unknown. This site configures no wallet address. |
| **Ethereum** | Same as Bitcoin (shared, method-independent code) | **Not driven end to end.** Only checked as *not offered* when switched on without simulation (Part A). Under simulation it shares Bitcoin's code path but wasn't exercised itself. | **None** | Same as Bitcoin. |
| **USDC** | Same as Bitcoin | **Not driven end to end:** same as Ethereum | **None** | A provider that supports USDC (none chosen). Which networks it accepts is unknown. |
| **Zelle** | Switch; no reservation; human confirmation with required reference, amount, date and attestation; exact-amount rule; unique reference; void before shipment; recipient shown only if configured | **Real code path, local test data.** There is no provider to simulate: an administrator is the verifier, by design. Tested through the API and in the browser. | **None** (there is no Zelle API) | `ZELLE_RECIPIENT_NAME` and `ZELLE_RECIPIENT_HANDLE` (the business's real Zelle details, not set), then the owner switches Zelle on. |
| **ACH bank transfer** | Switch; pending → processing → confirmed / failed / reversed; initiation never treated as paid; configurable reservation and fulfilment policy ("after settlement" by default, or "after initiation"); a return never restores shipped stock; no bank or routing numbers accepted anywhere | **Simulated** (processing, settle, fail, return-after-shipment, after-initiation policy) | **None** | An approved ACH provider (none chosen) with hosted or tokenized bank-account collection, its credentials and webhook secret. Its return codes and timelines are unknown. |
| **Credit / debit card** | Switch; no hold by default (configurable); confirm on provider capture; failure state; no card fields anywhere on the site | **Simulated** (capture, decline) | **None** | An approved card processor (none chosen) willing to underwrite the business, with hosted / tokenized fields, credentials and webhook secret. |
| **Apple Pay** | Same as cards | **Not driven end to end.** A direct order is refused (400) when switched on without simulation (Part A). It shares the card code path but wasn't exercised under simulation. | **None** | A processor that supports Apple Pay, plus Apple Pay merchant / domain verification through it. |
| **Google Pay** | Same as cards | **Not driven end to end.** Only checked as *not offered* when switched on without simulation (Part A). | **None** | A processor that supports Google Pay, plus Google Pay merchant registration through it. |

Pre-Stage-3 methods, kept for existing orders:
- **Bank transfer (manual):** offered only when `BANK_*` is set **and** you switch it on. It is **off by default**
  (D7 reversed). It is human-verified, so it also requires a reference to confirm.
- **Legacy "crypto" (Coinbase Commerce):** still retired and still behind its build flag. Its webhook now goes
  through the same confirmation function, with the event deduplicated.

The integration point is `src/lib/payments/index.ts`: replace an `unavailableProvider` with a real `PaymentProvider`
that verifies the provider's signature and normalizes its notification to `ProviderPaymentEvent`. The order and
inventory functions don't need to change.

---

## 7. Reservation and deduction engine

**Stage 2 meanings are kept:** physical is the actual units on hand, reserved is the units held, and available is
physical − reserved, across all lots. New: **sellable** = approved lots' physical − reserved, with an expired hold
counted as free. The shop and checkout read sellable.

| Operation | Function | Guarantees |
|---|---|---|
| Reserve (checkout) | `vc_order_reserve` | Runs in the same transaction as the order INSERT. Locks every touched strength in sorted order, first releasing expired holds on them. FIFO over eligible lots. All lines succeed or none do. Calling it again is a no-op. |
| Commit (payment) | `vc_order_confirm_payment` | Locks the order row, so concurrent confirmations produce one commit. Physical and reserved drop together. If a reserved lot was quarantined since checkout, it re-allocates FIFO. Short or expired → review, nothing deducted. |
| Deduct (no hold: Zelle, bank, card, ACH) | the same function | FIFO from approved lots. If short, the payment is recorded, nothing is deducted, and the order goes to review. |
| Release | `vc_release_allocation_locked`, `vc_allocation_release`, sweep | Each allocation is released at most once (state check plus an idempotency key per allocation) |
| Restore (cancel / void / refund before shipment) | `vc_restore_order_locked` | Back into the lot the units came from. Pre-Stage-3 orders go back into the quarantined reconciliation lot, using Stage 2's key, so they never come back twice. |
| Return (after shipment) | `vc_order_return` | Restock into the shipped lot, quarantine into `RETURNS-<SKU>`, or discard. Bounded by what shipped. Recorded once. |

Enforced by the database: physical ≥ 0, reserved ≥ 0, reserved ≤ physical (SKU and lot), SKU = Σ lots, lot reserved
= Σ live reservations, and movements are append-only. Every movement carries the permanent strength ID, SKU, lot,
order, quantity, reserved change, reason, actor and timestamp.

**Expiration: the three layers reported in section A, all built**
1. Checkout releases expired holds on the strengths it touches, in the same statement.
2. The shop counts an expired hold as free (`vc_sellable`), and the customer's order-status poll releases its own
   order's hold.
3. A cron route (`/api/cron/reservations`, Bearer `CRON_SECRET`) records a heartbeat on every run. It is
   **not scheduled in `vercel.json`**: how often it can run depends on the Vercel plan (Hobby allows daily only),
   which is unknown.

**How an administrator finds out expiration has stopped working (governance B):**
- The **Reservations** tab flags every reservation past its expiry and still held, in red ("Expired — not released").
- Its heartbeat line shows the last sweep, the last cron run and the runs in 24 hours, and turns amber with a warning
  when no sweep has run for 60 minutes.
- The SKU detail on the Stock tab notes units held by expired reservations.
- **Run sweep now** and per-reservation **Release** (reason required) act on it, and both are recorded.

If every layer stopped, customers would still be unaffected, because of layer 2. Only the Reserved figure on the
Stock tab would be overstated.

---

## 8. Lot tracking, FIFO, and certificate integration

- FIFO is by `received_at`, then ID. An order line spans several lots if it needs to, and each allocation row is the
  permanent record of which lot filled which line.
- Eligible lots: `approved`, not `failed`, not expired. Pending, quarantined and rejected lots are never allocated.
- **Certificates:**
  - A lot carries a VeriCert lot number. The Stock tab lists the `coa_records` filed under it (read only), and the
    order detail shows each allocated lot's VeriCert lot number.
  - Stage 3 **creates, edits and publishes no certificate**. Nothing approves a lot from certificate data:
    testing status is set by a person.
  - Existing certificate records and verification URLs are untouched (fingerprinted in the migration; 0
    certificates created in testing).
- **Shipping is refused** if any lot the order was filled from is no longer approved.
- **Traceability:** order → allocations → lot → manufacturer batch and VeriCert lot → certificates. In the other
  direction, lot → movements lists every order the lot was reserved for or shipped on.

---

## 9. Security controls

- All 20 new or changed executive endpoints refuse signed-out and customer requests (tested on every endpoint). A
  staff session that hasn't passed two-factor is refused by the shared session check (tested on the order list).
  /office has the same access as /command, per the existing parity decision.
- Validated on the server:
  - Prices are recomputed from the catalog.
  - The method is checked against the server's offered list.
  - The idempotency key is scoped to the customer.
  - Order search parameters are pattern-checked.
  - All SQL is parameterized.
- Payment settings can be written only by their own audited endpoint. The generic Site Content endpoint now refuses
  that key; it previously accepted any key.
- No payment credential is stored or returned. No card, bank-account or routing field exists anywhere.
- Human verification requires a reference. Provider-verified orders can't be confirmed by hand.
- The simulator exists only in local simulation; it returns 404 otherwise.
- Every action records its actor in `order_events` (same transaction, not best-effort) and in the activity log.
- The ordering gate, catalog gate, research-use attestation, rate limits and two-factor are all unchanged and
  retested.

---

## 10. Automated test results (actual counts)

**Environment:**
- A real local PostgreSQL 18.6 (`embedded-postgres` 18.6.0-beta.19) behind a Neon-HTTP-compatible shim with a
  connection pool, so the concurrency tests use real row locks and real concurrent connections.
- The app is the **production build** (`next build` + `next start`).
- Data: a 2026-11-07 copy of the catalog, plus the repo's own Stage 1/2 migration scripts and the Stage 3 migration.
- A network guard blocked every external host. The only outbound attempt seen was Next.js telemetry, and it was
  blocked.

**Final run (after the last code change), fresh database for each suite group:**

| Suite | Checks | Result |
|---|---|---|
| Engine: database functions directly (`t-engine.mjs`) | 89 | **89/89** |
| API, simulation off (`t-api.mjs` Part A) | 81 | **81/81** |
| Browser, headless Edge: scroll correction, Executive Office, checkout (`t-ui.mjs`) | 42 | **42/42** |
| API, simulation on (`t-api.mjs` Part B) | 35 | **35/35** |
| Stage 1/2 regression (`t-regress.mjs`) | 36 | **36/36** |
| **Total** | **283** | **283/283** |
| TypeScript `tsc --noEmit` | — | 0 errors |
| ESLint, 65 changed/new files | — | 0 errors, 0 warnings |
| `next build` | — | succeeds |

**What the suites cover:**
- **Orders:** creation; totals from the catalog; duplicate prevention (same attempt twice → one order; 6 at once →
  one order; a double click in the browser → one order).
- **Order access:** authorization (all 20 endpoints refuse signed-out and customer callers; a staff session without
  two-factor was checked on the order list); search by reference, email, SKU and name; each
  filter; a malformed filter value is ignored; valid and refused state transitions.
- **Inventory:**
  - reservation bookkeeping, release, commit, deduction and restore
  - concurrency: 25 buyers for 6 units → exactly 6 (engine); 14 buyers for 5 units → exactly 5 through the API, the
    rest told it sold out, no orphan orders
  - 8 simultaneous confirmations → one commit
  - multi-SKU all-or-nothing, insufficient stock, repeated requests
- **Payment simulation:**
  - crypto: reserve, commit, duplicate notification, expiry, late payment
  - Zelle without an advance hold: missing reference, missing attestation and empty body refused; wrong amount →
    review; reference reuse refused; void
  - ACH: processing, settled, failed, returned after shipment, after-initiation policy
  - card: capture, decline
  - **These are simulations, not provider tests:** no provider integration exists to test.
- **Lots:** FIFO order, exhaustion, multiple lots per order, exclusion of pending / quarantined / rejected lots,
  justification rule, failed-lot rule, split, stale count, reconciliation enforced by the database, legacy-order
  restore, traceability.
- **Regression:**
  - product and strength creation (permanent ID, server-made SKU, opening stock); rename keeps ID and SKU;
    duplicate-strength and case-insensitive SKU uniqueness
  - product saves still can't set stock; thresholds; levels; movement history order and append-only
  - Stock list data; storefront pages and the catalog gate; certificate admin and public search
  - registration, login, wrong password, session; no executive access for customers
  - ordering gate; attestation; subscriptions cron; BPC-157 20mg not reactivated (it isn't in this catalog copy)

**Failures during development, all fixed and re-run:**
- A real bug: the payment-settings save was rejected, because Zod 4's `z.record` with enum keys is exhaustive. Fixed
  with `z.partialRecord`.
- A real bug in the scroll fix: the `Date.now()` lint rule. Fixed.
- A missing guard: the migration's constraint-name precondition, added after review.
- The rest were test faults:
  - chose a product that isn't active in this catalog copy
  - read shop stock signed out, where the catalog gate hides it
  - text matches that missed CSS `uppercase` and "I certify…"
  - tripped the existing 20-orders-per-hour limit
  - fetched an order page as the wrong buyer
  - assumed a `/verify` index page; assumed an unknown lot page returns 404 (it returns 200 with a message, as
    before Stage 3)
  - registration without the age-gate cookie

**Not tested:**
- Real payment providers (none exist).
- Neon itself: the shim reproduces Neon's HTTP query and transaction behaviour, and the functions use standard
  PL/pgSQL. Production's Postgres version is unknown.
- The deployed application (not deployed).
- Email delivery (keys are blank locally).
- Vercel Cron scheduling.

---

## 11. Known issues and limitations

*(Updated in the final-corrections round. Items the first round listed that are now fixed are marked as such.)*

1. **Sellable stock is 0 after the migration, as decided (A1).** No product can be ordered until reconciliation lots
   are reduced to what is physically held, and real lots are received and approved. While that's the case, no
   customer surface shows a count or an in-stock state (tested). Approving a RECON lot itself makes its units
   sellable **without batch traceability**.
2. ~~The reservation cron isn't scheduled.~~ It's scheduled daily in `vercel.json`, which takes effect only when
   deployed. `CRON_SECRET` in Vercel is still unconfirmed.
3. ~~Order lines carry the assumed `lotNumber` into emails.~~ **Fixed:** only allocated lots are shown (§0.1 #1).
4. ~~A partial refund shows as fully refunded.~~ **Fixed** (§0.1 #3).
5. ~~No re-allocation action.~~ **Fixed** (§0.1 #4).
6. **Order history (`order_events`) starts at Stage 3.** Older orders' history is in the activity log only, which
   is best-effort.
7. ~~The "processing" email is sent for orders on hold.~~ **Fixed:** a one-time hold message is sent instead
   (§0.1 #2, copy pending approval).
8. **Removed features:** Mark Paid and Bulk Mark Paid (governance C). Payments are confirmed one at a time.
9. **The legacy "crypto" (Coinbase) path** is unchanged apart from going through the new confirmation function. It
   remains retired.
10. **Shop availability is computed at read time.** A product page reflects expired holds immediately, but the
    stored Reserved figure and the Reservations list keep showing an expired hold until a checkout, order-page poll,
    manual sweep or the daily cron releases it. The Stock tab shows the difference.

---

## 12. Outstanding decisions for the owner

The current list is §0.6. Remaining from the first round:

| # | Decision | Default if not decided |
|---|---|---|
| — | How the existing recorded quantities become real stock. You'll reduce the RECON lots to what is physically held (or 0) and receive actual stock into identified lots. | Nothing sellable |
| — | Zelle recipient details (`ZELLE_RECIPIENT_NAME` / `ZELLE_RECIPIENT_HANDLE`) and switching Zelle on | Off |
| — | Switching manual bank transfer on | **Off** (D7 reversed) |
| — | Payment providers for crypto, ACH and cards / wallets | None |

---

## 13. External payment-provider dependencies

None is chosen, contracted or configured. Each needs:
- account approval,
- API credentials and a webhook signing secret (stored only in Vercel environment variables, never in the
  repository or the database),
- a provider adapter implementing `PaymentProvider` and normalizing to `ProviderPaymentEvent`, plus a signed webhook
  route,
- its specific rules: confirmation thresholds, settlement timing, return codes. **All unknown.**

---

## 14. Production deployment requirements (when authorized)

1. **Owner approves this report.**
2. **Run the dry run against production and send it to the owner.** `node scripts/stage3-orders.mjs` is read-only.
   It confirms:
   - the constraint name
   - reserved = 0
   - the list of RECON lots (expected: one per strength with stock)
   - each order's status mapping, and any legacy status changes
3. **Owner approves the dry run.** Then `--apply`, and check that "Checks passed" is printed.
4. **Push the code.** The new code must not run before the migration.
5. **Vercel environment variables (optional, per decision):** `ZELLE_RECIPIENT_NAME` / `ZELLE_RECIPIENT_HANDLE`,
   `CRON_SECRET`, and a `vercel.json` cron entry for `/api/cron/reservations` at a frequency the plan allows.
   **Never set `PAYMENT_SIMULATION`.** It can't take effect on Vercel anyway.
6. **Owner splits and approves lots** in Executive Office → Stock, then switches payment methods and ordering on as
   decided.

---

## 15. Rollback

- **Before `--apply`:** nothing to roll back.
- **Code:** revert to `stage3-checkpoint` (`023cdf6`). The old code ignores the new columns and tables. Two caveats
  for running it again:
  - The `orders_derive_status` trigger would keep overwriting `status`, so drop it first:
    `DROP TRIGGER orders_derive_status ON orders`.
  - The deferred reconciliation triggers would refuse old Stage 2 writes that don't touch lots, so drop
    `strength_inventory_reconciled`, `inventory_lots_reconciled` and `inventory_allocations_reconciled`.
- **Data:**
  - The migration only adds. To remove it: drop those triggers, the `vc_*` functions, `inventory_allocations`,
    `order_returns`, `order_events`, `job_runs` and `inventory_lots` (after dropping the `inventory_movements.lot_id`
    reference), and the sequence. Then drop the new columns and restore the movement-type CHECK to its Stage 2 list.
  - That last step needs `DELETE`s of Stage 3 movement rows. The append-only trigger must be disabled for them, as
    the Stage 2 report noted.
  - **Movements and order events recorded after go-live are business records:** export them before removing anything.
- **Stock figures:** `strength_inventory` is the Stage 2 table and stays authoritative. The lots only subdivide it.

---

## 16. Recommended live manual audit (after deployment)

1. **Stock tab:** every SKU's Physical matches Stage 2's figure. Each strength with stock has one RECON lot,
   quarantined, with the same quantity. Sellable is 0.
2. **Scrolling:** open a SKU low in the list on desktop and phone; the panel comes to the top. Refresh; it stays.
   Typing in search and recording an adjustment don't move the page.
3. **Split part of one RECON lot** into a test lot and approve it, with testing passed or a justification. Sellable
   rises by exactly that amount, and the signed-in product page shows In Stock.
4. **Payments tab:** only bank transfer (if its details are set), and Zelle (if configured and switched on), are
   offered. Every provider method says "No provider integration exists".
5. **Orders tab:** there's no Mark Paid. Opening a pre-Stage-3 order shows "recorded before Stage 3" and no lots.
6. **One supervised internal Zelle order,** only if the owner authorizes a real one:
   - Confirm with the real Zelle reference. Check the reference, amount, administrator and time on the order, the
     lot deduction, and the history.
   - Void it, and check the stock comes back and the order returns to awaiting payment.
   - Cancel it.
7. **Reservations tab** loads. If the cron is scheduled, the heartbeat shows a cron run.
8. **Signed out:** the catalog gate is unchanged and `/api/executive/*` returns 401.

---

## 17. Production was not modified

- No deploy, push or production migration, and no dry run against production. No production inventory, order, SKU
  or certificate change. No live payment, and no real order.
- Production was never read. Every command ran through `scripts/stage3-tests/local.sh`, which refuses unless
  `DATABASE_URL` is the local `.invalid` test host, with a network guard blocking all external hosts.
- The BPC-157 20mg test-only strength was not touched; no Stage 3 code references it.
