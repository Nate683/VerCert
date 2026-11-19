# VeriCert Stage 3 — Production Migration Dry Run (read-only)

**Run:** 2026-11-18, `node scripts/stage3-orders.mjs`, with no flags, against the database in `.env.local`: host
`ep-nameless-sky-au523837-pooler…neon.tech`, database `neondb` (production).
**Nothing was applied.** The dry run only runs SELECT queries; it prints "Dry run: nothing executed" and exits before
the transaction. Nothing was committed, pushed or deployed.

---

## ⚠ Read this first: one answer is not what you expected

**Item 1. Existing rows modified: not zero. The answer is 4, all in `orders`.**

- The migration writes the new `payment_status` / `fulfillment_status` columns, plus `payment_source`,
  `payment_confirmed_at` and `payment_confirmed_by`, on each of the **4 existing orders**.
  - That is an UPDATE of 4 existing order rows. Only the new columns are filled in.
  - **No existing value in those rows changes**, including the legacy `status`: 0 status changes.
  - The guard inside the transaction would roll back the entire migration if any existing order column other than
    the listed status mappings changed.
- No other existing row is modified.
  - Products, strengths, stock rows, existing movements, certificate records, lots and files, and subscriptions:
    **0 rows**.
  - The other writes are **new** rows: 34 lots, 34 movements and 1 heartbeat row.
- "Additive" holds at the schema level: new tables, and new columns added to `orders` and `inventory_movements`.
  - Every existing row gains those columns, as NULL or the default.
  - The movement-type CHECK constraint is replaced with a wider one.
  - No existing column value is rewritten.

If you need zero modified rows, the order mapping can't be a write. The alternative is to leave the 4 orders' new
columns unset and derive their state when reading. That's a code change; I haven't made it.

The dry run reports **no change to product content and nothing published** (items 2 and 8).

---

## Confirmations

**1. Additive / rows modified.** See above: **4 existing order rows** get their new columns filled in, with no
existing value changed. **0** existing rows in any other table.

**2. Product content untouched.** The migration contains **no write** to `products` or `product_strengths`. Its only
UPDATE statements target `orders`. That leaves unchanged:
- descriptions, CAS numbers, molecular formulas, molecular weights, sequences, storage and purity
- prices, strengths, SKU codes and permanent IDs

The content manifest below lists production as it is now: 44 products (31 visible) and 47 strengths, with SKUs,
IDs, prices, active flags, statuses and quantities. Those tables are fingerprinted before the first statement and
after the last, inside the transaction, so any difference would roll everything back.

**3. "The one existing order".** Production has **4 orders**, not 1:

| Order | Status now | After (payment / fulfillment) | Legacy status after |
|---|---|---|---|
| VC-E3SQJ9 | cancelled | confirmed / cancelled | cancelled (unchanged) |
| VC-38UTPQ | cancelled | confirmed / cancelled | cancelled (unchanged) |
| VC-D7C7JS | shipped, refunded $25 of $25 | refunded / shipped | shipped (unchanged) |
| VC-9TNWAS | cancelled (the crypto order cancelled on 2026-11-07) | cancelled / cancelled | cancelled (unchanged) |

VC-E3SQJ9 and VC-38UTPQ were **paid, then cancelled, with no refund recorded**. That's why they map to
"payment confirmed". The migration doesn't open a review for them and doesn't count them as revenue, because
cancelled orders are excluded. If they were test orders, or if refunds were made outside the system, say so and
I'll describe the options. I haven't changed anything.

**4. Legacy status changes:** **0.** The dry run reports "legacy status changes: none". Locally there was one test
order (VC-LEG005); production has no order of that kind.

**5. Stage 2 partial refunds:** **none.** The dry run reports "none". VC-D7C7JS was refunded in full ($25 of $25), so
it maps to fully refunded.

**6. Reconciliation lots and the planned-purchase units.**
- There are **no reconciliation lots in production today**; the migration creates them. It would create
  **34 `RECON-<SKU>` lots**, all **quarantined** and untested, none approved, each holding its strength's current
  recorded quantity. Each comes with one `lot_reconciliation` movement, and SKU totals don't change.
