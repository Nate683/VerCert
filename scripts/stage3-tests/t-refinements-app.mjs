// LOCAL ONLY. Website Refinements Package 1 — app tests against the local production build (http://localhost:3300,
// started with SNAP=ref1 bash cycle.sh) and the local test Postgres. No external host is called.
//  A. public compound list: eligibility, dynamic count, prices identical to the storefront's, no extra data; the
//     signed-in catalog and the /shop gate unchanged
//  B. Blends API: authorization, listing, create / edit / reorder / remove, every validation rule, no stock moved
//  C. product pages: the text-only Blend Composition section (order, amounts, totals), no mini vial cards, nothing for
//     a blend without a composition; a rename keeps the slug and shows everywhere
//  D. the four wording changes
import pg from "pg";

const BASE = "http://localhost:3300";
const pool = new pg.Pool({ host: "127.0.0.1", port: 5491, user: "demo", password: "demo", database: "demo", max: 4 });
const q = async (t, p = []) => (await pool.query(t, p)).rows;
let pass = 0, fail = 0; const failures = [];
const check = (name, ok, detail = "") => { if (ok) pass++; else { fail++; failures.push(name); } console.log(`${ok ? "PASS" : "FAIL"}  [R1-APP] ${name}${detail ? `  — ${detail}` : ""}`); };

const enc = new TextEncoder();
async function sign(v) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode("demo-session-secret"));
  const k = await crypto.subtle.importKey("raw", d, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC", k, enc.encode(v))).toString("hex");
}
async function token(payload) { const s = `${payload}.${Date.now() + 3600_000}`; return `${s}.${await sign(s)}`; }
const AGE = "vericert_age_ack=1";
const COMMAND = `vericert_customer_session=${await token(`demo-command~2fa~${Date.now()}`)}; ${AGE}`;
const OFFICE = `vericert_customer_session=${await token(`demo-office~2fa~${Date.now()}`)}; ${AGE}`;
const BUYER = `vericert_customer_session=${await token(`demo-customer~s~${Date.now()}`)}; ${AGE}`;
async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(BASE + path, { method, redirect: "manual", headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, data, text, headers: res.headers };
}
const page = async (path, cookie = AGE) => (await api(path, { cookie })).text;
const stockFp = async () => (await q(`SELECT md5(string_agg(x, '|' ORDER BY x)) AS h FROM (
    SELECT to_jsonb(i)::text AS x FROM strength_inventory i UNION ALL SELECT to_jsonb(l)::text FROM inventory_lots l
    UNION ALL SELECT to_jsonb(m)::text FROM inventory_movements m UNION ALL SELECT to_jsonb(s)::text FROM product_strengths s) t`))[0].h;
const stock0 = await stockFp();

// ---------- A. public compound list ----------
const pub = await api("/api/public-catalog");
const compounds = pub.data?.compounds ?? [];
const onSale = await q(`SELECT p.slug, p.name, json_agg(json_build_object('label', s.label, 'price', s.price_usd::float) ORDER BY s.position) AS strengths
                          FROM products p JOIN product_strengths s ON s.product_slug = p.slug
                         WHERE p.active AND s.active AND s.price_usd IS NOT NULL AND p.slug <> 'bac-water' GROUP BY p.slug, p.name`);
