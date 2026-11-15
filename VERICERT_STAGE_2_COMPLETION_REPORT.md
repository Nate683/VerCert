# VeriCert Peptides — Stage 2 Completion Report
## Inventory Management + Stage 1 Corrections

| | |
|---|---|
| Date | 2026-11-15 |
| Code checkpoint | git tag `checkpoint/pre-stage2` (local) = `85db8ab` = origin/master before any Stage 2 code |
| Code status | **Development, local only.** Not committed, not pushed, not deployed |
| Database status | One additive migration, `scripts/strength-inventory.mjs`, **applied to production** with the owner's approval on 2026-11-15. The live site runs pre-Stage-2 code and ignores the new tables |
| Stage 3 | Not started. No order management, checkout or reservation was implemented |

---

## 1. Executive summary
**Completed**
- **All four Stage 1 findings corrected and verified by running tests:**
  - duplicate protection;
  - deactivated-strength URL cleanup;
  - Executive Office refresh behaviour;
  - Coming Soon styling.
- **Stage 2 inventory management is built:**
  - stock per strength (SKU), keyed by the permanent strength ID;
  - physical, reserved and available quantities;
  - audited adjustments with an append-only movement history;
  - low-stock thresholds per SKU;
  - an Executive Office **Stock** tab with search, filter, product totals, SKU detail and recent activity.

**Results**
- Stage 2 acceptance suite: **43/43**.
- Stage 1, certificate and site regression suites: passed, except the 3 local-only image checks described in §9.
- Production reconciliation: all **47** SKUs open exactly at their legacy-derived quantities. Nothing was lost, duplicated or changed. Reserved stock is 0.

**Incomplete or limited** (§12)
- Not deployed; deployment needs your authorization.
- Three homepage image checks can't run locally (production Blob images are blocked by the local network guard).
- Real vial-image upload to Blob is still unverified (carried over from Stage 1).

**Overall:** ready for deployment review. Stopped before Stage 3.

---

## 2. Stage 1 corrections

| Finding | Change | Verified by running |
|---|---|---|
| **B1. Duplicate strength / SKU** | **Server:** names are compared ignoring case and all whitespace (`10mg` = `10 MG` = ` 10 mg `), and stored trimmed with inner spaces collapsed. **Database:** two new unique indexes, on (product, name ignoring case and spaces) and on `upper(sku)`. They sit alongside the exact-match indexes from Stage 1. **Concurrency:** a save that loses a race is refused by an index; the whole transaction rolls back and the editor gets a clear 409 error. **Interface:** an immediate inline warning appears as soon as a duplicate is typed, before saving. | 4 spellings of a duplicate refused (400), nothing written. Direct database inserts of a case or space variant refused by both indexes. Two simultaneous saves of the same new strength: exactly one succeeded, the other got a clear 409, and existing IDs were unchanged. The immediate warning appeared after typing `10 MG`. |
| **B2. Deactivated-strength URL** | The product page rewrites `?strength=` in place (`history.replaceState`, once, after the page loads) to the strength actually shown. This happens when the requested strength is deactivated, unknown, or written another way (ID, SKU, `30 MG`). Other parameters and the `#hash` are kept. A link without `?strength=` is left alone. | Deactivated `40mg` with `&utm_source=qa#specs` → `?strength=10mg&utm_source=qa#specs`, one page load, URL stable (no loop). `999mg` → `10mg`. `30 MG` and the permanent ID → `30mg`. No parameter → none added. Browser Back lands on the corrected URL. The test-only BPC-157 20mg was not reactivated. |
| **B3. Refresh in Executive Office** | The open tab is kept in `?tab=`, an open product editor in `&edit=<slug>`, and an open SKU on the Stock tab in `&strength=<id>`. A refresh reopens them **from saved data; nothing is saved automatically**. A product not saved yet isn't restored. With unsaved edits, refreshing or leaving shows the browser's "leave page?" prompt. Cancel, opening another product, and New Product ask "Discard your unsaved changes?". A vial image (which saves immediately) never counts as unsaved. | Refresh on Stock stayed on Stock, and refresh with a SKU open reopened it. `?tab=products&edit=qa-stage2` reopened the editor. Refresh with unsaved edits triggered the browser prompt; staying kept the edit and nothing was saved. Cancel with unsaved edits asked first. |
| **B4. Coming Soon styling** | Product page Coming Soon is now a badge: gold dot, brand-gold border `#c9a227`, light gold tint, and the label in the site's existing gold for text on light backgrounds, gold-ink `#82673B`. The estimated date is in gold-ink. Catalog cards (navy): Coming Soon in brand gold `#c9a227`. Pending Independent Testing and Out of Stock styling unchanged. No status logic changed. | **Measured in the browser:** badge label **4.64:1** on its tint; date **5.01:1**; card label 6.31:1 (calculated). All ≥ 4.5:1. The border measured exactly `#c9a227`. Before: grey label and date 4.73:1. Brand gold as text would be 2.11:1 on the tint, so it is used for the border and dot only (owner decision 3). |

