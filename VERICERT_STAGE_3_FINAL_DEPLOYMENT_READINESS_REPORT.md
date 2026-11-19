# VeriCert Stage 3 — Final Deployment-Readiness Verification

Date: 2026-11-18. Everything in this pass was local. **Nothing was committed, pushed or deployed. No production
migration, dry run or query was run, and no production data or configuration was changed.**

## Recommendation: **READY FOR DEPLOYMENT APPROVAL** (updated 2026-11-19)

**Run 4, 2026-11-19, full suite, final code: 457/457 checks passed, 0 failed.**

| Migration | Engine | API A | Browser | Stage 2 | Regression | API B |
|---|---|---|---|---|---|---|
| 35/35 | 125/125 | 143/143 | 43/43 | 35/35 | 36/36 | 40/40 |

- The moved cron retry-safety checks ran in part B and passed. An immediate second run released 0 and changed no
  stock; the expired hold was released exactly once.
- The build used was the 2026-11-18 23:31 production build; no source file has changed since.
- No code defect and no deployment blocker was found.

This is not permission to deploy. The order still stands: your authorization, then the production migration
(`--apply`), then commit, push and deploy.

*(The original recommendation, below in §3, was NOT READY only because run 3 had been interrupted.)*

---

## 1. Historical test orders VC-E3SQJ9 and VC-38UTPQ

**What was wrong.** Under Stage 2, both orders were marked paid and then cancelled, and cancelling kept their
`paid_at`. The migration read that as "paid, then cancelled" and mapped them to payment **confirmed**. It also wrote
a payment-confirmation record copying `paid_at`.

**What the architecture already has.** `payment_status` already includes **`cancelled`**: "payment never completed;
the order was cancelled". VC-9TNWAS, a cancelled order with no `paid_at`, already maps to it. No new status was needed.

**Correction (`scripts/stage3-orders.mjs`).**
- VC-E3SQJ9 and VC-38UTPQ are named in the script as your confirmed test orders: cancelled, no payment received,
  no refund owed. They map to **payment `cancelled` / fulfillment `cancelled`**.
- They get **no payment confirmation**: `payment_source`, `payment_confirmed_at` and `payment_confirmed_by` stay
  empty.
- Their legacy status stays `cancelled`, so the migration makes no status change on them.
- Their Stage 2 record (`paid_at`, `cancelled_at`, cancel reason, totals, items, every other original column) is
  **not modified**. The in-transaction guard still fingerprints every Stage 2 order column and rolls back the whole
  migration on any change.
- One row per order is added to the new `order_events` table. It records your classification and keeps the original
  `paid_at` value in the audit trail.
- **Safety stop:** if either listed order is present but is no longer cancelled, or now has a refund, the dry run
  and the apply both STOP and execute nothing. The list can't reclassify a different kind of order.
- **The generic rule is unchanged** for every other order. A cancelled order that has `paid_at` and isn't on your
  list still maps to `confirmed` / `cancelled`, because under Stage 2 money may have been received.

**Revenue.** Every report already excluded cancelled orders, so neither test order was ever counted. The rule is now
explicit as well: a payment that was never received (`cancelled`, `failed`, `expired`) is never revenue or commission,
even with a `paid_at`. This is in one place, `src/lib/orders/revenue.ts` (`paymentNotReceived`), which feeds the
dashboard, financials, ledger, customers, affiliate stats and partner page. The same exclusion was added to the
customer-metrics SQL, and the dashboard's "marked paid" activity line now skips them.

**Effect on the four orders you approved for writing:**

| Order | Before this pass | Now |
|---|---|---|
| VC-E3SQJ9 | confirmed / cancelled | **cancelled / cancelled**, no confirmation record |
| VC-38UTPQ | confirmed / cancelled | **cancelled / cancelled**, no confirmation record |
| VC-D7C7JS | refunded / shipped | unchanged |
| VC-9TNWAS | cancelled / cancelled | unchanged |

**Tests.** The production shapes were added to the local pre-migration database:
- VC-E3SQJ9 and VC-38UTPQ, paid then cancelled;
- a control order with the same shape that is not on your list;
- a shipped, fully refunded order (the VC-D7C7JS shape).

