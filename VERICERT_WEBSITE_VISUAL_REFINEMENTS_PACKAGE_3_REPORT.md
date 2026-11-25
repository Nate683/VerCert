# VeriCert — Website Visual Refinements Package 3: Completion Report

Date: 2026-11-25. All development and testing are local. **Nothing was committed, pushed or deployed. There was no
production access, no migration, no configuration change and no production data change.**

## Executive summary

**Readiness: READY FOR DEPLOYMENT APPROVAL.** No deployment blocker was found. There are three small owner notes
(§13).

- **All 926 checks pass in one complete run** on the final code: every Stage 1–3 and Package 1–2 suite, plus the new
  Package 3 suites. That's 0 failures, 0 retries and 0 skipped in the final run.
- **The mandatory registration form-state preservation passed every test on desktop and on a phone layout.** The same
  form element stayed mounted throughout (proven by a marker on the element). Every value and checkbox survived, and
  the validation message survived. There were 0 form submissions and 0 navigations. Nothing sensitive reached storage,
  requests or the URL.
- **The signed-in header is unchanged:** identical HTML, layout, computed styles and pixels against the previous build,
  at all nine widths and in the open menus (15/15).
- **Starting point:** commit `8aed9ed`, tagged locally as **`package3-checkpoint`** (not pushed).

---

## 1. Governance A answers (reported before building)

**A1. Overlay mounting vs the registration form: no remount (verified).**
- **Where the form's state lives:** in `RegisterForm` (`useState`), under root layout → `SiteChrome` → `<main>`. There
  is no `template.tsx`.
- **Where the overlay lives:** it is now one provider (`CatalogOverlayProvider`) that wraps both the header and
  `<main>`, and its dialog is portaled to `document.body`.
- **Why the form can't be disturbed:** opening and closing change only that provider's state. There's no route change,
  and nothing above the form re-renders or remounts.
- **Who talks to the overlay on /register:** only the new `ExploreInvitation` button, not the form.
- **Proven by test:** the live `<form>` element carries a random marker set before any overlay use. It's still there
  after every open, search, dismissal and registration action (§5).

**A2. Header sharing.**
- **One component** (`Header.tsx`) with signed-in and signed-out branches.
- **The guarantee:** every Package 3 element renders only when `signedOutLayout` is true. When signed in, that is
  `false`, so each element and class string is exactly as before. While the client session check is still loading, the
  layout follows the server's own session check (`signedInAtRender`), so neither layout jumps.
- **Verified by:** `t-visual3-baseline.mjs`. I recorded the signed-in header from the old build (HTML, the geometry and
  computed styles of every element, and a screenshot) at 9 widths plus the open menus. Then I compared the new build:
  15/15 identical.
- **About the pixel check:** two same-build captures of the old build showed 42–71 pixels of anti-aliasing noise at
  360 / 430 px. So the pixel check allows up to 0.25 %, but only on top of identical HTML, layout and computed styles.

**A3. Coming Soon text and background.**
- **Text colour:** `--gold-ink` #82673B, kept. Brand gold is not used.
- **Background:** with the tint removed, it sits on the purchase panel's `bg-surface` **#F8F8F9**.
- **Contrast: 5.01:1**, measured as rendered (§9). That's above 4.5:1, so there was no stop.
- **The dot:** brand gold at 2.28:1. It is decoration; the words carry the status.

**A4. Autocomplete limit.**
- **Where the limit is:** the header autocomplete kept the best 8 matches. That limit is in the component; the public
  list has no limit.
- **What changed:** a shared function, `matchPublicCompounds` in `src/lib/catalog-public.ts`, returns **every** match
  using the same `lib/search.ts` scoring. The autocomplete takes `.slice(0, 8)`. The overlay filters the complete
  eligible list with it and shows the matches alphabetically.
- **Tested:** "e" matches more than 8 compounds in the overlay.

**B. Buttons near or in the form.**
- Every overlay control (close, clear) and the new "VIEW COMPOUNDS & PRICES" button are `type="button"`.
- The compound, strength and CREATE YOUR FREE ACCOUNT entries are links, which can't submit a form.
- The dialog is portaled outside the `<form>` in the DOM, so Enter in its search field can't submit the form either.
  Enter is also suppressed there.
