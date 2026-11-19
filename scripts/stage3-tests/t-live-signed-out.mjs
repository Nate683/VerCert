// LIVE, SIGNED-OUT, NON-MUTATING checks of the Stage 3 deploy on https://vericertpeptides.com.
// Only GETs and requests the server must refuse (no session, no cron secret). Nothing is created or changed.
const BASE = "https://vericertpeptides.com";
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  [LIVE] ${name}${detail ? `  — ${detail}` : ""}`); };
const req = async (path, opts = {}) => {
  const r = await fetch(BASE + path, { redirect: "manual", ...opts });
  const text = await r.text();
  return { status: r.status, text };
};

const home = await req("/");
check("homepage loads", home.status === 200, String(home.status));
for (const path of ["/api/cron/reservations", "/api/cron/subscriptions"]) {
  const none = await req(path), wrong = await req(path, { headers: { Authorization: "Bearer wrong" } });
  check(`${path}: no / wrong secret → 401`, none.status === 401 && wrong.status === 401, `${none.status}/${wrong.status}`);
}
// Stage 3-only executive routes: they exist (401, not 404) and refuse a signed-out request.
const execRoutes = [["GET", "/api/executive/orders"], ["GET", "/api/executive/payment-methods"], ["GET", "/api/executive/reservations"],
  ["GET", "/api/executive/lots/x"], ["POST", "/api/executive/orders/x/confirm-payment"], ["POST", "/api/executive/orders/x/void-payment"],
  ["POST", "/api/executive/orders/x/reallocate"], ["POST", "/api/executive/orders/x/refund"]];
for (const [method, path] of execRoutes) {
  const r = await req(path, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" ? undefined : "{}" });
  check(`${method} ${path}: signed out → 401`, r.status === 401, String(r.status));
}
// Next answers a POST to a missing route with its not-found page (status 200), so check what was matched.
const mp = await fetch(BASE + "/api/executive/orders/x/mark-paid", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/json" }, body: "{}" });
const mpGet = await fetch(BASE + "/api/executive/orders/x/mark-paid", { redirect: "manual" });
check("Stage 2 mark-paid route is gone (matched /_not-found; GET → 404)", mp.headers.get("x-matched-path") === "/_not-found" && mpGet.status === 404,
  `${mp.status} ${mp.headers.get("x-matched-path")} / GET ${mpGet.status}`);
const order = await req("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
check("checkout: signed-out order refused (401)", order.status === 401, String(order.status));
// The public status endpoint reads the migrated order (new columns) — test order shows cancelled.
const st = await req("/api/orders/VC-E3SQJ9/status");
let stJson = null; try { stJson = JSON.parse(st.text); } catch {}
check("order status endpoint reads a migrated order: VC-E3SQJ9 is cancelled", st.status === 200 && stJson?.status === "cancelled", `${st.status} ${st.text.slice(0, 80)}`);
const shop = await req("/shop");
check("shop page loads", shop.status === 200 || shop.status === 307 || shop.status === 308, String(shop.status));
console.log(`\n[LIVE] ${pass} passed, ${fail} failed (${pass + fail} checks)`);
process.exit(fail ? 1 : 0);
