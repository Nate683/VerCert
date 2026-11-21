# VeriCert — Website Refinements Package 1: Completion Report

Dates: 2026-11-20 to 2026-11-21. All work is local. **Nothing was committed, pushed or deployed. No production
migration ran, and no production data or configuration changed.** The only production access was two read-only
queries you authorized: `scripts/refinements1-prod-readonly.mjs` on 2026-11-20, and
`scripts/refinements1-prod-readonly-cjc.mjs` (the CJC-1295 names) on 2026-11-21.

# PART 2 — Final corrections and verification (2026-11-21) — current

## Readiness: **READY FOR DEPLOYMENT APPROVAL**, with one wording approval and one small layout note

- Every suite passed on the final code: **622 checks, 0 failed, 0 skipped**. That includes the deferred Stage 3,
  Stage 2 and Stage 1/2 regression suites, run against the state production will have after both migrations (§P2.6).
- **Your approval is needed** for the two replacement sentences in §P2.2 before anything is committed. They are
  already in the local code, and tested.
- The desktop search placeholder fits, but with **2 px to spare** (§P2.5).
- This is not permission to deploy. Each production step needs your separate authorization (§P2.8).

## P2.0 Governance answers

**A — TB-4 not renamed.**
- No step changes TB-4's name, slug or alternate names. The approved "TB-4 (Full Length)" and "TB-4" stand.
- WOLVERINE references it by permanent ID (`tb-4`), so the page shows its current name.
- Tested: the migration's guard covers every TB-4 column except the already-approved alternate name. After the apply,
  TB-4's name is unchanged.

**B — BAC Water: where it can and can't be found.** It's excluded by its permanent ID (`bac-water`) from one place
only: the public compound list behind the signed-out search. Nothing about the product changed (ID, price, stock,
availability, status). Tested.

| Where | Signed out | Signed in |
|---|---|---|
| Header search: rotating count ("Explore 30 Compounds") | **Not counted** | n/a (the signed-in box has no count) |
| Header search: results | **Not shown** (the public list) | **Shown**, with its price (the unchanged signed-in catalog search) |
| View All Compounds & Prices | **Not listed** | n/a (signed-out only) |
| `/shop` catalog | Redirects to /register (unchanged) | **Listed** (unchanged) |
| `/shop/bac-water` product page | Redirects to /register (unchanged) | **Loads**; can be added to cart when in stock (unchanged) |
| VERIFY BEFORE YOU BUY search | **Still listed** as a catalog row (compound, strength and SKU, no price), unchanged | Same |

**C — WOLVERINE's strength and total are consistent.**
- The strength label is "10mg / 10mg" (SKU `WOLVERINE-BLEND-10MG/10MG`). Its two amounts add to **20 mg**, the declared
  total, and the ingredients are BPC-157 10 mg + TB-4 10 mg.
- The migration checks every required blend this way and prints "(matches the label's amounts)". It did so for all
  four.
- The label, SKU, price ($89.99), stock and images are unchanged (tested).

**D — Is the CJC-1295 No DAC product matched by name anywhere?** No: everything that matters links to it by slug.
- **Certificates** link by slug, and their pages show the product's live name. As of the 2026-11-18 read, production
  has no certificate for this product. If one is added later and its printed compound reads "CJC-1295 without DAC",
  certificate validation would show a **non-blocking** "compound mismatch" advisory, because validation compares the
  printed name with the product's name and alternate names. Adding "CJC-1295 without DAC" as an alternate name would
  avoid that. I haven't added it, because you didn't approve it.
- **The VERIFY search** de-duplicates catalog rows by name, but only for products on sale. This one is hidden, so it
  isn't affected.
- **The blend's old free-text composition** says "CJC-1295". Nothing reads it any more; it's kept for reference.
- **Order line items** keep the name at purchase time, as history. Nothing re-matches them.
- **Text search** (shop and signed-in) matches names by design, but hidden products aren't in it.

## P2.1 BAC Water