- **Verified:** a capture-phase `submit` listener counted **0** submissions across every overlay action on desktop and
  phone, including Enter in the search field. The test asserts `type="button"` on the invitation button.

---

## 2. What changed

| § | Change |
|---|---|
| 1 | **Signed-out desktop (1280 px and wider):** Logo → **Compound Search** → SHOP → HOW WE TEST → ABOUT → CONTACT → VERIFY BEFORE YOU BUY → SIGN IN → Cart. Same 12.75rem field, slate blue, gold outline, rotating phrases ("COMPOUNDS & PRICES" gold / "SEARCH COMPOUNDS" gray). The dropdown now hangs from the field's left edge, so it stays on screen. Header 87 px, unchanged. |
| 1 | **768–1279 px:** unchanged. The search stays in the top row on the right, VERIFY in its own row, header 146 px. |
| 2 | **Signed-out phone (below 768 px):** the compound search fills the row VERIFY used, at that row's 58 px, so the header stays 133 px and 2 rows. The menu opens with **VERIFY BEFORE YOU BUY** first, using the same control, emblem and panel; tapping it closes the menu and opens the verification panel. The search is no longer repeated in the menu. Full "VIEW COMPOUNDS & PRICES" placeholder. |
| 3 | **Registration page:** "Explore before you register" / "Discover our compounds, strengths and pricing. No account required." / **VIEW COMPOUNDS & PRICES →**, placed between the intro paragraph and the account benefits. Navy heading, existing gray text, thin navy outlined button with navy lettering and a small magnifier in the darker gold. No card, banner or fill. Gold CREATE ACCOUNT stays the primary action. On the phone it appears before the form. |
| 4 | **Form-state preservation:** by mounting (A1), not by storage. No localStorage, sessionStorage, cookies or URL parameters. A normal dismissal returns focus to the invoking control and restores the page position. A registration action while on /register closes the overlay and moves focus to the "Create your account" heading, which is scrolled into view. There's no navigation and no history entry. |
| 5 | **One shared overlay** (`CatalogOverlay.tsx`) for the desktop search, the phone search and the registration button. Order: navy header, gold heading, ×, the **new search field** ("Search compounds...", white, hairline border, darker-gold magnifier, × clear), then the scrolling alphabetical list, the registration explanation and CREATE YOUR FREE ACCOUNT. "No matching compounds found." is announced as a status. Search clears on close. Tab is trapped inside, and Escape closes it. Opening focuses the close button, so no phone keyboard pops up. Page scroll is locked while it's open. On very short viewports, such as a phone with its keyboard open, the explanation steps aside so the list and button remain usable. |
| 6 | **Counts removed:** "VIEW ALL COMPOUNDS & PRICES →" and "VIEW ALL COMPOUNDS & PRICES". The count is still computed by `/api/public-catalog` (30 in this data). Eligibility is unchanged. |
| 7 | **Coming Soon:** tint, padding and badge shape removed as well as the border. The gold dot and gold-ink text remain, directly on the panel; the date line is unchanged. The large disabled COMING SOON button is untouched. |

## 3. Files

**New:**
- `src/components/CatalogOverlay.tsx` (the shared provider and dialog)
- `src/lib/use-public-catalog.ts` (the one shared public catalog loader)
- `src/app/register/ExploreInvitation.tsx`

**Changed:**
- `src/components/Header.tsx`: signed-out layout only. That's the left slot, the `xl:hidden` suffix on the original
  slot, the phone row, and VERIFY first in the menu.
- `src/components/PublicSearchBox.tsx`: shared loader and matching, opens the shared overlay, `anchor` prop, no count,
  a larger clear control, the private overlay removed, and on /register it returns to the form instead of navigating.
- `src/components/SiteChrome.tsx`: wraps in the provider; passes `signedInAtRender` to the header.
- `src/lib/catalog-public.ts`: `matchPublicCompounds`.
- `src/app/register/RegisterClient.tsx`: renders the invitation, and adds an id and `tabIndex={-1}` to the "Create your
  account" heading. No field, validation or submit code changed.
- `src/app/shop/[slug]/AddToCartPanel.tsx`: badge classes only.