- **13 strengths at 0** get no lot.
- Sellable stock afterwards is 0 on every SKU.

**Count discrepancy:** the dry run moves **2,274 units**, not 2,377.
- Production's recorded quantities have changed by **−103 net** since Stage 2 opened them at 2,377 on 2026-11-15.
- The dry run doesn't say which adjustments caused it. BPC-157-10MG now shows **16**. The Nov-7 catalog snapshot I
  used for local testing (which may not match the Stage 2 opening) had 124 for it, and the difference is roughly
  that SKU.
- To name the exact movements, I need your OK to run one more read-only query against production's
  `inventory_movements` (adjustments since 2026-11-15).
- Separately: every strength in production is currently **Coming Soon**, so no customer surface shows any of these
  quantities today.

**7. BPC-157 20mg:** **deactivated**, at 0 units, priced $79.99 ("BPC-157-20MG: deactivated (left untouched)"). The
migration never writes it and creates no lot for it, since it has 0 units. If it were **active**, the dry run would
print "STOPPED … BPC-157-20MG is ACTIVE" and execute nothing; it would also refuse `--apply`. That path was tested
locally (migration suite: "an ACTIVE BPC-157 20mg stops the migration (nothing executed)"). The migration also checks
afterwards that it is still deactivated.

**8. Certificates, including the synthetic Vanguard record and its PDF.**
- The migration has **no write** to any certificate table (`coa_records`, `coa_lots`, `coa_files`, `coa_revisions`,
  `coa_audit`, laboratories, criteria).
- It **publishes nothing**: no visibility or approval field exists in anything it writes.
- `coa_records` (which includes the Vanguard record), `coa_lots` and `coa_files` (which includes its PDF) are
  fingerprinted inside the transaction, so a change would roll everything back.

The dry run doesn't list individual certificates. If you want the Vanguard record and its PDF identified by name and
fingerprint, that's one more read-only query, with your OK.

**9. `CRON_SECRET` in production: unknown.**
- I can't see Vercel's environment variables: there's no CLI and no access. It is **not** in `.env.local`, but that
  file says nothing about Vercel.
- **To check:** Vercel → Project → Settings → Environment Variables, and look for `CRON_SECRET` on Production.
  Alternatively, look in Vercel → Logs for `/api/cron/subscriptions` returning **401** daily at 14:00 UTC.
- **If it's not set:** both cron routes refuse every call (401). The daily reservation sweep would never run, and the
  Reservations tab would show "The daily scheduled sweep has never run" in amber.
- Customers would be unaffected: available-to-sell counts expired holds as free whenever it's read, and checkout
  releases them. Only the stored Reserved figure and the Reservations list would keep showing expired holds until a
  checkout, order-page poll or manual **Run sweep now** clears them.
- The subscriptions cron is in the same position, but production has 0 subscriptions (fingerprint `d41d8cd9…` = empty).

**Also confirmed by the dry run:** the movement-type CHECK constraint has the expected name, no strength has
reserved > 0, and no order has an unknown status. So there are no blockers.

---

## Full dry-run output (verbatim)