Done as in B: `PUBLIC_COMPOUND_EXCLUSIONS` in `src/lib/catalog-public.ts`, applied in `/api/public-catalog`. The count
is still computed on every request from the eligible products. Production data gives **30**: 31 on sale, minus BAC
Water.

Tested:
- count = products on sale minus BAC Water;
- hiding one more product lowers the count by one live, and restoring it brings the count back;
- BAC Water is absent from the public list;
- it's present in the signed-in catalog with its price, and its page loads for a customer.

## P2.2 Privacy and About: **proposed text, for your approval before committing**

Only these two statements change. Everything else, including all previously approved Package 1 wording, is untouched.

**Privacy, the registration paragraph's last sentence**
- Current: "Access to the catalog is restricted to registered accounts."
- Proposed: "**Compound names and public pricing can be viewed without an account; registration is required for full
  product details, inventory availability, and purchasing.**"
- The whole paragraph would read: "Placing orders and accessing registered researcher account features requires
  registration. When an account is created we record name, email address, and shipping details. Passwords are stored
  using salted hashing. Compound names and public pricing can be viewed without an account; registration is required
  for full product details, inventory availability, and purchasing."

**About, first sentence of the intro's second paragraph**
- Current: "Access to our full product catalog, pricing, inventory information, and purchasing is reserved for
  registered research customers, including independent researchers, laboratories, academic institutions, and
  commercial research organizations."
- Proposed: "**Visitors can view our compound names and public pricing. Registration is required for full product
  details, inventory availability, and purchasing, and is open to research customers including independent
  researchers, laboratories, academic institutions, and commercial research organizations.**"