All pass (migration suite §3), including:
- the dry-run listing;
- both STOP cases;
- the test orders not paid, with no confirmation, `paid_at` and `cancelled_at` exactly preserved, and one audit
  note each;
- the control keeping the generic rule;
- paid, shipped, refunded and never-paid orders mapped as before;
- every Stage 2 order column byte-identical, except the 2 listed status changes, which touch the status column only.

In the app (API part A, last complete run):
- **Worst case:** with the test orders' legacy status forced away from `cancelled`, all-time and gross revenue and
  customer lifetime value did not move.
- **Control:** switching their payment to confirmed added exactly their $100 total, which proves the test can see
  them.

## 2. Reservation cron

- **Configuration (`vercel.json`, local and uncommitted):** subscriptions at `0 14 * * *` (existing) and reservations
  at `30 14 * * *` (new). Both are daily.
- **Authorization:** both routes use the same check. They require `Authorization: Bearer <CRON_SECRET>` exactly, and
  refuse everything if the variable is unset. That header is what Vercel Cron sends when `CRON_SECRET` is set.
- **Proxy:** `/api/cron` is on the proxy's ungated API list, so the age gate and the site gate can't intercept it.
- **Rejection tests:** on both routes, all 10 bad variants returned **401** with no secret in the body:
  - no header; an empty bearer; a wrong secret;
  - the secret without "Bearer"; "Basic"; a longer string starting with the secret; the wrong case;
  - the secret in the query string; the secret in another header;
  - an executive session cookie.

  The correct secret returns 200 on both.
- **Secret exposure:** the secret never appeared in a response or in the server log.
- **Expiry:**
  - Shop availability counts an expired hold as free before any sweep runs.
  - The sweep releases it and marks the order expired.
  - The checkout sweep and the order-page sweep both work.
- **Retry safety:**
  - A second sweep releases nothing and changes no stock (engine, final run). Each release also carries a one-time
    key (`alloc:<id>:released`).
  - Through the cron route, the sweep released a real expired crypto hold (part B, previous complete run).
  - The added HTTP retry check is in the unfinished run.
- **Heartbeat:** every cron run writes a `job_runs` row. Two back-to-back runs were both recorded, and the Reservations
  tab showed the latest cron run as just now (stale threshold 26 h).
- **Production:** `CRON_SECRET` is treated as confirmed present (your check, Oct 27). **Production scheduling has not
  been verified.** The reservations schedule and route exist only after deploy. Within about a day of deploying, the
  Reservations tab should show a cron run.

## 3. Automated test results (actual)

**Run 2 — last complete run; final application code:**

| Suite | Result |
|---|---|
| Migration safety | 35/35 (was 15; 20 new round-4 checks) |
| Engine (database functions, real concurrency) | 125/125 |
| API part A (simulation off) | **142/144** — 2 failures, a test fault (below) |
| Browser (headless Edge) | 43/43 |
| Stage 2 rebuilt checks | 35/35 |
| Stage 1/2 regression | 36/36 |
| API part B (local simulation) | 38/38 |

**The 2 failures:**
- They were my new "cron retry safety" checks. They placed a **Zelle** order to create a hold.
- Zelle never holds stock at checkout (it takes stock on confirmation), so there was no hold to expire, and the
  checks reported "released 0".
- Only the crypto methods hold stock, and those need the local payment simulation (part B). So the check moved to
  part B, after its existing cron sweep of a real expired hold. Part A keeps the authorization and heartbeat checks.

**Run 3 — after moving the check; no application code changed:** migration 35/35 and engine 125/125, then **stopped
by Claude Code for low system memory** during API part A. The browser, Stage 2, regression and part B suites didn't
run. The moved checks have not run.

**Earlier test faults in this pass, fixed and rerun:**
- A migration check expected 1 status change. There are 2 listed ones: VC-LEG005 and VC-LEG007 (a partial refund
  before shipment). The check now expects both and verifies that only the status column changed.
- Two duplicate variable names stopped the API file from starting. The round-4 block now has its own scope.

