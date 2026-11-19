// Stage 3 database objects: tables, constraints, triggers and the inventory/order functions. Imported by
// scripts/stage3-orders.mjs (the migration). Every stock change in Stage 3 is ONE call to one of these functions, so
// it is one statement and one transaction: it either happens completely or not at all (the Neon HTTP driver can't
// hold a transaction open across round trips, so atomicity has to live in the database).
//
// Conventions
// - Timestamps are ISO-8601 TEXT, like the rest of the schema (vc_now()).
// - Functions raise with these SQLSTATEs, which lib/inventory.ts maps to HTTP errors:
//     P0002 not found · P0003 insufficient stock · P0004 invalid request · P0005 invalid state
// - Locks: every function that touches several strengths locks their strength_inventory rows first, sorted by id
//   (vc_lock_strengths), so two operations can never deadlock on each other's rows. A strength's lots are only ever
//   changed while its strength_inventory row is locked.
// - Idempotency: every movement carries an idempotency key; vc_inv_move returns the existing movement for a key it
//   has already recorded and changes nothing (re-checked after the lock, with the unique index as a backstop).

export const MOVEMENT_TYPES = [
  "opening_balance", "stock_received", "stock_removed", "count_correction", "threshold_changed", "order_deducted", "order_restored",
  "reserved", "released", "committed", "lot_reconciliation", "lot_status", "lot_updated", "lot_transfer_out", "lot_transfer_in",
  "return_restocked", "return_quarantined", "reallocated_out", "reallocated_in",
];

export const PAYMENT_STATUSES = ["pending", "processing", "confirmed", "failed", "expired", "partially_refunded", "refunded", "reversed", "cancelled"];
export const FULFILLMENT_STATUSES = ["unfulfilled", "reserved", "allocated", "processing", "shipped", "delivered", "returned", "cancelled"];

const list = (xs) => xs.map((x) => `'${x}'`).join(", ");

// --- Tables and columns -------------------------------------------------------------------------------------------
export const SCHEMA = [
  `CREATE SEQUENCE inventory_lot_seq START 1`,
  `CREATE TABLE inventory_lots (
     id TEXT PRIMARY KEY,
     lot_code TEXT NOT NULL UNIQUE,
     strength_id TEXT NOT NULL REFERENCES product_strengths(id) ON DELETE RESTRICT,
     sku TEXT NOT NULL,
     product_slug TEXT NOT NULL,
     kind TEXT NOT NULL CHECK (kind IN ('received', 'reconciliation', 'returns')),
     manufacturer_lot TEXT,
     vericert_lot_number TEXT,
     received_quantity INTEGER NOT NULL CHECK (received_quantity >= 0),
     physical_quantity INTEGER NOT NULL DEFAULT 0 CHECK (physical_quantity >= 0),
     reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
     received_at TEXT NOT NULL,
     manufactured_on DATE,
     expires_on DATE,
     testing_status TEXT NOT NULL DEFAULT 'untested' CHECK (testing_status IN ('untested', 'in_testing', 'passed', 'failed')),
     release_status TEXT NOT NULL DEFAULT 'pending' CHECK (release_status IN ('pending', 'quarantined', 'approved', 'rejected')),
     release_changed_at TEXT,
     release_changed_by TEXT,
     release_reason TEXT,
     notes TEXT,
     version INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     created_by TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     CONSTRAINT inventory_lots_reserved_within_physical CHECK (reserved_quantity <= physical_quantity),
     CONSTRAINT inventory_lots_failed_never_approved CHECK (NOT (release_status = 'approved' AND testing_status = 'failed'))
   )`,
  `CREATE UNIQUE INDEX inventory_lots_one_reconciliation ON inventory_lots (strength_id) WHERE kind = 'reconciliation'`,
  `CREATE UNIQUE INDEX inventory_lots_one_returns ON inventory_lots (strength_id) WHERE kind = 'returns'`,
  `CREATE INDEX inventory_lots_fifo ON inventory_lots (strength_id, received_at, id)`,
  `CREATE INDEX inventory_lots_vericert ON inventory_lots (upper(vericert_lot_number)) WHERE vericert_lot_number IS NOT NULL`,
  `COMMENT ON TABLE inventory_lots IS 'Stage 3: inventory per manufacturing lot of a strength. Sum of physical/reserved over a strength''s lots = its strength_inventory row (deferred trigger). FIFO by received_at. Only approved, not-failed, unexpired lots are allocated.'`,

  // The one inventory ledger, extended (no second ledger): lot and order on each movement, plus reserved columns.
  `ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check`,
  `ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check CHECK (movement_type IN (${list(MOVEMENT_TYPES)}))`,
  `ALTER TABLE inventory_movements
     ADD COLUMN lot_id TEXT REFERENCES inventory_lots(id) ON DELETE RESTRICT,
     ADD COLUMN lot_code TEXT,
     ADD COLUMN order_id TEXT,
     ADD COLUMN reserved_change INTEGER NOT NULL DEFAULT 0,
     ADD COLUMN previous_reserved INTEGER,
     ADD COLUMN resulting_reserved INTEGER,
     ADD COLUMN lot_quantity_change INTEGER,
     ADD COLUMN lot_previous_quantity INTEGER,
     ADD COLUMN lot_resulting_quantity INTEGER,
     ADD COLUMN lot_reserved_change INTEGER,
     ADD COLUMN lot_previous_reserved INTEGER,
     ADD COLUMN lot_resulting_reserved INTEGER`,
  `ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reserved_arithmetic
     CHECK (previous_reserved IS NULL OR (resulting_reserved = previous_reserved + reserved_change AND resulting_reserved >= 0))`,
  `ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_lot_arithmetic
     CHECK (lot_id IS NULL OR (lot_resulting_quantity = lot_previous_quantity + lot_quantity_change AND lot_resulting_quantity >= 0
            AND lot_resulting_reserved = lot_previous_reserved + lot_reserved_change AND lot_resulting_reserved >= 0))`,
  `CREATE INDEX inventory_movements_lot ON inventory_movements (lot_id, created_at DESC) WHERE lot_id IS NOT NULL`,
  `CREATE INDEX inventory_movements_order ON inventory_movements (order_id) WHERE order_id IS NOT NULL`,

  // Orders: separate payment and fulfillment states (the legacy status column is derived from them by trigger).
  `ALTER TABLE orders
     ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending',
     ADD COLUMN fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled',
     ADD COLUMN idempotency_key TEXT,
     ADD COLUMN reservation_expires_at TEXT,
     ADD COLUMN payment_reference TEXT,
     ADD COLUMN payment_amount_received DOUBLE PRECISION,
     ADD COLUMN payment_received_on DATE,
     ADD COLUMN payment_confirmed_by TEXT,
     ADD COLUMN payment_confirmed_at TEXT,
     ADD COLUMN payment_source TEXT,
     ADD COLUMN provider_payment_id TEXT,
     ADD COLUMN needs_review BOOLEAN NOT NULL DEFAULT FALSE,
     ADD COLUMN review_reason TEXT,
     ADD COLUMN review_opened_at TEXT,
     ADD COLUMN returned_at TEXT`,
  `ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN (${list(PAYMENT_STATUSES)}))`,
  `ALTER TABLE orders ADD CONSTRAINT orders_fulfillment_status_check CHECK (fulfillment_status IN (${list(FULFILLMENT_STATUSES)}))`,
  `ALTER TABLE orders ADD CONSTRAINT orders_payment_source_check CHECK (payment_source IS NULL OR payment_source IN ('admin', 'provider', 'simulated', 'legacy'))`,
  // A confirmation reference can be claimed by one order only (per method), so the same Zelle/bank notification
  // can't confirm two orders.
  `CREATE UNIQUE INDEX orders_payment_reference ON orders (payment_method, upper(payment_reference)) WHERE payment_reference IS NOT NULL`,
  `CREATE UNIQUE INDEX orders_idempotency_key ON orders (idempotency_key) WHERE idempotency_key IS NOT NULL`,
  `CREATE INDEX orders_review ON orders (needs_review) WHERE needs_review`,

  `CREATE TABLE inventory_allocations (
     id TEXT PRIMARY KEY,
     order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
     order_reference TEXT NOT NULL,
     line_index INTEGER NOT NULL CHECK (line_index >= 0),
     strength_id TEXT NOT NULL REFERENCES product_strengths(id) ON DELETE RESTRICT,
     sku TEXT NOT NULL,
     lot_id TEXT NOT NULL REFERENCES inventory_lots(id) ON DELETE RESTRICT,
     lot_code TEXT NOT NULL,
     quantity INTEGER NOT NULL CHECK (quantity > 0),
     state TEXT NOT NULL CHECK (state IN ('reserved', 'committed', 'released', 'restored')),
     expires_at TEXT,
     returned_quantity INTEGER NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),
     created_at TEXT NOT NULL,
     created_by TEXT NOT NULL,
     committed_at TEXT,
     released_at TEXT, released_by TEXT, release_reason TEXT,
     restored_at TEXT, restored_by TEXT, restore_reason TEXT,
     -- Set on an allocation made by a reallocation: the allocation (now 'restored') it replaced. History is kept.
     replaces_allocation_id TEXT REFERENCES inventory_allocations(id) ON DELETE RESTRICT,
     CONSTRAINT inventory_allocations_returned_within CHECK (returned_quantity <= quantity),
     CONSTRAINT inventory_allocations_reserved_expiry CHECK (state <> 'reserved' OR expires_at IS NOT NULL)
   )`,
  `CREATE INDEX inventory_allocations_order ON inventory_allocations (order_id, line_index)`,
  `CREATE INDEX inventory_allocations_active ON inventory_allocations (expires_at) WHERE state = 'reserved'`,
  `CREATE INDEX inventory_allocations_lot ON inventory_allocations (lot_id)`,
  `COMMENT ON TABLE inventory_allocations IS 'Stage 3: which lot each order line was reserved or deducted from. reserved -> committed (paid) | released (expired/cancelled); committed -> restored (cancel/void/refund before shipment).'`,

  `CREATE TABLE order_events (
     id TEXT PRIMARY KEY,
     order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
     order_reference TEXT NOT NULL,
     event_type TEXT NOT NULL,
     actor TEXT NOT NULL,
     source TEXT NOT NULL CHECK (source IN ('customer', 'admin', 'provider', 'simulated', 'system', 'legacy')),
     payment_status_before TEXT, payment_status_after TEXT,
     fulfillment_status_before TEXT, fulfillment_status_after TEXT,
     details JSONB NOT NULL DEFAULT '{}'::jsonb,
     provider TEXT,
     provider_event_id TEXT,
     created_at TEXT NOT NULL
   )`,
  `CREATE UNIQUE INDEX order_events_provider_event ON order_events (provider, provider_event_id) WHERE provider_event_id IS NOT NULL`,
  `CREATE INDEX order_events_order ON order_events (order_id, created_at)`,

  `CREATE TABLE order_returns (
     id TEXT PRIMARY KEY,
     order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
     order_reference TEXT NOT NULL,
     line_index INTEGER NOT NULL,
     allocation_id TEXT REFERENCES inventory_allocations(id) ON DELETE RESTRICT,
     strength_id TEXT NOT NULL REFERENCES product_strengths(id) ON DELETE RESTRICT,
     from_lot_id TEXT REFERENCES inventory_lots(id) ON DELETE RESTRICT,
     to_lot_id TEXT REFERENCES inventory_lots(id) ON DELETE RESTRICT,
     quantity INTEGER NOT NULL CHECK (quantity > 0),
     condition TEXT NOT NULL CHECK (length(trim(condition)) > 0),
     decision TEXT NOT NULL CHECK (decision IN ('restock', 'quarantine', 'discard')),
     reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
     decided_by TEXT NOT NULL,
     idempotency_key TEXT NOT NULL UNIQUE,
     created_at TEXT NOT NULL
   )`,

  // Every refund recorded against an order (append-only). orders.refund_amount is their running total; the sum can
  // never exceed what was paid (enforced in vc_order_refund).
  `CREATE TABLE order_refunds (
     id TEXT PRIMARY KEY,
     order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
     order_reference TEXT NOT NULL,
     amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
     cumulative_after NUMERIC(12, 2) NOT NULL CHECK (cumulative_after >= amount),
     paid_amount NUMERIC(12, 2) NOT NULL CHECK (cumulative_after <= paid_amount),
     reason TEXT NOT NULL,
     note TEXT,
     actor TEXT NOT NULL,
     idempotency_key TEXT NOT NULL UNIQUE,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX order_refunds_order ON order_refunds (order_id, created_at)`,

  `CREATE TABLE job_runs (
     id TEXT PRIMARY KEY,
     job TEXT NOT NULL,
     source TEXT NOT NULL,
     started_at TEXT NOT NULL,
     finished_at TEXT,
     released_count INTEGER NOT NULL DEFAULT 0,
     error TEXT
   )`,
  `CREATE INDEX job_runs_job ON job_runs (job, started_at DESC)`,
];