**Tests:**
- new: `t-visual3-ui.mjs` (182 checks), `t-visual3-baseline.mjs` (15 signed-in comparisons)
- debug helpers: `peek-v3-*.mjs`
- updated expectations only where this package changes a requirement: `t-refinements-ui.mjs` (2: no count),
  `t-visual2-ui.mjs` (3: no count ×2, no tint)
- `run-all.sh` runs the new suites

**Screenshots:** `docs/visual-package-3/` (33 files).

No styling tokens were added. Everything reuses `navy`, `gold`, `gold-ink`, `muted`, `hairline`, `surface`, `paper`,
`charcoal` and `--search-slate`.

## 4. How existing parts were reused

- **Overlay:** the Package 2 overlay markup, colours and behaviour were moved into the shared `CatalogOverlay`, not
  recreated. The header's private copy was deleted, so there is exactly one implementation. There's no new route,
  overlay, pricing source or catalog system.
- **Data:** one request to `/api/public-catalog`, the same eligibility (hidden products, deactivated strengths and BAC
  Water excluded) and the same authoritative prices, shared by every entry point through `use-public-catalog.ts`.
- **Matching:** `matchPublicCompounds` wraps the existing `lib/search.ts` `searchScore` (name, alternate names, CAS,
  normalization). The autocomplete and the overlay call the same function.

## 5. Mandatory registration form-state preservation: results

Run on desktop (1366 px) and on a phone layout (390 px, emulated), with every field filled with **synthetic data**.
That's names, an `@example.invalid` email, a password and confirmation, a research category, a phone number, marketing
consent and the acknowledgment. The form was also put into a **validation-error state**: an invalid phone number, caught
in the browser with no request sent.

Each check verifies that every control's value or checked state is identical, the validation message is identical, and
the same `<form>` element is present (marker intact, so it was never remounted). It also verifies 0 `submit` events,
the overlay closed, and the expected focus.

| Sequence | Desktop | Phone |
|---|---|---|
| Open and close with ×: focus back on the invitation button, page position restored | PASS | PASS |
| Escape | PASS | PASS |
| Backdrop click | PASS | PASS |
| Search, Enter in the search field, clear, scroll the list, a no-results search, then close | PASS | PASS |
| Select a compound: overlay closes, focus on the "Create your account" heading, no navigation | PASS | PASS |
| Select a strength | PASS | PASS |
| CREATE YOUR FREE ACCOUNT | PASS | PASS |
| Three more open / search / close cycles | PASS | PASS |
| No navigation and no history entries during all of it | PASS | PASS |
| No name, email or password in localStorage, sessionStorage, cookies, the URL or any request; no registration request | PASS | PASS |
| Then completing registration normally with the same entries: account created in the local DB, redirected | PASS | PASS |

Evidence: `docs/visual-package-3/E-state-preserved-desktop.png` and `…-phone.png` (synthetic values; password fields
masked).

**Sensitive information:** the overlay component can't reach the form (separate tree, portal). Nothing was added to
any storage, URL, request, analytics call or log. The test inspected all three storage mechanisms, the URL, and every
request URL and body during overlay use.

## 6. Signed-in experience unchanged

`t-visual3-baseline.mjs compare`: **15/15**, at 360 / 390 / 430 / 768 / 1024 / 1279 / 1280 / 1366 / 1440 px plus the open
menus at the six widths below 1280 px. HTML, element geometry, computed styles and pixels match the previous build
(`8aed9ed`). Reference images: `signed-in-header-1366-unchanged.png` and `signed-in-menu-390-unchanged.png`.

## 7. Screenshots

All in `docs/visual-package-3/`. I looked at each one.

| What | Files |
|---|---|
| Desktop header: before → after | `before-signed-out-header-1280.png` / `-1366.png` → `A-header-signed-out-1280.png` / `-1366.png` / `-1440.png` |
| Desktop dropdown under the moved field | `A-dropdown-desktop-1366.png` |
| Tablet (unchanged) with dropdown | `before-signed-out-header-768.png`, `B-tablet-1024.png` |
| Phone header: before → after | `before-signed-out-header-390.png`, `-390-menu.png` → `C-phone-390-header.png`, `C-phone-390-menu.png` |
| Phone verification from the menu; phone dropdown | `C-phone-390-verify-panel.png`, `C-phone-390-dropdown.png` |
| Registration invitation | `D-register-desktop.png`, `D-register-phone.png` |
| State preservation | `E-state-preserved-desktop.png`, `E-state-preserved-phone.png` |
| Overlay: full, filtered, cleared, no results | `F-overlay-full-desktop.png`, `F-overlay-filtered-*.png`, `F-overlay-cleared-*.png`, `F-overlay-no-results-*.png` |
| Overlay with the phone keyboard (emulated) | `F-overlay-keyboard-emulated-phone-header.png`, `…-register.png` |
| Coming Soon, with / without a date | `G-coming-soon-desktop-with-date.png`, `…-no-date.png`, `G-coming-soon-phone-*.png` |