---

## 3. Stage 2 features implemented
- **Stock per strength.** Each strength has its own stock record, created in the same transaction when the strength is created (0 units, threshold 10, one opening movement).
- **Executive Office → Stock** (new tab next to Inventory):
  - view by product and strength;
  - search by product name or SKU;
  - filter by healthy, low, zero or deactivated;
  - product totals (active strengths);
  - per-SKU detail with physical, reserved, available, threshold and level;
  - adjustment form, threshold form, and full movement history;
  - recent activity (last 25 movements).
- **Adjustments:** add stock, remove stock, correct count.
  - A reason is required, from a fixed list per type; "Other" requires a note.
  - The administrator and timestamp are recorded.
  - A double submission is recorded once.
  - A count correction from an out-of-date view is refused.
- **Low-stock thresholds** per SKU. Levels: Healthy (above threshold), Low (at or below), Zero (none available). Threshold changes are recorded in the history.
- **Product editor:** stock is now read-only there, with a pointer to the Stock tab.
  - The shared "stock" box and the storefront Quick Controls "Set stock" box are removed.
  - A product save carrying stock fields is refused (400) rather than silently ignored.
- **Storefront** is unchanged in meaning. Each strength shows In stock / Low stock: only N left / Out of stock from its own available count. Stock never changes a strength's availability status.

---

## 4. Database changes
**`scripts/strength-inventory.mjs`.** Dry-run output was shown, then it was **applied to production** with approval on 2026-11-15 (`--apply --zero=BPC-157-20MG`). It ran as one transaction.

- **`strength_inventory`**
  - Columns:
    - `strength_id` TEXT PK, FK → `product_strengths(id)` ON DELETE RESTRICT;
    - `physical_quantity` INT NOT NULL CHECK ≥ 0;
    - `reserved_quantity` INT NOT NULL DEFAULT 0 CHECK ≥ 0;
    - `low_stock_threshold` INT NOT NULL CHECK ≥ 0;
    - `version` INT NOT NULL DEFAULT 0;
    - `created_at`, `updated_at`.
  - CHECK `reserved_quantity <= physical_quantity`.
- **`inventory_movements`**
  - Columns:
    - `id` PK;
    - `strength_id` FK RESTRICT;
    - snapshots of `sku`, `product_slug` and `strength_label`;
    - `movement_type` CHECK, one of opening_balance, stock_received, stock_removed, count_correction, threshold_changed, order_deducted, order_restored;
    - `quantity_change`, `previous_quantity` ≥ 0, `resulting_quantity` ≥ 0;
    - `reason` NOT NULL and non-blank, `note`, `actor`, `reference`;
    - `idempotency_key` UNIQUE;
    - `created_at`.
  - CHECK `resulting = previous + change`.
  - Indexes on (strength, time) and (time).
  - **Trigger `inventory_movements_no_update_delete`** rejects every UPDATE and DELETE.
