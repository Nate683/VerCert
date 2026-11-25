# VeriCert — Website Visual Refinements Package 2: Report

Date: 2026-11-23. All work is local. **Nothing was committed, pushed or deployed. No migration ran, no production
access of any kind, and no data, schema, pricing, eligibility or routing change.**

## Readiness (updated 2026-11-23): **READY FOR REVIEW / DEPLOYMENT APPROVAL**

**Owner decision applied:** "COMPOUNDS & PRICES" at full desktop width, and the full "VIEW COMPOUNDS & PRICES" on
smaller layouts. The switch happens at 1280 px, the breakpoint where the field is 204 px. It's chosen by CSS, so there
is no flash and no script.
- **Interpretation:** tablet-width layouts (768–1279 px) also show the search in the header, but in a 320 px field, so
  they keep the full phrase. It fits there with 85 px to spare.

**Measured widths** (natural width in the field's own font; the measurement method was fixed, see §6):

| Width | Pricing phrase | Text / room | Search phrase |
|---|---|---|---|
| 1366 and 1280 px | "COMPOUNDS & PRICES" | 149 / 154 px (5 px spare) | 143 / 154 px (11 px spare) |
| 768–1279 px | "VIEW COMPOUNDS & PRICES" | 185 / 270 px (85 px spare) | — |
| Phone 390 px | "VIEW COMPOUNDS & PRICES" | 185 / 292 px (107 px spare) | — |
| Phone 360 px | "VIEW COMPOUNDS & PRICES" | 185 / 262 px (77 px spare) | — |

**Screenshots checked:** `placeholder-view-desktop-1280.png` and `…-1366.png` show "COMPOUNDS & PRICES" in full,
with no ellipsis, inside the gold border. The header screenshots at both widths show the layout unchanged.

**Caution:** 5 px spare is a little tight if a browser renders text wider (Safari often does). If it ever ran over,
the containment fix means it would end in an ellipsis inside the field; it would never paint over the header.

**Tests: all 729 checks pass on the final code** (§6.1).

---

## 1. Changes

| # | Area | Change |
|---|---|---|
| 1 | Signed-out search field | Thin gold border (brand gold at 40 %, gold on hover and focus) on slate blue `#223255`, a step lighter than the header navy `#132544`. Same 204 px desktop slot, same height (41.5 px), same icon, clear button and keyboard behaviour. |
| 1 | Rotating placeholder | **"VIEW COMPOUNDS & PRICES"** in brand gold, first on load, held 4.5 s; then **"SEARCH COMPOUNDS"** in the navigation colour (the SHOP / ABOUT links' `white/70`), held 2.5 s. 300 ms fade between them. Uppercase, 13 px. Stops on focus and when typing begins. The count is no longer in the placeholder; it stays on the View All action and list. |
| 2 | Autocomplete dropdown | Charcoal background (`--charcoal` #20262D, the footer/ticker ground). Compound names in navigation gray (`white/75`), never white. Strengths `white/60` in thin outlined chips. Prices brand gold. Thumbnail 56 px (was 40), one per compound, shown whole (`object-fit: contain`, was `cover`, which cropped). New line: "Select a compound to view details — free registration required." (`white/60`). Same data, same scoring, same /register routing. |
| 3 | View All action | **"VIEW ALL 30 COMPOUNDS & PRICES →"**: uppercase, muted gold (gold at 85 %), live count. |
| 3 | View All overlay | Centred on desktop (vertically and horizontally); navy header bar with the title in gold; white list; names and strengths in gray; prices in the darker gold, semibold; no thumbnails. The footer explains what's visible without an account, with a gold **CREATE YOUR FREE ACCOUNT** button → /register (the site's existing gold-button style). Alphabetical order, live count, Escape, focus on close, scrolling, and the phone layout are kept. |
| 4 | Coming Soon indicator | **Border removed only.** The gold 10 % tint, gold-ink text and gold dot are kept (governance B). The estimated date still comes from the strength record and isn't shown when there is none. The large disabled COMING SOON button is untouched. |

**Containment fix found by looking at screenshots.** At first the long phrase didn't end in an ellipsis: it ran out
past the field's gold border, over the header. The placeholder is now bounded on both sides, so overflow ends in an
ellipsis inside the field. A new test checks this at every width.

**Letter spacing:** I first gave the placeholder 0.08em spacing, which your spec didn't ask for. That made "SEARCH
COMPOUNDS" 6 px too long, so I removed it. That is not a font-size change or a text change.

**Not changed:**
- the signed-in search: its styling, placeholder and the shared 204 px slot are as before (tested);
- data, search eligibility (BAC Water still excluded signed out only), prices, registration routing;
- blends, the TB-4 / TB-500 names, inventory, orders, payments, certificates, site wording;
- the header height (87 px) at 1280 and 1366 px;
- no horizontal scroll at any tested width.

## 2. Contrast (governance A and B): every introduced combination, measured as rendered

Each measurement is the element's computed colour, with any transparency blended over the real backgrounds beneath
it, then the WCAG ratio. In the dropdown, the measurements are on the highlighted (hover) row, which is the lighter,
worse case.

| Element | Colour token | Text → background | Ratio |
|---|---|---|---|
| Placeholder "VIEW COMPOUNDS & PRICES" | brand gold | #c9a227 → #223255 | **5.24:1** |
| Placeholder "SEARCH COMPOUNDS" | nav gray (white/70) | #b5b5b4 → #223255 | **6.17:1** |
| Dropdown compound name | white/75 | #c0bcb3 → #292e34 | **7.28:1** |
| Dropdown strength | white/60 | #a2a09a → #292e34 | **5.28:1** |
| Dropdown price | brand gold | #c9a227 → #292e34 | **5.69:1** |
| Dropdown registration note | white/60 | #9f9d97 → #20262d | **5.64:1** |
| Dropdown "VIEW ALL … →" | gold 85 % | #b09028 → #20262d | **4.96:1** |
| Overlay title | brand gold on navy | #c9a227 → #132544 | **6.31:1** |
| Overlay close × | white/70 | #b1b1af → #132544 | **7.09:1** |
| Overlay compound name | `--muted` (medium weight) | #6a7075 → #ffffff | **5.02:1** |
| Overlay strength | `--muted` | #6a7075 → #ffffff | **5.02:1** |
| **Overlay price** | **`--gold-ink` (semibold)** | #82673b → #ffffff | **5.31:1** |
| Overlay registration text | `--muted` | #6a7075 → #f8f8f9 | **4.73:1** |
| Overlay CTA | black on brand gold | #000000 → #c9a227 | **8.68:1** |
| **Coming Soon text (border removed)** | `--gold-ink` on gold 10 % tint | #82673b → #f3f0e4 | **4.64:1** |

**Governance A, the price list:**
- Overlay prices use the darker gold for light backgrounds (`--gold-ink`). They are **the highest-contrast text in
  each row** (5.31:1 against 5.02:1 for names and strengths), and semibold.
- In the dropdown, prices are brand gold on charcoal at 5.69:1. Names there are higher (7.28:1), because they are the
  primary label in a dark search list. Prices sit below them in gold, in their own chips.

**Governance B:** the Coming Soon text measures 4.64:1 on its tint, consistent with the 4.62:1 recorded in Stage 2.
The existing Stage 2 contrast test (B4) still passes.

**Non-text:** the field's gold border is 2:1 against the header. It is decorative ("understated"): the field is also
identified by its slate background, its search icon and its placeholder text.

**Flag: "navigation gray" on the white overlay.** The navigation colour is white at 70 % for use on navy; on white it
would be about 1.9:1, unreadable. So in the overlay, names and strengths use the site's existing gray for text on white
(`--muted`, 5.02:1), with names a step heavier. No new gray was introduced.

## 3. Placeholder widths (governance C): the decision needed

Measured in the field's own font (13 px, uppercase, no letter spacing):

| Phrase | Text | Desktop 1366 / 1280 (154 px room) | Phone 390 (292 px) | Phone 360 (262 px) |
|---|---|---|---|---|
| VIEW COMPOUNDS & PRICES | 185 px | **31 px short**: ends "VIEW COMPOUNDS & …" | fits, 107 px spare | fits, 77 px spare |
| SEARCH COMPOUNDS | 143 px | fits, 11 px spare | fits | fits |

The final test run's width line printed "154 px in 154 px" and "292 in 292" for the fitting cases. That is a
measurement artefact from the containment fix, not the real width. The widths above come from a separate measurement
in the same font, and the fit conclusions are unchanged.

**Free space in the desktop header row** (measured): **18 px at 1280 px; 33 px at 1366 px and wider** (the header is
capped at 1280 px). The nav gaps are 24 px × 4.

**Other options that don't work** (measured):
- 12 px with no spacing: 171 px.
- 11 px with 0.08em: 177 px.
- 11 px with no spacing: 156 px, still 2 px short.

**Options:**
1. **Shorter desktop wording.** "COMPOUNDS & PRICES" is 148 px (6 px spare). "VIEW PRICES" is 83 px (71 px spare).
   The phone could keep the full phrase. This is a wording decision, so it's yours.
2. **More room in the header.** Widen the slot +31 px (204 → 235 px) at full desktop width. To fund it at 1280 px:
   - the 18 px of free space, plus nav gaps 24 → 20 px (+16 px), = 34 px;
   - that leaves about 3 px spare at 1280 px — the same fragility as the "Explore" case (Safari renders wider);
   - the signed-in box would widen too, because it uses the same slot;
   - the nav spacing would tighten slightly.
3. Leave it as is: the ellipsis "VIEW COMPOUNDS & …" on desktop.

**Recommendation:** option 1. It's the only robust fit at 1280 px, and it doesn't touch the header layout.
Screenshots: `docs/visual-package-2/placeholder-view-desktop-1280.png` and `…-1366.png`.

## 4. Screenshots

All are in `docs/visual-package-2/`, local and uncommitted. I looked at each one.

| What | Desktop | Phone |
|---|---|---|
| Placeholder, pricing phrase | `placeholder-view-desktop-1366.png`, `-1280.png` (ellipsis) | `placeholder-view-phone-390.png`, `-360.png` (full) |
| Placeholder, search phrase | `placeholder-search-desktop-1366.png`, `-1280.png` | `placeholder-search-phone-390.png`, `-360.png` |
| Header context | `header-desktop-1366.png`, `-1280.png`; signed in: `header-signed-in-1366.png` | — |
| Autocomplete results | `dropdown-desktop.png` | `dropdown-phone.png` |
| View All catalog | `view-all-desktop.png` | `view-all-phone.png` |
| Coming Soon, with / without a date | `coming-soon-desktop-with-date.png`, `-no-date.png` | `coming-soon-phone-with-date.png`, `-no-date.png` |

Locally the thumbnails show as broken images, because product photos are on Vercel Blob, which the local network
guard blocks. In production they load, as Package 1's live screenshots showed.

## 5. Files

**Changed:**
- `src/components/PublicSearchBox.tsx` (presentation only)
- `src/app/shop/[slug]/AddToCartPanel.tsx` (the badge's border class removed)
- `src/app/globals.css` (new token)

**New token:** `--search-slate: #223255`. It has the same value as the office panel colour, but is separate so the
Executive Office theme can't change the public header. Everything else reuses existing tokens: `gold`, `gold-ink`,
`charcoal`, `muted`, `surface`, `hairline`, `navy`, and white at 60 / 70 / 75 %.

**Tests:**
- new: `scripts/stage3-tests/t-visual2-ui.mjs` (105 checks)
- updated: `t-refinements-ui.mjs` (expects the new phrases and labels; the retired "Explore 100" check is now just the
  204 px slot check), `run-all.sh` (adds the new suite)
- debug helpers: `peek-v2-1280.mjs`, `peek-v2-fit.mjs`

**Screenshots:** `docs/visual-package-2/`.

## 6. Test results (actual)

**Final full run on the final code** (`run-all.sh`, on a database with both migrations applied): **727 passed,
2 failed, 0 skipped.**

| Suite | Result |
|---|---|
| Stage 3 migration | 35/35 |
| Package 1 migration | 44/44 |
| Engine | 125/125 |
| Stage 3 API A | 143/143 |
| Stage 3 browser | 43/43 |
| Stage 2 rebuilt (includes the B4 Coming Soon contrast) | 35/35 |
| Stage 1/2 regression | 36/36 |
| Stage 3 API B | 40/40 |
| Package 1 app | 65/65 |
| Package 1 browser | 58/58 |
| **Package 2 browser** | **103/105** |

The 2 failures are "VIEW COMPOUNDS & PRICES fits without clipping" at 1366 and at 1280 px. They are the real finding
in §3, left failing deliberately until you decide.

**Earlier runs:**
- **Run 1** failed both phrases on desktop (55 and 6 px short with letter spacing), then crashed on a stale element
  handle; the sampler was made robust.
- **Run 2** removed the letter spacing. One Package 1 check measured the retired "Explore 100 Compounds" phrase and
  failed; it was corrected and rerun alone, 58/58.
- **Run 3** (final) is above.

**TypeScript:** 0 errors. **ESLint:** 0 errors and 0 warnings on the changed files. **Production build:** succeeds.

## 7. Other notes

- `scripts/stage3-tests/t-live-r1-signed-out.mjs`, Package 1's live check, still expects the old placeholder and
  label. It should be updated if this package is deployed.
- **No ambiguity resolved silently:** navigation gray on white (§2), the decorative border (§2) and the placeholder fit
  (§3) are all flagged above.

**STOPPED. Awaiting your decision on §3, and review.**

## 6.1 Final run after the owner's wording decision (2026-11-23)

**Change:** `PublicSearchBox.tsx` shows "COMPOUNDS & PRICES" at xl and wider (the 204 px desktop slot), and the full
phrase below xl. Both are rendered, and CSS shows one: `xl:hidden` / `hidden xl:inline`.

**Test updates:**
- The tests read the visible text (`innerText`) and expect the short phrase at desktop width.
- The width measurement now uses each phrase's **natural rendered width** (a detached copy in the field's own computed
  font) against the real room. The earlier clone method was clamped by the containment fix, and printed "154 in 154".
- No checks were added or removed; the suites' counts are unchanged.

**Results: all 729 checks pass.**

| Suite | Result |
|---|---|
| Stage 3 migration | 35/35 |
| Package 1 migration | 44/44 |
| Engine | 125/125 |
| Stage 3 API A | 143/143 |
| Stage 3 browser | 43/43 |
| Stage 2 rebuilt (includes B4 Coming Soon contrast) | 35/35 |
| Stage 1/2 regression | 36/36 |
| Stage 3 API B | 40/40 |
| Package 1 app | 65/65 |
| Package 1 browser | 58/58 * |
| **Package 2 browser** | **105/105** |

\* In the full run, the Package 1 browser suite stopped after 34 passing checks, on a 30-second page-load timeout. It
was the same intermittent timeout seen earlier under low memory; that step had passed in every earlier run. I reran
that suite alone against a freshly started app, on the same build and data: 58/58. All other suites are from the full
run.

**TypeScript:** 0 errors. **ESLint:** 0 errors, 0 warnings on the changed files. **Production build:** succeeds.

**Contrast:** unchanged, because the colours are unchanged (§2). The desktop pricing phrase measures #c9a227 on
#223255, 5.24:1.

**Tablet widths** (768 / 1024 / 1279 px, measured by `scripts/stage3-tests/peek-v2-tablet.mjs`): the full phrase is
185 px in 270 px, with no horizontal scroll.

The screenshots in `docs/visual-package-2/` are refreshed from this run.