**Screenshot finding: a capture artifact, not a defect.**
- **What I saw:** the first dropdown screenshots looked washed out and see-through.
- **What I checked:**
  - computed opacity was 1;
  - nothing was layered above the dropdown, including elements that ignore the pointer;
  - removing the header blur or the animation changed nothing;
  - a full-window capture measured solid charcoal (brightness 39, against 38 expected), as did the unchanged signed-in
    dropdown.
- **Cause:** only *clipped* captures showed it. A clipped capture re-renders the page and catches the dropdown during
  its opening fade.
- **Fix:** the dropdown screenshots are now full-window captures. They show the dropdown solid, as on the live site.

## 8. Responsive and accessibility findings

- **No horizontal scroll** on `/`, `/register` and `/about`, signed in and signed out, at all 9 widths (36 checks).
- **Desktop placeholder:** "COMPOUNDS & PRICES" 149 px in 154 px (5 px spare); "SEARCH COMPOUNDS" 143 px. The same as
  the Package 2 approval; the field didn't change size.
- **Phone placeholder:** full phrase 185 px in 262–330 px.
- **Overlay:** search field labelled; visible focus on the close, clear and invitation controls; Tab trapped; Escape
  closes; focus returns to the opener; no-results announced (`role="status"`); 44 px close target; 16 px search text on
  phones, so iOS won't zoom.
- **Contrast:**
  - Coming Soon text **5.01:1**
  - registration invitation text **5.02:1**, button **15.26:1**
  - overlay colours as approved in Package 2 (names and strengths 5.02:1, prices 5.31:1)
- **Limits of this testing:** everything is in headless Microsoft Edge (Chromium) with device **emulation**: viewport
  size, touch and mobile flags. A real phone keyboard can't be opened headless, so it was emulated by shrinking the
  viewport to 420 px. **No real-device, Safari or Firefox testing was performed.** Safari's possibly wider text could
  use some of the 5 px desktop clearance; if it ever exceeded it, the text ends in an ellipsis inside the field.

## 9. Test results (actual)

**Final complete run** (`run-all.sh`, final code, database with both migrations applied): **926 passed, 0 failed,
0 skipped, no retries.**

| Suite | Result |
|---|---|
| Stage 3 migration safety | 35/35 |
| Package 1 migration and database rules | 44/44 |
| Stage 3 engine (inventory, lots, reservations, orders, payments) | 125/125 |
| Stage 3 API A (gates, auth, checkout, refunds, cron, …) | 143/143 |
| Stage 3 browser | 43/43 |
| Stage 2 rebuilt (includes B4 Coming Soon contrast) | 35/35 |
| Stage 1/2 regression (auth, registration, ordering gate, subscriptions) | 36/36 |
| Stage 3 API B (payment simulation) | 40/40 |
| Package 1 app (public catalog, blends, BAC Water, wording) | 65/65 |
| Package 1 browser | 58/58 |
| Package 2 browser | 105/105 |
| **Package 3 browser** | **182/182** |
| **Package 3 signed-in comparison** | **15/15** |

After the final lint fix to `t-visual3-baseline.mjs`, a counter rewritten from `?:` to `if`, I reran that comparison:
15/15.

**Failures on the way, all test-script faults, fixed and rerun:**
1. A missing helper after a page reload crashed one section.
2. Retyping by triple-click appended text in search and phone fields, the same issue as in Package 1. It made overlay
   searches look empty and registration look "incomplete".
3. The synthetic phone number I first used, "(555) 123-4567", is rejected by the site's own phone rule (§13).
4. A network-idle wait never settled in the responsive sweep, so it now waits for the load event.