```
BEFORE fingerprints: {"products":"f23ddb4452271d0fbe546a40c62db733","product_strengths":"3c4ac7d0ea275b50bb1d2368f6904438","strength_inventory":"db2d6a37cb795cc89d2598a82ad4af7a","inventory_movements":"d17d160af3ca5be3f7c4874c6931e8e7","legacy_inventory":"b878bd881319d97d750a4e8099e7177a","coa_records":"e1ab9e2adb100df9e49d6459eea7fb79","coa_lots":"8e1e8eaf7584ac45807f868ccb6af1cf","coa_files":"c44caf691e941be1e0c435cb5e7ef38a","subscriptions":"d41d8cd98f00b204e9800998ecf8427e","orders_except_status":"4396428406ad6ede1ca9ef34c807eb78"}

CONTENT MANIFEST (this database, as it is now — compare with what you expect; the migration writes none of it):
  products: 44 (31 visible)
    5-amino-1mq · visible · CAS 42464-96-0 · formula C10H11IN2 · content#b41ad0717ee4
    ahk-cu · hidden · CAS 682809-81-0 · formula C15H24ClCuN6O4 · content#f89947def4f8
    aod-9604 · visible · CAS 221231-10-3 · formula C78H123N23O23S2 · content#ebc9fce464ef
    ara-290 · visible · CAS 1208243-50-8 · formula C51H84N16O21 · content#646c299143d0
    bac-water · visible · CAS 7732-18-5 (Water) | 100-51-6 (Benzyl Alcohol) · formula H2O (Water) | C7H8O (Benzyl Alcohol) · content#f558f2e3f654
    bpc-157 · visible · CAS 137525-51-0 · formula C62H98N16O22 · content#990a648ba4ad
    cagrilintide · visible · CAS — · formula — · content#f92ac547b4b4
    cartalax · hidden · CAS 85806-95-7 · formula C12H19N3O8 · content#d966267e85f9
    cjc-1295-ipamorelin-blend · visible · CAS CJC-1295 No DAC: 446036-97-1 | Ipamorelin: 170851-70-4 · formula CJC-1295 No DAC: C152H252N44O42 | Ipamorelin: C38H49N9O5 · content#043f5808783e
    cjc-1295-no-dac · hidden · CAS 446036-97-1 · formula C152H252N44O42 · content#d014b1ce9ce8
    dihexa · hidden · CAS 1401708-83-5 · formula C27H44N4O5 · content#8f9dd11a036d
    dsip · visible · CAS 62568-57-4 · formula C35H48N10O15 · content#d9786627d3c8
    epithalon · visible · CAS 307297-39-8 · formula C14H22N4O9 · content#4134a2e337d8
    foxo4-dri · hidden · CAS 2460055-10-9 · formula C228H388N86O64 · content#d5083b4df617
    ghk-cu · visible · CAS 89030-95-5 · formula C14H22CuN6O4 · content#82c88ef3a5d8
    glow-blend · visible · CAS — · formula — · content#6df1d3a03595
    glutathione · visible · CAS — · formula — · content#25cfaea8e153
    humanin · hidden · CAS — · formula — · content#4256355fb71a
    igf-1-lr3 · visible · CAS — · formula — · content#8141abce73b3
    ipamorelin · visible · CAS 170851-70-4 · formula C38H49N9O5 · content#fc779a0d3388
    kisspeptin-10 · hidden · CAS — · formula — · content#7fcf6d2960c8
    klow-blend · visible · CAS — · formula — · content#9d4217d71d4f
    kpv · visible · CAS — · formula — · content#72ef9c3c02f6
    ll-37 · hidden · CAS — · formula — · content#452396141c61
    melanotan-1 · visible · CAS 75921-69-6 · formula C78H111N21O19 · content#823895f8d5cb
    melanotan-2 · visible · CAS 121062-08-6 · formula C50H69N15O9 · content#7ef310038470
    mots-c · visible · CAS 1627580-64-6 · formula C101H152N28O22S2 · content#28d7639fd2fb
    nad-plus · visible · CAS — · formula — · content#49853d72b635
    pinealon · hidden · CAS — · formula — · content#572479e8e76e
    pt-141 · visible · CAS — · formula — · content#89b5a3da067a
    selank · visible · CAS 129954-34-3 · formula C33H57N11O9 · content#0c4aef67cb10
    semax · visible · CAS 80714-61-0 · formula C37H51N9O10S · content#8c4d5cfae324
    semax-selank-blend · hidden · CAS — · formula — · content#0c1fbe03fb48
    sermorelin · visible · CAS — · formula — · content#7b24408c66b0
    slu-pp-332 · hidden · CAS — · formula — · content#e0c7af2cda71
    ss-31 · visible · CAS — · formula — · content#82821ca36238
    tb-4 · visible · CAS 77591-33-4 · formula C₂₁₂H₃₅₀N₅₆O₇₈S · content#b707e442d4f7
    tb-500 · hidden · CAS 885340-08-9 · formula C38H68N10O14 · content#4e2638c5dc05
    tesamorelin · visible · CAS 218949-48-5 · formula C221H366N72O67S · content#c3dd34701e0d
    thymosin-alpha-1 · visible · CAS — · formula — · content#18d9bcd9f93b
    vc1s · hidden · CAS — · formula — · content#d5103625daf8
    vc2t · visible · CAS — · formula — · content#6d6c0dbe8ca5
    vc3r · visible · CAS — · formula — · content#2f47eaaf174c
    wolverine-blend · visible · CAS — · formula — · content#a66318bfd81a
  strengths: 47 (SKU · id · label · price · active · status · physical)
    5-AMINO-1MQ-50MG · 0fa9ebb3-f6da-4723-9798-c01b6fa2e84c · 50mg · 115 · active · coming_soon · 54
    AHK-CU-50MG · 06d99774-3f74-43f8-bfdf-d30d9569b25a · 50mg · unpriced · active · coming_soon · 0
    AOD-9604-5MG · e351e2c8-249f-4804-b6f8-50b6778d6708 · 5mg · 59.99 · active · coming_soon · 45
    ARA-290-10MG · 41597513-d476-4667-953e-2c7e43fb9d0d · 10mg · 58 · active · coming_soon · 34
    BAC-WATER-10ML · 3fc77c82-1ade-4add-a38b-506583ccf3e2 · 10ml · 15 · active · coming_soon · 94
    BPC-157-10MG · 8d5c9b8d-30ee-4412-b7a2-4fa6a77e139c · 10mg · 64.99 · active · coming_soon · 16
    BPC-157-20MG · 28bc686d-eefb-4359-9900-58ad0da2e223 · 20mg · 79.99 · DEACTIVATED · coming_soon · 0
    CAGRILINTIDE-10MG · 850a8d99-6e97-4915-966a-128ff764b3eb · 10mg · 124.99 · active · coming_soon · 74
    CARTALAX-20MG · bcbe9386-c1d3-4be4-aeea-5cb7a58a2975 · 20mg · unpriced · active · coming_soon · 0
    CJC-1295-IPAMORELIN-BLEND-5MG/5MG · ac15ec9a-df23-4800-8a4c-8b1468cae181 · 5mg / 5mg · 79.99 · active · coming_soon · 74
    CJC-1295-NO-DAC-10MG · fa06382a-2719-423c-b1cc-dfda3e74b649 · 10mg · unpriced · active · coming_soon · 0
    DIHEXA-10MG · ae631fe1-2b03-41a8-a0f6-018d730fc8e6 · 10mg · unpriced · active · coming_soon · 0
    DSIP-5MG · b7e7c1c0-0a71-432b-bf2e-fd7847bcca29 · 5mg · 49 · active · coming_soon · 34
    EPITHALON-10MG · 17a00073-1751-4ad4-ad05-2b6f569bf09f · 10mg · 49.99 · active · coming_soon · 44
    FOXO4-DRI-10MG · e8f6dfb3-7ea4-47b3-a950-48aab7af1372 · 10mg · unpriced · active · coming_soon · 0
    GHK-CU-100MG · 2ad53c17-34de-47cd-8c4c-cd381e2c4525 · 100mg · 59.99 · active · coming_soon · 154
    GLOW-BLEND-50MG/10MG/10MG · a9cda54d-6c8f-4a1e-a95f-774b6b3678aa · 50mg / 10mg / 10mg · 134.99 · active · coming_soon · 64
    GLUTATHIONE-1500MG · 72acaccd-7925-4a43-b3cd-b260da851ee8 · 1500mg · 79.99 · active · coming_soon · 44
    HUMANIN-10MG · 38054ebc-51d1-4aaa-8a26-8738e4547845 · 10mg · unpriced · active · coming_soon · 0
    IGF-1-LR3-1MG · 0f3a00ae-de16-4f38-b01a-a0f87db9e82b · 1mg · 84.99 · active · coming_soon · 34
    IPAMORELIN-10MG · c080fc79-82de-4cf8-910b-386d4ee162eb · 10mg · 69.99 · active · coming_soon · 44
    KISSPEPTIN-10-5MG · 3348d272-3518-46bb-90d1-16c6a5665cda · 5mg · unpriced · active · coming_soon · 0
    KLOW-BLEND-50MG/10MG/10MG/10MG · f323a95c-dfb0-4d29-9e78-2bce844786a9 · 50mg / 10mg / 10mg / 10mg · 134.99 · active · coming_soon · 74
    KPV-10MG · fd86be0a-3626-43ff-bbb7-89e98bb4abd2 · 10mg · 69 · active · coming_soon · 94
    LL-37-5MG · f78022d3-f172-4ea5-a1dd-2cf39890d1e1 · 5mg · unpriced · active · coming_soon · 0
    MELANOTAN-1-10MG · eed71d55-0ad4-4e88-91ab-904ec864f6e5 · 10mg · 44.99 · active · coming_soon · 34
    MELANOTAN-2-10MG · 7dd56ba7-72b7-4bca-93aa-082f1ef880a5 · 10mg · 44.99 · active · coming_soon · 44
    MOTS-C-10MG · 7eecea3f-bd6e-46ac-80de-6a07864f1d89 · 10mg · 59.99 · active · coming_soon · 94
    NAD-PLUS-500MG · 6867fec5-feaa-4d97-8557-256087a883b4 · 500mg · 79 · active · coming_soon · 74
    PINEALON-10MG · 62f117d5-8590-4dd3-8383-93120ffbc9cb · 10mg · unpriced · active · coming_soon · 0
    PT-141-10MG · e0c30b27-c35e-45cf-8854-41f2d469f9f9 · 10mg · 49.99 · active · coming_soon · 34
    SELANK-11MG · fa011127-5e4b-451e-b65d-3c4585c11c09 · 11mg · 59.99 · active · coming_soon · 44
    SEMAX-11MG · 05f7cabb-2675-4e62-bba5-fa62ea9165b6 · 11mg · 59.99 · active · coming_soon · 44
    SEMAX-SELANK-BLEND-20MG · 095c7290-0fc0-4056-9ab6-eec8a0ca2c38 · 20mg · unpriced · active · coming_soon · 0
    SERMORELIN-10MG · 28ca8837-f65b-4a94-8d55-921bbfea4713 · 10mg · 79.99 · active · coming_soon · 44
    SLU-PP-332-5MG · f382ea09-aaa7-4a6e-8bf0-5d39abd51cf6 · 5mg · unpriced · active · coming_soon · 0
    SS-31-10MG · 3e24ad87-5c97-40ef-8115-ce1d631ff298 · 10mg · 79 · active · coming_soon · 74
    TB-4-10MG · 9a225989-ef13-494a-b9bf-f91a147ad227 · 10mg · 69 · active · coming_soon · 94
    TB-500-10MG · 4b5cca1e-f2b2-457d-83a5-0e22287593e0 · 10mg · 69 · active · coming_soon · 94
    TESAMORELIN-10MG · 97a2b8e0-ae26-49d7-a20b-ba2c61f05b25 · 10mg · 89.99 · active · coming_soon · 74
    THYMOSIN-ALPHA-1-10MG · d6d879b9-0440-4bcc-8138-3ccea5010b73 · 10mg · 84.99 · active · coming_soon · 44
    VC1S-10MG · d1de6f6a-25f6-4e8b-8258-943038a314e0 · 10mg · 49 · active · coming_soon · 0
    VC2T-30MG · 7f13425e-beab-47a0-9918-10b178033482 · 30mg · 159.99 · active · coming_soon · 74
    VC2T-60MG · dccc67bb-6607-4f6e-9dca-ae5909737007 · 60mg · 199.99 · active · coming_soon · 74
    VC3R-10MG · 612c2cdf-13be-4647-b876-bd62b1eb2924 · 10mg · 99 · active · coming_soon · 149
    VC3R-20MG · d55cabd7-167b-4b93-a6f0-504b5edff767 · 20mg · 139 · active · coming_soon · 144
    WOLVERINE-BLEND-10MG/10MG · 29674e34-295f-4fdd-a20a-930b85613532 · 10mg / 10mg · 89.99 · active · coming_soon · 64
  BPC-157-20MG: deactivated (left untouched)

PLAN:
  1. create inventory_lots, inventory_allocations, order_events, order_returns, order_refunds, job_runs, inventory_lot_seq (+ indexes)
  2. inventory_movements: add nullable/defaulted columns, widen the movement_type CHECK, add 2 arithmetic CHECKs, 2 indexes (no row rewritten)
  3. orders: add columns + CHECKs + indexes; map 4 existing order(s) to payment/fulfillment status
  4. install 35 function statements and 9 triggers (status derivation, deferred reconciliation, append-only)
  5. owner decision A1 (option 2): 34 reconciliation lot(s) RECON-<SKU>, QUARANTINED, untested, holding each strength's current physical quantity
  6. in-transaction guard over: products, product_strengths, strength_inventory, inventory_movements, legacy_inventory, coa_records, coa_lots, coa_files, subscriptions, orders_except_status — any change rolls everything back

reconciliation lots (sku · active · units):
  RECON-5-AMINO-1MQ-50MG · active · 54
  RECON-AOD-9604-5MG · active · 45
  RECON-ARA-290-10MG · active · 34
  RECON-BAC-WATER-10ML · active · 94
  RECON-BPC-157-10MG · active · 16
  RECON-CAGRILINTIDE-10MG · active · 74
  RECON-CJC-1295-IPAMORELIN-BLEND-5MG/5MG · active · 74
  RECON-DSIP-5MG · active · 34
  RECON-EPITHALON-10MG · active · 44
  RECON-GHK-CU-100MG · active · 154
  RECON-GLOW-BLEND-50MG/10MG/10MG · active · 64
  RECON-GLUTATHIONE-1500MG · active · 44
  RECON-IGF-1-LR3-1MG · active · 34
  RECON-IPAMORELIN-10MG · active · 44
  RECON-KLOW-BLEND-50MG/10MG/10MG/10MG · active · 74
  RECON-KPV-10MG · active · 94
  RECON-MELANOTAN-1-10MG · active · 34
  RECON-MELANOTAN-2-10MG · active · 44
  RECON-MOTS-C-10MG · active · 94
  RECON-NAD-PLUS-500MG · active · 74
  RECON-PT-141-10MG · active · 34
  RECON-SELANK-11MG · active · 44
  RECON-SEMAX-11MG · active · 44
  RECON-SERMORELIN-10MG · active · 44
  RECON-SS-31-10MG · active · 74
  RECON-TB-4-10MG · active · 94
  RECON-TB-500-10MG · active · 94
  RECON-TESAMORELIN-10MG · active · 74
  RECON-THYMOSIN-ALPHA-1-10MG · active · 44
  RECON-VC2T-30MG · active · 74
  RECON-VC2T-60MG · active · 74
  RECON-VC3R-10MG · active · 149
  RECON-VC3R-20MG · active · 144
  RECON-WOLVERINE-BLEND-10MG/10MG · active · 64
  total units moved into quarantined reconciliation lots: 2274; strengths at 0 (no lot): 13
  → sellable stock after apply: 0 on every SKU until an administrator acts. Nothing is approved by this script.

order mapping (reference · status → payment / fulfillment):
  VC-E3SQJ9 · cancelled → confirmed / cancelled
  VC-38UTPQ · cancelled → confirmed / cancelled
  VC-D7C7JS · shipped (refunded 25 of 25) → refunded / shipped
  VC-9TNWAS · cancelled → cancelled / cancelled
  legacy status changes: none
  Stage 2 partial refunds now shown as partially refunded (net revenue counted): none

movement-type CHECK constraint(s) found: inventory_movements_movement_type_check (expected: inventory_movements_movement_type_check)

Dry run: nothing executed. Re-run with --apply.
```