// --- Functions (CREATE OR REPLACE: safe to re-install with --refresh-functions) ------------------------------------
export const FUNCTIONS = [
  `CREATE OR REPLACE FUNCTION vc_now() RETURNS text LANGUAGE sql VOLATILE AS $$
     SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$`,

  // History tables that must never be edited.
  `CREATE OR REPLACE FUNCTION vc_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP; END $$`,

  `CREATE OR REPLACE FUNCTION vc_lot_eligible(p_release text, p_testing text, p_expires date) RETURNS boolean LANGUAGE sql STABLE AS $$
     SELECT p_release = 'approved' AND p_testing <> 'failed' AND (p_expires IS NULL OR p_expires >= CURRENT_DATE) $$`,

  // The legacy single status, derived from payment + fulfillment so every existing page, email and report that reads
  // orders.status keeps working unchanged.
  `CREATE OR REPLACE FUNCTION vc_legacy_status(p_payment text, p_fulfillment text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
     SELECT CASE
       WHEN p_fulfillment = 'cancelled' THEN 'cancelled'
       WHEN p_fulfillment = 'returned' THEN 'returned'
       WHEN p_fulfillment = 'delivered' THEN 'delivered'
       WHEN p_fulfillment = 'shipped' THEN 'shipped'
       WHEN p_payment = 'expired' THEN 'expired'
       WHEN p_payment = 'failed' THEN 'payment_failed'
       WHEN p_fulfillment = 'processing' THEN 'processing'
       WHEN p_payment IN ('confirmed', 'partially_refunded', 'refunded', 'reversed') THEN 'paid'
       ELSE 'awaiting_payment' END $$`,
  `CREATE OR REPLACE FUNCTION vc_orders_derive_status() RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN NEW.status := vc_legacy_status(NEW.payment_status, NEW.fulfillment_status); RETURN NEW; END $$`,

  // SKU totals = sum of the strength's lots; each lot's reserved = its live reservations. Checked at COMMIT
  // (deferred), so a statement that moves several rows is judged on its end state.
  `CREATE OR REPLACE FUNCTION vc_inventory_reconcile_check() RETURNS trigger LANGUAGE plpgsql AS $$
     DECLARE sid text; lid text; p int; r int; lp int; lr int; ar int; lres int;
     BEGIN
       IF TG_TABLE_NAME = 'inventory_allocations' THEN lid := COALESCE(NEW.lot_id, OLD.lot_id);
         SELECT strength_id INTO sid FROM inventory_lots WHERE id = lid;
       ELSIF TG_TABLE_NAME = 'inventory_lots' THEN sid := COALESCE(NEW.strength_id, OLD.strength_id); lid := COALESCE(NEW.id, OLD.id);
       ELSE sid := COALESCE(NEW.strength_id, OLD.strength_id);
       END IF;
       SELECT physical_quantity, reserved_quantity INTO p, r FROM strength_inventory WHERE strength_id = sid;
       IF p IS NOT NULL THEN
         SELECT COALESCE(SUM(physical_quantity), 0), COALESCE(SUM(reserved_quantity), 0) INTO lp, lr FROM inventory_lots WHERE strength_id = sid;
         IF p <> lp OR r <> lr THEN
           RAISE EXCEPTION 'inventory_unreconciled: strength % is physical %/reserved % but its lots total %/%', sid, p, r, lp, lr USING ERRCODE = '23514';
         END IF;
       END IF;
       IF lid IS NOT NULL THEN
         SELECT reserved_quantity INTO lres FROM inventory_lots WHERE id = lid;
         SELECT COALESCE(SUM(quantity), 0) INTO ar FROM inventory_allocations WHERE lot_id = lid AND state = 'reserved';
         IF lres IS NOT NULL AND lres <> ar THEN
           RAISE EXCEPTION 'inventory_unreconciled: lot % has % reserved but % in live reservations', lid, lres, ar USING ERRCODE = '23514';
         END IF;
       END IF;
       RETURN NULL;
     END $$`,

  // Available-to-sell per strength, evaluated against the clock on EVERY read (owner requirement 2026-11-18): a hold
  // whose time has run out counts as free immediately, whether or not anything has released it yet. So a product page
  // never shows stock as gone because of dead reservations, and a stopped expiry job can't hide stock.
  //   sellable      approved lots only: physical − live (unexpired) reservations — what can be ordered
  //   expired_holds units still recorded as reserved on approved lots although their hold has expired
  //   expired_all   the same over every lot (for the Executive Office "Available" figure)
  `DROP FUNCTION IF EXISTS vc_sellable()`,
  `CREATE OR REPLACE FUNCTION vc_sellable() RETURNS TABLE (strength_id text, sellable int, expired_holds int, expired_all int) LANGUAGE sql STABLE AS $$
     SELECT l.strength_id,
            COALESCE(SUM(l.physical_quantity - l.reserved_quantity + COALESCE(x.expired, 0))
                       FILTER (WHERE vc_lot_eligible(l.release_status, l.testing_status, l.expires_on)), 0)::int,
            COALESCE(SUM(COALESCE(x.expired, 0)) FILTER (WHERE vc_lot_eligible(l.release_status, l.testing_status, l.expires_on)), 0)::int,
            COALESCE(SUM(COALESCE(x.expired, 0)), 0)::int
       FROM inventory_lots l
       LEFT JOIN (SELECT lot_id, SUM(quantity) AS expired FROM inventory_allocations
                   WHERE state = 'reserved' AND expires_at <= vc_now() GROUP BY lot_id) x ON x.lot_id = l.id
      GROUP BY l.strength_id $$`,

  `CREATE OR REPLACE FUNCTION vc_lock_strengths(p_ids text[]) RETURNS void LANGUAGE plpgsql AS $$
     BEGIN PERFORM 1 FROM strength_inventory WHERE strength_id = ANY(p_ids) ORDER BY strength_id FOR UPDATE; END $$`,

  // THE write path for stock. Locks the strength (and lot), checks every bound, updates both and records one
  // movement. Separate SKU and lot deltas let a lot-to-lot transfer leave the SKU total unchanged.
  `CREATE OR REPLACE FUNCTION vc_inv_move(p_strength text, p_lot text, p_type text,
       p_sku_phys int, p_sku_res int, p_lot_phys int, p_lot_res int,
       p_reason text, p_note text, p_actor text, p_reference text, p_order_id text, p_key text)
     RETURNS inventory_movements LANGUAGE plpgsql AS $$
     DECLARE si strength_inventory%ROWTYPE; l inventory_lots%ROWTYPE; s product_strengths%ROWTYPE; m inventory_movements%ROWTYPE; t text := vc_now();
     BEGIN
       IF p_key IS NOT NULL THEN
         SELECT * INTO m FROM inventory_movements WHERE idempotency_key = p_key;
         IF FOUND THEN RETURN m; END IF;
       END IF;
       SELECT * INTO si FROM strength_inventory WHERE strength_id = p_strength FOR UPDATE;
       IF NOT FOUND THEN RAISE EXCEPTION 'No stock record for this strength (%).', p_strength USING ERRCODE = 'P0002'; END IF;
       IF p_key IS NOT NULL THEN
         SELECT * INTO m FROM inventory_movements WHERE idempotency_key = p_key;
         IF FOUND THEN RETURN m; END IF;
       END IF;
       SELECT * INTO s FROM product_strengths WHERE id = p_strength;
       IF p_lot IS NOT NULL THEN
         SELECT * INTO l FROM inventory_lots WHERE id = p_lot FOR UPDATE;
         IF NOT FOUND OR l.strength_id <> p_strength THEN RAISE EXCEPTION 'That lot does not belong to %.', s.sku USING ERRCODE = 'P0002'; END IF;
         IF l.physical_quantity + p_lot_phys < 0 OR l.reserved_quantity + p_lot_res < 0
            OR l.reserved_quantity + p_lot_res > l.physical_quantity + p_lot_phys THEN
           RAISE EXCEPTION 'Not enough stock in lot % of % (physical %, reserved %).', l.lot_code, s.sku, l.physical_quantity, l.reserved_quantity USING ERRCODE = 'P0003';
         END IF;
       ELSIF p_lot_phys <> 0 OR p_lot_res <> 0 THEN
         RAISE EXCEPTION 'A lot change needs a lot.' USING ERRCODE = 'P0004';
       END IF;
       IF si.physical_quantity + p_sku_phys < 0 OR si.reserved_quantity + p_sku_res < 0
          OR si.reserved_quantity + p_sku_res > si.physical_quantity + p_sku_phys THEN
         RAISE EXCEPTION 'Not enough stock of % (physical %, reserved %).', s.sku, si.physical_quantity, si.reserved_quantity USING ERRCODE = 'P0003';
       END IF;
       IF p_sku_phys <> 0 OR p_sku_res <> 0 THEN
         UPDATE strength_inventory SET physical_quantity = physical_quantity + p_sku_phys, reserved_quantity = reserved_quantity + p_sku_res,
                version = version + 1, updated_at = t WHERE strength_id = p_strength;
       END IF;
       IF p_lot IS NOT NULL AND (p_lot_phys <> 0 OR p_lot_res <> 0) THEN
         UPDATE inventory_lots SET physical_quantity = physical_quantity + p_lot_phys, reserved_quantity = reserved_quantity + p_lot_res,
                version = version + 1, updated_at = t WHERE id = p_lot;
       END IF;
       INSERT INTO inventory_movements (id, strength_id, sku, product_slug, strength_label, movement_type, quantity_change, previous_quantity,
              resulting_quantity, reason, note, actor, reference, idempotency_key, created_at, lot_id, lot_code, order_id,
              reserved_change, previous_reserved, resulting_reserved,
              lot_quantity_change, lot_previous_quantity, lot_resulting_quantity, lot_reserved_change, lot_previous_reserved, lot_resulting_reserved)
       VALUES (gen_random_uuid()::text, p_strength, s.sku, s.product_slug, s.label, p_type, p_sku_phys, si.physical_quantity,
              si.physical_quantity + p_sku_phys, p_reason, p_note, p_actor, p_reference, p_key, t, p_lot, l.lot_code, p_order_id,
              p_sku_res, si.reserved_quantity, si.reserved_quantity + p_sku_res,
              CASE WHEN p_lot IS NULL THEN NULL ELSE p_lot_phys END, l.physical_quantity, l.physical_quantity + p_lot_phys,
              CASE WHEN p_lot IS NULL THEN NULL ELSE p_lot_res END, l.reserved_quantity, l.reserved_quantity + p_lot_res)
       RETURNING * INTO m;
       RETURN m;
     END $$`,

  `CREATE OR REPLACE FUNCTION vc_order_event(p_order_id text, p_type text, p_actor text, p_source text,
       p_pay_before text, p_pay_after text, p_ful_before text, p_ful_after text, p_details jsonb,
       p_provider text DEFAULT NULL, p_provider_event_id text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
     INSERT INTO order_events (id, order_id, order_reference, event_type, actor, source, payment_status_before, payment_status_after,
            fulfillment_status_before, fulfillment_status_after, details, provider, provider_event_id, created_at)
     SELECT gen_random_uuid()::text, o.id, o.reference, p_type, p_actor, p_source, p_pay_before, p_pay_after, p_ful_before, p_ful_after,
            COALESCE(p_details, '{}'::jsonb), p_provider, p_provider_event_id, vc_now()
       FROM orders o WHERE o.id = p_order_id $$`,

  // An order's lines as (line, strength id, sku, quantity): the permanent strength id on the line, else (lines
  // from before Stage 1) the strength matched by product + label.
  `CREATE OR REPLACE FUNCTION vc_order_lines(p_order_id text)
     RETURNS TABLE (line_index int, strength_id text, sku text, quantity int, name text) LANGUAGE sql STABLE AS $$
     SELECT (e.ord - 1)::int, ps.id, ps.sku, (e.v->>'quantity')::int, (e.v->>'name') || ' ' || (e.v->>'sizeLabel')
       FROM orders o, jsonb_array_elements(o.items::jsonb) WITH ORDINALITY AS e(v, ord)
       LEFT JOIN product_strengths ps ON ps.id = COALESCE(e.v->>'strengthId',
            (SELECT x.id FROM product_strengths x WHERE x.product_slug = e.v->>'slug' AND x.label = e.v->>'sizeLabel'))
      WHERE o.id = p_order_id $$`,

  // The reconciliation / returns lot of a strength, created (quarantined) if it doesn't exist yet. Caller holds the
  // strength lock.
  `CREATE OR REPLACE FUNCTION vc_holding_lot(p_strength text, p_kind text, p_actor text) RETURNS text LANGUAGE plpgsql AS $$
     DECLARE lid text; s product_strengths%ROWTYPE; t text := vc_now();
     BEGIN
       SELECT id INTO lid FROM inventory_lots WHERE strength_id = p_strength AND kind = p_kind;
       IF FOUND THEN RETURN lid; END IF;
       SELECT * INTO s FROM product_strengths WHERE id = p_strength;
       lid := gen_random_uuid()::text;
       INSERT INTO inventory_lots (id, lot_code, strength_id, sku, product_slug, kind, received_quantity, received_at, release_status,
              release_changed_at, release_changed_by, release_reason, created_at, created_by, updated_at)
       VALUES (lid, CASE p_kind WHEN 'reconciliation' THEN 'RECON-' ELSE 'RETURNS-' END || s.sku, p_strength, s.sku, s.product_slug, p_kind,
              0, t, 'quarantined', t, p_actor,
              CASE p_kind WHEN 'reconciliation' THEN 'Stock with no lot record. Not sellable until split into real lots or approved.'
                          ELSE 'Returned goods awaiting inspection. Not sellable until approved.' END, t, p_actor, t);
       RETURN lid;
     END $$`,

  // FIFO allocation of an order's lines. Caller holds the strength locks. Mode 'reserve' holds units (reserved +q);
  // mode 'deduct' takes them (physical −q). Oldest eligible lot first, then the next. Any line that can't be
  // filled raises, which rolls back every line (all-or-nothing).
  `CREATE OR REPLACE FUNCTION vc_allocate_locked(p_order_id text, p_mode text, p_expires_at text, p_actor text) RETURNS int LANGUAGE plpgsql AS $$
     DECLARE ln record; l record; need int; take int; o orders%ROWTYPE; n int := 0; aid text; t text := vc_now(); avail int;
     BEGIN
       SELECT * INTO o FROM orders WHERE id = p_order_id;
       FOR ln IN SELECT * FROM vc_order_lines(p_order_id) ORDER BY line_index LOOP
         IF ln.strength_id IS NULL THEN RAISE EXCEPTION 'Line % (%) has no matching strength.', ln.line_index + 1, ln.name USING ERRCODE = 'P0004'; END IF;
         need := ln.quantity;
         FOR l IN SELECT * FROM inventory_lots
                   WHERE strength_id = ln.strength_id AND vc_lot_eligible(release_status, testing_status, expires_on)
                     AND physical_quantity - reserved_quantity > 0
                   ORDER BY received_at, id LOOP
           EXIT WHEN need = 0;
           SELECT physical_quantity - reserved_quantity INTO avail FROM inventory_lots WHERE id = l.id;
           take := LEAST(need, avail);
           CONTINUE WHEN take <= 0;
           aid := gen_random_uuid()::text;
           IF p_mode = 'reserve' THEN
             PERFORM vc_inv_move(ln.strength_id, l.id, 'reserved', 0, take, 0, take,
                     'Order ' || o.reference || ' reserved until ' || p_expires_at, NULL, p_actor, o.reference, o.id, 'alloc:' || aid || ':reserved');
             INSERT INTO inventory_allocations (id, order_id, order_reference, line_index, strength_id, sku, lot_id, lot_code, quantity, state, expires_at, created_at, created_by)
             VALUES (aid, o.id, o.reference, ln.line_index, ln.strength_id, ln.sku, l.id, l.lot_code, take, 'reserved', p_expires_at, t, p_actor);
           ELSE
             PERFORM vc_inv_move(ln.strength_id, l.id, 'order_deducted', -take, 0, -take, 0,
                     'Order ' || o.reference || ' paid', NULL, p_actor, o.reference, o.id, 'alloc:' || aid || ':deducted');
             INSERT INTO inventory_allocations (id, order_id, order_reference, line_index, strength_id, sku, lot_id, lot_code, quantity, state, created_at, created_by, committed_at)
             VALUES (aid, o.id, o.reference, ln.line_index, ln.strength_id, ln.sku, l.id, l.lot_code, take, 'committed', t, p_actor, t);
           END IF;
           need := need - take;
           n := n + 1;
         END LOOP;
         IF need > 0 THEN
           RAISE EXCEPTION 'Not enough sellable stock of % for order % (needs %, % available in approved lots).',
             ln.sku, o.reference, ln.quantity, ln.quantity - need USING ERRCODE = 'P0003';
         END IF;
       END LOOP;
       RETURN n;
     END $$`,

  // Strengths an order touches: its lines' strengths and any it holds allocations on.
  `CREATE OR REPLACE FUNCTION vc_order_strengths(p_order_id text) RETURNS text[] LANGUAGE sql STABLE AS $$
     SELECT COALESCE(array_agg(DISTINCT x), '{}') FROM (
       SELECT strength_id AS x FROM vc_order_lines(p_order_id) WHERE strength_id IS NOT NULL
       UNION SELECT strength_id FROM inventory_allocations WHERE order_id = p_order_id) q $$`,

  `CREATE OR REPLACE FUNCTION vc_release_allocation_locked(p_alloc_id text, p_actor text, p_reason text) RETURNS boolean LANGUAGE plpgsql AS $$
     DECLARE a inventory_allocations%ROWTYPE;
     BEGIN
       SELECT * INTO a FROM inventory_allocations WHERE id = p_alloc_id FOR UPDATE;
       IF NOT FOUND OR a.state <> 'reserved' THEN RETURN false; END IF;
       PERFORM vc_inv_move(a.strength_id, a.lot_id, 'released', 0, -a.quantity, 0, -a.quantity, p_reason, NULL, p_actor,
               a.order_reference, a.order_id, 'alloc:' || a.id || ':released');
       UPDATE inventory_allocations SET state = 'released', released_at = vc_now(), released_by = p_actor, release_reason = p_reason WHERE id = a.id;
       RETURN true;
     END $$`,

  // Puts deducted units back into the lot they came from (cancel / void / refund before shipment).
  `CREATE OR REPLACE FUNCTION vc_restore_order_locked(p_order_id text, p_actor text, p_reason text) RETURNS int LANGUAGE plpgsql AS $$
     DECLARE a inventory_allocations%ROWTYPE; o orders%ROWTYPE; ln record; lid text; n int := 0; has_alloc boolean;
     BEGIN
       SELECT * INTO o FROM orders WHERE id = p_order_id;
       SELECT EXISTS (SELECT 1 FROM inventory_allocations WHERE order_id = p_order_id) INTO has_alloc;
       FOR a IN SELECT * FROM inventory_allocations WHERE order_id = p_order_id AND state = 'committed' ORDER BY line_index, created_at FOR UPDATE LOOP
         IF a.quantity - a.returned_quantity > 0 THEN
           PERFORM vc_inv_move(a.strength_id, a.lot_id, 'order_restored', a.quantity - a.returned_quantity, 0, a.quantity - a.returned_quantity, 0,
                   p_reason, NULL, p_actor, a.order_reference, a.order_id, 'alloc:' || a.id || ':restored');
         END IF;
         UPDATE inventory_allocations SET state = 'restored', restored_at = vc_now(), restored_by = p_actor, restore_reason = p_reason WHERE id = a.id;
         n := n + 1;
       END LOOP;
       -- Orders paid before Stage 3 were deducted per SKU with no lot. Their units go back into the strength's
       -- reconciliation lot (quarantined: restored but unverified stock is not sellable automatically). Same
       -- idempotency key as Stage 2's restore, so a line restored by either never comes back twice.
       IF NOT has_alloc AND o.stock_decremented THEN
         FOR ln IN SELECT * FROM vc_order_lines(p_order_id) WHERE strength_id IS NOT NULL ORDER BY line_index LOOP
           lid := vc_holding_lot(ln.strength_id, 'reconciliation', p_actor);
           PERFORM vc_inv_move(ln.strength_id, lid, 'order_restored', ln.quantity, 0, ln.quantity, 0,
                   p_reason || ' (pre-Stage-3 order: returned to the reconciliation lot)', NULL, p_actor, o.reference, o.id,
                   'order:' || o.reference || ':' || ln.line_index || ':restored');
           n := n + 1;
         END LOOP;
       END IF;
       RETURN n;
     END $$`,

  // Releases every live reservation of an expired order and marks it expired. Caller holds the strength locks.
  `CREATE OR REPLACE FUNCTION vc_expire_order_locked(p_order_id text, p_actor text, p_source text) RETURNS int LANGUAGE plpgsql AS $$
     DECLARE a record; n int := 0; o orders%ROWTYPE;
     BEGIN
       SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
       FOR a IN SELECT id FROM inventory_allocations WHERE order_id = p_order_id AND state = 'reserved' AND expires_at <= vc_now() LOOP
         IF vc_release_allocation_locked(a.id, p_actor, 'Reservation expired: payment not confirmed in time') THEN n := n + 1; END IF;
       END LOOP;
       IF n > 0 AND o.payment_status = 'pending' THEN
         UPDATE orders SET payment_status = 'expired', fulfillment_status = 'unfulfilled' WHERE id = p_order_id;
         PERFORM vc_order_event(p_order_id, 'reservation_expired', p_actor, p_source, o.payment_status, 'expired', o.fulfillment_status, 'unfulfilled',
                 jsonb_build_object('released_allocations', n, 'expired_at', o.reservation_expires_at));
       ELSIF n > 0 THEN
         PERFORM vc_order_event(p_order_id, 'reservation_expired', p_actor, p_source, o.payment_status, o.payment_status, o.fulfillment_status,
                 o.fulfillment_status, jsonb_build_object('released_allocations', n));
       END IF;
       RETURN n;
     END $$`,

  // The expiry sweep (cron, the Reservations view, and every checkout for the strengths it touches). Retry-safe:
  // an allocation is released once (state check + idempotency key); re-running finds nothing left to do.
  `CREATE OR REPLACE FUNCTION vc_reservations_sweep(p_actor text, p_source text, p_strengths text[] DEFAULT NULL) RETURNS int LANGUAGE plpgsql AS $$
     DECLARE ids text[]; o record; n int := 0; jid text := gen_random_uuid()::text; t text := vc_now();
     BEGIN
       SELECT COALESCE(array_agg(DISTINCT a2.strength_id), '{}') INTO ids
         FROM inventory_allocations a JOIN inventory_allocations a2 ON a2.order_id = a.order_id AND a2.state = 'reserved'
        WHERE a.state = 'reserved' AND a.expires_at <= t AND (p_strengths IS NULL OR a.strength_id = ANY(p_strengths));
       IF cardinality(ids) > 0 THEN
         PERFORM vc_lock_strengths(ids);
         FOR o IN SELECT DISTINCT order_id FROM inventory_allocations
                   WHERE state = 'reserved' AND expires_at <= vc_now() AND strength_id = ANY(ids) LOOP
           n := n + vc_expire_order_locked(o.order_id, p_actor, 'system');
         END LOOP;
       END IF;
       -- The heartbeat: every cron/admin run is recorded (so a stopped job is visible); checkout sweeps only when
       -- they actually released something.
       IF p_source <> 'checkout' OR n > 0 THEN
         INSERT INTO job_runs (id, job, source, started_at, finished_at, released_count) VALUES (jid, 'reservation_sweep', p_source, t, vc_now(), n);
       END IF;
       RETURN n;
     END $$`,

  // Checkout for a reserving method: hold stock for the order until p_expires_at. Runs in the same transaction as
  // the order INSERT, so a refusal leaves no order behind. Expired holds on the same strengths are released first.
  `CREATE OR REPLACE FUNCTION vc_order_reserve(p_order_id text, p_expires_at text, p_actor text) RETURNS int LANGUAGE plpgsql AS $$
     DECLARE ids text[]; n int; o orders%ROWTYPE;
     BEGIN
       IF EXISTS (SELECT 1 FROM inventory_allocations WHERE order_id = p_order_id AND state IN ('reserved', 'committed')) THEN RETURN 0; END IF;
       ids := vc_order_strengths(p_order_id);
       -- Lock this order's strengths together with those of any expired hold on them, in one sorted pass, then
       -- release the expired holds (the sweep re-locks rows already held, so it never waits on itself).
       SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO ids FROM (
         SELECT unnest(ids) AS x
         UNION SELECT a2.strength_id FROM inventory_allocations a JOIN inventory_allocations a2 ON a2.order_id = a.order_id AND a2.state = 'reserved'
          WHERE a.state = 'reserved' AND a.expires_at <= vc_now() AND a.strength_id = ANY(ids)) q;
       PERFORM vc_lock_strengths(ids);
       PERFORM vc_reservations_sweep('system:expiry', 'checkout', ids);
       n := vc_allocate_locked(p_order_id, 'reserve', p_expires_at, p_actor);
       SELECT * INTO o FROM orders WHERE id = p_order_id;
       UPDATE orders SET fulfillment_status = 'reserved', reservation_expires_at = p_expires_at WHERE id = p_order_id;
       PERFORM vc_order_event(p_order_id, 'stock_reserved', p_actor, 'customer', o.payment_status, o.payment_status, o.fulfillment_status, 'reserved',
               jsonb_build_object('expires_at', p_expires_at, 'allocations', n));
       RETURN n;
     END $$`,

  // Payment confirmed (administrator with a recorded reference, or a provider notification). One call:
  // claims the order, records the payment, then moves stock — commits the reservation, or (no reservation:
  // Zelle / bank transfer) deducts FIFO from approved lots. If stock can't be committed (insufficient, or the
  // reservation already expired) the payment is still recorded and the order goes to Administrative Review with
  // nothing deducted: it is never oversold.
  `CREATE OR REPLACE FUNCTION vc_order_confirm_payment(p_order_id text, p_actor text, p_source text, p_reference text, p_amount double precision,
       p_received_on date, p_note text, p_exact_amount boolean, p_provider text, p_provider_event_id text, p_reserve_policy boolean)
     RETURNS jsonb LANGUAGE plpgsql AS $$
     DECLARE o orders%ROWTYPE; ids text[]; outcome text := 'confirmed'; review text; live int; expired int; committed int; ful text; t text := vc_now();
             a record; msg text;
     BEGIN
       IF p_provider_event_id IS NOT NULL AND EXISTS (SELECT 1 FROM order_events WHERE provider = p_provider AND provider_event_id = p_provider_event_id) THEN
         RETURN jsonb_build_object('outcome', 'duplicate_event');
       END IF;
       ids := vc_order_strengths(p_order_id);
       PERFORM vc_lock_strengths(ids);
       SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
       IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.' USING ERRCODE = 'P0002'; END IF;
       IF o.payment_status = 'confirmed' THEN
         PERFORM vc_order_event(p_order_id, 'payment_duplicate', p_actor, p_source, o.payment_status, o.payment_status, o.fulfillment_status, o.fulfillment_status,
                 jsonb_build_object('reference', p_reference, 'amount', p_amount), p_provider, p_provider_event_id);
         RETURN jsonb_build_object('outcome', 'already_confirmed');
       END IF;
       IF o.payment_status NOT IN ('pending', 'processing', 'expired') OR (o.payment_status = 'expired' AND p_source = 'admin') OR o.fulfillment_status = 'cancelled' THEN
         IF p_source <> 'admin' THEN
           -- A provider says it was paid, but the order is cancelled / refunded / failed: record it for a person.
           UPDATE orders SET needs_review = TRUE, review_reason = 'Payment notification received for an order that is ' || o.payment_status || ' / ' || o.fulfillment_status || '.', review_opened_at = t WHERE id = p_order_id;
           PERFORM vc_order_event(p_order_id, 'payment_unexpected', p_actor, p_source, o.payment_status, o.payment_status, o.fulfillment_status, o.fulfillment_status,
                   jsonb_build_object('reference', p_reference, 'amount', p_amount), p_provider, p_provider_event_id);
           RETURN jsonb_build_object('outcome', 'needs_review');
         END IF;
         RAISE EXCEPTION 'This order is % / % and can''t be confirmed.', o.payment_status, o.fulfillment_status USING ERRCODE = 'P0005';
       END IF;
       IF p_exact_amount AND (p_amount IS NULL OR round(p_amount::numeric, 2) <> round(o.total::numeric, 2)) THEN
         UPDATE orders SET needs_review = TRUE, review_reason = format('Amount received %s does not match the order total %s (reference %s). Not confirmed.',
                to_char(p_amount, 'FM999999990.00'), to_char(o.total, 'FM999999990.00'), p_reference), review_opened_at = t WHERE id = p_order_id;
         PERFORM vc_order_event(p_order_id, 'payment_amount_mismatch', p_actor, p_source, o.payment_status, o.payment_status, o.fulfillment_status, o.fulfillment_status,
                 jsonb_build_object('reference', p_reference, 'amount_received', p_amount, 'order_total', o.total, 'received_on', p_received_on, 'note', p_note), p_provider, p_provider_event_id);
         RETURN jsonb_build_object('outcome', 'amount_mismatch');
       END IF;

       UPDATE orders SET payment_status = 'confirmed', payment_reference = p_reference, payment_amount_received = p_amount, payment_received_on = p_received_on,
              payment_confirmed_by = p_actor, payment_confirmed_at = t, payment_source = p_source, paid_at = COALESCE(paid_at, t)
        WHERE id = p_order_id;

       SELECT count(*) FILTER (WHERE state = 'reserved' AND expires_at > t), count(*) FILTER (WHERE state = 'reserved' AND expires_at <= t),
              count(*) FILTER (WHERE state = 'committed')
         INTO live, expired, committed FROM inventory_allocations WHERE order_id = p_order_id;
       ful := o.fulfillment_status;
       IF committed > 0 AND live = 0 AND expired = 0 THEN
         ful := 'allocated';
       ELSIF expired > 0 OR o.payment_status = 'expired' OR (p_reserve_policy AND live = 0) THEN
         -- Paid after the hold ran out: release what's left of it and hold nothing. A person decides.
         FOR a IN SELECT id FROM inventory_allocations WHERE order_id = p_order_id AND state = 'reserved' LOOP
           PERFORM vc_release_allocation_locked(a.id, 'system:expiry', 'Reservation expired before payment was confirmed');
         END LOOP;
         outcome := 'late_payment'; ful := 'unfulfilled';
         review := 'Payment confirmed after the stock reservation expired. No stock is held: allocate stock now or refund.';
       ELSIF live > 0 THEN
         BEGIN
           IF EXISTS (SELECT 1 FROM inventory_allocations al JOIN inventory_lots l ON l.id = al.lot_id
                       WHERE al.order_id = p_order_id AND al.state = 'reserved' AND NOT vc_lot_eligible(l.release_status, l.testing_status, l.expires_on)) THEN
             -- A reserved lot was quarantined/rejected/expired since checkout: release the whole hold and fill the
             -- order afresh, FIFO, from lots that are approved now (the strengths are locked, so nobody else can
             -- take the released units in between).
             FOR a IN SELECT id FROM inventory_allocations WHERE order_id = p_order_id AND state = 'reserved' LOOP
               PERFORM vc_release_allocation_locked(a.id, p_actor, 'Reserved lot no longer eligible at payment: re-allocated');
             END LOOP;
             PERFORM vc_allocate_locked(p_order_id, 'deduct', NULL, p_actor);
           ELSE
             FOR a IN SELECT * FROM inventory_allocations WHERE order_id = p_order_id AND state = 'reserved' ORDER BY line_index, created_at LOOP
               PERFORM vc_inv_move(a.strength_id, a.lot_id, 'committed', -a.quantity, -a.quantity, -a.quantity, -a.quantity,
                       'Order ' || o.reference || ' paid: reservation committed', NULL, p_actor, o.reference, o.id, 'alloc:' || a.id || ':committed');
               UPDATE inventory_allocations SET state = 'committed', committed_at = t WHERE id = a.id;
             END LOOP;
           END IF;
           ful := 'allocated';
         EXCEPTION WHEN SQLSTATE 'P0003' THEN
           GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
           outcome := 'insufficient_stock'; ful := 'unfulfilled';
           review := 'Payment confirmed but stock could not be committed: ' || msg;
           -- Nothing is held for an order in review.
           FOR a IN SELECT id FROM inventory_allocations WHERE order_id = p_order_id AND state = 'reserved' LOOP
             PERFORM vc_release_allocation_locked(a.id, p_actor, 'Released: payment confirmed but the order could not be filled');
           END LOOP;
         END;
       ELSE
         BEGIN
           PERFORM vc_allocate_locked(p_order_id, 'deduct', NULL, p_actor);
           ful := 'allocated';
         EXCEPTION WHEN SQLSTATE 'P0003' OR SQLSTATE 'P0004' THEN
           GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
           outcome := 'insufficient_stock'; ful := 'unfulfilled';
           review := 'Payment confirmed but stock could not be deducted: ' || msg;
         END;
       END IF;

       UPDATE orders SET fulfillment_status = ful, stock_decremented = (ful = 'allocated'),
              needs_review = (review IS NOT NULL), review_reason = review, review_opened_at = CASE WHEN review IS NULL THEN NULL ELSE t END
        WHERE id = p_order_id;
       PERFORM vc_order_event(p_order_id, 'payment_confirmed', p_actor, p_source, o.payment_status, 'confirmed', o.fulfillment_status, ful,
               jsonb_build_object('reference', p_reference, 'amount_received', p_amount, 'received_on', p_received_on, 'note', p_note,
                                  'stock', outcome, 'review', review), p_provider, p_provider_event_id);
       RETURN jsonb_build_object('outcome', outcome, 'review', review);
     END $$`,

  // Non-confirming payment updates from a provider (ACH / cards): processing, failed, reversed (ACH return).
  `CREATE OR REPLACE FUNCTION vc_order_payment_update(p_order_id text, p_kind text, p_actor text, p_source text, p_provider text,
       p_provider_event_id text, p_details jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
     DECLARE o orders%ROWTYPE; ids text[]; a record; pay text; ful text; review text; t text := vc_now();
     BEGIN
       IF p_provider_event_id IS NOT NULL AND EXISTS (SELECT 1 FROM order_events WHERE provider = p_provider AND provider_event_id = p_provider_event_id) THEN
         RETURN jsonb_build_object('outcome', 'duplicate_event');
       END IF;
       ids := vc_order_strengths(p_order_id);
       PERFORM vc_lock_strengths(ids);
       SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
       IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.' USING ERRCODE = 'P0002'; END IF;
       pay := o.payment_status; ful := o.fulfillment_status;
       IF p_kind = 'processing' THEN
         IF o.payment_status <> 'pending' THEN RAISE EXCEPTION 'Only a pending payment can start processing (it is %).', o.payment_status USING ERRCODE = 'P0005'; END IF;
         pay := 'processing';
       ELSIF p_kind = 'failed' THEN
         IF o.payment_status NOT IN ('pending', 'processing') THEN RAISE EXCEPTION 'Only a pending or processing payment can fail (it is %).', o.payment_status USING ERRCODE = 'P0005'; END IF;
         pay := 'failed';
         FOR a IN SELECT id FROM inventory_allocations WHERE order_id = p_order_id AND state = 'reserved' LOOP
           PERFORM vc_release_allocation_locked(a.id, p_actor, 'Payment failed: reservation released');
         END LOOP;
         IF ful IN ('allocated', 'processing') THEN PERFORM vc_restore_order_locked(p_order_id, p_actor, 'Payment failed before shipment'); END IF;
         IF ful IN ('shipped', 'delivered') THEN review := 'Payment failed after the order shipped. Stock was not restored.'; ELSE ful := 'unfulfilled'; END IF;
       ELSIF p_kind = 'reversed' THEN
         IF o.payment_status <> 'confirmed' THEN RAISE EXCEPTION 'Only a confirmed payment can be returned/reversed (it is %).', o.payment_status USING ERRCODE = 'P0005'; END IF;
         pay := 'reversed';
         -- Never restores stock automatically: shipped goods are not back on the shelf because money was returned.
         review := 'Payment returned/reversed after confirmation (' || COALESCE(p_details->>'reason', 'no reason given') || '). Stock was not changed.';
       ELSE
         RAISE EXCEPTION 'Unknown payment update %.', p_kind USING ERRCODE = 'P0004';
       END IF;
       UPDATE orders SET payment_status = pay, fulfillment_status = ful, stock_decremented = (ful IN ('allocated', 'processing', 'shipped', 'delivered')) AND stock_decremented,
              needs_review = needs_review OR review IS NOT NULL, review_reason = COALESCE(review, review_reason),
              review_opened_at = CASE WHEN review IS NULL THEN review_opened_at ELSE t END
        WHERE id = p_order_id;
       PERFORM vc_order_event(p_order_id, 'payment_' || p_kind, p_actor, p_source, o.payment_status, pay, o.fulfillment_status, ful,
               COALESCE(p_details, '{}'::jsonb) || jsonb_build_object('review', review), p_provider, p_provider_event_id);
       RETURN jsonb_build_object('outcome', p_kind, 'review', review);
     END $$`,

  // ACH with "fulfil after initiation": deduct stock while the payment is still processing.
  `CREATE OR REPLACE FUNCTION vc_order_allocate_now(p_order_id text, p_actor text, p_allow_processing boolean) RETURNS jsonb LANGUAGE plpgsql AS $$
     DECLARE o orders%ROWTYPE; ids text[]; t text := vc_now();
     BEGIN
       ids := vc_order_strengths(p_order_id);
       PERFORM vc_lock_strengths(ids);
       SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
       IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.' USING ERRCODE = 'P0002'; END IF;
       IF NOT (o.payment_status = 'confirmed' OR (p_allow_processing AND o.payment_status = 'processing')) THEN
         RAISE EXCEPTION 'Stock is allocated only after payment is confirmed (payment is %).', o.payment_status USING ERRCODE = 'P0005';
       END IF;
       IF o.fulfillment_status <> 'unfulfilled' OR EXISTS (SELECT 1 FROM inventory_allocations WHERE order_id = p_order_id AND state IN ('reserved', 'committed')) THEN
         RAISE EXCEPTION 'This order already has stock allocated (%).', o.fulfillment_status USING ERRCODE = 'P0005';
       END IF;
       PERFORM vc_allocate_locked(p_order_id, 'deduct', NULL, p_actor);   -- raises P0003 if short: nothing changes
       UPDATE orders SET fulfillment_status = 'allocated', stock_decremented = TRUE,
              needs_review = FALSE, review_reason = NULL, review_opened_at = NULL WHERE id = p_order_id;
       PERFORM vc_order_event(p_order_id, 'stock_allocated', p_actor, CASE WHEN p_actor LIKE 'system:%' THEN 'system' ELSE 'admin' END,
               o.payment_status, o.payment_status, o.fulfillment_status, 'allocated', jsonb_build_object('previous_review', o.review_reason));
       RETURN jsonb_build_object('outcome', 'allocated');
     END $$`,

  // Cancel (allowed until shipment). Releases holds, restores deducted units to their lots.
  `CREATE OR REPLACE FUNCTION vc_order_cancel(p_order_id text, p_actor text, p_source text, p_reason text) RETURNS jsonb LANGUAGE plpgsql AS $$
     DECLARE o orders%ROWTYPE; ids text[]; a record; released int := 0; restored int := 0; pay text; review text; t text := vc_now();
     BEGIN
       ids := vc_order_strengths(p_order_id);
       PERFORM vc_lock_strengths(ids);
       SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
       IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.' USING ERRCODE = 'P0002'; END IF;
       IF o.fulfillment_status = 'cancelled' THEN RETURN jsonb_build_object('outcome', 'already_cancelled'); END IF;
       IF o.fulfillment_status NOT IN ('unfulfilled', 'reserved', 'allocated', 'processing') THEN
         RAISE EXCEPTION 'An order that is % can no longer be cancelled. Record a return or a refund instead.', o.fulfillment_status USING ERRCODE = 'P0005';
       END IF;
       FOR a IN SELECT id FROM inventory_allocations WHERE order_id = p_order_id AND state = 'reserved' LOOP
         IF vc_release_allocation_locked(a.id, p_actor, 'Order cancelled: ' || COALESCE(p_reason, 'no reason given')) THEN released := released + 1; END IF;
       END LOOP;
       restored := vc_restore_order_locked(p_order_id, p_actor, 'Order ' || o.reference || ' cancelled');
       pay := CASE WHEN o.payment_status IN ('pending', 'processing', 'failed', 'expired') THEN 'cancelled' ELSE o.payment_status END;
       IF o.payment_status = 'confirmed' AND o.refunded_at IS NULL THEN review := 'Cancelled after payment was confirmed: record the refund.'; END IF;
       UPDATE orders SET fulfillment_status = 'cancelled', payment_status = pay, cancelled_at = t, cancel_reason = p_reason, stock_decremented = FALSE,
              needs_review = review IS NOT NULL, review_reason = review, review_opened_at = CASE WHEN review IS NULL THEN NULL ELSE t END
        WHERE id = p_order_id;
       PERFORM vc_order_event(p_order_id, 'order_cancelled', p_actor, p_source, o.payment_status, pay, o.fulfillment_status, 'cancelled',
               jsonb_build_object('reason', p_reason, 'reservations_released', released, 'allocations_restored', restored));
       RETURN jsonb_build_object('outcome', 'cancelled', 'released', released, 'restored', restored, 'review', review);
     END $$`,

  // Refunds (Stage 3 final corrections). Each call records ONE refund (append-only order_refunds row) and adds it to
  // orders.refund_amount; the running total can never exceed what was paid. Until the total reaches the amount paid
  // the payment is "partially_refunded" and nothing else about the order changes. The refund that completes it makes
  // the payment "refunded", and — owner decision Q1 — if the order hasn't shipped, also cancels it and restores its
  // stock; after shipment NO stock changes (goods come back only through a recorded return). A repeated submission
  // (same key) is recorded once.
  `DROP FUNCTION IF EXISTS vc_order_refund(text, text, text, double precision, text)`,
  `CREATE OR REPLACE FUNCTION vc_order_refund(p_order_id text, p_actor text, p_reason text, p_amount numeric, p_note text, p_key text) RETURNS jsonb LANGUAGE plpgsql AS $$
     DECLARE o orders%ROWTYPE; ids text[]; a record; restored int := 0; released int := 0; ful text; pay text; t text := vc_now(); shipped boolean;
             paid numeric; prior numeric; amt numeric; cumulative numeric; full_refund boolean;
     BEGIN
       IF p_key IS NOT NULL AND EXISTS (SELECT 1 FROM order_refunds WHERE idempotency_key = p_key) THEN RETURN jsonb_build_object('outcome', 'duplicate'); END IF;
       ids := vc_order_strengths(p_order_id);
       PERFORM vc_lock_strengths(ids);
       SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
       IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.' USING ERRCODE = 'P0002'; END IF;
       IF p_key IS NOT NULL AND EXISTS (SELECT 1 FROM order_refunds WHERE idempotency_key = p_key) THEN RETURN jsonb_build_object('outcome', 'duplicate'); END IF;
       IF o.paid_at IS NULL THEN RAISE EXCEPTION 'Only paid orders can be refunded.' USING ERRCODE = 'P0005'; END IF;
       IF o.payment_status = 'refunded' THEN RAISE EXCEPTION 'This order has already been fully refunded.' USING ERRCODE = 'P0005'; END IF;
       IF o.payment_status NOT IN ('confirmed', 'partially_refunded') THEN
         RAISE EXCEPTION 'A % payment can''t be refunded here.', o.payment_status USING ERRCODE = 'P0005';
       END IF;
       paid := round(COALESCE(o.payment_amount_received, o.total)::numeric, 2);
       prior := round(COALESCE(o.refund_amount, 0)::numeric, 2);
       amt := round(COALESCE(p_amount, paid - prior), 2);
       IF amt <= 0 THEN RAISE EXCEPTION 'The refund amount must be more than 0.' USING ERRCODE = 'P0004'; END IF;
       cumulative := prior + amt;
       IF cumulative > paid THEN
         RAISE EXCEPTION 'That would refund % in total, more than the % paid (% already refunded, % remaining).', cumulative, paid, prior, paid - prior USING ERRCODE = 'P0004';
       END IF;
       full_refund := cumulative = paid;
       shipped := o.fulfillment_status IN ('shipped', 'delivered', 'returned');
       ful := o.fulfillment_status;
       IF full_refund AND NOT shipped AND o.fulfillment_status <> 'cancelled' THEN
         FOR a IN SELECT id FROM inventory_allocations WHERE order_id = p_order_id AND state = 'reserved' LOOP
           IF vc_release_allocation_locked(a.id, p_actor, 'Order fully refunded before shipment') THEN released := released + 1; END IF;
         END LOOP;
         restored := vc_restore_order_locked(p_order_id, p_actor, 'Order ' || o.reference || ' fully refunded before shipment');
         ful := 'cancelled';
       END IF;
       pay := CASE WHEN full_refund THEN 'refunded' ELSE 'partially_refunded' END;
       INSERT INTO order_refunds (id, order_id, order_reference, amount, cumulative_after, paid_amount, reason, note, actor, idempotency_key, created_at)
       VALUES (gen_random_uuid()::text, o.id, o.reference, amt, cumulative, paid, p_reason, p_note, p_actor, COALESCE(p_key, gen_random_uuid()::text), t);
       UPDATE orders SET payment_status = pay, fulfillment_status = ful, refund_reason = p_reason, refund_amount = cumulative,
              -- refunded_at marks a FULL refund (every report and page reads it that way); a partial refund leaves it as it was.
              refunded_at = CASE WHEN full_refund THEN t ELSE refunded_at END,
              stock_decremented = CASE WHEN full_refund AND NOT shipped THEN FALSE ELSE stock_decremented END,
              cancelled_at = CASE WHEN ful = 'cancelled' AND o.fulfillment_status <> 'cancelled' THEN t ELSE cancelled_at END,
              cancel_reason = CASE WHEN ful = 'cancelled' AND o.fulfillment_status <> 'cancelled' THEN 'Fully refunded before shipment' ELSE cancel_reason END,
              needs_review = CASE WHEN full_refund AND review_reason LIKE 'Cancelled after payment%' THEN FALSE ELSE needs_review END,
              review_reason = CASE WHEN full_refund AND review_reason LIKE 'Cancelled after payment%' THEN NULL ELSE review_reason END
        WHERE id = p_order_id;
       PERFORM vc_order_event(p_order_id, CASE WHEN full_refund THEN 'payment_refunded' ELSE 'payment_partially_refunded' END, p_actor, 'admin',
               o.payment_status, pay, o.fulfillment_status, ful,
               jsonb_build_object('reason', p_reason, 'amount', amt, 'refunded_total', cumulative, 'paid', paid, 'remaining', paid - cumulative,
                                  'note', p_note, 'stock_restored', restored > 0, 'after_shipment', shipped,
                                  'allocations_restored', restored, 'reservations_released', released));
       RETURN jsonb_build_object('outcome', pay, 'amount', amt, 'refunded_total', cumulative, 'paid', paid, 'remaining', paid - cumulative,
                                 'restored', restored, 'after_shipment', shipped);
     END $$`,

  // Void a human-verified confirmation (owner decision Q4): before shipment only. Deducted units go back to their
  // lots; the order returns to pending payment; the original confirmation stays in the history.
  `CREATE OR REPLACE FUNCTION vc_order_void_payment(p_order_id text, p_actor text, p_reason text) RETURNS jsonb LANGUAGE plpgsql AS $$
     DECLARE o orders%ROWTYPE; ids text[]; restored int;
     BEGIN
       ids := vc_order_strengths(p_order_id);
       PERFORM vc_lock_strengths(ids);
       SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
       IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.' USING ERRCODE = 'P0002'; END IF;
       IF o.payment_status <> 'confirmed' THEN RAISE EXCEPTION 'Only a confirmed payment can be voided (it is %).', o.payment_status USING ERRCODE = 'P0005'; END IF;
       IF o.payment_source <> 'admin' THEN RAISE EXCEPTION 'Only a confirmation entered by an administrator can be voided.' USING ERRCODE = 'P0005'; END IF;
       IF o.fulfillment_status NOT IN ('unfulfilled', 'allocated', 'processing') THEN
         RAISE EXCEPTION 'A confirmation can be voided only before shipment (the order is %).', o.fulfillment_status USING ERRCODE = 'P0005';
       END IF;
       restored := vc_restore_order_locked(p_order_id, p_actor, 'Payment confirmation voided for ' || o.reference);
       UPDATE orders SET payment_status = 'pending', fulfillment_status = 'unfulfilled', payment_reference = NULL, payment_amount_received = NULL,
              payment_received_on = NULL, payment_confirmed_by = NULL, payment_confirmed_at = NULL, payment_source = NULL, paid_at = NULL,
              stock_decremented = FALSE, needs_review = FALSE, review_reason = NULL, review_opened_at = NULL
        WHERE id = p_order_id;
       PERFORM vc_order_event(p_order_id, 'payment_confirmation_voided', p_actor, 'admin', 'confirmed', 'pending', o.fulfillment_status, 'unfulfilled',
               jsonb_build_object('reason', p_reason, 'voided_reference', o.payment_reference, 'voided_amount', o.payment_amount_received,
                                  'originally_confirmed_by', o.payment_confirmed_by, 'originally_confirmed_at', o.payment_confirmed_at,
                                  'allocations_restored', restored));
       RETURN jsonb_build_object('outcome', 'voided', 'restored', restored);
     END $$`,

  // Fulfillment steps. Shipping requires confirmed payment (or ACH processing under "fulfil after initiation"), no
  // open review, and every lot the order was filled from still approved.
  `CREATE OR REPLACE FUNCTION vc_order_advance(p_order_id text, p_next text, p_actor text, p_carrier text, p_tracking text, p_allow_processing boolean)
     RETURNS jsonb LANGUAGE plpgsql AS $$
     DECLARE o orders%ROWTYPE; bad text; t text := vc_now();
     BEGIN
       SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
       IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.' USING ERRCODE = 'P0002'; END IF;
       IF o.fulfillment_status = p_next THEN RETURN jsonb_build_object('outcome', 'unchanged'); END IF;
       IF NOT ((o.fulfillment_status = 'allocated' AND p_next IN ('processing', 'shipped'))
            OR (o.fulfillment_status = 'processing' AND p_next = 'shipped')
            OR (o.fulfillment_status = 'shipped' AND p_next = 'delivered')) THEN
         RAISE EXCEPTION 'Can''t move an order from % to %.', o.fulfillment_status, p_next USING ERRCODE = 'P0005';
       END IF;
       IF o.needs_review THEN RAISE EXCEPTION 'Resolve the open review first: %', o.review_reason USING ERRCODE = 'P0005'; END IF;
       IF p_next IN ('processing', 'shipped') AND NOT (o.payment_status = 'confirmed' OR (p_allow_processing AND o.payment_status = 'processing')) THEN
         RAISE EXCEPTION 'Payment is % — the order can''t be fulfilled yet.', o.payment_status USING ERRCODE = 'P0005';
       END IF;
       IF p_next = 'shipped' THEN
         IF p_tracking IS NULL OR length(trim(p_tracking)) = 0 THEN RAISE EXCEPTION 'Enter the tracking number to mark the order shipped.' USING ERRCODE = 'P0004'; END IF;
         SELECT string_agg(DISTINCT l.lot_code || ' (' || l.release_status || ')', ', ') INTO bad
           FROM inventory_allocations a JOIN inventory_lots l ON l.id = a.lot_id
          WHERE a.order_id = p_order_id AND a.state = 'committed' AND NOT vc_lot_eligible(l.release_status, l.testing_status, l.expires_on);
         IF bad IS NOT NULL THEN RAISE EXCEPTION 'Can''t ship from lots that are no longer approved: %. Reallocate the order to approved lots first.', bad USING ERRCODE = 'P0005'; END IF;
       END IF;
       UPDATE orders SET fulfillment_status = p_next,
              processing_at = CASE WHEN p_next = 'processing' THEN t ELSE processing_at END,
              shipped_at = CASE WHEN p_next = 'shipped' THEN t ELSE shipped_at END,
              delivered_at = CASE WHEN p_next = 'delivered' THEN t ELSE delivered_at END,
              carrier = CASE WHEN p_next = 'shipped' THEN NULLIF(trim(COALESCE(p_carrier, '')), '') ELSE carrier END,
              tracking_number = CASE WHEN p_next = 'shipped' THEN trim(p_tracking) ELSE tracking_number END
        WHERE id = p_order_id;
       PERFORM vc_order_event(p_order_id, 'fulfillment_' || p_next, p_actor, 'admin', o.payment_status, o.payment_status, o.fulfillment_status, p_next,
               jsonb_build_object('carrier', p_carrier, 'tracking_number', p_tracking));
       RETURN jsonb_build_object('outcome', p_next);
     END $$`,

  // Controlled reallocation (Stage 3 final corrections). For an order not yet shipped whose deducted stock sits in a
  // lot that is no longer eligible (quarantined, rejected, failed, expired): in ONE call, each such allocation's units
  // go back into the lot they came from (physically they never left the shelf; the lot keeps its status), and the
  // same quantity is deducted FIFO from approved lots of the SAME strength. The old allocation stays (state
  // 'restored', with the reason); each new one records which it replaced. If approved stock can't cover it, nothing
  // moves and the order is held in Administrative Review. Never touches a lot that isn't eligible.
  `CREATE OR REPLACE FUNCTION vc_order_reallocate(p_order_id text, p_actor text, p_reason text) RETURNS jsonb LANGUAGE plpgsql AS $$
     DECLARE o orders%ROWTYPE; ids text[]; a record; l record; need int; take int; avail int; nid text; moved jsonb := '[]'::jsonb; msg text;
             t text := vc_now(); n int := 0;
     BEGIN
       IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
         RAISE EXCEPTION 'Give the reason for the reallocation (at least 10 characters).' USING ERRCODE = 'P0004';
       END IF;
       ids := vc_order_strengths(p_order_id);
       PERFORM vc_lock_strengths(ids);
       SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
       IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.' USING ERRCODE = 'P0002'; END IF;
       IF o.fulfillment_status NOT IN ('allocated', 'processing') THEN
         RAISE EXCEPTION 'Only an order whose stock is allocated and not yet shipped can be reallocated (this one is %).', o.fulfillment_status USING ERRCODE = 'P0005';
       END IF;
       IF NOT EXISTS (SELECT 1 FROM inventory_allocations al JOIN inventory_lots lt ON lt.id = al.lot_id
                       WHERE al.order_id = p_order_id AND al.state = 'committed' AND NOT vc_lot_eligible(lt.release_status, lt.testing_status, lt.expires_on)) THEN
         RAISE EXCEPTION 'Every lot this order was filled from is still approved: nothing to reallocate.' USING ERRCODE = 'P0005';
       END IF;
       BEGIN
         FOR a IN SELECT al.* FROM inventory_allocations al JOIN inventory_lots lt ON lt.id = al.lot_id
                   WHERE al.order_id = p_order_id AND al.state = 'committed' AND NOT vc_lot_eligible(lt.release_status, lt.testing_status, lt.expires_on)
                   ORDER BY al.line_index, al.created_at LOOP
           PERFORM vc_inv_move(a.strength_id, a.lot_id, 'reallocated_out', a.quantity, 0, a.quantity, 0,
                   'Reallocation of ' || o.reference || ' away from ' || a.lot_code || ': ' || p_reason, NULL, p_actor, o.reference, o.id,
                   'alloc:' || a.id || ':reallocated');
           UPDATE inventory_allocations SET state = 'restored', restored_at = t, restored_by = p_actor, restore_reason = 'Reallocated: ' || p_reason WHERE id = a.id;
           need := a.quantity;
           FOR l IN SELECT * FROM inventory_lots
                     WHERE strength_id = a.strength_id AND vc_lot_eligible(release_status, testing_status, expires_on) AND physical_quantity - reserved_quantity > 0
                     ORDER BY received_at, id LOOP
             EXIT WHEN need = 0;
             SELECT physical_quantity - reserved_quantity INTO avail FROM inventory_lots WHERE id = l.id;
             take := LEAST(need, avail);
             CONTINUE WHEN take <= 0;
             nid := gen_random_uuid()::text;
             PERFORM vc_inv_move(a.strength_id, l.id, 'reallocated_in', -take, 0, -take, 0,
                     'Reallocation of ' || o.reference || ' from ' || a.lot_code || ' to ' || l.lot_code || ': ' || p_reason, NULL, p_actor, o.reference, o.id,
                     'alloc:' || nid || ':deducted');
             INSERT INTO inventory_allocations (id, order_id, order_reference, line_index, strength_id, sku, lot_id, lot_code, quantity, state, created_at, created_by, committed_at, replaces_allocation_id)
             VALUES (nid, o.id, o.reference, a.line_index, a.strength_id, a.sku, l.id, l.lot_code, take, 'committed', t, p_actor, t, a.id);
             moved := moved || jsonb_build_object('line', a.line_index + 1, 'sku', a.sku, 'from', a.lot_code, 'to', l.lot_code, 'quantity', take);
             need := need - take;
           END LOOP;
           IF need > 0 THEN
             RAISE EXCEPTION 'Not enough approved stock of % to replace % unit(s) from lot %.', a.sku, need, a.lot_code USING ERRCODE = 'P0003';
           END IF;
           n := n + 1;
         END LOOP;
       EXCEPTION WHEN SQLSTATE 'P0003' THEN
         GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
         -- Same hold continues (e.g. the quarantine that caused it): keep its opening time, so the customer is not sent the
         -- same hold message a second time (notifications are keyed by it).
         UPDATE orders SET needs_review = TRUE, review_reason = 'Reallocation needed: ' || msg,
                review_opened_at = CASE WHEN needs_review AND review_reason LIKE 'Reallocation needed:%' THEN review_opened_at ELSE t END
          WHERE id = p_order_id;
         PERFORM vc_order_event(p_order_id, 'reallocation_failed', p_actor, 'admin', o.payment_status, o.payment_status, o.fulfillment_status, o.fulfillment_status,
                 jsonb_build_object('reason', p_reason, 'error', msg));
         RETURN jsonb_build_object('outcome', 'on_hold', 'review', 'Reallocation needed: ' || msg);
       END;
       UPDATE orders SET needs_review = FALSE, review_reason = NULL, review_opened_at = NULL
        WHERE id = p_order_id AND needs_review AND review_reason LIKE 'Reallocation needed:%';
       PERFORM vc_order_event(p_order_id, 'stock_reallocated', p_actor, 'admin', o.payment_status, o.payment_status, o.fulfillment_status, o.fulfillment_status,
               jsonb_build_object('reason', p_reason, 'moves', moved, 'allocations_replaced', n));
       RETURN jsonb_build_object('outcome', 'reallocated', 'moves', moved);
     END $$`,

  // An administrator releases one reservation (Executive Office → Reservations). The order keeps its payment state
  // but holds nothing; a payment that arrives later goes to review.
  `CREATE OR REPLACE FUNCTION vc_allocation_release(p_alloc_id text, p_actor text, p_reason text) RETURNS jsonb LANGUAGE plpgsql AS $$
     DECLARE a inventory_allocations%ROWTYPE; o orders%ROWTYPE; ids text[]; left_live int;
     BEGIN
       IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'A reason is required.' USING ERRCODE = 'P0004'; END IF;
       SELECT * INTO a FROM inventory_allocations WHERE id = p_alloc_id;
       IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found.' USING ERRCODE = 'P0002'; END IF;
       ids := vc_order_strengths(a.order_id);
       PERFORM vc_lock_strengths(ids);
       SELECT * INTO o FROM orders WHERE id = a.order_id FOR UPDATE;
       IF NOT vc_release_allocation_locked(p_alloc_id, p_actor, 'Released by administrator: ' || p_reason) THEN
         RETURN jsonb_build_object('outcome', 'not_reserved');
       END IF;
       SELECT count(*) INTO left_live FROM inventory_allocations WHERE order_id = a.order_id AND state = 'reserved';
       IF left_live = 0 AND o.fulfillment_status = 'reserved' THEN UPDATE orders SET fulfillment_status = 'unfulfilled' WHERE id = a.order_id; END IF;
       PERFORM vc_order_event(a.order_id, 'reservation_released', p_actor, 'admin', o.payment_status, o.payment_status, o.fulfillment_status,
               CASE WHEN left_live = 0 AND o.fulfillment_status = 'reserved' THEN 'unfulfilled' ELSE o.fulfillment_status END,
               jsonb_build_object('allocation_id', a.id, 'sku', a.sku, 'lot', a.lot_code, 'quantity', a.quantity, 'reason', p_reason, 'expires_at', a.expires_at));
       RETURN jsonb_build_object('outcome', 'released');
     END $$`,

  // A return of shipped goods with an explicit restocking decision. restock → back into the lot it shipped from
  // (sellable only if that lot is approved); quarantine → the strength's returns lot (not sellable); discard → no
  // stock change. Recorded in order_returns either way.
  `CREATE OR REPLACE FUNCTION vc_order_return(p_order_id text, p_line int, p_alloc_id text, p_qty int, p_condition text, p_decision text,
       p_actor text, p_reason text, p_key text) RETURNS jsonb LANGUAGE plpgsql AS $$
     DECLARE o orders%ROWTYPE; a inventory_allocations%ROWTYPE; ids text[]; sid text; to_lot text; ln record; prior int; rid text := gen_random_uuid()::text;
             all_back boolean; t text := vc_now();
     BEGIN
       IF EXISTS (SELECT 1 FROM order_returns WHERE idempotency_key = p_key) THEN RETURN jsonb_build_object('outcome', 'duplicate'); END IF;
       IF p_decision NOT IN ('restock', 'quarantine', 'discard') THEN RAISE EXCEPTION 'Choose restock, quarantine or discard.' USING ERRCODE = 'P0004'; END IF;
       IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'Enter how many units came back.' USING ERRCODE = 'P0004'; END IF;
       ids := vc_order_strengths(p_order_id);
       PERFORM vc_lock_strengths(ids);
       SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
       IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.' USING ERRCODE = 'P0002'; END IF;
       IF EXISTS (SELECT 1 FROM order_returns WHERE idempotency_key = p_key) THEN RETURN jsonb_build_object('outcome', 'duplicate'); END IF;
       IF o.fulfillment_status NOT IN ('shipped', 'delivered', 'returned') THEN
         RAISE EXCEPTION 'Returns are recorded for shipped orders (this one is %). Cancel it instead.', o.fulfillment_status USING ERRCODE = 'P0005';
       END IF;
       IF p_alloc_id IS NOT NULL THEN
         SELECT * INTO a FROM inventory_allocations WHERE id = p_alloc_id AND order_id = p_order_id AND state = 'committed' FOR UPDATE;
         IF NOT FOUND THEN RAISE EXCEPTION 'That shipped lot is not on this order.' USING ERRCODE = 'P0002'; END IF;
         IF a.returned_quantity + p_qty > a.quantity THEN
           RAISE EXCEPTION 'Only % unit(s) from lot % are still out on this order.', a.quantity - a.returned_quantity, a.lot_code USING ERRCODE = 'P0004';
         END IF;
         sid := a.strength_id;
         UPDATE inventory_allocations SET returned_quantity = returned_quantity + p_qty WHERE id = a.id;
       ELSE
         -- Pre-Stage-3 orders carry no lot allocation: the line's quantity bounds the return.
         SELECT * INTO ln FROM vc_order_lines(p_order_id) WHERE line_index = p_line;
         IF ln.strength_id IS NULL THEN RAISE EXCEPTION 'That line is not on this order.' USING ERRCODE = 'P0002'; END IF;
         IF EXISTS (SELECT 1 FROM inventory_allocations WHERE order_id = p_order_id AND line_index = p_line) THEN
           RAISE EXCEPTION 'Choose which lot the units came back from.' USING ERRCODE = 'P0004';
         END IF;
         SELECT COALESCE(SUM(quantity), 0) INTO prior FROM order_returns WHERE order_id = p_order_id AND line_index = p_line;
         IF prior + p_qty > ln.quantity THEN RAISE EXCEPTION 'Only % unit(s) of that line are still out.', ln.quantity - prior USING ERRCODE = 'P0004'; END IF;
         sid := ln.strength_id;
         IF p_decision = 'restock' THEN p_decision := 'quarantine'; END IF;  -- no lot to put them back into: hold for inspection
       END IF;
       IF p_decision = 'restock' THEN
         to_lot := a.lot_id;
         PERFORM vc_inv_move(sid, to_lot, 'return_restocked', p_qty, 0, p_qty, 0, 'Return on ' || o.reference || ': ' || p_reason, p_condition, p_actor, o.reference, o.id, 'return:' || p_key);
       ELSIF p_decision = 'quarantine' THEN
         to_lot := vc_holding_lot(sid, 'returns', p_actor);
         PERFORM vc_inv_move(sid, to_lot, 'return_quarantined', p_qty, 0, p_qty, 0, 'Return on ' || o.reference || ' held for inspection: ' || p_reason, p_condition, p_actor, o.reference, o.id, 'return:' || p_key);
       END IF;
       INSERT INTO order_returns (id, order_id, order_reference, line_index, allocation_id, strength_id, from_lot_id, to_lot_id, quantity, condition, decision, reason, decided_by, idempotency_key, created_at)
       VALUES (rid, o.id, o.reference, COALESCE(a.line_index, p_line), a.id, sid, a.lot_id, to_lot, p_qty, p_condition, p_decision, p_reason, p_actor, p_key, t);
       SELECT NOT EXISTS (
         SELECT 1 FROM vc_order_lines(p_order_id) l2
          WHERE l2.quantity > (SELECT COALESCE(SUM(r.quantity), 0) FROM order_returns r WHERE r.order_id = p_order_id AND r.line_index = l2.line_index)) INTO all_back;
       UPDATE orders SET fulfillment_status = CASE WHEN all_back THEN 'returned' ELSE fulfillment_status END,
              returned_at = CASE WHEN all_back THEN t ELSE returned_at END WHERE id = p_order_id;
       PERFORM vc_order_event(p_order_id, 'return_recorded', p_actor, 'admin', o.payment_status, o.payment_status, o.fulfillment_status,
               CASE WHEN all_back THEN 'returned' ELSE o.fulfillment_status END,
               jsonb_build_object('line', COALESCE(a.line_index, p_line), 'lot', a.lot_code, 'quantity', p_qty, 'condition', p_condition, 'decision', p_decision, 'reason', p_reason));
       RETURN jsonb_build_object('outcome', 'recorded', 'decision', p_decision, 'all_returned', all_back);
     END $$`,

  // --- Lots ---------------------------------------------------------------------------------------------------
  `CREATE OR REPLACE FUNCTION vc_lot_receive(p_strength text, p_qty int, p_manufacturer_lot text, p_vericert_lot text, p_received_at text,
       p_manufactured_on date, p_expires_on date, p_notes text, p_actor text, p_key text) RETURNS jsonb LANGUAGE plpgsql AS $$
     DECLARE s product_strengths%ROWTYPE; lid text; code text; t text := vc_now(); existing text;
     BEGIN
       IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'Enter the number of units received (at least 1).' USING ERRCODE = 'P0004'; END IF;
       PERFORM vc_lock_strengths(ARRAY[p_strength]);
       SELECT lot_id INTO existing FROM inventory_movements WHERE idempotency_key = 'lot:' || p_key || ':received';
       IF FOUND THEN RETURN jsonb_build_object('outcome', 'duplicate', 'lot_id', existing); END IF;
       SELECT * INTO s FROM product_strengths WHERE id = p_strength;
       IF NOT FOUND THEN RAISE EXCEPTION 'Strength not found.' USING ERRCODE = 'P0002'; END IF;
       lid := gen_random_uuid()::text;
       code := 'LOT-' || lpad(nextval('inventory_lot_seq')::text, 5, '0');
       INSERT INTO inventory_lots (id, lot_code, strength_id, sku, product_slug, kind, manufacturer_lot, vericert_lot_number, received_quantity,
              received_at, manufactured_on, expires_on, notes, created_at, created_by, updated_at)
       VALUES (lid, code, p_strength, s.sku, s.product_slug, 'received', NULLIF(trim(p_manufacturer_lot), ''), NULLIF(trim(p_vericert_lot), ''), p_qty,
              COALESCE(p_received_at, t), p_manufactured_on, p_expires_on, p_notes, t, p_actor, t);
       PERFORM vc_inv_move(p_strength, lid, 'stock_received', p_qty, 0, p_qty, 0, 'Received into new lot ' || code, p_notes, p_actor, NULL, NULL, 'lot:' || p_key || ':received');
       RETURN jsonb_build_object('outcome', 'received', 'lot_id', lid, 'lot_code', code);
     END $$`,

  // Moves units out of one lot into a new one (e.g. splitting the reconciliation lot into the real lots once their
  // batch numbers are known). The SKU total does not change.
  `CREATE OR REPLACE FUNCTION vc_lot_split(p_from_lot text, p_qty int, p_manufacturer_lot text, p_vericert_lot text, p_received_at text,
       p_manufactured_on date, p_expires_on date, p_notes text, p_actor text, p_reason text, p_key text) RETURNS jsonb LANGUAGE plpgsql AS $$
     DECLARE f inventory_lots%ROWTYPE; lid text; code text; t text := vc_now(); existing text;
     BEGIN
       IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'Enter the number of units to move (at least 1).' USING ERRCODE = 'P0004'; END IF;
       IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'A reason is required.' USING ERRCODE = 'P0004'; END IF;
       SELECT * INTO f FROM inventory_lots WHERE id = p_from_lot;
       IF NOT FOUND THEN RAISE EXCEPTION 'Lot not found.' USING ERRCODE = 'P0002'; END IF;
       PERFORM vc_lock_strengths(ARRAY[f.strength_id]);
       SELECT lot_id INTO existing FROM inventory_movements WHERE idempotency_key = 'lot:' || p_key || ':in';
       IF FOUND THEN RETURN jsonb_build_object('outcome', 'duplicate', 'lot_id', existing); END IF;
       lid := gen_random_uuid()::text;
       code := 'LOT-' || lpad(nextval('inventory_lot_seq')::text, 5, '0');
       INSERT INTO inventory_lots (id, lot_code, strength_id, sku, product_slug, kind, manufacturer_lot, vericert_lot_number, received_quantity,
              received_at, manufactured_on, expires_on, notes, created_at, created_by, updated_at)
       VALUES (lid, code, f.strength_id, f.sku, f.product_slug, 'received', NULLIF(trim(p_manufacturer_lot), ''), NULLIF(trim(p_vericert_lot), ''), p_qty,
              COALESCE(p_received_at, f.received_at), p_manufactured_on, p_expires_on, p_notes, t, p_actor, t);
       PERFORM vc_inv_move(f.strength_id, f.id, 'lot_transfer_out', 0, 0, -p_qty, 0, 'Moved ' || p_qty || ' to new lot ' || code || ': ' || p_reason, NULL, p_actor, NULL, NULL, 'lot:' || p_key || ':out');
       PERFORM vc_inv_move(f.strength_id, lid, 'lot_transfer_in', 0, 0, p_qty, 0, 'Moved ' || p_qty || ' from ' || f.lot_code || ': ' || p_reason, NULL, p_actor, NULL, NULL, 'lot:' || p_key || ':in');
       RETURN jsonb_build_object('outcome', 'split', 'lot_id', lid, 'lot_code', code);
     END $$`,

  // Units received into / removed from an existing lot, or a physical count of one lot.
  `CREATE OR REPLACE FUNCTION vc_lot_adjust(p_lot text, p_type text, p_qty int, p_expected_version int, p_reason text, p_note text, p_actor text, p_key text)
     RETURNS inventory_movements LANGUAGE plpgsql AS $$
     DECLARE l inventory_lots%ROWTYPE; d int; m inventory_movements%ROWTYPE;
     BEGIN
       SELECT * INTO l FROM inventory_lots WHERE id = p_lot;
       IF NOT FOUND THEN RAISE EXCEPTION 'Lot not found.' USING ERRCODE = 'P0002'; END IF;
       PERFORM vc_lock_strengths(ARRAY[l.strength_id]);
       SELECT * INTO m FROM inventory_movements WHERE idempotency_key = p_key;
       IF FOUND THEN RETURN m; END IF;
       SELECT * INTO l FROM inventory_lots WHERE id = p_lot;
       IF p_type = 'stock_received' THEN d := p_qty;
       ELSIF p_type = 'stock_removed' THEN d := -p_qty;
       ELSIF p_type = 'count_correction' THEN
         IF p_expected_version IS NOT NULL AND l.version <> p_expected_version THEN
           RAISE EXCEPTION 'This lot changed since you opened it. Reload to see the current count, then try again. Nothing was changed.' USING ERRCODE = 'P0006';
         END IF;
         IF p_qty < l.reserved_quantity THEN
           RAISE EXCEPTION 'The count can''t be below the % reserved in this lot. Nothing was changed.', l.reserved_quantity USING ERRCODE = 'P0003';
         END IF;
         d := p_qty - l.physical_quantity;
       ELSE RAISE EXCEPTION 'Unknown adjustment.' USING ERRCODE = 'P0004';
       END IF;
       IF p_type = 'stock_removed' AND l.physical_quantity - l.reserved_quantity < p_qty THEN
         RAISE EXCEPTION 'Only % available to remove from lot % (physical %, reserved %). Nothing was changed.',
           l.physical_quantity - l.reserved_quantity, l.lot_code, l.physical_quantity, l.reserved_quantity USING ERRCODE = 'P0003';
       END IF;
       RETURN vc_inv_move(l.strength_id, l.id, p_type, d, 0, d, 0, p_reason, p_note, p_actor, NULL, NULL, p_key);
     END $$`,

  // Testing / release status (and descriptive fields) of a lot. Approving needs a passed test or a written
  // justification; the reconciliation lot always needs one. Recorded as a zero-quantity movement.
  `CREATE OR REPLACE FUNCTION vc_lot_update(p_lot text, p_release text, p_testing text, p_manufacturer_lot text, p_vericert_lot text,
       p_manufactured_on date, p_expires_on date, p_notes text, p_reason text, p_actor text, p_key text) RETURNS jsonb LANGUAGE plpgsql AS $$
     DECLARE l inventory_lots%ROWTYPE; rel text; tst text; changes text[] := '{}'; t text := vc_now(); held record; flagged int := 0; held_ids text[] := '{}';
     BEGIN
       SELECT * INTO l FROM inventory_lots WHERE id = p_lot;
       IF NOT FOUND THEN RAISE EXCEPTION 'Lot not found.' USING ERRCODE = 'P0002'; END IF;
       PERFORM vc_lock_strengths(ARRAY[l.strength_id]);
       IF EXISTS (SELECT 1 FROM inventory_movements WHERE idempotency_key = 'lot:' || p_key || ':update') THEN RETURN jsonb_build_object('outcome', 'duplicate'); END IF;
       SELECT * INTO l FROM inventory_lots WHERE id = p_lot FOR UPDATE;
       rel := COALESCE(p_release, l.release_status); tst := COALESCE(p_testing, l.testing_status);
       IF rel = 'approved' AND tst = 'failed' THEN RAISE EXCEPTION 'A lot that failed testing can''t be approved.' USING ERRCODE = 'P0004'; END IF;
       -- Owner decision D4 (2026-11-18): the VeriCert lot number is what a customer verifies against, so a lot can never
       -- be approved (made sellable) without one — whatever its testing status, and including the reconciliation lot.
       IF rel = 'approved' AND l.release_status <> 'approved' AND COALESCE(NULLIF(trim(p_vericert_lot), ''), l.vericert_lot_number) IS NULL THEN
         RAISE EXCEPTION 'A lot can''t be approved without a VeriCert lot number. Enter the VeriCert lot number first.' USING ERRCODE = 'P0004';
       END IF;
       IF rel = 'approved' AND l.release_status <> 'approved' AND (tst <> 'passed' OR l.kind <> 'received')
          AND (p_reason IS NULL OR length(trim(p_reason)) < 10) THEN
         RAISE EXCEPTION 'Approving a lot that has not passed testing (or the reconciliation/returns lot) needs a written justification of at least 10 characters.' USING ERRCODE = 'P0004';
       END IF;
       IF rel <> l.release_status THEN changes := changes || ('release ' || l.release_status || ' → ' || rel); END IF;
       IF tst <> l.testing_status THEN changes := changes || ('testing ' || l.testing_status || ' → ' || tst); END IF;
       IF p_manufacturer_lot IS DISTINCT FROM l.manufacturer_lot AND p_manufacturer_lot IS NOT NULL THEN changes := changes || ('manufacturer lot → ' || p_manufacturer_lot); END IF;
       IF p_vericert_lot IS DISTINCT FROM l.vericert_lot_number AND p_vericert_lot IS NOT NULL THEN changes := changes || ('VeriCert lot → ' || p_vericert_lot); END IF;
       IF p_manufactured_on IS DISTINCT FROM l.manufactured_on AND p_manufactured_on IS NOT NULL THEN changes := changes || ('manufactured ' || p_manufactured_on); END IF;
       IF p_expires_on IS DISTINCT FROM l.expires_on AND p_expires_on IS NOT NULL THEN changes := changes || ('expires ' || p_expires_on); END IF;
       IF p_notes IS DISTINCT FROM l.notes AND p_notes IS NOT NULL THEN changes := changes || 'notes edited'::text; END IF;
       IF cardinality(changes) = 0 THEN RETURN jsonb_build_object('outcome', 'unchanged'); END IF;
       UPDATE inventory_lots SET release_status = rel, testing_status = tst,
              manufacturer_lot = COALESCE(NULLIF(trim(p_manufacturer_lot), ''), manufacturer_lot),
              vericert_lot_number = COALESCE(NULLIF(trim(p_vericert_lot), ''), vericert_lot_number),
              manufactured_on = COALESCE(p_manufactured_on, manufactured_on), expires_on = COALESCE(p_expires_on, expires_on),
              notes = COALESCE(p_notes, notes),
              release_changed_at = CASE WHEN rel <> l.release_status THEN t ELSE release_changed_at END,
              release_changed_by = CASE WHEN rel <> l.release_status THEN p_actor ELSE release_changed_by END,
              release_reason = CASE WHEN rel <> l.release_status THEN p_reason ELSE release_reason END,
              version = version + 1, updated_at = t
        WHERE id = p_lot;
       PERFORM vc_inv_move(l.strength_id, l.id, CASE WHEN rel <> l.release_status OR tst <> l.testing_status THEN 'lot_status' ELSE 'lot_updated' END,
               0, 0, 0, 0, 'Lot ' || l.lot_code || ': ' || array_to_string(changes, '; '), p_reason, p_actor, NULL, NULL, 'lot:' || p_key || ':update');
       -- A lot that stops being eligible puts every unshipped order filled from it on hold, so nobody ships it by
       -- mistake and the order shows up as needing a decision (reallocate, or re-approve the lot).
       IF vc_lot_eligible(l.release_status, l.testing_status, l.expires_on)
          AND NOT vc_lot_eligible(rel, tst, COALESCE(p_expires_on, l.expires_on)) THEN
         FOR held IN SELECT DISTINCT o.id, o.payment_status, o.fulfillment_status FROM inventory_allocations al JOIN orders o ON o.id = al.order_id
                      WHERE al.lot_id = l.id AND al.state = 'committed' AND o.fulfillment_status IN ('allocated', 'processing') AND NOT o.needs_review LOOP
           UPDATE orders SET needs_review = TRUE, review_opened_at = t,
                  review_reason = 'Reallocation needed: lot ' || l.lot_code || ' is now ' || rel || CASE WHEN tst = 'failed' THEN ' (failed testing)' ELSE '' END || '.'
            WHERE id = held.id;
           PERFORM vc_order_event(held.id, 'review_opened', p_actor, 'system', held.payment_status, held.payment_status, held.fulfillment_status, held.fulfillment_status,
                   jsonb_build_object('reason', 'Lot ' || l.lot_code || ' no longer eligible', 'lot', l.lot_code, 'release', rel, 'testing', tst));
           flagged := flagged + 1;
           held_ids := held_ids || held.id;
         END LOOP;
       ELSIF NOT vc_lot_eligible(l.release_status, l.testing_status, l.expires_on)
          AND vc_lot_eligible(rel, tst, COALESCE(p_expires_on, l.expires_on)) THEN
         -- The lot is eligible again: lift the automatic "reallocation needed" holds it caused, for orders whose every
         -- allocated lot is now eligible (recorded in each order's history). Holds with any other reason stay.
         FOR held IN SELECT DISTINCT o.id, o.payment_status, o.fulfillment_status, o.review_reason FROM inventory_allocations al JOIN orders o ON o.id = al.order_id
                      WHERE al.lot_id = l.id AND al.state = 'committed' AND o.needs_review AND o.review_reason LIKE 'Reallocation needed: lot %'
                        AND NOT EXISTS (SELECT 1 FROM inventory_allocations a2 JOIN inventory_lots l2 ON l2.id = a2.lot_id
                                         WHERE a2.order_id = o.id AND a2.state = 'committed' AND a2.lot_id <> l.id
                                           AND NOT vc_lot_eligible(l2.release_status, l2.testing_status, l2.expires_on)) LOOP
           UPDATE orders SET needs_review = FALSE, review_reason = NULL, review_opened_at = NULL WHERE id = held.id;
           PERFORM vc_order_event(held.id, 'review_closed', p_actor, 'system', held.payment_status, held.payment_status, held.fulfillment_status, held.fulfillment_status,
                   jsonb_build_object('reason', 'Lot ' || l.lot_code || ' eligible again', 'previous_review', held.review_reason));
         END LOOP;
       END IF;
       RETURN jsonb_build_object('outcome', 'updated', 'changes', to_jsonb(changes), 'orders_on_hold', flagged, 'held_orders', to_jsonb(held_ids));
     END $$`,
];