**TypeScript:** 0 errors. **ESLint:** 0 errors and 0 warnings on all 17 changed files, after fixing 2 warnings in test
scripts. **Production build:** succeeds.

## 10. Requirement-to-test reconciliation

| Spec | Evidence |
|---|---|
| §1 desktop order, field, phrases, timing, fit, dropdown inside the viewport, routing, VERIFY works | V3 A (1280 / 1366 / 1440): order and x positions, 87 px, 204 × 41.5, phrases and timing, focus stop, dropdown left-anchored and within the viewport, /register, VERIFY panel opens; `A-*.png` |
| §1 tablet unchanged | V3 B (768 / 1024 / 1279) |
| §1 / §2 signed-in unchanged | V3-SIGNED-IN 15/15 |
| §2 phone: search visible, VERIFY first in the menu, header 133 px, no duplicates, panel from the menu, dropdown, keyboard (emulated), clear | V3 C (360 / 390 / 430); `C-*.png` |
| §3 invitation: text, placement, styling, primary CTA kept, direct overlay, no navigation | V3 D (desktop, phone); `D-*.png` |
| §4 mandatory state preservation | V3 E (26 checks, 13 each on desktop and phone) — §5; `E-*.png` |
| §5 shared overlay: one overlay from every entry, full list, full / partial / alias / CAS, no limit, prices, clear, no results, reset on reopen, scrolling, keyboard, focus, scroll lock, no thumbnails, exclusions | V3 F (48 checks across 4 entry points: 11–13 each; phone entries add the keyboard check, header entries the /register routing check); `F-*.png` |
| §6 no visible counts | V3 A / F; R1-UI and V2-UI updated expectations |
| §7 Coming Soon: no border / tint / padding, dot and text, 5.01:1, date or no empty label, disabled button | V3 G (desktop, phone, with and without a date); `G-*.png` |
| §8 protected functionality | Every Stage 1–3 and Package 1–2 suite (729 checks) |
| §9 responsive 360 → 1440, signed in and out | V3 H (18 combinations × up to 3 pages) |

## 11. Protected data and functionality

- **Data:** no database schema, migration or data change. The only local test writes were the two synthetic
  registrations and a temporary Coming Soon status on KPV, restored afterwards, in the local test database only.
- **Unchanged:** catalog eligibility, prices, BAC Water exclusion, signed-in search, blends, TB-4 / TB-500, inventory,
  orders, payments, certificates, VERIFY functionality, authentication, registration validation and legal wording.
  All of that suite coverage passes.
- **No production access** of any kind in this package.

## 12. Deployment and rollback

- **No migration:** this is front-end code only, so the deploy is commit + push.
- **Rollback:** revert to `package3-checkpoint` (`8aed9ed`). No data to undo.
- **Live checks after the authorized deploy:** the existing live scripts need new expectations:
  - `scripts/stage3-tests/t-live-r1-signed-out.mjs` still expects the Package 1 placeholder ("Compound Search" /
    "Explore N Compounds") and "View All N …" labels.
  - `scripts/stage3-tests/t-live-v2-signed-out.mjs` (Package 2, uncommitted) expects "VIEW ALL N COMPOUNDS & PRICES →",
    finds the phone search after opening the menu (it's now in the header row), and doesn't check the new desktop
    order.
  - A Package 3 live check should cover the signed-out desktop order, the phone row and menu, the registration button,
    the overlay search and no counts. Form-state preservation can be checked live signed out on /register with
    synthetic data, **without submitting**.

## 13. Owner notes (no blockers)

1. **The site's phone example fails the site's own rule.** The registration error says "e.g. (555) 123-4567", but the
   phone check requires the three digits after the area code to start with 2–9, so that example is rejected. Existing
   wording and validation, not changed here (protected).
2. **The first account benefit** reads "The full catalog, with pricing — Every compound and size with its price…".
   With public prices and the new "No account required" invitation, you may want to reword it. Not changed (protected
   wording).
3. **Desktop placeholder clearance** stays at 5 px (§8). This is unchanged from the Package 2 approval, and was tested
   in Chromium only.

**Interpretation, as reported before building:** "signed-out mobile" means narrower than 768 px. Between 768 and
1279 px the search was already in the top row, so that layout is unchanged.

**STOPPED. Awaiting your review.** Nothing will be committed, pushed or deployed without explicit authorization.