check("public list: works signed out (200), shared-cacheable", pub.status === 200 && /public/.test(pub.headers.get("cache-control") ?? ""), String(pub.status));
check(`public list: count is dynamic = compounds on sale in the database, BAC Water excluded (${onSale.length})`, pub.data?.count === onSale.length && compounds.length === onSale.length, `${pub.data?.count}`);
// The count follows the data: hiding one more product lowers it by one, showing it again restores it.
await q("UPDATE products SET active = FALSE WHERE slug = 'kpv'");
const fewer = (await api("/api/public-catalog")).data?.count;
await q("UPDATE products SET active = TRUE WHERE slug = 'kpv'");
check("public list: the count is computed live (hiding KPV → one fewer; restored after)", fewer === onSale.length - 1 && (await api("/api/public-catalog")).data?.count === onSale.length, `${fewer}`);
check("BAC Water: not in the public list or its count", !compounds.some((c) => c.slug === "bac-water"));
check("public list: one entry per compound (strengths counted once)", new Set(compounds.map((c) => c.slug)).size === compounds.length);
check("public list: alphabetical", compounds.every((c, i) => i === 0 || compounds[i - 1].name.localeCompare(c.name, "en", { sensitivity: "base" }) <= 0));
const bySlug = new Map(onSale.map((p) => [p.slug, p]));
const priceMismatch = compounds.filter((c) => JSON.stringify(c.strengths.map((s) => ({ label: s.label, price: s.price.regularUsd }))) !== JSON.stringify(bySlug.get(c.slug)?.strengths));
check("public list: every compound's strengths and prices are exactly the storefront's (product_strengths.price_usd, active + priced only)", priceMismatch.length === 0, priceMismatch.map((c) => c.slug).join(","));
check("public list: effective price = regular price (no public promotion exists; none calculated)", compounds.every((c) => c.strengths.every((s) => s.price.effectiveUsd === s.price.regularUsd)));
const hidden = (await q("SELECT slug FROM products WHERE NOT active")).map((r) => r.slug);
check(`public list: no hidden product (${hidden.length} hidden, e.g. tb-500, cjc-1295-no-dac, semax-selank-blend)`, !compounds.some((c) => hidden.includes(c.slug)) && hidden.includes("tb-500"));
const deact = await q("SELECT product_slug, label FROM product_strengths WHERE NOT active");
check("public list: no deactivated strength (BPC-157 20mg included)", !deact.some((d) => compounds.find((c) => c.slug === d.product_slug)?.strengths.some((s) => s.label === d.label)), deact.map((d) => `${d.product_slug} ${d.label}`).join(","));
const allowed = new Set(["slug", "name", "alternateNames", "casNumber", "imageUrl", "strengths"]);
check("public list: only name / alternate names / CAS / photo / strengths+prices — no stock, SKU, purity, cost, lot or link data",
  compounds.every((c) => Object.keys(c).every((k) => allowed.has(k)) && c.strengths.every((s) => Object.keys(s).join() === "label,price")) && !/sku|stock|purity|cost|batch|lot/i.test(JSON.stringify(compounds.map((c) => Object.keys(c)))));
const signedIn = await api("/api/catalog", { cookie: BUYER });
const minMismatch = (signedIn.data?.entries ?? []).filter((e) => { const c = compounds.find((x) => x.slug === e.slug); return c && Math.min(...c.strengths.map((s) => s.price.regularUsd)) !== e.minPriceUsd; });
check("public prices agree with the signed-in catalog's (same source)", signedIn.status === 200 && minMismatch.length === 0, minMismatch.map((e) => e.slug).join(","));
check("signed-in catalog (/api/catalog) still refuses signed-out visitors (401)", (await api("/api/catalog")).status === 401);
const bacRow = (await q("SELECT p.active, s.price_usd::float AS price, s.active AS strength_active FROM products p JOIN product_strengths s ON s.product_slug = p.slug WHERE p.slug = 'bac-water'"))[0];
check("BAC Water: still in the signed-in catalog search, with its price, and its product page loads for a customer",
  (signedIn.data?.entries ?? []).some((e) => e.slug === "bac-water" && e.minPriceUsd === bacRow.price) && (await api("/shop/bac-water", { cookie: BUYER })).status === 200 && bacRow.active && bacRow.strength_active, JSON.stringify(bacRow));
const shop = await api("/shop", { cookie: AGE });
check("/shop gate unchanged: signed-out visitor still sent to /register", [307, 308].includes(shop.status) && /\/register/.test(shop.headers.get("location") ?? ""), `${shop.status} ${shop.headers.get("location")}`);
check("product pages unchanged gate: signed-out /shop/glow-blend goes to /register", /\/register/.test((await api("/shop/glow-blend", { cookie: AGE })).headers.get("location") ?? ""));