**TypeScript:** `tsc --noEmit` — 0 errors.
**ESLint:** the 77 changed files have 0 errors and 0 warnings. Over all of `src`: 0 errors and 7 warnings, all in
files this work doesn't touch.
**Production build (`next build`, Turbopack):** succeeds, compiled with all 17 static pages.
- The first attempts failed while resolving Google fonts from `layout.tsx`, which Stage 3 doesn't touch.
- The cause was empty route folders left behind by deleted routes (`auth/signup`, `orders/[id]/mark-paid`,
  `products/[slug]/images`, `partner/apply`), hit on a fresh build cache. I removed those 4 empty folders; git
  doesn't track empty folders, so nothing tracked changed.
- A fresh git checkout, as on Vercel, never contains them. As a cross-check, the committed code (HEAD) and HEAD plus
  all Stage 3 changes both built cleanly in a temporary separate copy, which has since been removed.

## 4. Governance C — the "+5" on VC3R-10MG

**Answer: the movement exists, and the earlier query did not miss it.** It is in the read-only output from
2026-11-18:

```
2026-11-16T02:34:46.219Z · VC3R-10MG · stock_received · +5 (144 → 149) · reason: Received from supplier · by ryancalpacific@aol.com
```

It has a reason and an author but no note. My earlier summary said "+5 with no note", and that made it read as
unrecorded. That was my wording.

**Is there a code path that changes a quantity without a movement? No.**
- **Stage 2 (deployed):** `applyMovement` in `src/lib/inventory.ts` is the one write path for stock. It changes the
  quantity and inserts the movement in a **single SQL statement**, so one can't happen without the other. Order
  deduct, restore, receive, remove and count all go through it. The other `strength_inventory` writes either set
  only the threshold (which also records a movement) or create a new row at 0.
- **Stage 3:** every quantity or reserved change goes through `vc_inv_move` (`scripts/stage3-sql.mjs`), which writes
  the movement in the same function. Lots are created at 0 and filled by a movement. Release-status updates don't
  touch quantities.
- **Chain check:** offline, against the production output already captured; nothing was re-queried. Every SKU's
  movement chain is continuous, and each ends at the current quantity in the dry-run manifest. Totals: opening 2,377
  units, movements −103, current 2,274.

**Not a code path, but worth knowing:** someone with direct database access (for example the Neon console) could
still edit a quantity by hand without a movement; the database doesn't forbid that. After Stage 3, a hand edit to a
SKU total alone would be refused at commit, because the SKU must equal the sum of its lots. Editing both together
would not be. A database trigger could close that gap if you want it; I haven't built one.

## 5. Production data protection

- **No production access in this pass.** No query, dry run or migration ran against production.
- **The migration** still never writes product content, strengths or permanent IDs, SKUs, prices, stock rows,
  existing movements, legacy inventory, certificate records, lots or PDFs, or subscriptions. The in-transaction guard
  covers all of those plus every Stage 2 order column, and it is retested: a planted mid-migration product edit rolls
  the whole migration back.
- **BPC-157-20MG:** an active BPC-157-20MG still stops the migration, and a deactivated one is left untouched.
- **What changed versus the dry run you reviewed:** only the planned values for VC-E3SQJ9 and VC-38UTPQ (§1), plus
  one new audit row each in the new `order_events` table.

## 6. Files changed in this pass (all uncommitted)

- `scripts/stage3-orders.mjs` — test-order classification, STOP rule, audit note, post-apply check, header comment.
- `src/lib/orders/revenue.ts` — `paymentNotReceived`, used by `countsAsRevenue` and `qualifiesForCommission`.
- `src/lib/marketing/customer-metrics.ts` — the payment-status exclusion in the metrics SQL.
- `src/lib/executive/stats.ts` — the "marked paid" activity line skips payments never received.
- Test harness, `scripts/stage3-tests/`:
  - `seed-legacy-orders.mjs` — the 4 production-shape orders;
  - `t-migration.mjs` — 20 new checks;
  - `t-api.mjs` — cron and revenue checks;
  - `guard.cjs`, `pg-shim.mjs`, `README.md` — local shim port 5490 → 5492, because another session's local demo
    was using 5490.
- Removed 4 empty, untracked folders under `src/app/api` (§3).
- New: this report.

## 7. Remaining items before deploy

