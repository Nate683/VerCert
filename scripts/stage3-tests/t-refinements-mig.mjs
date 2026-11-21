// LOCAL ONLY. Website Refinements Package 1 — migration and database-rule tests, from the post-Stage-3 snapshot
// (snap_post3, the same schema production has today). Ends by saving snap_ref1 for the app tests.
//  - the dry run writes nothing and lists exactly what it would write
//  - it STOPS on a blend without exactly one active strength; the in-transaction guard rolls everything back
//  - the policy passages: replaced only where the old text appears exactly once; an edited copy is left as is
//  - a clean apply stores GLOW / KLOW / CJC-Ipamorelin in the owner's order with the right totals and permanent ids,
//    adds the TB-4 alternate name, and leaves every product, strength, price, SKU, stock row, lot, movement, order,
//    certificate and other site content byte-identical
//  - the database itself refuses invalid compositions (sum, duplicate, zero, self, wrong blend, gaps, empty) and the
//    deletion of a product used as an ingredient
import { execFileSync } from "child_process";
import path from "path";
import pg from "pg";
const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const local = (args) => {
  try { return { ok: true, out: execFileSync("bash", [path.join(here, "local.sh"), "node", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; }
  catch (e) { return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
};
const snap = (m, n) => execFileSync("node", [path.join(here, "db-snapshot.mjs"), m, n], { encoding: "utf8" });
let pass = 0, fail = 0; const failures = [];
const check = (name, ok, detail = "") => { if (ok) pass++; else { fail++; failures.push(name); } console.log(`${ok ? "PASS" : "FAIL"}  [R1-MIG] ${name}${detail ? `  — ${detail}` : ""}`); };
const withDb = async (fn) => { const c = new pg.Client({ host: "127.0.0.1", port: 5491, user: "demo", password: "demo", database: "demo" }); await c.connect(); try { return await fn(c); } finally { await c.end(); } };
const MIG = "scripts/refinements1-blends.mjs";
const md5 = (t) => `(SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM (${t}) s(x))`;
const fp = () => withDb(async (c) => (await c.query(`SELECT
  ${md5("SELECT to_jsonb(p) - CASE WHEN p.slug = 'tb-4' THEN ARRAY['alternate_names','updated_at'] WHEN p.slug = 'cjc-1295-no-dac' THEN ARRAY['name','alternate_names','updated_at'] ELSE ARRAY[]::text[] END FROM products p")} AS products,
  ${md5("SELECT to_jsonb(s) FROM product_strengths s")} AS strengths,
  ${md5("SELECT to_jsonb(i) FROM strength_inventory i")} AS stock,
  ${md5("SELECT to_jsonb(l) FROM inventory_lots l")} AS lots,
  ${md5("SELECT to_jsonb(m) FROM inventory_movements m")} AS movements,
  ${md5("SELECT to_jsonb(o) FROM orders o")} AS orders,
  ${md5("SELECT to_jsonb(r) FROM coa_records r")} AS coa,
  ${md5("SELECT to_jsonb(c) FROM site_content c WHERE key NOT IN ('policies', 'about_page')")} AS content,
  (SELECT to_regclass('public.blend_compositions') IS NOT NULL) AS applied`)).rows[0]);
const sameExceptApplied = (a, b) => JSON.stringify({ ...a, applied: null }) === JSON.stringify({ ...b, applied: null });

// --- dry run ---
snap("restore", "post3");
const f0 = await fp();
const dry = local([MIG]);
const f1 = await fp();
check("dry run writes nothing", dry.ok && JSON.stringify(f0) === JSON.stringify(f1) && !f1.applied);
check("dry run lists GLOW in the owner's order: GHK-Cu 50, BPC-157 10, TB-4 10 = 70 mg",
  /GLOW Blend \(glow-blend, visible\).*declared total 70 mg \(matches the label's amounts\)\s+1\. "GHK-Cu" · product id ghk-cu · 50 mg\s+2\. "BPC-157" · product id bpc-157 · 10 mg\s+3\. "TB-4" · product id tb-4 · 10 mg/.test(dry.out));
check("dry run lists KLOW: GHK-Cu 50, BPC-157 10, TB-4 10, KPV 10 = 80 mg",
  /KLOW Blend.*declared total 80 mg \(matches the label's amounts\)\s+1\. "GHK-Cu".*50 mg\s+2\. "BPC-157".*10 mg\s+3\. "TB-4" · product id tb-4 · 10 mg\s+4\. "KPV".*10 mg/.test(dry.out));
check("dry run lists CJC/Ipamorelin: CJC-1295 No DAC (hidden, text only) 5 + Ipamorelin 5 = 10 mg",
  /cjc-1295-ipamorelin-blend.*declared total 10 mg \(matches the label's amounts\)\s+1\. ".*" · product id cjc-1295-no-dac · HIDDEN product \(shown as text, no link\) · 5 mg\s+2\. "Ipamorelin" · product id ipamorelin · 5 mg/.test(dry.out));
check("dry run: TB-500 is never an ingredient", !/product id tb-500/.test(dry.out));
check("dry run: TB-4 alternate name planned (before null, after [\"TB-4\"])", /BEFORE alternate_names: null\s+AFTER alternate_names: \["TB-4"\]/.test(dry.out));
check("dry run: no edited policies here → nothing written for them", /no edited policies in this database/.test(dry.out));
check("dry run lists WOLVERINE: BPC-157 10 + TB-4 10 = 20 mg, matching its strength label 10mg / 10mg",
  /WOLVERINE Blend \(wolverine-blend, visible\) · strength WOLVERINE-BLEND-10MG\/10MG .* label "10mg \/ 10mg" · declared total 20 mg \(matches the label's amounts\)\s+1\. "BPC-157" · product id bpc-157 · 10 mg\s+2\. "TB-4" · product id tb-4 · 10 mg/.test(dry.out));
check("dry run: the old name kept as an alternate name (before null, after [\"CJC-1295 without DAC\"])", /Name of cjc-1295-no-dac:[\s\S]*?BEFORE alternate_names: null\s+AFTER alternate_names: \["CJC-1295 without DAC"\]/.test(dry.out));
check("dry run: CJC-1295 No DAC rename planned, hidden status kept", /Name of cjc-1295-no-dac:\s+BEFORE "CJC-1295 without DAC" · AFTER "CJC-1295 \(No DAC\)" · slug, visibility \(hidden\)/.test(dry.out));
check("dry run: only Semax/Selank (hidden) left flagged for completion", /flagged for administrator completion.*: Semax \/ Selank Blend \(hidden\)\s*$/m.test(dry.out) && !/flagged.*WOLVERINE/.test(dry.out));
check("dry run: no edited About content here → nothing written for it", /no edited About content in this database/.test(dry.out));
await withDb((c) => c.query("UPDATE products SET name = 'CJC-1295 something else' WHERE slug = 'cjc-1295-no-dac'"));
const stopName = local([MIG, "--apply"]);
await withDb((c) => c.query("UPDATE products SET name = 'CJC-1295 without DAC' WHERE slug = 'cjc-1295-no-dac'"));
check("STOPS if the CJC product isn't named exactly 'CJC-1295 without DAC' (re-confirm, never guess)", /STOPPED: .*cjc-1295-no-dac is named "CJC-1295 something else"/.test(stopName.out) && !(await fp()).applied);

// --- STOP: a required blend without exactly one active strength ---
await withDb((c) => c.query("UPDATE product_strengths SET active = FALSE WHERE product_slug = 'klow-blend'"));
const stop = local([MIG, "--apply"]);
await withDb((c) => c.query("UPDATE product_strengths SET active = TRUE WHERE product_slug = 'klow-blend'"));
check("STOPS when a required blend has no single active strength (nothing executed)", /STOPPED: klow-blend has 0 active strengths/.test(stop.out) && !(await fp()).applied);

// --- guard: a planted trigger edits a product mid-migration → everything rolls back ---
await withDb(async (c) => {
  await c.query(`CREATE FUNCTION test_tamper() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE products SET summary = summary || ' ' WHERE slug = 'kpv'; RETURN NULL; END $$`);
});
// Plant it on the update the migration makes to tb-4 (alternate names).
await withDb((c) => c.query("CREATE TRIGGER test_tamper AFTER UPDATE ON products FOR EACH ROW WHEN (NEW.slug = 'tb-4') EXECUTE FUNCTION test_tamper()"));
const g0 = await fp();
const tampered = local([MIG, "--apply"]);
const g1 = await fp();
check("guard: a product changed mid-migration → the migration fails", !tampered.ok && /refinements1 guard: protected data changed \(products\)/.test(tampered.out), tampered.out.split("\n").filter((l) => /guard|Failed/.test(l)).join(" ").slice(0, 200));
check("guard: nothing applied (no blend tables; products, strengths, stock unchanged)", !g1.applied && sameExceptApplied(g0, g1));
await withDb(async (c) => { await c.query("DROP TRIGGER test_tamper ON products"); await c.query("DROP FUNCTION test_tamper()"); });

// --- policies: an edited copy in site_content ---
const OLD_PRIV = "Access to the VeriCert Peptides catalog, product information, and ordering requires registration.";
const OLD_TERMS = "Prices are in U.S. dollars and are shown to signed-in customers.";
const OLD_PRIV3 = "Access to the catalog is restricted to registered accounts.";
const policies = { privacy: ["Intro.", `${OLD_PRIV} When an account is created we record name. ${OLD_PRIV3}`], terms: ["## Pricing and availability", `${OLD_TERMS} The price that applies is the one shown.`], refund: ["Refund text kept."] };
await withDb((c) => c.query("INSERT INTO site_content (key, value, updated_at) VALUES ('policies', $1, now()::text)", [JSON.stringify(policies)]));
const pd = local([MIG]);
check("dry run with an edited policies copy shows BEFORE / AFTER for both passages",
  /privacy: BEFORE ".*ordering requires registration\. When/.test(pd.out) && /privacy: AFTER  "Placing orders and accessing registered researcher account features requires registration\. When/.test(pd.out)
  && /terms: AFTER  "Prices are in U\.S\. dollars and are displayed alongside eligible product listings\. The price/.test(pd.out));
await withDb((c) => c.query("UPDATE site_content SET value = $1 WHERE key = 'policies'", [JSON.stringify({ ...policies, privacy: ["Owner rewrote this entirely."] })]));
const pe = local([MIG]);
check("an edited copy WITHOUT the old privacy passage is left as is (reported, not guessed)", /privacy: the old passage appears 0 time\(s\) in the edited copy — LEFT AS IS/.test(pe.out));
await withDb((c) => c.query("UPDATE site_content SET value = $1 WHERE key = 'policies'", [JSON.stringify(policies)]));
const pa = local([MIG, "--apply"]);
const pol = await withDb(async (c) => JSON.parse((await c.query("SELECT value FROM site_content WHERE key = 'policies'")).rows[0].value));
check("apply with the edited copy: all three passages replaced, the rest of every paragraph and section unchanged",
  pa.ok && /Checks passed/.test(pa.out)
  && JSON.stringify(pol) === JSON.stringify({ ...policies,
    privacy: ["Intro.", "Placing orders and accessing registered researcher account features requires registration. When an account is created we record name. Compound names and public pricing can be viewed without an account; registration is required for full product details, inventory availability, and purchasing."],
    terms: ["## Pricing and availability", "Prices are in U.S. dollars and are displayed alongside eligible product listings. The price that applies is the one shown."] }),
  pa.out.split("\n").slice(-1).join(""));

// --- About: an edited copy in site_content ---
snap("restore", "post3");
const OLD_ABOUT = "Access to our full product catalog, pricing, inventory information, and purchasing is reserved for registered research customers, including independent researchers, laboratories, academic institutions, and commercial research organizations.";
const NEW_ABOUT = "Visitors can view our compound names and public pricing. Registration is required for full product details, inventory availability, and purchasing, and is open to research customers including independent researchers, laboratories, academic institutions, and commercial research organizations.";
const about = { headline: "Edited headline kept", intro: `First paragraph kept.\n\n${OLD_ABOUT} Certificates of Analysis are available for public verification without requiring an account.`, valuesHeading: "Kept" };
await withDb((c) => c.query("INSERT INTO site_content (key, value, updated_at) VALUES ('about_page', $1, now()::text)", [JSON.stringify(about)]));
const ad = local([MIG]);
check("dry run with an edited About copy shows BEFORE / AFTER for the one sentence", /intro: BEFORE "Access to our full product catalog/.test(ad.out) && /intro: AFTER  "Visitors can view our compound names and public pricing\./.test(ad.out));
const aa = local([MIG, "--apply"]);
const aboutAfter = await withDb(async (c) => JSON.parse((await c.query("SELECT value FROM site_content WHERE key = 'about_page'")).rows[0].value));
check("apply with the edited About copy: only that sentence replaced; headline, other paragraphs and fields unchanged",
  aa.ok && /Checks passed/.test(aa.out) && JSON.stringify(aboutAfter) === JSON.stringify({ ...about, intro: about.intro.replace(OLD_ABOUT, NEW_ABOUT) }), aa.out.split("\n").slice(-1).join(""));

// --- clean apply (no policies row), as production would be without an edited copy ---
snap("restore", "post3");
const before = await fp();
const ok = local([MIG, "--apply"]);
const after = await fp();
check("clean apply: checks pass", ok.ok && /Checks passed: 4 composition\(s\) stored and read back in order; all protected data unchanged/.test(ok.out), ok.out.split("\n").slice(-1).join(""));
check("clean apply: products (except tb-4's alternate names and cjc-1295-no-dac's name), strengths, prices, SKUs, stock, lots, movements, orders, certificates, site content byte-identical",
  after.applied && sameExceptApplied(before, after));
const st = await withDb(async (c) => ({
  rows: (await c.query(`SELECT c.blend_slug, c.declared_total_mg::float AS total, s.sku, s.product_slug = c.blend_slug AS own,
                               json_agg(json_build_object('slug', b.component_slug, 'mg', b.amount_mg::float, 'pos', b.position) ORDER BY b.position) AS parts
                          FROM blend_compositions c JOIN product_strengths s ON s.id = c.blend_strength_id
                          JOIN blend_components b USING (blend_strength_id) GROUP BY 1, 2, 3, 4 ORDER BY 1`)).rows,
  tb4: (await c.query("SELECT name, alternate_names FROM products WHERE slug = 'tb-4'")).rows[0],
  tb500: (await c.query("SELECT name, alternate_names, active FROM products WHERE slug = 'tb-500'")).rows[0],
  cjc: (await c.query("SELECT name, active, alternate_names FROM products WHERE slug = 'cjc-1295-no-dac'")).rows[0],
}));
const comp = (slug) => st.rows.find((r) => r.blend_slug === slug);
const parts = (slug) => comp(slug)?.parts.map((p) => `${p.slug}:${p.mg}@${p.pos}`).join(",");
check("GLOW stored on its own strength: ghk-cu 50, bpc-157 10, tb-4 10 (positions 0–2), total 70", comp("glow-blend")?.own && comp("glow-blend").total === 70 && parts("glow-blend") === "ghk-cu:50@0,bpc-157:10@1,tb-4:10@2", parts("glow-blend"));
check("KLOW stored: ghk-cu 50, bpc-157 10, tb-4 10, kpv 10, total 80", comp("klow-blend")?.own && comp("klow-blend").total === 80 && parts("klow-blend") === "ghk-cu:50@0,bpc-157:10@1,tb-4:10@2,kpv:10@3", parts("klow-blend"));
check("CJC/Ipamorelin stored: cjc-1295-no-dac 5, ipamorelin 5, total 10", comp("cjc-1295-ipamorelin-blend")?.own && comp("cjc-1295-ipamorelin-blend").total === 10 && parts("cjc-1295-ipamorelin-blend") === "cjc-1295-no-dac:5@0,ipamorelin:5@1");
check("GLOW and KLOW reference TB-4 (tb-4), never TB-500", st.rows.every((r) => !r.parts.some((p) => p.slug === "tb-500")) && ["glow-blend", "klow-blend"].every((b) => comp(b).parts.some((p) => p.slug === "tb-4")));
check("WOLVERINE stored on its own strength: bpc-157 10, tb-4 10, total 20 (= its label's 10mg / 10mg)", comp("wolverine-blend")?.own && comp("wolverine-blend").total === 20 && parts("wolverine-blend") === "bpc-157:10@0,tb-4:10@1", parts("wolverine-blend"));
check("four blends have compositions; Semax/Selank (hidden) left for the administrator", st.rows.length === 4 && !comp("semax-selank-blend"));
check("CJC-1295 No DAC renamed to 'CJC-1295 (No DAC)', still hidden, old name kept as its only alternate name", st.cjc.name === "CJC-1295 (No DAC)" && st.cjc.active === false && st.cjc.alternate_names === '["CJC-1295 without DAC"]', JSON.stringify(st.cjc));
check("TB-4: alternate name added, name untouched; TB-500 untouched and still hidden", st.tb4.alternate_names === '["TB-4"]' && st.tb4.name === "TB-4" && st.tb500.alternate_names === null && st.tb500.active === false);
const again = local([MIG, "--apply"]);
check("re-running does nothing", /already exists/.test(again.out));

// --- the database's own rules ---
const refused = async (sqls, pattern) => withDb(async (c) => {
  await c.query("BEGIN");
  try { for (const s of sqls) await c.query(s); await c.query("COMMIT"); return { refused: false }; }
  catch (e) { await c.query("ROLLBACK").catch(() => {}); return { refused: pattern.test(e.message), message: e.message }; }
});
const glowSid = "(SELECT blend_strength_id FROM blend_compositions WHERE blend_slug = 'glow-blend')";
const semaxSid = "(SELECT id FROM product_strengths WHERE product_slug = 'semax-selank-blend')";
const cases = [
  ["ingredients that don't add up to the declared total", [`UPDATE blend_components SET amount_mg = 40 WHERE blend_strength_id = ${glowSid} AND component_slug = 'ghk-cu'`], /add up to 60\.000 mg, but the declared total is 70\.000 mg/],
  ["the same compound twice", [`INSERT INTO blend_components VALUES ('dup', ${glowSid}, 'ghk-cu', 1, 3)`], /blend_components_unique_compound/],
  ["a zero amount", [`UPDATE blend_components SET amount_mg = 0 WHERE blend_strength_id = ${glowSid} AND component_slug = 'tb-4'`], /amount_mg_check/],
  ["a negative declared total", [`UPDATE blend_compositions SET declared_total_mg = -70 WHERE blend_slug = 'glow-blend'`], /declared_total_mg_check/],
  ["a blend listing itself", [`UPDATE blend_components SET component_slug = 'glow-blend' WHERE blend_strength_id = ${glowSid} AND component_slug = 'tb-4'`], /can't list itself/],
  ["a composition naming the wrong blend product", [`INSERT INTO blend_compositions VALUES (${semaxSid}, 'glow-blend', 20, 1, 'x', 't', 'x', 't')`, `INSERT INTO blend_components VALUES ('w1', ${semaxSid}, 'bpc-157', 20, 0)`], /belongs to semax-selank-blend, not glow-blend/],
  ["a gap in the positions", [`UPDATE blend_components SET position = 5 WHERE blend_strength_id = ${glowSid} AND component_slug = 'tb-4'`], /positions must run 0 to 2/],
  ["a composition with no ingredients", [`DELETE FROM blend_components WHERE blend_strength_id = ${glowSid}`], /at least one ingredient/],
  ["an ingredient that isn't a catalog product", [`UPDATE blend_components SET component_slug = 'not-a-product' WHERE blend_strength_id = ${glowSid} AND component_slug = 'tb-4'`], /foreign key/],
  ["deleting a product used as an ingredient", ["DELETE FROM products WHERE slug = 'kpv'"], /foreign key/],
];
for (const [label, sqls, pattern] of cases) {
  const r = await refused(sqls, pattern);
  check(`database refuses ${label}`, r.refused, r.message?.slice(0, 120) ?? "COMMITTED");
}
const reorder = await refused([
  `UPDATE blend_components SET position = 9 WHERE blend_strength_id = ${glowSid} AND component_slug = 'ghk-cu'`,
  `UPDATE blend_components SET position = 0 WHERE blend_strength_id = ${glowSid} AND component_slug = 'bpc-157'`,
  `UPDATE blend_components SET position = 1 WHERE blend_strength_id = ${glowSid} AND component_slug = 'ghk-cu'`,
], /never/);
check("a valid reorder in one transaction is accepted (positions judged at commit)", reorder.refused === false, reorder.message ?? "");
const undo = await refused([
  `UPDATE blend_components SET position = 9 WHERE blend_strength_id = ${glowSid} AND component_slug = 'bpc-157'`,
  `UPDATE blend_components SET position = 0 WHERE blend_strength_id = ${glowSid} AND component_slug = 'ghk-cu'`,
  `UPDATE blend_components SET position = 1 WHERE blend_strength_id = ${glowSid} AND component_slug = 'bpc-157'`,
], /never/);
const end = await fp();
const glowNow = await withDb(async (c) => (await c.query(`SELECT string_agg(component_slug || ':' || amount_mg::float || '@' || position, ',' ORDER BY position) AS p FROM blend_components WHERE blend_strength_id = ${glowSid}`)).rows[0].p);
check("after every refused write: compositions, products, stock and movements as applied", undo.refused === false && sameExceptApplied(after, end) && glowNow === "ghk-cu:50@0,bpc-157:10@1,tb-4:10@2", glowNow);
snap("save", "ref1");
console.log(`\n[R1-MIG] ${pass} passed, ${fail} failed (${pass + fail} checks)${failures.length ? `\nFAILED: ${failures.join(" | ")}` : ""}`);
process.exit(fail ? 1 : 0);