// ---------- B. Blends API ----------
const sid = async (slug) => (await q("SELECT id FROM product_strengths WHERE product_slug = $1 AND active", [slug]))[0].id;
const [KLOW, WOLF] = [await sid("klow-blend"), await sid("wolverine-blend")];
let anon = 0, buyer = 0;
for (const [m, p] of [["GET", "/api/executive/blends"], ["PUT", `/api/executive/blends/${KLOW}`], ["DELETE", `/api/executive/blends/${KLOW}`]]) {
  if ((await api(p, { method: m, body: m === "PUT" ? {} : undefined, cookie: AGE })).status === 401) anon++;
  if ((await api(p, { method: m, body: m === "PUT" ? {} : undefined, cookie: BUYER })).status === 401) buyer++;
}
check("blends API: all 3 endpoints refuse signed-out visitors and customers (401)", anon === 3 && buyer === 3, `${anon}/${buyer}`);
const list = await api("/api/executive/blends", { cookie: OFFICE });
const row = (slug) => list.data?.blends.find((b) => b.productSlug === slug && b.strengthActive);
const names = (r) => r?.composition?.ingredients.map((i) => `${i.name} ${i.amountMg}`).join(", ");
check("blends API: /office has the same access as /command (200)", list.status === 200 && (await api("/api/executive/blends", { cookie: COMMAND })).status === 200);
check("blends list: GLOW = GHK-Cu 50, BPC-157 10, TB-4 10 (70 mg)", names(row("glow-blend")) === "GHK-Cu 50, BPC-157 10, TB-4 10" && row("glow-blend").composition.declaredTotalMg === 70, names(row("glow-blend")));
check("blends list: KLOW = GHK-Cu 50, BPC-157 10, TB-4 10, KPV 10 (80 mg)", names(row("klow-blend")) === "GHK-Cu 50, BPC-157 10, TB-4 10, KPV 10" && row("klow-blend").composition.declaredTotalMg === 80);
check("blends list: CJC/Ipamorelin = the hidden CJC-1295 No DAC product 5 + Ipamorelin 5 (10 mg), hidden component marked",
  row("cjc-1295-ipamorelin-blend")?.composition.ingredients.map((i) => `${i.componentSlug}:${i.amountMg}:${i.componentActive}`).join() === "cjc-1295-no-dac:5:false,ipamorelin:5:true");
check("blends list: GLOW/KLOW reference tb-4 by permanent id, not tb-500", ["glow-blend", "klow-blend"].every((b) => row(b).composition.ingredients.some((i) => i.componentSlug === "tb-4") && !row(b).composition.ingredients.some((i) => i.componentSlug === "tb-500")));
check("blends list: WOLVERINE = BPC-157 10, TB-4 10 (20 mg), by permanent ids bpc-157 / tb-4", names(row("wolverine-blend")) === "BPC-157 10, TB-4 10" && row("wolverine-blend").composition.declaredTotalMg === 20 && row("wolverine-blend").composition.ingredients.map((i) => i.componentSlug).join() === "bpc-157,tb-4" && !row("wolverine-blend").flagged, names(row("wolverine-blend")));
check("blends list: only the hidden Semax/Selank is flagged", list.data.blends.filter((b) => b.flagged && b.strengthActive).map((b) => b.productSlug).join() === "semax-selank-blend");
check("blends list: the earlier free-text entry is shown for reference only (GLOW's lists TB-500)", /TB-500/.test(JSON.stringify(row("glow-blend").legacyComposition)));
const choices = list.data?.choices ?? [];
check("ingredient choices: catalog compounds by permanent id, TB-4 and TB-500 separate entries, hidden ones marked, no blends",
  choices.some((c) => c.slug === "tb-4") && choices.some((c) => c.slug === "tb-500" && c.active === false) && !choices.some((c) => /blend/.test(c.slug)));

