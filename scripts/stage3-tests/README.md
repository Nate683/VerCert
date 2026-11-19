# Stage 3 local test harness — LOCAL ONLY

These are the scripts that produced the Stage 3 test results in `VERICERT_STAGE_3_COMPLETION_REPORT.md`. They never
touch production:

- The app runs with `DATABASE_URL=postgresql://demo:demo@db.demo.invalid/demo` (`env.sh`). The reserved `.invalid`
  host can't resolve on the internet. `guard.cjs` (preloaded through `NODE_OPTIONS`) sends it to a local shim and
  refuses every other outbound host, including Neon, Resend, Anthropic, Coinbase, Blob and Twilio.
- `local.sh` refuses to run anything unless `DATABASE_URL` is that local host. Every app/migration command goes through it.
- `pg-shim.mjs` runs a **real local Postgres** (`embedded-postgres`, scratch data directory, `127.0.0.1:5491`) behind a
  Neon-HTTP-compatible endpoint on `127.0.0.1:5492`, with a connection pool. That gives the concurrency tests real
  row locks.
- Service keys are blank. `SESSION_SECRET` is a local test value, so sessions are minted locally.

## Setup (once)
1. In a scratch folder outside the repo: `npm i @neondatabase/serverless pg embedded-postgres puppeteer-core`, copy
   these files there, and run `node pg-shim.mjs --fresh` (keep it running).
2. `bash local.sh node scripts/migrate.mjs`, then `CATALOG_SNAPSHOT=<catalog json> bash local.sh node seed-local.mjs`.
   The catalog JSON is a 2026-11-07 copy of the product catalog; it isn't in the repo.
3. `bash local.sh node drop-empty-stage12.mjs inventory_movements,strength_inventory,product_strengths --fn --idx`,
   then the real Stage 1/2 scripts with `--apply` (`product-strengths.mjs`, `strength-inventory.mjs`,
   `coa-lifecycle.mjs`), then `node seed-legacy-orders.mjs` (pre-Stage-3 orders).
4. `node db-snapshot.mjs save pre3`, then `bash local.sh node scripts/stage3-orders.mjs --apply`, then `node db-snapshot.mjs save post3`.

## Run
`bash cycle.sh --build` once (builds against the local DB), then `bash run-all.sh`, and separately
`node t-regress.mjs` with the app running (`bash cycle.sh`).

Step 3 also adds a deactivated BPC-157 20mg (`node seed-bpc20.mjs`). `run-all.sh` begins with `t-migration.mjs`,
which rebuilds `snap_post3` from `snap_pre3`.

| Suite | What |
|---|---|
| `t-migration.mjs` | migration safety: dry run, manifest, BPC-157 20mg stop, in-transaction guard rollback, clean apply |
| `t-engine.mjs` | database functions directly, real concurrent connections |
| `t-stage2.mjs` | Stage 2 checks rebuilt (API, database and browser) |
| `t-api.mjs` `PART=A` | app API with payment simulation OFF |
| `t-ui.mjs` | headless Edge: Stock-tab scrolling correction, Executive Office screens, checkout |
| `t-api.mjs` `PART=B` | app API with `PAYMENT_SIMULATION=local-test-only` (simulated provider events) |
| `t-regress.mjs` | Stage 1 / Stage 2 regression |
