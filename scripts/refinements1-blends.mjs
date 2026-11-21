// Website Refinements Package 1 — blend compositions, the TB-4 alternate name, and two policy passages.
// NOT APPROVED FOR PRODUCTION: run it there only with the owner's explicit authorization for this package.
//
//   node scripts/refinements1-blends.mjs           # dry run: read-only; prints exactly what would be written
//   node scripts/refinements1-blends.mjs --apply   # applies everything below in ONE transaction
//
// What it does:
// 1. Creates two NEW tables, blend_compositions and blend_components (scripts/refinements1-sql.mjs), with their check
//    trigger. No existing table, column or constraint is changed.
// 2. Records the owner's three required compositions (spec section 8) on each blend's strength, in the order given:
//    GLOW 70 mg, KLOW 80 mg, CJC-1295 (No DAC) / Ipamorelin 10 mg. Ingredients reference permanent product ids.
//    Final corrections (2026-11-21): also WOLVERINE 20 mg = BPC-157 10 + TB-4 10.
// 3. Adds "TB-4" to the alternate names of tb-4 (owner-approved 2026-11-20), only if it isn't there already.
//    Renames cjc-1295-no-dac "CJC-1295 without DAC" → "CJC-1295 (No DAC)" (owner, 2026-11-21); slug and hidden status
//    kept. Only from exactly that name — any other current name stops the migration.
// 5. The About page intro sentence and a third privacy sentence (final corrections item 2), the same way as step 4:
//    only in an edited copy held in site_content, only where the old sentence appears exactly once.
// 4. If this database holds an edited copy of the policies (site_content 'policies'), replaces the two approved
//    passages in it — privacy (registration) and terms section 11 (prices) — each only where the old passage appears
//    exactly once. Without that row, the pages use the code defaults (already updated) and nothing is written.
//
// It never writes products (other than step 3), strengths, prices, SKUs, stock, lots, movements, orders, certificates,
// subscriptions, images or any other site content. An IN-TRANSACTION GUARD fingerprints all of those before the first
// statement and after the last; any other difference rolls the whole thing back.
//
// Refuses to run (the dry run says why) if: the tables already exist; a required blend or ingredient product is
// missing; a required blend doesn't have exactly one active strength; or a policy row exists but can't be parsed.
// Rollback: DROP TABLE blend_components; DROP TABLE blend_compositions; DROP FUNCTION vc_blend_composition_check();
// then restore tb-4's alternate names and the two passages from the BEFORE values this script prints.
import { pathToFileURL } from "url";
import { SCHEMA, FUNCTIONS, TRIGGERS, REQUIRED_COMPOSITIONS } from "./refinements1-sql.mjs";

const ACTOR = "system:migration (Website Refinements Package 1, owner spec)";
const TB4 = "tb-4";
const TB4_ALT = "TB-4";
// Final corrections item 3: the hidden CJC-1295 No DAC product's display name. Slug, visibility and everything else
// stay as they are. Renamed only from exactly this name; any other current name stops the migration.
const CJC = { slug: "cjc-1295-no-dac", from: "CJC-1295 without DAC", to: "CJC-1295 (No DAC)" };
const PASSAGES = [
  { section: "privacy", old: "Access to the VeriCert Peptides catalog, product information, and ordering requires registration.",
    next: "Placing orders and accessing registered researcher account features requires registration." },
  { section: "terms", old: "Prices are in U.S. dollars and are shown to signed-in customers.",
    next: "Prices are in U.S. dollars and are displayed alongside eligible product listings." },
  // Final corrections item 2.
  { section: "privacy", old: "Access to the catalog is restricted to registered accounts.",
    next: "Compound names and public pricing can be viewed without an account; registration is required for full product details, inventory availability, and purchasing." },
];
// Final corrections item 2: the About page's intro, if this database holds an edited copy (site_content 'about_page').
const ABOUT = {
  old: "Access to our full product catalog, pricing, inventory information, and purchasing is reserved for registered research customers, including independent researchers, laboratories, academic institutions, and commercial research organizations.",
  next: "Visitors can view our compound names and public pricing. Registration is required for full product details, inventory availability, and purchasing, and is open to research customers including independent researchers, laboratories, academic institutions, and commercial research organizations.",
};

