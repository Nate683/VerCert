// LOCAL ONLY. Debug the translucent-looking header dropdown: screenshot it as is, then with (a) the header's
// backdrop-filter removed, (b) the pop-in animation removed — temporary in-page style changes in this test browser
// only — and (c) a SIGNED-IN dropdown (unchanged code). Also reports whether the headless browser has GPU compositing.
import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
import os from "os";
import path from "path";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const edge = spawn(EDGE, ["--headless=new", `--user-data-dir=${path.join(os.tmpdir(), `edge-peek-tr-${Date.now()}`)}`, "--remote-debugging-port=9347", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser; for (let i = 0; i < 40 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9347" }); } catch { await sleep(250); } }
const enc = new TextEncoder();
async function sign(v) { const d = await crypto.subtle.digest("SHA-256", enc.encode("demo-session-secret")); const k = await crypto.subtle.importKey("raw", d, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return Buffer.from(await crypto.subtle.sign("HMAC", k, enc.encode(v))).toString("hex"); }
// Mean brightness of a 40×40 square inside the dropdown, below the header (charcoal ≈ 38; washed out ≈ 150).
const sample = async (page, x, y) => page.evaluate(async (x, y, png) => { const i = new Image(); i.src = `data:image/png;base64,${png}`; await i.decode(); const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const g = c.getContext("2d"); g.drawImage(i, 0, 0); const d = g.getImageData(x, y, 40, 40).data; let s = 0; for (let k = 0; k < d.length; k += 4) s += (d[k] + d[k + 1] + d[k + 2]) / 3; return Math.round(s / (d.length / 4)); }, x, y, (await page.screenshot({ encoding: "base64" })));
async function run(label, signedIn, tweak) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); await page.setViewport({ width: 1366, height: 860 });
  const cookies = [{ name: "vericert_age_ack", value: "1", domain: "localhost", path: "/" }];
  if (signedIn) { const s = `demo-customer~s~${Date.now()}.${Date.now() + 3600_000}`; cookies.push({ name: "vericert_customer_session", value: `${s}.${await sign(s)}`, domain: "localhost", path: "/" }); }
  await ctx.setCookie(...cookies);
  await page.goto("http://localhost:3300/about", { waitUntil: "networkidle0" });
  if (tweak) await page.addStyleTag({ content: tweak });
  const input = await page.evaluateHandle((si) => (si ? document.querySelector("#catalog-search") : [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null).querySelector("input")), signedIn);
  await input.focus(); await input.type("bpc"); await sleep(800);
  const r = await page.evaluate((si) => { const p = si ? document.querySelector("#catalog-search-results") : [...document.querySelectorAll("[data-public-results]")].find((e) => e.offsetParent !== null); const b = p.getBoundingClientRect(); return { x: Math.round(b.left + 10), y: Math.round(b.bottom - 50) }; }, signedIn);
  const brightness = await sample(page, r.x, r.y);
  await page.screenshot({ path: `peek-tr-${label}.png` });
  console.log(`${label}: brightness inside the dropdown below the header = ${brightness} (charcoal ≈ 38)`);
  await ctx.close();
}
const gpu = await (async () => { const p = await browser.newPage(); await p.goto("about:blank"); const v = await p.evaluate(() => { const c = document.createElement("canvas").getContext("webgl"); return c ? "webgl available" : "no webgl (software compositing)"; }); await p.close(); return v; })();
console.log("compositing:", gpu);
await run("signed-out-as-is", false, null);
await run("signed-out-no-backdrop-filter", false, "header { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }");
await run("signed-out-no-pop-in", false, ".pop-in { animation: none !important; }");
await run("signed-in-as-is", true, null);
await browser.close(); edge.kill();
