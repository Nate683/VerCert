# VeriCert Peptides — Stage 1 Completion Report
## Strength-Specific SKU & Product Functionality

**Report status:** FINAL (post-deployment), 2026-11-14. Stopped for business-owner review.
**Code checkpoint:** git tag `checkpoint/pre-stage1` (local) = commit `7161af7` = origin/master before any Stage 1 code.
**Code status:** committed as `0a0867a`, pushed to master, **deployed to production** (Vercel reported "Deployment has completed"). Verified live, signed out (section F2).
**Database status:** one additive migration **applied to production** (owner-approved, 2026-11-14). See section C2.

---

## A. Stage completed

Stage 1 only. No Stage 2 (inventory quantities, alerts, replenishment, adjustment history) and no Stage 3 (order-based
deductions, payment-triggered inventory changes, reservations, FIFO or automatic lot activation) work was done. No
certificate-system redesign, email, or payment-processor work was done.

---

## B. Changes implemented

### B1. What was built (new)
- **`product_strengths` table**: one row per strength of a product. Each row has:
  - a permanent id (a UUID that is never regenerated or reused);
  - a SKU code, label and position;
  - retail price, cost of goods, bulk pricing tiers and blend composition;
  - its own availability status and optional estimated availability date;
  - an optional primary vial image;
  - an active/deactivated flag.
- **Permanent identifiers.**
  - The id is made once.
  - The SKU code is made once when the strength is created, using `upper(slug-label)` with spaces removed (e.g. `BPC-157-10MG`). This is the convention the certificate system already uses.
  - A clash gets a `-2` suffix. A code is never reused.
  - A rename, a price, image or status change, and deactivation or reactivation all keep both the id and the SKU code.
- **Executive Office → Inventory → Edit Product → Sizes & Pricing.** Each strength is an expandable panel containing:
  - strength designation;
  - SKU code and permanent id (read-only);
  - retail price, cost of goods, stock, bulk pricing;
  - availability status and estimated availability date (with Clear);
  - an Active/Deactivated control;
  - primary vial image upload, replace and remove.

  Other behaviour of the editor:
  - All strength edits save together through the existing single **Save Product** button.
  - The form is checked before sending (empty or duplicate strengths, invalid numbers). If a save fails, a clear error is shown and every edit stays on screen.
  - Renaming a saved strength shows a note explaining what a rename keeps and what it doesn't.
  - A saved strength can't be removed, only deactivated. Only a not-yet-saved strength can be removed.
- **Per-strength vial image route**: `/api/executive/products/[slug]/strengths/[id]/image` (PUT/DELETE).
  - Staff-only.
  - Uses the existing product-image upload and processing pipeline unchanged.
  - Never touches the product photo or the gallery.
- **Product detail page: dynamic strength switching.**
  - The photo column and the purchase panel share one selection, so the following always belong to the same SKU and change together without a reload:
    - primary vial image;
    - retail price and bulk pricing;
    - availability status and estimated date;
    - Add to Cart state;
    - SKU on the cart line;
    - the URL.
  - **Default selection:** the first active In Stock strength, else the first active strength. A deactivated strength is never selected.
  - **Shareable links:** `/shop/<slug>?strength=20mg`. The value can also be the permanent id or the SKU code, in any capitalisation and with or without spaces.
    - An invalid, outdated or deactivated value falls back to the default strength.
    - The existing product URL is unchanged, and there's still one page per product.
    - A signed-out visitor sent to registration keeps the strength in the return link.
- **Image fallback.** A strength with no image of its own, or one whose image fails to load, shows the product photo, then the placeholder. A broken or blank image is never shown.
- **Cart and order lines** now record the strength's permanent id and SKU code. Older carts (label only) still work.

### B2. What already existed and was left alone
- Everything else on the product detail page:
  - name, category, summary, specifications (CAS, formula, weight, purity, sequence/form, storage);
  - Product Description and Related Compounds;
  - the gallery;
  - the Certificate of Analysis panel and the "You'll receive lot …" line;
  - layout and typography.