const fp = (q) => `SELECT md5(coalesce(string_agg(t.x::text, '|' ORDER BY t.x::text), '')) FROM (${q}) t`;
const PROTECTED = {
  // tb-4's alternate names and updated_at are the one planned product change; every other column of every product
  // (tb-4's name, CAS, formula, sequence, prices…) is fingerprinted.
  // …and the CJC-1295 No DAC product's name (+ updated_at) is the other.
  products: fp(`SELECT to_jsonb(p) - CASE WHEN p.slug = '${TB4}' THEN ARRAY['alternate_names', 'updated_at']
                                          WHEN p.slug = '${CJC.slug}' THEN ARRAY['name', 'alternate_names', 'updated_at'] ELSE ARRAY[]::text[] END AS x FROM products p`),
  product_strengths: fp("SELECT to_jsonb(s) AS x FROM product_strengths s"),
  strength_inventory: fp("SELECT to_jsonb(i) AS x FROM strength_inventory i"),
  inventory_lots: fp("SELECT to_jsonb(l) AS x FROM inventory_lots l"),
  inventory_allocations: fp("SELECT to_jsonb(a) AS x FROM inventory_allocations a"),
  inventory_movements: fp("SELECT to_jsonb(m) AS x FROM inventory_movements m"),
  orders: fp("SELECT to_jsonb(o) AS x FROM orders o"),
  order_events: fp("SELECT to_jsonb(e) AS x FROM order_events e"),
  coa_records: fp("SELECT to_jsonb(r) AS x FROM coa_records r"),
  coa_lots: fp("SELECT to_jsonb(l) AS x FROM coa_lots l"),
  coa_files: fp("SELECT id || ':' || sha256 AS x FROM coa_files"),
  legacy_inventory: fp("SELECT to_jsonb(i) AS x FROM inventory i"),
  subscriptions: fp("SELECT to_jsonb(s) AS x FROM subscriptions s"),
  site_content_except_policies_about: fp("SELECT to_jsonb(c) AS x FROM site_content c WHERE c.key NOT IN ('policies', 'about_page')"),
};
const FP_SELECT = `SELECT ${Object.entries(PROTECTED).map(([k, q]) => `(${q}) AS ${k}`).join(",\n       ")}`;
const GUARD_CREATE = `CREATE TEMP TABLE refinements1_guard ON COMMIT DROP AS ${FP_SELECT}`;
const GUARD_CHECK = `DO $guard$
  DECLARE guard_before record; guard_after record; bad text[] := '{}';
  BEGIN
    SELECT * INTO guard_before FROM refinements1_guard;
    ${FP_SELECT} INTO guard_after;
    ${Object.keys(PROTECTED).map((k) => `IF guard_after.${k} IS DISTINCT FROM guard_before.${k} THEN bad := bad || '${k}'::text; END IF;`).join("\n    ")}
    IF cardinality(bad) > 0 THEN
      RAISE EXCEPTION 'refinements1 guard: protected data changed (%); rolled back, nothing was applied', array_to_string(bad, ', ');
    END IF;
  END $guard$`;

const labelSum = (label) => (label.match(/\d+(\.\d+)?/g) ?? []).reduce((a, n) => a + Number(n), 0);