- **`product_strengths`:** new unique indexes `product_strengths_product_label_norm` and `product_strengths_sku_ci`.
- **Comments:** table comments, including marking `inventory` as the frozen legacy copy.

**Data preservation**
- Zero existing rows modified. Fingerprints of `inventory`, `products`, `product_strengths`, `orders`, `coa_records` and `coa_lots` were identical before and after, and re-checked identical after all local testing.
- **Opening balances:** each strength opened at exactly what the storefront computed for it the moment before (`lib/inventory.ts` `resolveRow`):
  - its own legacy row (34);
  - its product's shared row as the only user (AOD-9604-5MG = 45);
  - 0 if it had no row (11).
  - **Exception:** BPC-157-20MG opened at **0** by owner decision 1, instead of 124. That 124 was the product-level shared count, equal to 10mg's own 124. The 124 remains in the legacy table.
- **Not carried, untouched in the legacy table** (full list in §11a): 14 non-zero rows, 976 units, plus 20 zero rows.
  - 11 product-level rows of existing products that no strength drew on;
  - BPC-157's product-level row (124, by decision 1);
  - 2 rows for products that no longer exist: `semaglutide` = 65, `tirzepatide` = 12.

**Rollback:** `DROP TABLE inventory_movements, strength_inventory` and drop the two new indexes. The legacy table is untouched, so the pre-Stage-2 code still reads its old numbers.

`scripts/migrate.mjs` has the same schema, for fresh environments.

---

## 5. Files modified
| File | Purpose |
|---|---|
| `scripts/strength-inventory.mjs` (new) | The migration above: dry run, apply, `--zero`, fingerprint checks |
| `scripts/migrate.mjs` | Same schema for fresh environments |
| `src/lib/inventory-shared.ts` (new) | Client-safe vocabulary: movement types, adjustment reasons, stock levels, row types |
| `src/lib/inventory.ts` (rewritten) | Stock store: listing, the single atomic write path (`applyMovement`), adjustments, thresholds, opening stock for new strengths. Storefront, checkout and order-lifecycle readers and writers now use `strength_inventory`, with the same function names as before |
| `src/app/api/executive/inventory/**` (new) | GET list; GET one SKU with history; POST adjustment; PUT threshold. All staff-only, validated, `Cache-Control: private, no-store` on reads |
| `src/lib/validation.ts` | `inventoryAdjustmentSchema`, `lowStockThresholdSchema` |
| `src/lib/orders/lifecycle.ts` | Passes the order reference into stock movements. Behaviour unchanged |
| `src/lib/products/strength-store.ts` | Normalized names (B1); `strengthConflict` maps a lost race to a clear error; new strengths open stock in the same transaction; the legacy-inventory rename statement is removed (stock is keyed by ID) |
| `src/app/api/executive/products/route.ts`, `[slug]/route.ts` | Refuse stock fields in product saves. 409 for a concurrent-save conflict. GET returns read-only per-strength stock. Delete no longer deletes stock |
| `src/components/executive/StockPanel.tsx` (new) | The Stock tab |
| `src/components/executive/ExecutiveTerminal.tsx` | Stock tab; `?tab=` persistence (B3) |
| `src/components/executive/ProductsPanel.tsx`, `StrengthPanel.tsx` | Read-only stock; immediate duplicate warning (B1); `?edit=` restore and unsaved-change prompts (B3) |
| `src/components/ProductCard.tsx` | "Set stock" quick control removed; Coming Soon in gold on cards (B4) |
| `src/app/shop/[slug]/StrengthSelection.tsx` | URL cleanup for invalid or non-canonical `?strength=` (B2) |
| `src/app/shop/[slug]/AddToCartPanel.tsx` | Coming Soon badge (B4) |

---