export const TRIGGERS = [
  `CREATE TRIGGER orders_derive_status BEFORE INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION vc_orders_derive_status()`,
  `CREATE CONSTRAINT TRIGGER strength_inventory_reconciled AFTER INSERT OR UPDATE ON strength_inventory DEFERRABLE INITIALLY DEFERRED
     FOR EACH ROW EXECUTE FUNCTION vc_inventory_reconcile_check()`,
  `CREATE CONSTRAINT TRIGGER inventory_lots_reconciled AFTER INSERT OR UPDATE ON inventory_lots DEFERRABLE INITIALLY DEFERRED
     FOR EACH ROW EXECUTE FUNCTION vc_inventory_reconcile_check()`,
  `CREATE CONSTRAINT TRIGGER inventory_allocations_reconciled AFTER INSERT OR UPDATE ON inventory_allocations DEFERRABLE INITIALLY DEFERRED
     FOR EACH ROW EXECUTE FUNCTION vc_inventory_reconcile_check()`,
  `CREATE TRIGGER inventory_lots_no_delete BEFORE DELETE ON inventory_lots FOR EACH ROW EXECUTE FUNCTION vc_append_only()`,
  `CREATE TRIGGER inventory_allocations_no_delete BEFORE DELETE ON inventory_allocations FOR EACH ROW EXECUTE FUNCTION vc_append_only()`,
  `CREATE TRIGGER order_events_append_only BEFORE UPDATE OR DELETE ON order_events FOR EACH ROW EXECUTE FUNCTION vc_append_only()`,
  `CREATE TRIGGER order_returns_append_only BEFORE UPDATE OR DELETE ON order_returns FOR EACH ROW EXECUTE FUNCTION vc_append_only()`,
  `CREATE TRIGGER order_refunds_append_only BEFORE UPDATE OR DELETE ON order_refunds FOR EACH ROW EXECUTE FUNCTION vc_append_only()`,
];
