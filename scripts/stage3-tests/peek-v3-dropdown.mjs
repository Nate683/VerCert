// LOCAL ONLY. Debug: at 1366px signed out, type in the desktop search and sample the dropdown's computed opacity
// (and its ancestors') over time; screenshot at 1.5 s. Nothing is changed.
import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
import os from "os";
import path from "path";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const edge = spawn(EDGE, ["--headless=new", `--user-data-dir=${path.join(os.tmpdir(), `edge-peek-dd-${Date.now()}`)}`, "--remote-debugging-port=9346", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser; for (let i = 0; i < 40 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9346" }); } catch { await sleep(250); } }
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 860 });
await page.setCookie({ name: "vericert_age_ack", value: "1", domain: "localhost", path: "/" });
await page.goto("http://localhost:3300/about", { waitUntil: "networkidle0" });
const input = await page.evaluateHandle(() => [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null).querySelector("input"));
await input.focus(); await input.type("bpc");
const t0 = Date.now();
for (const at of [100, 300, 600, 1000, 1500]) {
  while (Date.now() - t0 < at) await sleep(20);
  const o = await page.evaluate(() => { const p = [...document.querySelectorAll("[data-public-results]")].find((e) => e.offsetParent !== null);
    const chain = []; for (let n = p; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.opacity !== "1" || cs.backgroundColor.includes("/") ) chain.push(`${n.tagName}.${(n.className || "").toString().split(" ").slice(0, 2).join(".")} opacity=${cs.opacity}`); }
    return { bg: getComputedStyle(p).backgroundColor, opacity: getComputedStyle(p).opacity, anim: getComputedStyle(p).animationName, chain }; });
  console.log(`+${at}ms`, JSON.stringify(o));
}
console.log("topmost at points:", JSON.stringify(await page.evaluate(() => [[400,250],[300,190],[600,280]].map(([x,y]) => { const els = document.elementsFromPoint(x,y).slice(0,5); return { at: [x,y], stack: els.map((e) => { const cs = getComputedStyle(e); return `${e.tagName}.${(e.className||"").toString().slice(0,60)} z=${cs.zIndex} pos=${cs.position} op=${cs.opacity} bg=${cs.backgroundColor}`; }) }; }))));
console.log("covering (incl. pointer-events:none):", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.left <= 400 && r.right >= 400 && r.top <= 250 && r.bottom >= 250 && (cs.pointerEvents === "none" || (cs.position !== "static" && cs.zIndex !== "auto")); }).map((e) => { const cs = getComputedStyle(e); return `${e.tagName}.${(e.className||"").toString().slice(0,70)} z=${cs.zIndex} pos=${cs.position} pe=${cs.pointerEvents} op=${cs.opacity} filter=${cs.filter} mix=${cs.mixBlendMode} bdf=${cs.backdropFilter}`; }))));
await page.screenshot({ path: "peek-dd-1500.png", clip: { x: 0, y: 0, width: 1366, height: 420 } });
await browser.close(); edge.kill();