## 6. Inventory architecture
- **Physical** (`physical_quantity`): units on hand, per strength.
- **Reserved** (`reserved_quantity`): units held for orders. **Always 0 in Stage 2.**
- **Available to sell** = physical − reserved. It's computed in SQL and in `toRow`, never stored. The database CHECKs (physical ≥ 0, reserved ≥ 0, reserved ≤ physical) make negative availability impossible, and removals are guarded to stay within available.
- **One source of truth:** `strength_inventory`. The legacy `inventory` table is neither read nor written (kept frozen for rollback), and product saves can't write stock.
- **Storefront** shows only available-derived states (In stock / Low stock with a count / Out of stock). The thresholds, reserved and physical counts are never sent to customers (checked on a rendered page).
- **Reserved is inert, verified two ways:**
  1. **Code:** every reference to `reserved_quantity` in `src/` and `scripts/` is a read, a guard, or an INSERT of the literal 0. There is no UPDATE of it anywhere.
  2. **Run:** after the whole Stage 2 suite, reserved = 0 on every strength, locally and in production.

  No reservation service exists, so there's nothing to leave unreachable.

---

## 7. Inventory audit trail
- Every stock change is one row in `inventory_movements`:
  - SKU, product and name as they were at the time, plus the permanent strength ID;
  - type, change, previous and resulting quantity;
  - reason, note, actor (administrator email or `system:*`), reference (e.g. order reference);
  - idempotency key and timestamp.
- **Protection:**
  - **Database:** a trigger rejects UPDATE and DELETE on the history (tested), and CHECKs enforce the arithmetic and non-negative values.
  - **Application:** no route edits or deletes history (PUT, PATCH and DELETE on the history route return 405).
- **History stays with the SKU:**
  - it's keyed by the permanent ID, so deactivation, reactivation and renaming leave it intact (tested);
  - the foreign keys are ON DELETE RESTRICT, so a strength with stock or history can't be deleted.

---

## 8. Security and validation
- **Authorization:** all inventory routes require an Executive Office session (`requireExecutiveSession`, the same guard as product management). Tested: signed out → 401 and customer session → 401, on all 4 routes, with nothing changed. The Stock tab only displays; the routes enforce.
- **Server-side validation (zod):**
  - type from a fixed set;
  - whole-number quantity, ≥ 1 to add or remove, ≥ 0 to correct;
  - reason from the type's list, and a note for "Other";
  - idempotency key required;
  - expected version required for a correction;
  - threshold a whole number ≥ 0.
- **Concurrency:** each change is a single SQL statement that locks the row (`FOR UPDATE`), checks the guard, updates and inserts the movement together. Tested:
  - 20 simultaneous +1 → exactly +20, with 20 distinct, consecutive steps;
  - 10 simultaneous −1 with 5 on hand → exactly 5 succeeded and 5 were refused, ending at 0.
- **Duplicate submissions:** a repeated idempotency key is refused by a unique index with nothing changed (tested via the API, and via a double-click in the interface).
- **Uniqueness of strengths and SKUs:** see B1.
- **Unchanged checks:** the ordering gate, catalog gate and all existing authorization are unchanged. Re-verified: with ordering off, an In Stock strength with stock shows a disabled "Ordering Temporarily Unavailable" and the order API returns 403.

---

## 9. Test results
All runs were **local** (local site, local database copy). None ran against production.