export async function run(sql, { apply = false, log: print = console.log } = {}) {
  const [{ exists }] = await sql`SELECT to_regclass('public.blend_compositions') IS NOT NULL AS exists`;
  if (exists) { print("blend_compositions already exists. Nothing to do."); return { applied: false }; }
  const before = (await sql.query(FP_SELECT))[0];
  print("BEFORE fingerprints:", JSON.stringify(before));

  const products = await sql`SELECT slug, name, active, alternate_names FROM products`;
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const strengths = await sql`SELECT id, product_slug, sku, label, active, price_usd FROM product_strengths ORDER BY product_slug, position`;
  const blockers = [];
  const plan = [];

  print("\n1. New tables: blend_compositions, blend_components (+ check trigger). No existing table changed.");
  print("\n2. Required compositions (owner spec section 8, in the order given):");
  for (const c of REQUIRED_COMPOSITIONS) {
    const blend = bySlug.get(c.blend);
    const active = strengths.filter((s) => s.product_slug === c.blend && s.active);
    if (!blend) { blockers.push(`blend product ${c.blend} not found`); continue; }
    if (active.length !== 1) { blockers.push(`${c.blend} has ${active.length} active strengths (expected exactly 1): ${active.map((s) => s.sku).join(", ") || "none"}`); continue; }
    const s = active[0];
    const sum = c.ingredients.reduce((a, [, mg]) => a + mg, 0);
    if (sum !== c.totalMg) blockers.push(`${c.blend}: spec ingredients add to ${sum} mg, not ${c.totalMg} mg`);
    print(`  ${blend.name} (${c.blend}, ${blend.active ? "visible" : "hidden"}) · strength ${s.sku} (${s.id}) · label "${s.label}" · declared total ${c.totalMg} mg` +
      `${labelSum(s.label) === c.totalMg ? " (matches the label's amounts)" : `  ** the label's amounts add to ${labelSum(s.label)} mg`}`);
    c.ingredients.forEach(([slug, mg], i) => {
      const p = bySlug.get(slug);
      if (!p) blockers.push(`${c.blend}: ingredient product ${slug} not found`);
      if (slug === c.blend) blockers.push(`${c.blend} lists itself`);
      print(`     ${i + 1}. ${p ? `"${p.name}"` : "?"} · product id ${slug}${p && !p.active ? " · HIDDEN product (shown as text, no link)" : ""} · ${mg} mg`);
    });
    plan.push({ ...c, strengthId: s.id });
  }

  print(`\n3. Alternate name "${TB4_ALT}" on ${TB4}:`);
  const tb4 = bySlug.get(TB4);
  let tb4Alt = null;
  if (!tb4) blockers.push(`${TB4} not found`);
  else {
    const current = tb4.alternate_names ? JSON.parse(tb4.alternate_names) : [];
    print(`  "${tb4.name}" · BEFORE alternate_names: ${tb4.alternate_names ?? "null"}`);
    if (current.some((n) => n.toLowerCase() === TB4_ALT.toLowerCase())) print(`  already present — nothing written`);
    else { tb4Alt = JSON.stringify([...current, TB4_ALT]); print(`  AFTER alternate_names: ${tb4Alt}`); }
  }

  print(`\n3b. Name of ${CJC.slug}:`);
  const cjc = bySlug.get(CJC.slug);
  let cjcRename = false;
  if (!cjc) blockers.push(`${CJC.slug} not found`);
  else if (cjc.name === CJC.to) print(`  already "${CJC.to}" — nothing written`);
  else if (cjc.name === CJC.from) { cjcRename = true; print(`  BEFORE "${cjc.name}" · AFTER "${CJC.to}" · slug, visibility (${cjc.active ? "visible" : "hidden"}), strengths, stock and certificates unchanged`); }
  else blockers.push(`${CJC.slug} is named "${cjc.name}", not "${CJC.from}" — re-confirm the rename with the owner`);
  // Owner-approved 2026-11-21: keep the old name as an alternate name (as with TB-4), so a certificate printed
  // "CJC-1295 without DAC" doesn't raise a compound-mismatch note.
  let cjcAlt = null;
  if (cjc) {
    const current = cjc.alternate_names ? JSON.parse(cjc.alternate_names) : [];
    print(`  BEFORE alternate_names: ${cjc.alternate_names ?? "null"}`);
    if (current.some((n) => n.toLowerCase() === CJC.from.toLowerCase())) print(`  "${CJC.from}" already an alternate name — nothing written`);
    else { cjcAlt = JSON.stringify([...current, CJC.from]); print(`  AFTER alternate_names: ${cjcAlt}`); }
  }

  print("\n4. Policy passages:");
  const [policyRow] = await sql`SELECT value FROM site_content WHERE key = 'policies'`;
  let policiesNext = null;
  if (!policyRow) print("  no edited policies in this database — the pages use the code defaults (already updated). Nothing written.");
  else {
    let policies;
    try { policies = JSON.parse(policyRow.value); } catch { blockers.push("site_content 'policies' can't be parsed"); }
    if (policies) {
      let changed = false;
      for (const p of PASSAGES) {
        const paras = Array.isArray(policies[p.section]) ? policies[p.section] : [];
        const hits = paras.filter((t) => typeof t === "string" && t.includes(p.old));
        const count = paras.reduce((a, t) => a + (typeof t === "string" ? t.split(p.old).length - 1 : 0), 0);
        if (count === 1) {
          policies[p.section] = paras.map((t) => (typeof t === "string" ? t.replace(p.old, p.next) : t));
          changed = true;
          print(`  ${p.section}: BEFORE "${hits[0]}"\n  ${p.section}: AFTER  "${hits[0].replace(p.old, p.next)}"`);
        } else if (paras.some((t) => typeof t === "string" && t.includes(p.next))) print(`  ${p.section}: already has the new wording — nothing written`);
        else print(`  ${p.section}: the old passage appears ${count} time(s) in the edited copy — LEFT AS IS (needs the owner's edit in Site Content)`);
      }
      if (changed) policiesNext = JSON.stringify(policies);
    }
  }

  print("\n5. About page:");
  const [aboutRow] = await sql`SELECT value FROM site_content WHERE key = 'about_page'`;
  let aboutNext = null;
  if (!aboutRow) print("  no edited About content in this database — the page uses the code default (already updated). Nothing written.");
  else {
    let about;
    try { about = JSON.parse(aboutRow.value); } catch { blockers.push("site_content 'about_page' can't be parsed"); }
    if (about) {
      const intro = typeof about.intro === "string" ? about.intro : null;
      const count = intro ? intro.split(ABOUT.old).length - 1 : 0;
      if (count === 1) {
        aboutNext = JSON.stringify({ ...about, intro: intro.replace(ABOUT.old, ABOUT.next) });
        print(`  intro: BEFORE "${ABOUT.old}"\n  intro: AFTER  "${ABOUT.next}"`);
      } else if (intro?.includes(ABOUT.next)) print("  intro already has the new wording — nothing written");
      else print(`  ${intro === null ? "the edited copy has no intro (the page uses the default intro, already updated)" : `the old statement appears ${count} time(s) in the edited intro — LEFT AS IS (needs the owner's edit in Site Content)`}`);
    }
  }

  const composed = new Set(plan.map((c) => c.blend));
  const flagged = products.filter((p) => !composed.has(p.slug) && /blend/i.test(`${p.slug} ${p.name}`));
  print(`\nBlends left without a structured composition (flagged for administrator completion; customers see no composition section): ${flagged.map((p) => `${p.name} (${p.active ? "visible" : "hidden"})`).join(", ") || "none"}`);
  print(`\nIn-transaction guard over: ${Object.keys(PROTECTED).join(", ")}`);

  if (blockers.length) { print(`\nSTOPPED: ${blockers.join("; ")}. Nothing executed.`); return { applied: false, blockers }; }
  if (!apply) { print("\nDry run: nothing executed. Re-run with --apply."); return { applied: false }; }

  const now = new Date().toISOString();
  await sql.transaction([
    sql.query(GUARD_CREATE),
    ...SCHEMA.map((q) => sql.query(q)),
    ...FUNCTIONS.map((q) => sql.query(q)),
    ...TRIGGERS.map((q) => sql.query(q)),
    ...plan.flatMap((c) => [
      sql.query(`INSERT INTO blend_compositions (blend_strength_id, blend_slug, declared_total_mg, created_at, created_by, updated_at, updated_by)
                 VALUES ($1, $2, $3, $4, $5, $4, $5)`, [c.strengthId, c.blend, c.totalMg, now, ACTOR]),
      ...c.ingredients.map(([slug, mg], i) => sql.query(
        `INSERT INTO blend_components (id, blend_strength_id, component_slug, amount_mg, position) VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`,
        [c.strengthId, slug, mg, i])),
    ]),
    ...(tb4Alt ? [sql.query("UPDATE products SET alternate_names = $2, updated_at = $3 WHERE slug = $1", [TB4, tb4Alt, now])] : []),
    ...(cjcRename ? [sql.query("UPDATE products SET name = $2, updated_at = $3 WHERE slug = $1 AND name = $4", [CJC.slug, CJC.to, now, CJC.from])] : []),
    ...(cjcAlt ? [sql.query("UPDATE products SET alternate_names = $2, updated_at = $3 WHERE slug = $1", [CJC.slug, cjcAlt, now])] : []),
    ...(policiesNext ? [sql.query("UPDATE site_content SET value = $1, updated_at = $2 WHERE key = 'policies'", [policiesNext, now])] : []),
    ...(aboutNext ? [sql.query("UPDATE site_content SET value = $1, updated_at = $2 WHERE key = 'about_page'", [aboutNext, now])] : []),
    sql.query(GUARD_CHECK),
  ]);

  const after = (await sql.query(FP_SELECT))[0];
  const problems = Object.keys(PROTECTED).filter((k) => before[k] !== after[k]).map((k) => `${k} changed`);
  const rows = await sql`SELECT c.blend_slug, c.declared_total_mg::float AS total, string_agg(b.component_slug || ' ' || b.amount_mg::float || 'mg', ', ' ORDER BY b.position) AS parts
                           FROM blend_compositions c JOIN blend_components b USING (blend_strength_id) GROUP BY c.blend_slug, c.declared_total_mg ORDER BY c.blend_slug`;
  for (const c of plan) {
    const r = rows.find((x) => x.blend_slug === c.blend);
    const want = c.ingredients.map(([s, mg]) => `${s} ${mg}mg`).join(", ");
    if (!r || r.total !== c.totalMg || r.parts !== want) problems.push(`${c.blend} read back as ${r ? `${r.total} mg: ${r.parts}` : "missing"}`);
  }
  if (cjcRename || cjcAlt) {
    const [c] = await sql.query("SELECT name, active, alternate_names FROM products WHERE slug = $1", [CJC.slug]);
    if (c?.name !== CJC.to || c.active !== cjc.active) problems.push(`${CJC.slug} reads back as "${c?.name}" (${c?.active ? "visible" : "hidden"})`);
    if (cjcAlt && c?.alternate_names !== cjcAlt) problems.push(`${CJC.slug} alternate names read back as ${c?.alternate_names}`);
  }
  print("\nAFTER fingerprints:", JSON.stringify(after));
  print(problems.length ? `\nCHECK FAILED: ${problems.join("; ")}` : `\nChecks passed: ${rows.length} composition(s) stored and read back in order; all protected data unchanged.`);
  return { applied: true, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  const { neon } = await import("@neondatabase/serverless");
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set."); process.exit(1); }
  console.log("database host:", new URL(process.env.DATABASE_URL).hostname);
  try {
    const r = await run(neon(process.env.DATABASE_URL), { apply: process.argv.includes("--apply") });
    process.exit(r.problems?.length ? 1 : 0);
  } catch (e) {
    console.error("[refinements1] Failed:", e.message);
    process.exit(1);
  }
}