- The rest of the paragraph is unchanged ("Certificates of Analysis are available for public verification… not for
  human or veterinary consumption.").

**Where they apply:**
- In the code defaults (done locally, tested on `/privacy-policy` and `/about`).
- In production's edited copies, **if** production holds them (`site_content` `policies` / `about_page`). The
  migration replaces each sentence only where it appears exactly once and leaves an edited copy without it as is
  (tested both ways).
- Whether production has those copies is unknown. The production dry run will show it before anything is written.

## P2.3 CJC-1295 rename

- **The migration:** renames `cjc-1295-no-dac` from "CJC-1295 without DAC" to **"CJC-1295 (No DAC)"**, and only from
  exactly that name. Any other current name STOPS the migration (tested).
- **Kept:** the slug, hidden status, alternate names (none), strengths, stock and certificates. The guard allows only
  this product's name to change.
- **Verified:** the CJC/Ipamorelin blend page shows "CJC-1295 (No DAC) 5mg · Ipamorelin 5mg · Total per vial 10mg",
  as text with no link.
- **Not changed:** the blend's own name, "CJC-1295 / Ipamorelin Blend", wasn't in the approved list.

## P2.4 WOLVERINE composition

- **Stored:** BPC-157 (`bpc-157`) 10 mg, then TB-4 (`tb-4`, not `tb-500`) 10 mg; total 20 mg. It's added to the
  migration's required compositions, and works through the Blends tab too.
- **Product page:** "BPC-157 10mg · TB-4 10mg · Total per vial 20mg", text only, on desktop and phone. I looked at the
  screenshots.
- **Stock:** saving, editing and removing compositions changed **no stock, lots, movements or strengths**. Tested by a
  fingerprint across the whole app suite.
- **A blend with no composition** still renders nothing: tested by temporarily clearing WOLVERINE, then restoring it.
- **Blends tab:** only the hidden Semax/Selank now says "Needs composition".

## P2.5 Search placeholder: checked by looking at screenshots

- **Desktop (1366 px):** "Explore 30 Compounds" is shown in full, with no ellipsis. Measured: the text is 144 px wide
  in a 146 px space, so **2 px to spare**. In the screenshot it sits right up against the field's right padding.
- **Phone (390 px):** the text is 144 px in 292 px, comfortably inside the field.
- **Header layout:** unchanged. The field is the same size as the signed-in box, and the header height is the same
  signed in and out.

The margin is thin. A three-digit count ("Explore 100 Compounds"), or a browser that renders the font slightly wider
(Safari on a Mac often does), could end the text in an ellipsis on desktop. **Smallest correction if wanted:** widen
the desktop field from 12.25 rem to 12.75 rem, only at the widest layout (+8 px). I haven't made that change, because
the text currently fits and the field size is meant to stay as it is. Your call.

## P2.6 Regression and Package 1 tests: one complete run, final code, 2026-11-21 14:11–14:16

Run as `run-all.sh`:
- the app suites ran on a database with the Stage 3 migration **and** this package's migration applied, as production
  will have;
- the Package 1 app suites ran on a freshly restored copy.

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| Stage 3 migration safety | 35 | 0 | 0 |
| Package 1 migration and database rules | 43 | 0 | 0 |
| Stage 3 engine (database functions, concurrency) | 125 | 0 | 0 |
| Stage 3 API part A (simulation off) | 143 | 0 | 0 |
| Stage 3 browser | 43 | 0 | 0 |
| Stage 2 rebuilt checks | 35 | 0 | 0 |
| Stage 1/2 regression | 36 | 0 | 0 |
| Stage 3 API part B (local payment simulation) | 40 | 0 | 0 |
| Package 1 app | 65 | 0 | 0 |
| Package 1 browser (desktop and phone) | 57 | 0 | 0 |
| **Total** | **622** | **0** | **0** |

- The Stage 3 suites cover inventory, orders, reservations, payments, lots, the order and catalog gates, and
  authorization. They are unchanged and all pass with the Package 1 code and tables in place.
- Certificate records are fingerprinted unchanged by both migration suites.
- **TypeScript:** 0 errors. **ESLint:** 0 errors, 0 warnings on the changed files. **Production build:** succeeds.
- Before this run, I updated the Package 1 tests for the corrections: WOLVERINE now has a composition, the count is
  30, the CJC name is new, and there are new wording, BAC Water, live-count and placeholder-fit checks. Nothing failed
  in the run.

## P2.7 Protected production data

- **Unchanged.** The only production access in this round was the read-only CJC name query: one read-only
  transaction, which wrote nothing.
- **The migration** writes, beyond its two new tables: TB-4's alternate name; the CJC product's name; and, only if
  production holds edited copies, the listed sentences in the policies and About text. Everything else is covered by
  the in-transaction guard: products, strengths, prices, SKUs, stock, lots, allocations, movements, orders, order
  events, certificates, legacy inventory, subscriptions and the other site content.

## P2.8 Proposed production sequence (each step only on your separate authorization)

1. **Dry run** (read-only): `node scripts/refinements1-blends.mjs`. It shows every planned write:
   - the 4 compositions;
   - the TB-4 alternate name;
   - the CJC rename;
   - whether edited policies / About copies exist, and what would change in them.
2. **Apply:** `node scripts/refinements1-blends.mjs --apply`. It runs as one transaction with the guard, and checks
   itself afterwards.
3. **Commit** the Package 1 code. `VeriCert_Group_2_Audit_Report.txt` stays out.
4. **Push**, which makes Vercel deploy automatically.
5. **Live signed-out checks:**
   - the search shows "Explore 30 Compounds";
   - View All lists 30 compounds;
   - BAC Water is absent from both;
   - the new privacy and About sentences appear;
   - `/shop` still redirects to /register.

Order matters: the product page and Blends tab read the new tables, so step 2 must come before step 4.

**STOPPED. Awaiting your approval of the §P2.2 wording, and then each production step.**

---

# PART 1 — Original completion report (2026-11-21)

## Deployment readiness (superseded by Part 2): **NOT READY** — one test gap, and three owner decisions

1. **Regression suites not yet run on this package's code.** The Stage 3 suite, the rebuilt Stage 2 checks and the
   Stage 1/2 regression need the local database and app. Claude Code stopped both because the computer ran critically
   low on memory, and I didn't restart them without being asked. This package's own suites all passed (§7).
2. Owner decisions in §9: BAC Water in the count; two pieces of existing copy that now contradict public prices; the
   display name of the hidden CJC-1295 No DAC product.
3. **Deploy order matters.** The product page and the Blends tab read the new tables. The package migration must run
   in production **before** the code deploys; otherwise product pages would fail. Both need your authorization.

---

## 1. Governance A (as reported 2026-11-20)

- **A1. Slug.** The slug is the products table's primary key and the system's permanent product ID. No edit path can
  change it.
  - Keyed off the slug: `/shop/<slug>` URLs, strengths, certificate records, Stage 3 lots and movements, order line
    items, subscriptions, the ledger and promo restrictions.
  - Confirmed by test: renaming TB-4 to "TB-4 (Full Length)" through the Executive Office kept slug `tb-4`. `/shop/tb-4`
    still loads, and GLOW's composition shows the new name through the same reference.
- **A2. TB-4 / TB-500, as stored in production** (read 2026-11-20). Both were already renamed in production on 11-18;
  this package doesn't touch their names.

  | | TB-4 (Full Length) | TB-500 (Fragment 17–23) |
  |---|---|---|
  | Slug | tb-4 | tb-500 |
  | Visibility | visible | **hidden** |
  | CAS | 77591-33-4 | 885340-08-9 |
  | Formula | C₂₁₂H₃₅₀N₅₆O₇₈S | C38H68N10O14 |
  | Molecular weight | 4,963.4 g/mol | 889.01 g/mol |
  | Sequence | SDKPDMAEIEKFDKSKLKKTETQEKNPLPSKETIEQEKQAGES, 43 aa | Ac-LKKTETQ, 7 aa |

  Internal consistency check (stored values against each other only; nothing supplied):
  - Both residue counts match.
  - TB-500's sequence is exactly residues 17–23 of TB-4's.
  - Each formula and weight follows from its sequence with an N-terminal acetyl group.

  Presentation notes:
  - TB-4's sequence text has no "Ac-" prefix; TB-500's does.
  - TB-4's formula uses subscript characters.

  Neither was changed. The only TB-4 data change is the approved alternate name "TB-4".
- **A3. Blends.** No declared-total field existed; compositions were free-text names per strength.
  - GLOW and KLOW listed **TB-500**.
  - CJC/Ipamorelin listed "CJC-1295".
  - WOLVERINE had none.
  - Semax/Selank is hidden.

  The old free-text entries are kept untouched for reference and are no longer shown to customers.
- **A4. Pricing source.** The storefront's price is `product_strengths.price_usd`, filtered by `pricedSizes` (active
  and priced strengths only). There's no central promotional price. The search reads the same product listing the
  shop uses (`listProducts`), and decides prices in one place (`publicPrice()`), which today returns the regular price.