- Product names, categories, descriptions and specification data; the product-level Visible in Shop control; product photos and galleries.
- The sitewide ordering switch (`lib/ordering.ts`) and every place it is enforced; the catalog session gate (`proxy.ts`, `requireCustomerForPage`); checkout configuration; payment configuration (including the disconnected payment integration).
- Customer accounts, registration, login, password change and reset.
- Existing order records (each keeps its stored price, label and lot).
- The certificate system's storage, matching, approval, publication, public search and lot pages.

### B3. Existing code changed, and why
| Area | Change | Why |
|---|---|---|
| `lib/products/store.ts` | Reads strengths from `product_strengths`, falling back to `products.sizes` only for a product with no strength rows. Writes the product row and its strengths in one transaction. `products.sizes` stays as a mirror of the active strengths. | Strengths are now the source of truth. The mirror keeps the previous code working if it is ever redeployed. |
| `lib/products/pricing.ts` | `pricedSizes` now also excludes deactivated strengths. | A deactivated strength must disappear from every customer-facing list and from checkout in one place. |
| `lib/products/availability.ts` | Adds `strengthStatus` and `defaultStrength`. `isPurchasable` now requires the selected strength to be active **and** In Stock **and** ordering switched on **and** units left. `availabilityStatus(product)` now reports the default strength's status. | Status is per strength. The sitewide ordering switch is still required; a strength's status can't bypass it. |
| `lib/products/estimated-availability.ts` | Adds `strengthEstimatedLabel` (the same rule, applied to the strength's own date and status). | The date is per strength. |
| `app/shop/[slug]/page.tsx`, `AddToCartPanel.tsx` | Selection comes from the shared strength context. Status, date and purchasability are per strength. Cart lines carry id and SKU. | Dynamic switching (spec §9–11). |
| `api/orders`, `api/promo/validate`, `account` (Reorder), `subscriptions/run.ts` | Find the strength by id (else label) among active, priced strengths, and check **its** status. Order lines record id and SKU. The ordering-switch refusal in `/api/orders` is unchanged and still runs first. | Only an In Stock strength can be bought; a deactivated one is refused. |
| `api/executive/products` (POST, PATCH) | Strength rule violations return a clear 400. The inline price edit targets a strength by id. | Never silently discard edits; no mis-targeted price. |
| `components/executive/ProductsPanel.tsx` | Per-strength panels replace the flat size rows. Product-level status and date fields are replaced by a note that they're now per strength. The catalog card shows each strength's status. The inline "Price (1st size)" box now targets the first active strength by id. | Spec §4. |
| `components/ProductCard.tsx` | The executive inline price edit targets the strength by id. | Same reason. |
| `lib/validation.ts` | A strength may carry `id`, `active`, `availabilityStatus` and `estimatedAvailableOn`; `sizePrice` may carry `id`. SKU and image are never accepted from a request. | Validation of the new fields; identifiers are server-made. |
| `lib/content-guard.ts` | Adds `id` to the non-copy keys. | A random UUID isn't marketing copy. No existing field's check changed. |
| `lib/cart-context.tsx`, `CheckoutForm.tsx` | The cart line key uses the strength id when present. Checkout sends `strengthId`. | Exact SKU on the cart line. |
| `lib/coa/validate.ts`, `lib/coa/admin.ts`, `lib/coa/public.ts` | The informational "currently Coming Soon/…" note and the admin lot-availability label now read the certificate's **own strength's** status, using the record's existing strength label. Catalog suggestions in certificate search show the strength's stored SKU code, which equals the old computed code unless the strength was renamed. | Status is per strength. Read-only use of the existing association; no certificate behaviour or data changed. |
| `scripts/migrate.mjs` | `CREATE TABLE IF NOT EXISTS product_strengths …` for fresh environments. | Convention. |

Unchanged on purpose:
- The product-level `availability_status` and `estimated_available_on` columns are preserved and no longer edited in the editor. They are used only as a fallback for a strength that has no status of its own, which none currently lack.
- Product deletion is unchanged, and it never deletes strength rows. Re-creating a product with the same slug reuses or deactivates them.

---

## C. Certificate compatibility

### C1. Findings
- **What exists:**
  - Executive Office Certificates;
  - Verify Before You Buy (header) and Every Lot Certified (How We Test), both driven by one search;
  - permanent lot pages;
  - public PDF and lab verification links;
  - `coa_records.product_slug` + `size_label` + `sku` + `lot_number`;
  - `coa_lots`, `coa_revisions`, `coa_files`, `coa_audit`.
- **Product detail page certificate display (what actually exists).** Everything is keyed by **product + lot**, never by strength:
  - a COA panel listing the product's lots, with "View COA →" for a lot with a published certificate;
  - "You'll receive lot X" (the product's first listed lot);
  - a purity figure, shown only when the first lot has a published certificate.

  No per-strength certificate display exists. It was deliberately not built (it is the deferred later phase), and Stage 1 did not build it.
- **Preserved:** all certificate records and identifiers, associations, lot references, public links, administration, both search locations and lot pages. Verified by the suites in section D. Certificate tables were fingerprinted unchanged before and after the production migration and every local suite.
- **No second identifier system.**
  - Strength SKU codes use the certificate system's existing convention.
  - Production's one certificate record (the synthetic KPV, `KPV-10MG`) matches its strength's SKU exactly.
  - No certificate was reassigned to a strength id. Certificates still associate by product + strength label, as before.

### C2. Unresolved associations (documented for the later certificate integration phase)
1. **Lots are per product, not per strength.** `products.batch_numbers` is product-level, and every order line, whatever its strength, records the product's first listed lot.
2. **The product page ignores a certificate's strength.** `publishedLotKeys` is keyed by product + lot. A certificate published for one strength would light up "View COA" and the purity figure under **every** strength of the product that shares that lot number. In Stage 1 the COA panel is unchanged and doesn't switch with the strength, so it shows nothing strength-attributed. **Production has zero published certificates, so nothing shows this today.**
3. **Certificates associate by strength label, not by strength id.** Renaming a strength's label detaches certificates filed under the old label. The editor warns about this. Stage 1 doesn't rewrite certificate records, as the spec requires.
   - Recommendation for the later phase: add a nullable `coa_records.strength_id`, backfilled by matching (product, label), as an additive migration.

### C3. Other label-keyed records (pre-existing, unchanged)
- `inventory (slug, size_label)`: a rename now **moves** the strength's stock count (it used to delete it).
- `subscriptions.size_label`: a rename pauses subscriptions on the old label, as before. Production has 0 subscriptions.
- Order lines keep the label (and, from now on, the id and SKU) they were placed with.

---

## D. Database and application changes

### D1. Schema change: `scripts/product-strengths.mjs`. APPLIED TO PRODUCTION (approved), 2026-11-14
- **What it did:**
  - `CREATE TABLE product_strengths` with the columns in B1;
  - CHECK constraints on status and on non-negative price and cost;
  - unique index on `sku`, unique index on (`product_slug`, `label`), and an index on (`product_slug`, `position`);
  - a table comment;
  - 46 rows inserted from the 44 products' existing `sizes`, in one transaction.
- **Existing rows modified: zero.** Fingerprints of `products`, `inventory`, `orders`, `subscriptions`, `coa_records`, `coa_lots` and `coa_files` were identical before and after. They were re-checked identical later the same day.
- **Production result:** 46 strengths, 46 unique SKUs, all active, none with an image. 0 SKU collisions, 0 data problems, 0 orphan inventory or subscription rows.
- **Post-check note:** the script's own post-check falsely failed 19 rows. JSONB stores object keys in a different order, and the check compared text. `scripts/product-strengths-verify.mjs` (read-only) then confirmed every one of the 46 rows matches its source field by field. The script's check was corrected to compare by value and passed on the local apply.
- **Recovery:** `DROP TABLE product_strengths`. No existing data needs restoring, because `products.sizes` is unchanged and still read by the pre-Stage-1 code.

### D2. No other schema change. No destructive migration. No change to existing order, product or certificate data.

---

## E. Automated testing results

All tests ran locally against the local copy of the database. None ran against production.

| Suite | Result | Notes |
|---|---|---|
| Stage 1 acceptance (`stage1-test.mjs`) | **45/45** | First run 40/45. All 5 failures were test-harness faults and were fixed in the harness, not the site: key-order comparison, an order-response field, CSS-uppercased text, and a register-page button mistaken for a purchase button. |
| Strength estimated-date boundary (`page-date-s1.mjs`), clock pinned | **7/7** evening (Nov 25, 9:30 pm Central) + **6/6** after midnight (00:01 Central Nov 26) | Port of the earlier product-level date suite to strength dates. |
| Certificate API acceptance (`coa-test.mjs`) | **79/79** | |
| Certificate browser suite (`coa-ui.mjs`) | **24/24** | Header and How We Test search, lot page, admin preview, open/confirm lab link. |
| Catalog / product page (`catalog-test.mjs`) | **87/87** | |
| Catalog gate (`gate-test.mjs`) | **13/13** | |
| Auth (`auth-test.mjs`) | **35/35** | |
| Change password (`pw-test.mjs`) | **24/24** | |
| Password reset (`reset-test.mjs`) | **18/18** | |
| Typography (`typo-test.mjs`) | **80/80** | |
| Admin estimated date (`admin-date-test.mjs`) | **1/1** | |
| UI (`ui-test.mjs`) | **40/43** | The 3 failures are the homepage featured-vial images on phones. Those images are production Blob URLs, which the local network guard blocks (1,165 blocked requests logged). They passed earlier today only from Next's image cache, which the rebuild cleared. Not caused by Stage 1 (that image code is unchanged), but **not verifiable locally**; to be checked live. |
| Product-level date suite (`page-date-test.mjs`) | 5/6 | **Superseded by design:** it sets the product-level date, which the product page no longer reads. Replaced by `page-date-s1.mjs` above. |
| TypeScript (`tsc --noEmit`) | **passes** | |
| ESLint | **0 errors** | No warnings in any Stage 1 file. 9 older warnings elsewhere. |
| Production build (`next build`) | **succeeds** | |

**Governance C: ordering switched OFF sitewide, an In Stock strength (20mg), observed in the browser:**
- **Signed out:** no product page at all. The visitor is sent to `/register?next=/shop/qa-stage1?strength=20mg`, so there is no purchase button. Cart empty. Order API **401**.
- **Signed in as a customer:** the product page opens on 20mg and shows a **disabled "Ordering Temporarily Unavailable"** button. No quantity picker; price $80.00 shown. Clicking adds nothing. Order API **403**.
- **Signed in as an executive:** the same disabled "Ordering Temporarily Unavailable" button, no picker, price shown. Nothing added. Order API **403**.

**Governance D: quantity picker follows the selected strength:**
- **Ordering on:** switched 12 times between In Stock 20mg, Coming Soon 10mg and Pending Independent Testing 30mg (desktop), and 4 times on a 390px phone. Every time:
  - the picker, running total and bulk hint appeared only on 20mg;
  - price was always shown;
  - image, status, date, button, SKU and URL matched the selected strength;
  - no reload.
- **Ordering off:** switched 5 times. The picker, total and hint never appeared, the button was always disabled, and price was always shown.

**Not tested, or not verifiable locally:**
- **The real vial-image upload to Vercel Blob.** Blob isn't reachable from the local sandbox. The route's sign-in, validation, not-found and remove paths were tested. Image display and switching were tested with local images standing in for uploaded renders.
- **Homepage featured-vial images on phones:** see the UI row above.
- **No real purchase was made**, and no payment credentials were touched. Local test orders were placed against the local database only and then removed.

---

## F. Deployment status
**Deployed.** The owner authorized "Commit and deploy". Committed as `0a0867a` (`VeriCert_Group_2_Audit_Report.txt` was left out), pushed to master, and deployed by Vercel's existing Git integration. Vercel reported success; no deployment errors.

### F2. Live verification (signed out, no account, read-only)
**Stage 1 checks: 11/11 passed.**
- **Homepage featured cards:** all 4 vial images load at 390×844, 375×667 and 1280×900, and each card shows one price. This closes the item that couldn't be checked locally.
- **Signed-out strength link:** `/shop/vc3r?strength=20mg` returns 307 to `/register?next=/shop/vc3r?strength=20mg`. Nothing about the product (price, SKU, strength) is served.
- **Staff routes, signed out:** the new strength-image route (PUT and DELETE), `GET /api/executive/products` and `PATCH /api/executive/products/vc3r` all return **401**. `/api/catalog` still returns **401**.
- **Certificate search "VC3R":** catalog rows for both strengths with their stored SKU codes (`VC3R-10MG`, `VC3R-20MG`), and no certificate groups.

**Certificate checks** (the post-COA-deploy suite, re-run): **24/26 on the first pass.**
- **The two failures came from comparing single page loads, and are not a leak.** They compared one load of the synthetic lot's `/lot/` page with one load of a made-up lot's page.
- **Re-checked across 9 loads:**
  - only two versions of the page exist;
  - they differ only in whether the page-title text is placed in the page body, which varies between requests and also appeared between loads of the same made-up lot;
  - every load of the synthetic lot's page is word-for-word identical to a made-up lot's page.
- **All other certificate checks passed:**
  - search for the synthetic lot and report number returns the same as for made-up ones;
  - its PDF returns 404, like a random id;
  - staff certificate routes return 401;
  - the header search and How We Test return identical results;
  - the no-match wording is correct.

**Not verifiable without an account:**
- the signed-in product page on production;
- the Executive Office editor on production;
- a real vial-image upload to Vercel Blob.

These are business-owner checks G1–G8.

Pre-deployment confirmations:
- **Recoverable checkpoint:** yes (`checkpoint/pre-stage1` = `7161af7`). To roll back after deploying, revert the Stage 1 commit; the old code reads `products.sizes`, which is kept in sync.
- **Database changes are safe and additive:** yes. Existing certificate records are preserved: yes. No destructive migration is required: yes.
- **Outstanding critical issues:** none known.

---

## G. Business-owner verification (browser steps)
1. Executive Office → **Inventory** → **Edit** on a product with several strengths (e.g. VC2T or VC3R).
   - Open each strength's panel. Check its SKU code and permanent ID are shown and can't be edited.
   - Change two strengths' prices, press **Save Product** once, reopen, and confirm both saved.
2. In one strength's panel, set **Availability status** to Coming Soon with an **Estimated availability date**, and set another to In Stock. Save.
3. Upload a vial image to one strength (**Upload vial image**).
4. Open that product in the shop (signed in). Click between the strengths and confirm, each time:
   - the photo changes to that strength's image (or the product photo if it has none);
   - the price, status line and date line change;
   - the button reads Coming Soon / In Independent Testing / Out of Stock for unavailable strengths;
   - the address bar shows `?strength=…`.
5. With **Online Ordering** OFF (Site Content), confirm even an In Stock strength shows **Ordering Temporarily Unavailable**, disabled, with no quantity picker.
6. Copy a strength link (e.g. `…/shop/vc3r?strength=20mg`), open it in a new tab, and confirm it opens on that strength.
7. Deactivate a strength (untick **Active**) and Save. Confirm it disappears from the shop page but stays in the editor with the same SKU and ID. Re-tick to reactivate.
8. Confirm Verify Before You Buy (header), Every Lot Certified (How We Test) and the Certificates tab all still work.

---

## H. Outstanding issues and risks
1. **The certificate-to-strength association is missing** (C2). Record it for the later certificate integration phase. Do not show certificates per strength until then.
2. **Renaming a strength detaches label-keyed certificates and subscriptions** (C2.3, C3). The editor warns about this.
3. **Product-level status and date columns are kept but no longer edited.** Any external tool writing them directly has no effect on the storefront.
4. **The real vial-image upload to Vercel Blob is unverified** (it can't be tested locally or signed out). Verify with step G3.
5. ~~Homepage featured-vial images on phones are unverified locally.~~ Verified live: all load (F2).

Stage 2 and Stage 3 have not been started and await explicit business-owner approval.