---

## Follow-up read-only checks (2026-11-18, owner-authorized)

Script: `scripts/stage3-prod-readonly-checks.mjs`. All queries ran in one transaction opened **READ ONLY**, in which Postgres refuses any write. Nothing was written.

**Findings:**
- **The 103-unit drop:** all 21 movements since the Stage 2 opening balances (2026-11-15 17:47 UTC, 47 strengths, 2,377 units) were made by `ryancalpacific@aol.com` on 2026-11-16 and 2026-11-17. Net change: BPC-157-10MG **−108** (124 → 16), VC3R-10MG **+5** (144 → 149), VC3R-20MG 0 (+3 then −3). Total −103, leaving 2,274. Several notes say "Stage 2 audit — test …".
- **Vanguard:** 1 laboratory (Vanguard Laboratory) and **1 certificate record**, `LS-KPV102.V.2026` (KPV 10mg): approval *pending*, visibility *hidden*, is_test *true*, not deleted. It has **1 PDF**, `COA-e4bc7e4c-….pdf` (209,465 bytes, sha256 `6bc330ed…4706682`).
  - The record's own fingerprint, `e1ab9e2adb100df9e49d6459eea7fb79`, is **identical** to the whole-table `coa_records` fingerprint in the dry run above. So this is the only certificate record in production, and it is byte-for-byte what the dry run saw.
  - After any apply, re-running this script must show the same fingerprint and sha256.