## 2. What was built

| # | Item | Result |
|---|---|---|
| 1 | Signed-out header search | `components/PublicSearchBox.tsx` (details below) |
| 2 | Footer | "…by qualified researchers and professional entities." (`Footer.tsx`) |
| 3 | Register | "Create an account to access our full research catalog, place orders, and manage your research purchases." |
| 4 | Privacy | "Placing orders and accessing registered researcher account features requires registration." (that sentence only) |
| 5 | Terms §11 (Pricing and availability) | "Prices are in U.S. dollars and are displayed alongside eligible product listings." (that sentence only) |
| 6 | Blend page | Miniature ingredient vial cards removed; text-only **Blend Composition** section added. Hero image, gallery and price untouched |
| 7 | Executive Office → **Blends** tab | Structured composition editor (§5) |
| 8 | GLOW, KLOW and CJC/Ipamorelin compositions | Stored by the migration (§6) |
| 9 | TB-4 alternate name | "TB-4" added (owner-approved); names already correct in production |

**Search details:**
- **Placeholder:** alternates "Compound Search" / "Explore 31 Compounds" with a 300 ms fade every 3 s. The count comes
  from the live catalog. Rotation stops on focus or typing, and no number shows until the real count has loaded.
- **Matching:** by name, alternate name or CAS number, using the shop search's own scoring (`lib/search.ts`).
- **Results:** the existing photo, then each strength with its price, at most 8 results.
- **View All:** "View All 31 Compounds & Prices" is available even with an empty field. It opens a compact
  alphabetical sheet over the page (rendered on `document.body`), with Escape to close and focus moved to the close
  button.