| Suite / test | Expected | Actual | Result |
|---|---|---|---|
| **Stage 2 acceptance** (`stage2-test.mjs`) | 43 checks: data preservation, duplicates (API, database, concurrent), adjustments, history chain, stale correction, 10 invalid inputs, duplicate submission, concurrency (+20 / floor), immutability, thresholds and levels, stock ≠ availability, isolation, totals, deactivate/reactivate/rename, auth, storefront zero stock, no admin data public, order lifecycle, ordering gate, B2, B4 measured, B3 refresh and prompts, B1 immediate warning, reserved = 0, cleanup | **43/43** | PASS |
| — first run | — | 24/36. A real bug: add/remove adjustments (and order deduction) failed with "could not determine data type of parameter $3". Fixed in `lib/inventory.ts`, then every write path was verified directly against the local database | fixed |
| — second run | — | 42/43. A test fault (the search box wasn't cleared). Verified separately that the filter works (12 of 12 zero SKUs) | fixed in test |
| **Stage 1 regression** (`stage1-test-s2.mjs`, adapted: stock via adjustments, rename checks stock by ID, Cancel prompt answered) | 46 | **46/46** | PASS |
| Strength estimated date, pinned clock (`page-date-s1.mjs`) | 7 + 6 | **7/7 evening, 6/6 after midnight** | PASS |
| Certificates API (`coa-test.mjs`) / browser (`coa-ui.mjs`) | 79 / 24 | **79/79, 24/24** | PASS |
| Catalog / product page (`catalog-test-s2.mjs`, ported: empties BPC-157 5mg in `strength_inventory` instead of the legacy table) | 87 | **87/87** | PASS |
| Typography (`typo-test-s2.mjs`: "Coming Soon" and its date added to the allowed gold set, per B4) | 80 | **80/80** | PASS |
| Catalog gate / auth / change password / reset | 13 / 35 / 24 / 18 | **13/13, 35/35, 24/24, 18/18** | PASS |
| UI (`ui-test.mjs`) | 43 | 40/43. The 3 failures are the homepage featured-vial photos on phones, which are production Blob URLs blocked by the local network guard. Same as Stage 1; those photos were verified live after Stage 1 | NOT VERIFIABLE LOCALLY |
| Admin product-level date (`admin-date-test.mjs`) | — | **Superseded since Stage 1:** it drives the product-level date field that Stage 1 replaced with per-strength dates, and has crashed on its second step since then. **Correction:** the Stage 1 report listed it as "1/1 passed", but that was the crash. Per-strength dates were and are covered by the Stage 1 suite and `page-date-s1` | SUPERSEDED |
| Production reconciliation (read-only) | All SKUs match legacy-derived balances | **47/47 match, reserved 0, one opening movement each, fingerprints unchanged, trigger on** | PASS |
| TypeScript `tsc --noEmit` | 0 errors | 0 | PASS |
| ESLint, all changed and new files | 0 errors | 0 errors, 0 warnings | PASS |
| `next build` | success | success (first attempt stopped by the system for low memory; second failed with an internal Turbopack font error; third succeeded) | PASS |

**Not tested**
- **Real vial-image upload to Vercel Blob:** Blob isn't reachable from the local sandbox. Unchanged in Stage 2.
- **The deployed application:** it isn't deployed.

**Side effect found and cleaned up:** before being ported, the old `catalog-test` created a stray **local** test order (VC-QXM732) while expecting a refusal. It was deleted locally. Production was not involved.

---

## 10. Regression testing (Stage 1 functions)
All retested locally and working:
- product creation and editing;
- strength creation, deactivation and reactivation;
- permanent IDs and SKU codes;
- per-strength prices, bulk pricing and costs;
- strength vial images and product-image fallback;
- the gallery;
- `?strength=` links (now also canonicalized);
- default-strength selection;
- all four statuses;
- estimated dates (pinned-clock boundary);
- the catalog and product page;
- the certificate system (admin, header search, How We Test, lot pages, public PDF rules);
- sign-in, registration, password change and reset;
- the catalog gate and the ordering gate.

---

## 11. Data integrity and reconciliation
- **Production after apply** (re-checked read-only after testing):
  - 47 strengths, 47 unique SKUs, 47 stock rows, 47 opening movements;
  - physical total 2,377 (= 2,501 computed before, minus BPC-157-20MG's 124 by decision);
  - reserved 0.
- **Every SKU** matches its legacy-derived balance: 34 from their own row, 2 from a shared row (AOD-9604-5MG 45; BPC-157-20MG 0 by decision), 11 with no row at 0.
- **Fingerprints** of the legacy `inventory`, `product_strengths`, `products`, `orders` and `coa_records` are identical to apply time.
- **Permanent IDs and SKU codes:** unchanged (included in the `product_strengths` fingerprint).
- **Certificates:** 0 published; the synthetic Vanguard record is unchanged.

### 11a. Stock left behind in the legacy table (record only)
**Owner decision, 2026-11-15:**
- **Left as they are:** these counts stay in the frozen legacy table, untouched.
- **Not adjusted:** none was recorded as an adjustment in `strength_inventory`.
- **Why:** none has been physically verified, and the storefront already ignored all of them.
- **If any turns out to be real:** count it physically, then record it as an adjustment in Executive Office → Stock.

**Where they live:** production table `inventory` (columns `slug`, `size_label`, `quantity`, `threshold`; table comment "LEGACY (frozen 2026-11 by Stage 2)"). The application no longer reads or writes it. Rows with `size_label` = `''` were product-level ("shared") counts.

Values below were read from production, read-only, on 2026-11-15.

**A. Product-level counts for existing products: 12 rows, 899 units.**
- 11 of them were drawn on by no strength before Stage 2, because the product's strength had its own row.
- The twelfth, BPC-157's, was the only source for BPC-157-20MG (deactivated, test-only), which opened at 0 by owner decision 1.

| `slug` | `size_label` | quantity | threshold | The product's own strength row |
|---|---|---|---|---|
| 5-amino-1mq | '' | 54 | 10 | 50mg = 54 |
| bac-water | '' | 94 | 10 | 10ml = 94 |
| bpc-157 | '' | 124 | 20 | 10mg = 124 |
| cjc-1295-ipamorelin-blend | '' | 74 | 10 | 5mg / 5mg = 74 |
| epithalon | '' | 44 | 15 | 10mg = 44 |
| ghk-cu | '' | 154 | 20 | 100mg = 154 |
| ipamorelin | '' | 44 | 10 | 10mg = 44 |
| nad-plus | '' | 5 | 15 | 500mg = 74 |
| selank | '' | 44 | 15 | 11mg = 44 |
| tb-4 | '' | 94 | 10 | 10mg = 94 |
| tb-500 | '' | 94 | 20 | 10mg = 94 |
| tesamorelin | '' | 74 | 10 | 10mg = 74 |

**B. Retired products (no product record exists): 2 rows, 77 units.**

| `slug` | `size_label` | quantity | threshold |
|---|---|---|---|
| semaglutide | '' | 65 | 25 |
| tirzepatide | '' | 12 | 20 |

**C. Zero-quantity product-level rows: 20, also left untouched.** ara-290, cagrilintide, dsip, glow-blend, glutathione, igf-1-lr3, klow-blend, kpv, melanotan-1, melanotan-2, mots-c, pt-141, semax, sermorelin, ss-31, thymosin-alpha-1, vc1s, vc2t, vc3r, wolverine-blend.

**Total left behind: 14 non-zero rows, 976 units** (899 + 77), plus the 20 zero rows.

**Not left behind:** AOD-9604's product-level count of 45 was carried, as the only source for its single strength (owner decision 2). Its legacy row is still in the table, unchanged.

**Observation, not acted on:** in 11 of the 12 rows in A, the count equals the product's own strength row exactly; NAD-PLUS (5 vs 74) is the exception. That suggests most are duplicate records of the same vials rather than extra stock. Carrying them would have double-counted.

**Verify any time (read-only):**
```sql
SELECT slug, size_label, quantity, threshold FROM inventory WHERE size_label = '' AND quantity > 0 ORDER BY slug;
```

---

## 12. Known issues
1. **Not deployed.** Deployment requires your authorization.
2. **Homepage featured-vial photos can't be checked locally** (3 UI checks). Check them live after deployment.
3. **Real Blob upload of a strength vial image is unverified.** Owner check after deploy.
4. **Legacy stock deliberately left behind (owner decision, 2026-11-15).** These counts were not carried into the new system and were not recorded as adjustments: nobody has physically verified them, and the shop already ignored them. See §11a for the full list and where they live.
5. **Test fixtures write stock directly.** The ported catalog suite empties a strength by writing `strength_inventory` directly (local only, restored after), which bypasses the history on purpose. The application itself has no such path.
6. **Stock levels are informational only.** "Low stock" appears in the Stock tab and the existing low-inventory alerts. No email or SMS alerts were added (out of scope).
7. **Stage 1 report correction** for `admin-date-test` (§9).
8. **Build reliability on this machine:** low memory stopped one build, and one failed with a Turbopack font error before a clean retry. Neither reflects the code; Vercel builds on its own machines.

---

## 13. Deployment status
**Development, local only.** Production has the Stage 2 tables, which the live pre-Stage-2 code ignores (it still reads the legacy table).

- **Rollback (code):** revert the Stage 2 commit, or redeploy `85db8ab` (`checkpoint/pre-stage2`).
- **Rollback (database):** drop the two new tables and two indexes. Nothing needs restoring.
- **Migration prerequisite:** already met (applied).
- **Deployment order:** the code can be deployed directly.

---

## 14. Stage 3 readiness
**Ready**
- Reserved and available quantities in the schema, with database CHECKs.
- One atomic write path with row locking, idempotency keys and recorded movements.
- Order lines that already carry the strength ID and SKU.
- An existing paid/cancel/refund deduction path that is idempotent per order line.

**Intended interfaces (designs only, NOT implemented, nothing calls them)**
- **`reserve(orderRef, lines)`:** for each line, in one statement per strength, `reserved += q` where `physical − reserved ≥ q` (refuse otherwise). Records a `reserved` movement with an idempotency key `order:<ref>:<line>:reserved`. All lines in one transaction; any failure rolls back all of them (prevents overselling).
- **`release(orderRef)`:** `reserved −= q` for each previously reserved line (expiry, cancel before payment). Key `…:released`.
- **`commit(orderRef)`:** on payment, `physical −= q` and `reserved −= q` together (the deduction moves from reserved to physical). Key `…:committed`. Replaces today's `order_deducted`.
- **`rollback(orderRef)`:** after a committed order is refunded or cancelled, `physical += q`. Key `…:restored`.
- **Expiry:** a scheduled job must release stale reservations. **Without it, reservations would drain available stock permanently**, which is why nothing increments reserved in Stage 2.

**Still needed for Stage 3**
- New movement types in the CHECK (`reserved`, `released`, `committed`).
- The expiry job.
- Wiring checkout and payment events.
- Decisions on reservation duration.
- Lots per strength (lots are still per product).

---

## 15. Recommended manual audit (after deployment)
1. **Executive Office → Stock:**
   - VC3R shows 10mg = 144 and 20mg = 144, with a product total of 288 available;
   - AOD-9604-5MG shows 45, and BPC-157-20MG shows 0 (deactivated).
2. **Open a SKU:**
   - add 1 unit with a reason, then remove it;
   - confirm both appear in its history with your email.
3. **Try to remove more than is available:** it's refused, and nothing changes.
4. **Set a threshold above the current count:** the SKU shows **Low stock**. Set it back.
5. **Edit Product:** stock is read-only there.
   - Add a strength named like an existing one (e.g. `10 MG`): a warning appears at once and Save is refused.
6. **Refresh while editing a product:** the editor reopens. With an unsaved change, the browser asks first.
7. **Deactivated strength link:** open a link to one (e.g. `/shop/bpc-157?strength=20mg`). The address bar changes to the strength shown.
8. **Coming Soon:** open a Coming Soon strength. The badge (gold border and tint, dark gold text) and date are readable.
9. **Certificates tab, header Verify search and How We Test search:** all still work.
