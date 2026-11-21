// Website Refinements Package 1 — blend composition schema (owner-approved 2026-11-20: two new tables, nothing
// existing changed). Used by scripts/refinements1-blends.mjs and the local tests.
//
// blend_compositions  one row per blend STRENGTH (its permanent strength id): the declared total in mg.
// blend_components    the ingredients of that strength: each references a catalog product by its permanent product
//                     id (products.slug — the products table's primary key, which never changes), with an amount in
//                     mg and a display position.
//
// The database itself refuses an invalid composition, whatever writes it:
// - amounts and the declared total must be positive; positions are 0..n-1 with no gaps or duplicates;
// - a compound appears at most once in a blend, and a blend can't list itself;
// - the blend product named on the row must be the strength's own product;
// - ingredient amounts must add up to the declared total, checked at COMMIT (deferred), so a save that replaces every
//   ingredient is judged on its end state;
// - a product used as an ingredient can't be deleted while it is (ON DELETE RESTRICT).
// Nothing here touches stock: a blend is its own SKU, and saving a composition moves no inventory.

export const SCHEMA = [
  `CREATE TABLE blend_compositions (
     blend_strength_id TEXT PRIMARY KEY REFERENCES product_strengths(id) ON DELETE RESTRICT,
     blend_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE RESTRICT,
     declared_total_mg NUMERIC(10,3) NOT NULL CHECK (declared_total_mg > 0),
     version INTEGER NOT NULL DEFAULT 1,
     created_at TEXT NOT NULL,
     created_by TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     updated_by TEXT NOT NULL
   )`,
  `CREATE TABLE blend_components (
     id TEXT PRIMARY KEY,
     blend_strength_id TEXT NOT NULL REFERENCES blend_compositions(blend_strength_id) ON DELETE CASCADE,
     component_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE RESTRICT,
     amount_mg NUMERIC(10,3) NOT NULL CHECK (amount_mg > 0),
     position INTEGER NOT NULL CHECK (position >= 0),
     CONSTRAINT blend_components_unique_compound UNIQUE (blend_strength_id, component_slug),
     CONSTRAINT blend_components_unique_position UNIQUE (blend_strength_id, position) DEFERRABLE INITIALLY DEFERRED
   )`,
  `CREATE INDEX blend_components_component ON blend_components (component_slug)`,
];

export const FUNCTIONS = [
  `CREATE OR REPLACE FUNCTION vc_blend_composition_check() RETURNS trigger LANGUAGE plpgsql AS $$
     DECLARE sid text; c blend_compositions%ROWTYPE; owner_slug text; total numeric; n int; maxpos int; self int;
     BEGIN
       sid := COALESCE(NEW.blend_strength_id, OLD.blend_strength_id);
       SELECT * INTO c FROM blend_compositions WHERE blend_strength_id = sid;
       IF NOT FOUND THEN RETURN NULL; END IF;  -- the whole composition was removed
       SELECT product_slug INTO owner_slug FROM product_strengths WHERE id = sid;
       IF owner_slug IS DISTINCT FROM c.blend_slug THEN
         RAISE EXCEPTION 'Blend composition: strength % belongs to %, not %.', sid, owner_slug, c.blend_slug USING ERRCODE = 'P0004';
       END IF;
       SELECT count(*), COALESCE(sum(amount_mg), 0), COALESCE(max(position), -1), count(*) FILTER (WHERE component_slug = c.blend_slug)
         INTO n, total, maxpos, self FROM blend_components WHERE blend_strength_id = sid;
       IF n = 0 THEN RAISE EXCEPTION 'Blend composition: a composition needs at least one ingredient.' USING ERRCODE = 'P0004'; END IF;
       IF self > 0 THEN RAISE EXCEPTION 'Blend composition: a blend can''t list itself as an ingredient.' USING ERRCODE = 'P0004'; END IF;
       IF maxpos <> n - 1 THEN RAISE EXCEPTION 'Blend composition: ingredient positions must run 0 to % without gaps.', n - 1 USING ERRCODE = 'P0004'; END IF;
       IF total <> c.declared_total_mg THEN
         RAISE EXCEPTION 'Blend composition: ingredients add up to % mg, but the declared total is % mg.', total, c.declared_total_mg USING ERRCODE = 'P0004';
       END IF;
       RETURN NULL;
     END $$`,
];

export const TRIGGERS = [
  `CREATE CONSTRAINT TRIGGER blend_compositions_valid AFTER INSERT OR UPDATE ON blend_compositions DEFERRABLE INITIALLY DEFERRED
     FOR EACH ROW EXECUTE FUNCTION vc_blend_composition_check()`,
  `CREATE CONSTRAINT TRIGGER blend_components_valid AFTER INSERT OR UPDATE OR DELETE ON blend_components DEFERRABLE INITIALLY DEFERRED
     FOR EACH ROW EXECUTE FUNCTION vc_blend_composition_check()`,
];

// The owner's specification (section 8), in the order given. Amounts in mg. Ingredients by permanent product id.
export const REQUIRED_COMPOSITIONS = [
  { blend: "glow-blend", totalMg: 70, ingredients: [["ghk-cu", 50], ["bpc-157", 10], ["tb-4", 10]] },
  { blend: "klow-blend", totalMg: 80, ingredients: [["ghk-cu", 50], ["bpc-157", 10], ["tb-4", 10], ["kpv", 10]] },
  // CJC-1295 No DAC is a hidden product; owner-approved 2026-11-20 as the reference (shown as text, never linked).
  { blend: "cjc-1295-ipamorelin-blend", totalMg: 10, ingredients: [["cjc-1295-no-dac", 5], ["ipamorelin", 5]] },
  // Final corrections item 4 (owner, 2026-11-21). TB-4 by its permanent id; its name is NOT changed.
  { blend: "wolverine-blend", totalMg: 20, ingredients: [["bpc-157", 10], ["tb-4", 10]] },
];