- **Routing:** choosing a compound, a strength or a list row goes to `/register`.
- **Unchanged:** the field's size and 13 px font match the signed-in box exactly. The signed-in search is untouched.
  The box appears only once the session check has finished, so a signed-in visitor never sees it flash.

**Promotions:** a public price carries `regularUsd` and `effectiveUsd`. The search and list show the effective price
with the regular one struck through **only when they differ**, which can't happen today. A future central promotions
system plugs in at `publicPrice()` without a redesign. Registered-only discounts (subscriptions, bulk tiers, codes) are
never shown.

## 3. Wolverine: what its customer page shows with no composition

**Nothing: no section, no heading, no placeholder text.** The page goes straight from the size selector ("10mg /
10mg, $89.99") to the stock status, price and button, exactly as it did before this package. Wolverine had no
composition then either, so it showed no cards. There's no visibly empty section, so hiding Wolverine isn't needed
for this reason. Screenshot: `shots-r1/wolverine-desktop.png` in the local test folder.

In the Executive Office → Blends tab, Wolverine shows **"Needs composition"**, and the summary counts it.
Semax / Selank (hidden) is flagged the same way.

## 4. Signed-out visibility: before and after (governance B)

| | Before | After |
|---|---|---|
| Header product search | None (signed-in only) | Yes |
| Compound names | Through the VERIFY search only (compound, strength, SKU) | All 31 compounds on sale |
| Strengths | Through VERIFY only | Yes, on sale only |
| **Prices** | **None** | **Every on-sale strength's price**, in results and in View All |
| Product photos | None | Thumbnail in results (View All has none) |
| Product pages, `/shop`, cart, checkout | Redirect to `/register` | **Unchanged**: still redirect |
| Hidden products, deactivated strengths, stock, SKU, purity, lots, certificates | Not shown | Still not shown |

A signed-out visitor can now see essentially the full price list that `/shop` was gated to protect. The only things
still behind registration are product detail pages, stock status and purchasing. Whether the `/shop` redirect still
serves a purpose is your decision; it is unchanged, as instructed. The new endpoint `/api/public-catalog` is the only
gate change; the signed-in `/api/catalog` still refuses signed-out requests (tested).

## 5. Blend Component Selector (Executive Office → Blends)

**Where:** a new tab after Stock, with the same access for `/command` and `/office`.

**The list:** every blend strength with its composition ("GHK-Cu 50mg · BPC-157 10mg · TB-4 10mg = 70mg") or
**Needs composition**.

**The editor:**
- the declared total in mg;
- ingredient rows, each with a compound chosen from the catalog (stored by permanent product ID; hidden products
  marked "(hidden)"; blends excluded) and an amount in mg;
- ↑ / ↓ to reorder; remove a row; add a row;
- a live "Ingredients: X mg of Y mg" line, with errors shown before saving and Save disabled while any remain;
- "Remove composition", with a confirm step.

The earlier free-text entry is shown for reference only.

**Rules,** checked in the browser, in the API (`validateComposition`) and again by the database at commit:
- positive amounts and total (at most 3 decimal places);
- at least one ingredient;
- no duplicate compound;
- no self-reference;
- the product must exist;
- the sum must equal the declared total.

An example message: "The ingredients add up to 85mg, but the declared total is 80mg. They must match."

**Effects:**
- **Stock:** saving moves no stock. A blend stays its own SKU; tested by fingerprinting stock, lots, movements and
  strengths before and after.
- **Activity log:** each save is recorded with the administrator and the ingredients.
- **Product deletion:** a product used as an ingredient can't be deleted while it is one (database rule). Deleting
  such a product in Inventory would now fail **with a generic server error** rather than a friendly message. That's
  a small follow-up, not built.

## 6. Data design and the migration

**Two new tables (approved), plus one check function and two triggers on them.** Nothing existing is altered.
- `blend_compositions`: one row per blend **strength** (its permanent strength ID): the declared total in mg, version,
  and who and when.
- `blend_components`: one row per ingredient: the component product's slug (its permanent ID, a foreign key to
  products), `amount_mg` > 0, and `position`. Unique per blend on compound and on position.