const put = (strengthId, body, cookie = OFFICE) => api(`/api/executive/blends/${strengthId}`, { method: "PUT", body, cookie });
const KLOW_SPEC = { declaredTotalMg: 80, ingredients: [{ componentSlug: "ghk-cu", amountMg: 50 }, { componentSlug: "bpc-157", amountMg: 10 }, { componentSlug: "tb-4", amountMg: 10 }, { componentSlug: "kpv", amountMg: 10 }] };
const v0 = row("klow-blend").composition.version;
const reord = await put(KLOW, { declaredTotalMg: 80, ingredients: [KLOW_SPEC.ingredients[3], ...KLOW_SPEC.ingredients.slice(0, 3)] });
check("edit: reorder KLOW (KPV first) saves, order kept, version +1", reord.status === 200 && reord.data.composition.ingredients.map((i) => i.componentSlug).join() === "kpv,ghk-cu,bpc-157,tb-4" && reord.data.composition.version === v0 + 1, JSON.stringify(reord.data?.error ?? ""));
const logged = await q("SELECT details FROM activity_log WHERE action = 'blend.composition_saved' ORDER BY created_at DESC LIMIT 1").catch(() => []);
check("edit: recorded in the activity log with the administrator and the ingredients", /klow-blend .*kpv 10mg, ghk-cu 50mg, bpc-157 10mg, tb-4 10mg = 80mg/.test(logged[0]?.details ?? ""), logged[0]?.details);
const bad = [
  ["ingredients that don't add up", { declaredTotalMg: 80, ingredients: [{ componentSlug: "ghk-cu", amountMg: 50 }, { componentSlug: "bpc-157", amountMg: 10 }] }, /add up to 60mg, but the declared total is 80mg/],
  ["a duplicate compound", { declaredTotalMg: 20, ingredients: [{ componentSlug: "kpv", amountMg: 10 }, { componentSlug: "kpv", amountMg: 10 }] }, /already in this blend/],
  ["a zero amount", { declaredTotalMg: 10, ingredients: [{ componentSlug: "kpv", amountMg: 0 }, { componentSlug: "tb-4", amountMg: 10 }] }, /more than 0 mg/],
  ["a negative amount", { declaredTotalMg: 10, ingredients: [{ componentSlug: "kpv", amountMg: -5 }, { componentSlug: "tb-4", amountMg: 15 }] }, /more than 0 mg/],
  ["an unknown product", { declaredTotalMg: 10, ingredients: [{ componentSlug: "not-a-product", amountMg: 10 }] }, /isn't a product in the catalog/],
  ["the blend itself", { declaredTotalMg: 10, ingredients: [{ componentSlug: "klow-blend", amountMg: 10 }] }, /can't list itself/],
  ["no ingredients", { declaredTotalMg: 10, ingredients: [] }, /at least one ingredient/],
  ["no declared total", { declaredTotalMg: 0, ingredients: [{ componentSlug: "kpv", amountMg: 10 }] }, /declared total/],
  ["more than 3 decimals", { declaredTotalMg: 10.0001, ingredients: [{ componentSlug: "kpv", amountMg: 10.0001 }] }, /3 decimal places/],
];
for (const [label, body, pattern] of bad) {
  const r = await put(KLOW, body);
  check(`validation: ${label} → 400 with a clear message, nothing saved`, r.status === 400 && pattern.test(r.data?.error ?? ""), r.data?.error);
}
check("validation: a non-number total is refused by the request schema (400)", (await put(KLOW, { declaredTotalMg: "eighty", ingredients: [] })).status === 400);
check("validation: unknown strength → 404", (await put("00000000-0000-0000-0000-000000000000", KLOW_SPEC)).status === 404);
const afterBad = (await api("/api/executive/blends", { cookie: OFFICE })).data.blends.find((b) => b.strengthId === KLOW).composition;
check("after the refusals KLOW is exactly as last saved", afterBad.ingredients.map((i) => i.componentSlug).join() === "kpv,ghk-cu,bpc-157,tb-4" && afterBad.version === v0 + 1);
const restore = await put(KLOW, KLOW_SPEC);
check("edit: KLOW restored to the owner's order", restore.status === 200 && restore.data.composition.ingredients.map((i) => i.componentSlug).join() === "ghk-cu,bpc-157,tb-4,kpv");
const WOLF_SPEC = { declaredTotalMg: 20, ingredients: [{ componentSlug: "bpc-157", amountMg: 10 }, { componentSlug: "tb-4", amountMg: 10 }] };
const decimals = await put(WOLF, { declaredTotalMg: 2.5, ingredients: [{ componentSlug: "bpc-157", amountMg: 1.25 }, { componentSlug: "tb-4", amountMg: 1.25 }] });
check("edit: decimals allowed (WOLVERINE temporarily 1.25 + 1.25 = 2.5 mg)", decimals.status === 200 && decimals.data.composition.declaredTotalMg === 2.5);
const cleared = await api(`/api/executive/blends/${WOLF}`, { method: "DELETE", cookie: OFFICE });
const wolfAfter = (await api("/api/executive/blends", { cookie: OFFICE })).data.blends.find((b) => b.strengthId === WOLF);
check("remove: WOLVERINE's composition removed → flagged", cleared.status === 200 && cleared.data.removed === true && wolfAfter.flagged && !wolfAfter.composition);
const wolfEmpty = await page("/shop/wolverine-blend", BUYER);
check("a blend with NO composition renders nothing: no section, no empty heading (WOLVERINE while cleared)", !/data-blend-composition/.test(wolfEmpty) && !/Blend Composition/.test(wolfEmpty) && /WOLVERINE Blend/.test(wolfEmpty));
const wolfBack = await put(WOLF, WOLF_SPEC);
check("create: WOLVERINE's owner composition saved again (BPC-157 10, TB-4 10 = 20 mg)", wolfBack.status === 200 && wolfBack.data.composition.ingredients.map((i) => `${i.componentSlug}:${i.amountMg}`).join() === "bpc-157:10,tb-4:10");
check("no composition save, edit or removal moved any stock (stock, lots, movements, strengths unchanged)", (await stockFp()) === stock0);

// ---------- C. product pages ----------
const section = (html) => html.match(/<section[^>]*data-blend-composition[\s\S]*?<\/section>/)?.[0] ?? null;
const rowsOf = (sec) => [...(sec ?? "").matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((m) => `${m[1]}=${m[2]}`);
const glowHtml = await page("/shop/glow-blend", BUYER);
const glowSec = section(glowHtml);
check("GLOW page: a Blend Composition section", Boolean(glowSec) && /Blend Composition/.test(glowSec));
check("GLOW page: GHK-Cu 50mg, BPC-157 10mg, TB-4 10mg, total 70mg, in that order", rowsOf(glowSec).join(" | ") === "GHK-Cu=50mg | BPC-157=10mg | TB-4=10mg | Total per vial=70mg", rowsOf(glowSec).join(" | "));
check("GLOW page: no miniature ingredient vial cards (old 'In each … vial' grid)", !/In each [^<]* vial/.test(glowHtml) && !/View compound →/.test(glowHtml));
check("GLOW page: the section is text-only (no image inside it)", !/<img/.test(glowSec ?? "<img"));
const klowSec = section(await page("/shop/klow-blend", BUYER));
check("KLOW page: GHK-Cu 50mg, BPC-157 10mg, TB-4 10mg, KPV 10mg, total 80mg", rowsOf(klowSec).join(" | ") === "GHK-Cu=50mg | BPC-157=10mg | TB-4=10mg | KPV=10mg | Total per vial=80mg", rowsOf(klowSec).join(" | "));
const cjcHtml = await page("/shop/cjc-1295-ipamorelin-blend", BUYER);
const cjcRow = (await q("SELECT name, active FROM products WHERE slug = 'cjc-1295-no-dac'"))[0];
check(`CJC page: "CJC-1295 (No DAC)" 5mg, Ipamorelin 5mg, total 10mg — the renamed hidden compound as text, never linked`,
  cjcRow.name === "CJC-1295 (No DAC)" && cjcRow.active === false
  && rowsOf(section(cjcHtml)).join(" | ") === "CJC-1295 (No DAC)=5mg | Ipamorelin=5mg | Total per vial=10mg" && !/href="\/shop\/cjc-1295-no-dac/.test(cjcHtml), rowsOf(section(cjcHtml)).join(" | "));
const wolfHtml = await page("/shop/wolverine-blend", BUYER);
check("WOLVERINE page: BPC-157 10mg, TB-4 10mg, total 20mg (text only)", rowsOf(section(wolfHtml)).join(" | ") === "BPC-157=10mg | TB-4=10mg | Total per vial=20mg" && !/<img/.test(section(wolfHtml) ?? "<img"), rowsOf(section(wolfHtml)).join(" | "));
check("WOLVERINE: strength label, SKU and price unchanged", JSON.stringify((await q("SELECT sku, label, price_usd::float AS p, active FROM product_strengths WHERE product_slug = 'wolverine-blend'"))[0]) === JSON.stringify({ sku: "WOLVERINE-BLEND-10MG/10MG", label: "10mg / 10mg", p: 89.99, active: true }));
check("non-blend page (KPV): no composition section", !/data-blend-composition/.test(await page("/shop/kpv", BUYER)));
// A rename keeps the slug, every reference, and shows at once.
const ren = await api("/api/executive/products/tb-4", { method: "PATCH", cookie: COMMAND, body: { name: "TB-4 (Full Length)" } });
const tb4 = (await q("SELECT slug, name, alternate_names FROM products WHERE name = 'TB-4 (Full Length)'"))[0];
const glowAfterRename = rowsOf(section(await page("/shop/glow-blend", BUYER))).join(" | ");
check("rename TB-4 → 'TB-4 (Full Length)': slug stays tb-4, alternate name kept", ren.status === 200 && tb4?.slug === "tb-4" && tb4.alternate_names === '["TB-4"]', `${ren.status} ${JSON.stringify(tb4)}`);
check("after the rename the GLOW page shows 'TB-4 (Full Length)' from the same permanent reference", glowAfterRename === "GHK-Cu=50mg | BPC-157=10mg | TB-4 (Full Length)=10mg | Total per vial=70mg", glowAfterRename);
check("after the rename /shop/tb-4 still loads and the public list finds it by its alternate name's slug", (await api("/shop/tb-4", { cookie: BUYER })).status === 200 && (await api("/api/public-catalog")).data.compounds.some((c) => c.slug === "tb-4" && c.name === "TB-4 (Full Length)" && c.alternateNames?.includes("TB-4")));
await api("/api/executive/products/tb-4", { method: "PATCH", cookie: COMMAND, body: { name: "TB-4" } });

// ---------- D. wording ----------
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const home = text(await page("/"));
check("footer: 'by qualified researchers and professional entities.'", home.includes("by qualified researchers and professional entities.") && !home.includes("by qualified professional entities."));
check("register: the new sentence", text(await page("/register")).includes("Create an account to access our full research catalog, place orders, and manage your research purchases."));
const priv = text(await page("/privacy-policy"));
check("privacy: the new passage, the old one gone", priv.includes("Placing orders and accessing registered researcher account features requires registration.") && !priv.includes("Access to the VeriCert Peptides catalog, product information, and ordering requires registration."));
check("privacy: the corrected closing sentence, the contradictory one gone",
  priv.includes("Passwords are stored using salted hashing. Compound names and public pricing can be viewed without an account; registration is required for full product details, inventory availability, and purchasing.") && !priv.includes("Access to the catalog is restricted to registered accounts."));
const aboutText = text(await page("/about"));
check("About: the corrected sentence, the contradictory one gone, the rest of the paragraph kept",
  aboutText.includes("Visitors can view our compound names and public pricing. Registration is required for full product details, inventory availability, and purchasing, and is open to research customers including independent researchers, laboratories, academic institutions, and commercial research organizations. Certificates of Analysis are available for public verification without requiring an account.")
  && !aboutText.includes("is reserved for registered research customers"));
const terms = text(await page("/terms"));
check("terms §11 (Pricing and availability): the new sentence follows the heading, the old one gone",
  /Pricing and availability\s+Prices are in U\.S\. dollars and are displayed alongside eligible product listings\./.test(terms) && !terms.includes("are shown to signed-in customers"));
check("stock, lots, movements and strengths unchanged by the whole suite", (await stockFp()) === stock0);

console.log(`\n[R1-APP] ${pass} passed, ${fail} failed (${pass + fail} checks)${failures.length ? `\nFAILED: ${failures.join(" | ")}` : ""}`);
await pool.end();
process.exit(fail ? 1 : 0);
