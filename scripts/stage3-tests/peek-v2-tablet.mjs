// LOCAL ONLY. At tablet widths (header search shown, below full desktop): which pricing phrase is visible, its natural
// width in the field's font, the room, and whether anything is clipped. Nothing is changed.
import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const edge = spawn(EDGE, ["--headless=new", "--user-data-dir=" + process.env.TEMP + `/edge-tab-${Date.now()}`, "--remote-debugging-port=9341", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser; for (let i = 0; i < 40 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9341" }); } catch { await sleep(250); } }
const page = await browser.newPage();
await page.setCookie({ name: "vericert_age_ack", value: "1", domain: "localhost", path: "/" });
for (const width of [768, 1024, 1279]) {
  await page.setViewport({ width, height: 860 });
  await page.goto("http://localhost:3300/about", { waitUntil: "load" }); await sleep(1000);
  const r = await page.evaluate(() => {
    const el = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null);
    if (!el) return null;
    const s = el.querySelector("[data-placeholder]"); const cs = getComputedStyle(s);
    const m = document.createElement("span"); m.textContent = s.innerText;
    Object.assign(m.style, { position: "absolute", visibility: "hidden", whiteSpace: "nowrap", font: cs.font, letterSpacing: cs.letterSpacing, textTransform: cs.textTransform });
    document.body.appendChild(m); const w = Math.ceil(m.getBoundingClientRect().width); m.remove();
    return { shown: s.innerText, width: w, room: s.clientWidth, field: Math.round(el.getBoundingClientRect().width), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  console.log(`${width}px: ${r ? `"${r.shown}" ${r.width}px in ${r.room}px (field ${r.field}px) → ${r.width <= r.room ? `fits, ${r.room - r.width}px spare` : "DOES NOT FIT"}; horizontal scroll: ${r.overflow}` : "header search not shown"}`);
}
await browser.close(); edge.kill();
