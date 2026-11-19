// LOCAL ONLY. Stage 1 / Stage 2 regression after Stage 3, against the local production build (:3300, simulation off)
// and the local test Postgres. Product & strength management, permanent IDs, SKU uniqueness, opening stock,
// thresholds/levels, movement history, Stock list/search data, storefront & catalog, certificates, authentication,
// ordering gate, subscriptions cron.
import pg from "pg";
import { randomUUID } from "crypto";
const BASE = "http://localhost:3300";
const pool = new pg.Pool({ host: "127.0.0.1", port: 5491, user: "demo", password: "demo", database: "demo", max: 4 });
const q = async (t, p = []) => (await pool.query(t, p)).rows;
const one = async (t, p) => (await q(t, p))[0];
let pass = 0, fail = 0; const failures = [];
const check = (name, ok, detail = "") => { if (ok) pass++; else { fail++; failures.push(name); } console.log(`${ok ? "PASS" : "FAIL"}  [REG] ${name}${detail ? `  — ${detail}` : ""}`); };
const enc = new TextEncoder();
async function sign(v) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode("demo-session-secret"));
  const k = await crypto.subtle.importKey("raw", d, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC", k, enc.encode(v))).toString("hex");
}
async function tok(p) { const s = `${p}.${Date.now() + 3600_000}`; return `vericert_customer_session=${s}.${await sign(s)}`; }
const COMMAND = await tok(`demo-command~2fa~${Date.now()}`);
const BUYER = await tok(`demo-customer~s~${Date.now()}`);
async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(BASE + path, { method, redirect: "manual", headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
  return { status: res.status, data, text, headers: res.headers };
}
await q("DELETE FROM rate_limits");

// --- product & strength management (Stage 1) ---
const list = await api("/api/executive/products", { cookie: COMMAND });
check("products: executive list loads", list.status === 200 && list.data.products.length > 0);
const prod = list.data.products.find((p) => p.slug === "ipamorelin");
const sizes = prod.sizes.map((s) => ({ id: s.id, label: s.label, priceUsd: s.priceUsd ?? null }));
const add = await api(`/api/executive/products/${prod.slug}`, { method: "PATCH", cookie: COMMAND, body: { sizes: [...sizes, { label: "77mg", priceUsd: null }] } });
const newS = await one("SELECT id, sku FROM product_strengths WHERE product_slug = $1 AND label = '77mg'", [prod.slug]);
check("strengths: a new strength gets a permanent id and a server-made SKU", add.status === 200 && Boolean(newS?.id) && /77MG/.test(newS?.sku ?? ""), `${add.status} ${newS?.sku}`);
const open = await one("SELECT si.physical_quantity::int AS p, (SELECT count(*)::int FROM inventory_movements m WHERE m.strength_id = $1 AND m.movement_type = 'opening_balance') AS n FROM strength_inventory si WHERE si.strength_id = $1", [newS.id]);
check("strengths: opening stock row at 0 with one opening-balance movement (reconciled with no lots)", open?.p === 0 && open.n === 1);
const ren = await api(`/api/executive/products/${prod.slug}`, { method: "PATCH", cookie: COMMAND, body: { sizes: [...sizes, { id: newS.id, label: "78mg", priceUsd: null }] } });
const after = await one("SELECT id, sku, label FROM product_strengths WHERE id = $1", [newS.id]);
check("strengths: renaming keeps the permanent id and SKU", ren.status === 200 && after.label === "78mg" && after.sku === newS.sku);
const dup = await api(`/api/executive/products/${prod.slug}`, { method: "PATCH", cookie: COMMAND, body: { sizes: [...sizes, { id: newS.id, label: "78mg", priceUsd: null }, { label: "78 MG", priceUsd: null }] } });
check("strengths: a duplicate strength (case/space) is refused", dup.status >= 400 && dup.status < 500, String(dup.status));
const stockSave = await api(`/api/executive/products/${prod.slug}`, { method: "PATCH", cookie: COMMAND, body: { sizeStock: { "10mg": 5 } } });
check("product saves still can't set stock (400)", stockSave.status === 400);
let skuDup = false;
try { await q("INSERT INTO product_strengths (id, product_slug, label, sku, position, active, availability_status, created_at, updated_at) VALUES ($1, 'ipamorelin', 'zz', lower($2), 99, false, 'coming_soon', 'x', 'x')", [randomUUID(), newS.sku]); } catch { skuDup = true; }
check("SKU uniqueness: the database refuses a second SKU differing only in case", skuDup);

// --- Stock (Stage 2) ---
const inv = await api("/api/executive/inventory", { cookie: COMMAND });
check("stock list: every strength row has physical, reserved, available, sellable, threshold, level", inv.status === 200 && inv.data.rows.every((r) => ["physical", "reserved", "available", "sellable", "threshold"].every((k) => typeof r[k] === "number") && r.level));
check("stock list: recent movements returned", Array.isArray(inv.data.recent) && inv.data.recent.length > 0);
const s = (await one("SELECT id FROM product_strengths WHERE sku = 'KPV-10MG'"));
const th = await api(`/api/executive/inventory/${s.id}/threshold`, { method: "PUT", cookie: COMMAND, body: { threshold: 25, idempotencyKey: randomUUID() } });
const det = await api(`/api/executive/inventory/${s.id}`, { cookie: COMMAND });
check("thresholds: saving records a threshold_changed movement", th.status === 200 && det.data.movements[0].type === "threshold_changed" && det.data.row.threshold === 25);
check("levels: computed from sellable units (only quarantined stock → zero)", det.data.row.sellable === 0 ? det.data.row.level === "zero" : true, `${det.data.row.sellable} → ${det.data.row.level}`);
const thBad = await api(`/api/executive/inventory/${s.id}/threshold`, { method: "PUT", cookie: COMMAND, body: { threshold: -1, idempotencyKey: randomUUID() } });
check("thresholds: invalid value refused (400)", thBad.status === 400);
const ordered = det.data.movements.every((m, i, a) => i === 0 || a[i - 1].createdAt >= m.createdAt);
check("movement history: newest first", ordered);
let appendOnly = false;
try { await q("UPDATE inventory_movements SET reason = 'x' WHERE id = $1", [det.data.movements[0].id]); } catch { appendOnly = true; }
check("movement history: append-only (UPDATE rejected)", appendOnly);
const lowAlerts = await api("/api/executive/overview", { cookie: COMMAND });
check("overview (low-stock alerts) still loads", lowAlerts.status === 200);

// --- storefront & catalog ---
for (const [path, name] of [["/", "home"], ["/shop", "catalog"], ["/shop/kpv", "product page"], ["/how-we-test", "How We Test"]]) {
  const r = await fetch(BASE + path, { headers: { Cookie: `${BUYER}; vericert_age_ack=1` } });
  check(`storefront: ${name} renders (200)`, r.status === 200, String(r.status));
}
const anonShop = await fetch(`${BASE}/shop/kpv`);
check("catalog gate: signed-out product page still hides prices/stock", anonShop.status === 200 && !/Add to Cart/.test(await anonShop.text()));
const cat = await api("/api/catalog");
check("catalog API responds", cat.status === 200 || cat.status === 401, String(cat.status));
const canon = await fetch(`${BASE}/shop/ipamorelin?strength=${encodeURIComponent(newS.id)}`, { headers: { Cookie: `${BUYER}; vericert_age_ack=1` }, redirect: "manual" });
check("?strength= links still resolve", canon.status === 200 || canon.status === 307 || canon.status === 308, String(canon.status));

// --- certificates ---
const certs = await api("/api/executive/certificates", { cookie: COMMAND });
const certsAnon = await api("/api/executive/certificates");
check("certificates: admin list loads for staff, refused signed out", certs.status === 200 && certsAnon.status === 401);
const vs = await api("/api/verify/search?q=BPC");
check("certificates: public verify search responds", vs.status === 200, String(vs.status));
const lotPage = await fetch(`${BASE}/lot/NO-SUCH-LOT`);
check("certificates: an unknown lot page renders its not-verified message (200, unchanged since 7161af7)", lotPage.status === 200, String(lotPage.status));
const coaUnchanged = await one("SELECT count(*)::int AS n FROM coa_records");
check("certificates: Stage 3 created no certificate records", coaUnchanged.n === 0);

// --- authentication ---
const email = `reg-${randomUUID().slice(0, 8)}@example.invalid`;
const reg = await api("/api/auth/register", { method: "POST", cookie: "vericert_age_ack=1", body: { firstName: "Reg", lastName: "Test", email, password: "Correct-Horse-Battery-77", researchCategory: "Laboratory", phone: "+15125550123", acknowledgment: true } });
check("auth: registration works", reg.status === 200 || reg.status === 201, `${reg.status} ${JSON.stringify(reg.data).slice(0, 120)}`);
const login = await api("/api/auth/login", { method: "POST", body: { email, password: "Correct-Horse-Battery-77" } });
const setCookie = login.headers.get("set-cookie") ?? "";
check("auth: login with the right password sets a session", login.status === 200 && /vericert_customer_session=/.test(setCookie), String(login.status));
const bad = await api("/api/auth/login", { method: "POST", body: { email, password: "wrong-password-123" } });
check("auth: wrong password refused", bad.status === 401 || bad.status === 400, String(bad.status));
const me = await api("/api/auth/me", { cookie: setCookie.split(";")[0] });
check("auth: session identifies the user", me.status === 200 && JSON.stringify(me.data).includes(email));
const meStaff = await api("/api/executive/orders", { cookie: setCookie.split(";")[0] });
check("auth: a new customer account has no executive access", meStaff.status === 401);

// --- ordering restrictions & subscriptions ---
await q("UPDATE site_content SET value = '{\"enabled\":false}' WHERE key = 'ordering'");
const gated = await api("/api/orders", { method: "POST", cookie: BUYER, body: { customer: { firstName: "a", lastName: "b", email: "buyer1@example.invalid", address: "1", city: "c", state: "TX", postalCode: "7", country: "US" }, items: [{ slug: "kpv", sizeLabel: "10mg", quantity: 1 }], paymentMethod: "bank_transfer", researchAttestation: true } });
check("ordering gate: off → 403", gated.status === 403);
await q("UPDATE site_content SET value = '{\"enabled\":true}' WHERE key = 'ordering'");
const noAttest = await api("/api/orders", { method: "POST", cookie: BUYER, body: { customer: { firstName: "a", lastName: "b", email: "buyer1@example.invalid", address: "1", city: "c", state: "TX", postalCode: "7", country: "US" }, items: [{ slug: "kpv", sizeLabel: "10mg", quantity: 1 }], paymentMethod: "bank_transfer" } });
check("checkout: research-use attestation still required (400)", noAttest.status === 400);
const anonOrder = await api("/api/orders", { method: "POST", body: {} });
check("checkout: signed-out order refused (401)", anonOrder.status === 401);
const sub = await fetch(`${BASE}/api/cron/subscriptions`, { headers: { Authorization: "Bearer demo-cron" } });
check("subscriptions cron still runs with its secret", sub.status === 200, String(sub.status));
const bpc20 = await one("SELECT active::text AS a FROM product_strengths WHERE sku = 'BPC-157-20MG'");
check("BPC-157 20mg: not reactivated (absent from this catalog copy, or inactive)", !bpc20 || bpc20.a === "false", bpc20 ? bpc20.a : "absent");

console.log(`\n[REG] ${pass} passed, ${fail} failed (${pass + fail} checks)${failures.length ? `\nFAILED: ${failures.join(" | ")}` : ""}`);
await pool.end();
process.exit(fail ? 1 : 0);