- **Orders VC-E3SQJ9 and VC-38UTPQ:** confirmed by the owner as test orders, with no money moved and no refund owed. The migration maps them to payment confirmed / fulfillment cancelled. They stay excluded from revenue because they are cancelled.

**Full output (verbatim):**

```
database host: ep-nameless-sky-au523837-pooler.c-10.us-east-1.aws.neon.tech

=== 1. Inventory movements since the Stage 2 opening balances ===
opening balances: 47 strengths, 2377 units, recorded at 2026-11-15T17:47:00.458Z
units now (strength_inventory): 2274  → net change -103
movements after the opening (all of them, oldest first): 21
  2026-11-16T01:56:31.982Z · BPC-157-10MG · count_correction · -124 (124 → 0) · reason: Physical count · note: Stage 2 audit — physical inventory not yet received · by ryancalpacific@aol.com
  2026-11-16T02:02:27.513Z · BPC-157-10MG · stock_received · +25 (0 → 25) · reason: Received from supplier · note: Stage 2 audit — test addition of 25 units · by ryancalpacific@aol.com
  2026-11-16T02:05:04.781Z · BPC-157-10MG · stock_removed · -5 (25 → 20) · reason: Damaged · note: Stage 2 audit — test removal of 5 damaged units · by ryancalpacific@aol.com
  2026-11-16T02:06:58.835Z · BPC-157-10MG · threshold_changed · 0 (20 → 20) · reason: Low-stock threshold 10 → 10 · by ryancalpacific@aol.com
  2026-11-16T02:07:05.436Z · BPC-157-10MG · stock_removed · -10 (20 → 10) · reason: Damaged · note: Stage 2 audit — testing low-stock threshold · by ryancalpacific@aol.com
  2026-11-16T02:09:06.964Z · BPC-157-10MG · stock_removed · -10 (10 → 0) · reason: Damaged · note: Stage 2 audit — testing zero-stock transition · by ryancalpacific@aol.com
  2026-11-16T02:12:43.441Z · BPC-157-10MG · threshold_changed · 0 (0 → 0) · reason: Low-stock threshold 10 → 15 · by ryancalpacific@aol.com
  2026-11-16T02:15:17.488Z · BPC-157-10MG · stock_received · +5 (0 → 5) · reason: Received from supplier · by ryancalpacific@aol.com
  2026-11-16T02:17:36.128Z · BPC-157-10MG · stock_received · +11 (5 → 16) · reason: Received from supplier · by ryancalpacific@aol.com
  2026-11-16T02:34:46.219Z · VC3R-10MG · stock_received · +5 (144 → 149) · reason: Received from supplier · by ryancalpacific@aol.com
  2026-11-16T19:12:27.588Z · BPC-157-10MG · count_correction · 0 (16 → 16) · reason: Physical count · by ryancalpacific@aol.com
  2026-11-16T19:21:35.945Z · BPC-157-10MG · stock_removed · -16 (16 → 0) · reason: Damaged · by ryancalpacific@aol.com
  2026-11-16T19:22:48.039Z · BPC-157-10MG · stock_received · +16 (0 → 16) · reason: Received from supplier · by ryancalpacific@aol.com
  2026-11-16T19:24:58.443Z · BPC-157-10MG · stock_removed · -1 (16 → 15) · reason: Damaged · by ryancalpacific@aol.com
  2026-11-16T19:28:20.238Z · BPC-157-10MG · stock_received · +1 (15 → 16) · reason: Received from supplier · by ryancalpacific@aol.com
  2026-11-16T19:53:21.469Z · VC3R-20MG · stock_received · +3 (144 → 147) · reason: Received from supplier · by ryancalpacific@aol.com
  2026-11-16T20:03:33.049Z · VC3R-20MG · stock_removed · -3 (147 → 144) · reason: Damaged · note: Stage 2 audit — reversing test stock addition · by ryancalpacific@aol.com
  2026-11-16T20:12:25.834Z · BPC-157-10MG · threshold_changed · 0 (16 → 16) · reason: Low-stock threshold 15 → 20 · by ryancalpacific@aol.com
  2026-11-16T20:14:27.634Z · BPC-157-10MG · threshold_changed · 0 (16 → 16) · reason: Low-stock threshold 20 → 15 · by ryancalpacific@aol.com
  2026-11-17T14:48:18.684Z · BPC-157-10MG · count_correction · -2 (16 → 14) · reason: Physical count · by ryancalpacific@aol.com
  2026-11-17T14:48:59.415Z · BPC-157-10MG · count_correction · +2 (14 → 16) · reason: Physical count · by ryancalpacific@aol.com
net change per SKU:
  BPC-157-10MG: -108
  VC3R-10MG: +5

=== 2. Vanguard certificate records ===
laboratories matching 'vanguard': Vanguard Laboratory (638beafe-6eca-4f36-baee-72cea57d7277)
records: 1
  id=c35100d7-9a4e-4232-bf8a-ef94dab127b8 · lot_number=LS-KPV102.V.2026 · product_slug=kpv · size_label=10mg · compound_name=KPV · laboratory_id=638beafe-6eca-4f36-baee-72cea57d7277 · laboratory_name=Vanguard Laboratory · lab_report_id=V260211-4 016 · verification_url=https://verifiedbyvanguard.com/verify/e4bc7e4c-b22b-4c13-8248-84d171f75a96 · approval_status=pending · public_visibility=hidden · is_test=true · file_id=384f1e82-dd7b-496e-bc9e-687b046bc9f9 · created_at=2026-11-09T20:46:59.910Z · updated_at=2026-11-09T21:17:16.953Z · deleted_at=— · row_fingerprint=e1ab9e2adb100df9e49d6459eea7fb79
files (PDFs): 1
  384f1e82-dd7b-496e-bc9e-687b046bc9f9 · COA-e4bc7e4c-b22b-4c13-8248-84d171f75a96.pdf · application/pdf · 209465 bytes · sha256 6bc330eda67794841a70eef584f7fc7be737c745a0a24c2b15be9ec9b4706682 · uploaded 2026-11-09T20:46:59.790Z by ryancalpacific@aol.com

Read-only: nothing was written.
```