- A deferred check at commit: sum = total; positions 0…n−1 with no gaps; no self-reference; the blend named must be the
  strength's own product; at least one ingredient.

**`scripts/refinements1-blends.mjs`** is a dry run by default. With `--apply` it runs in one transaction:
1. creates the tables;
2. stores the compositions, as tested locally:
   - **GLOW**: GHK-Cu 50 · BPC-157 10 · **TB-4** 10 = 70 mg
   - **KLOW**: GHK-Cu 50 · BPC-157 10 · **TB-4** 10 · KPV 10 = 80 mg
   - **CJC-1295 (No DAC) / Ipamorelin**: `cjc-1295-no-dac` 5 · Ipamorelin 5 = 10 mg

   All are in your order, and each total matches its strength label's amounts.
3. adds "TB-4" to TB-4's alternate names;
4. updates the two policy passages **only if** production holds an edited copy of the policies (a `site_content`
   row), each only where the old sentence appears exactly once. Without that row, the pages use the updated code
   defaults. Whether production has one is **unknown**: it wasn't in the authorized query. The dry run will show it.

**Safeguards:**
- **Stops:** it STOPS if a required blend doesn't have exactly one active strength, or if any product is missing.
- **In-transaction guard:** covers products (all except TB-4's alternate names), strengths, stock, lots, allocations,
  movements, orders, order events, certificates, legacy inventory, subscriptions and all other site content.

TB-500 is never an ingredient.

## 7. Automated test results (actual)

| Suite (new) | Result |
|---|---|
| `t-refinements-mig.mjs` — migration and database rules | **35/35** |
| `t-refinements-app.mjs` — public list, Blends API, product pages, wording | **56/56** |
| `t-refinements-ui.mjs` — headless Edge, desktop 1366 px and phone 390 px | **55/55** |

**Migration suite (35):**
- dry run writes nothing and lists every planned write;
- the STOP case;
- a planted mid-migration product edit rolls back everything;
- policy passages replaced only where exact, and an edited copy is left as is;
- all three compositions stored in order on their own strengths, never TB-500;
- the protected data byte-identical;
- the database refuses 10 kinds of invalid write.

**App suite (56):**
- the count equals the products on sale (31) and is one entry per compound, alphabetical;
- prices are identical to the storefront's, with no hidden product, deactivated strength or extra field;
- the signed-in catalog and the `/shop` gate are unchanged;
- the Blends API refuses signed-out visitors and customers;
- listing, reorder, create, remove and 11 validation refusals all work, and no stock moved;
- GLOW, KLOW and CJC pages show the exact rows and totals, with no vial cards;
- Wolverine and a non-blend show nothing;
- the hidden CJC product is never linked;
- a rename keeps the slug;
- all four wording changes appear.

**UI suite (55):**
- the placeholder alternates with a fade and stops on focus and typing;
- an empty field shows View All only;
- search finds by name, CAS (300801-03-0 → GHK-Cu) and alternate name;
- hidden TB-500 isn't found;
- strengths and prices match the catalog;
- compound, strength and list rows all route to `/register`;
- View All covers the screen with 31 alphabetical rows and closes on Escape;
- no horizontal scroll;
- the field is the same size as the signed-in box and the header height is unchanged;
- the signed-in search is unchanged;
- the composition section renders on desktop and phone;
- the Blends tab works: list, flag, editor load, live mismatch error, reorder and save.

**Failures along the way:**
- **A real product bug, found by looking at screenshots after the tests had passed:** the View All sheet was squashed
  into the header, because the header confines fixed-position overlays to its own box. **Fixed** by rendering the
  sheet on `document.body`. I added a check that the sheet covers the whole screen with at least 6 readable rows.
  After the fix: desktop 764 px sheet with 15 rows visible; phone full height.
- **A migration bug:** the guard's variable names clashed with a table alias. Fixed; the guard was then proven by its
  rollback test.
- **Test faults, fixed:**
  - re-typing into search and number fields appended text instead of replacing it;
  - one click landed on the overlay.
- **Local-only effect:** the hero vial images can't load locally, because the network guard blocks the Vercel Blob
  host they're stored on. The test checks that the page still renders GLOW's stored hero image, which it does.
- **One UI run** stopped on a 30-second navigation timeout during the low-memory period. The next two runs completed,
  and the final full run was 55/55.
- **Run order:** the app suite ran on the build from just before the View All fix. That fix touched only
  `PublicSearchBox.tsx`, which the app suite doesn't exercise; the UI suite ran on the final build.

**Not run on this package's code: the Stage 3 suite (migration, engine, API, browser), the rebuilt Stage 2 checks,
and the Stage 1/2 regression.** The local database and app were stopped for low memory.

**TypeScript:** 0 errors. **ESLint:** 0 errors and 0 warnings on all 25 new or changed files, test scripts included.
**Production build:** succeeds on the final code.

## 8. Files

**New:**
- `scripts/refinements1-sql.mjs`, `scripts/refinements1-blends.mjs`
- `scripts/refinements1-prod-readonly.mjs` (authorized read)
- `src/lib/products/blend-composition.ts`, `blend-composition-shared.ts`
- `src/lib/catalog-public.ts`
- `src/app/api/public-catalog/route.ts`
- `src/app/api/executive/blends/route.ts`, `[strengthId]/route.ts`
- `src/components/PublicSearchBox.tsx`, `src/components/executive/BlendsPanel.tsx`
- tests: `t-refinements-mig.mjs`, `t-refinements-app.mjs`, `t-refinements-ui.mjs`, two `peek-*` helpers
- this report

**Changed:**
- `src/components/Header.tsx`, `Footer.tsx`
- `src/app/register/RegisterClient.tsx`
- `src/app/shop/[slug]/page.tsx`, `AddToCartPanel.tsx`
- `src/components/executive/ExecutiveTerminal.tsx` (Blends tab)
- `src/lib/site-content/defaults.ts` (2 sentences)
- `src/lib/validation.ts` (one schema)
- `src/proxy.ts` (one public API path)
- `scripts/stage3-tests/cycle.sh` (`SNAP=` option)

**Removed:** `src/lib/products/blend-components.ts`, the old name-matching for vial cards; it is now unused.

## 9. Owner decisions

1. **BAC Water counts as a compound.** It's sold as a product, so it is in "Explore 31 Compounds" and View All. Keep
   it, or exclude it?
2. **Existing copy that now contradicts public prices.** These weren't changed, because you asked for those passages
   only:
   - The same privacy paragraph still ends "Access to the catalog is restricted to registered accounts."
   - The About text says "Access to our full product catalog, pricing, inventory information, and purchasing is
     reserved for registered research customers."
3. **CJC/Ipamorelin ingredient name.** It shows the hidden product's **current name**. Locally that's "CJC-1295 without
   DAC"; I haven't read the production name. To show "CJC-1295 (No DAC)", rename that product in Inventory. The slug
   doesn't change.
4. **WOLVERINE:** its composition, when you have it (Blends tab → Add composition).
5. **Optional follow-up:** a friendly message when deleting a product that is a blend ingredient (§5).

**Not measured:** whether "Explore 31 Compounds" fits the 12.25 rem desktop field without being cut off. The UI
suite confirmed the text appears, but not its width. (An overflowing placeholder would end in an ellipsis.)

## 10. To finish

1. Rerun the Stage 3 suite and the Stage 1/2 regression on this code, when memory allows. I'll do it when you ask.
2. With your authorization: `node scripts/refinements1-blends.mjs` (a production dry run), then `--apply`, then
   commit, push and deploy, in that order.

**STOPPED. Awaiting your review.**

---

## P2.9 Owner approvals and step 1 of the production sequence (2026-11-21)

**Approved and done locally:**
- **CJC alias.** "CJC-1295 without DAC" is added as an alternate name on CJC-1295 (No DAC), in the migration, beside
  the rename. Tested: 44/44 migration checks.
- **Header search slot.** At full desktop width only (xl, 1280 px and wider) it is now 12.75 rem, up from 12.25 rem
  (+8 px). Measured:
  - "Explore 30 Compounds" is 144 px of text in 154 px of space;
  - "Explore 100 Compounds" would be 150 px in 154 px, so it would still fit;
  - the header height is unchanged (87 px) at 1280 and 1366 px, with no horizontal scroll (screenshots checked);
  - the signed-in box gets the same width, since it uses the same slot.
- **Full rerun after both changes: 626 checks, 0 failed, 0 skipped.**

  | Suite | Passed |
  |---|---|
  | Stage 3 migration safety | 35 |
  | Package 1 migration | 44 |
  | Engine | 125 |
  | API part A | 143 |
  | Stage 3 browser | 43 |
  | Stage 2 rebuilt | 35 |
  | Stage 1/2 regression | 36 |
  | API part B | 40 |
  | Package 1 app | 65 |
  | Package 1 browser | 60 |

  The production build was rebuilt after a OneDrive file lock on `.next`, and succeeded.

**Step 1: production dry run** (`node scripts/refinements1-blends.mjs`, no `--apply`). Exit 0, "Dry run: nothing
executed." In production it would:
- create the two tables and four compositions: GLOW 70, KLOW 80, CJC/Ipamorelin 10, WOLVERINE 20. Every total matches
  its strength label, and every TB-4 reference is `tb-4`, displayed as "TB-4 (Full Length)";
- add "TB-4" to TB-4's alternate names;
- rename CJC "without DAC" → "(No DAC)", keeping it hidden and adding the old name as an alternate name;
- **policies and About: no edited copies exist in production.** The live pages use the code defaults, so the
  migration writes no site content. The approved wording reaches the site through the code deploy only.

The certificate fingerprint `e1ab9e2adb100df9e49d6459eea7fb79` is unchanged since 2026-11-18. Only Semax / Selank
(hidden) would remain flagged.

**Not done:** apply, commit, push, deploy. Each awaits separate authorization. The two replacement sentences in §P2.2
also still await your wording approval before the commit.

## P2.10 Step 2: production migration APPLIED (2026-11-21, owner-authorized)

`node scripts/refinements1-blends.mjs --apply`: exit 0, **"Checks passed: 4 composition(s) stored and read back in
order; all protected data unchanged."** The wording in §P2.2 was approved by the owner before this step.

- **All 14 protected fingerprints are identical before and after:** products (except the planned TB-4 and CJC fields),
  strengths, stock, lots, allocations, movements, orders, order events, certificate records (still
  `e1ab9e2adb100df9e49d6459eea7fb79`), lots, files, legacy inventory, subscriptions and other site content.
- **Independent read-only check** (`scripts/refinements1-prod-verify-apply.mjs`):

  | Blend | Ingredients | Total |
  |---|---|---|
  | GLOW | GHK-Cu 50 · BPC-157 10 · TB-4 (Full Length) 10 | 70 mg |
  | KLOW | GHK-Cu 50 · BPC-157 10 · TB-4 (Full Length) 10 · KPV 10 | 80 mg |
  | CJC/Ipamorelin | CJC-1295 (No DAC) 5 · Ipamorelin 5 | 10 mg |
  | WOLVERINE | BPC-157 10 · TB-4 (Full Length) 10 | 20 mg |

  All four are on their own strengths, with labels unchanged.
  - `cjc-1295-no-dac` is "CJC-1295 (No DAC)", hidden, with alternate name "CJC-1295 without DAC".
  - `tb-4` is "TB-4 (Full Length)", with alternate name "TB-4".
  - `tb-500` is unchanged.
  - Only Semax/Selank (hidden) has no composition.
  - There are no edited policies or About rows.
  - BAC Water is unchanged.
  - Stock is 2,274 units.
  - Both check triggers are present.
- **Until the code deploys:** the live site runs the Stage 3 code, which doesn't read the new tables. Blend pages
  still show the old free-text vial cards, and the CJC card's name-match is unaffected because that product is hidden.
  Nothing breaks in the meantime.

**Not done:** commit, push, deploy and live checks. Each awaits separate authorization.