1. ~~Rerun the full local suite once~~ — **done 2026-11-19: 457/457** (see the top of this report). Before that run,
   a leftover Postgres process from the interrupted run was still holding the test database port. It was stopped and
   the local database restarted on its existing data; both snapshots were intact.
2. Your authorization for the production migration (`--apply`), then commit, push and deploy, in that order: the
   migration runs before the code that reads it.
3. After deploy, confirm a cron run appears in the Reservations tab within about a day.
4. Still holding, as before: D6–D8, an optional "hold lifted" email (copy needed from you), and the test-adjusted
   reconciliation quantities (BPC-157-10MG at 16, VC3R-10MG at 149). You've said these are zeroed before launch.

**Small note, not a blocker:** the public order-status endpoint still returns the stored `paid_at` for the two test
orders, but the page shows them as cancelled and never displays it.

**STOPPED.** Nothing will be committed, pushed, deployed, migrated or reconfigured without your explicit authorization.

---

## 8. Production migration APPLIED (2026-11-19, owner-authorized)

`node scripts/stage3-orders.mjs --apply` against the production database: **exit 0, "Checks passed"**. Full output
was saved locally (`prod-apply.txt`, scratchpad).

- **Protected data:** all 10 fingerprints are identical before and after: products, strengths, stock rows, existing
  movements, legacy inventory, certificate records, lots and files, subscriptions, and every Stage 2 order column.
  The certificate fingerprint `e1ab9e2adb100df9e49d6459eea7fb79` still matches the Vanguard record.
- **Orders:**
  - VC-E3SQJ9 and VC-38UTPQ → cancelled / cancelled, with no payment confirmation. Their original `paid_at` is kept,
    with one audit note each.
  - VC-D7C7JS → refunded / shipped.
  - VC-9TNWAS → cancelled / cancelled.
  - Legacy status changes: none.
- **Lots:** 34 reconciliation lots, all quarantined, 0 approved, holding 2,274 units. Every strength is reconciled to
  its lots, and sellable is 0 everywhere.
- **Triggers:** all 8 Stage 3 triggers are present.
- **BPC-157-20MG:** still deactivated.
- **Read-only check afterwards:** `scripts/stage3-prod-verify-apply.mjs`.

**Until the Stage 3 code is deployed,** the live site still runs Stage 2 code against the new schema:
- Ordering is off and nothing is sellable, so customers are unaffected.
- **In the Executive Office, don't use stock adjustments or order actions (mark paid, cancel, refund) until deploy.**
- A Stage 2 stock adjustment would be refused by the database, and nothing would change.
- A Stage 2 "mark paid" would leave the order inconsistent.

Not yet done: commit, push, deploy.

## 9. Committed, pushed and deployed (2026-11-19, owner-authorized)

- **Commit and push:** `f721b2e` (Stage 3, 89 files), pushed `023cdf6..f721b2e` to `master`. Vercel deployed it
  automatically; the new routes answered on vericertpeptides.com about 40 seconds after the push.
  `VeriCert_Group_2_Audit_Report.txt` was not part of Stage 3 and was left uncommitted.
- **Live signed-out checks:** `scripts/stage3-tests/t-live-signed-out.mjs`, 15/15. It only makes GET requests and
  requests the server refuses.
  - Homepage and shop load.
  - Both cron routes refuse a missing or wrong secret (401).
  - Eight Stage 3 executive routes exist and refuse a signed-out request (401).
  - The old mark-paid route is gone.
  - A signed-out checkout is refused.
  - The public order-status endpoint reads a migrated order: VC-E3SQJ9 shows cancelled.
  - One failed check during the first live run was a test fault, now fixed: Next answers a POST to a missing route
    with its not-found page and status 200, so the test now checks the matched path.
- **The pre-deploy caution in §8 no longer applies:** the Executive Office now runs Stage 3 code.

**Still to verify, which needs you or time:**
1. Within about a day: the Reservations tab shows a scheduled cron run (daily at 14:30 UTC).
2. The signed-in live audit in the completion report §16: Stock tab, scrolling, Payments tab, Orders tab, and the
   Reservations tab.
3. Still holding: D6–D8, the "hold lifted" email copy, and zeroing the reconciliation quantities before launch.
