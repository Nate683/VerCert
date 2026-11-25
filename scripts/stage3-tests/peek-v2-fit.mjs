// LOCAL ONLY. Measurements for proposing the placeholder fix (nothing is changed): at full desktop widths, the free
// space in the header row, and each phrase's rendered width in alternative styles, measured with the field's own font.
import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const edge = spawn(EDGE, ["--headless=new", "--user-data-dir=" + process.env.TEMP + `/edge-fit-${Date.now()}`, "--remote-debugging-port=9340", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser; for (let i = 0; i < 40 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9340" }); } catch { await sleep(250); } }
const page = await browser.newPage();
await page.setCookie({ name: "vericert_age_ack", value: "1", domain: "localhost", path: "/" });
for (const width of [1280, 1366, 1440, 1920]) {
  await page.setViewport({ width, height: 860 });
  await page.goto("http://localhost:3300/about", { waitUntil: "load" }); await sleep(800);
  const r = await page.evaluate(() => {
    const field = [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null);
    const slot = field.parentElement; const row = slot.parentElement; const cs = getComputedStyle(row);
    const inner = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const kids = [...row.children].filter((k) => getComputedStyle(k).display !== "none");
    const used = kids.reduce((a, k) => a + k.getBoundingClientRect().width + parseFloat(getComputedStyle(k).marginLeft || 0) + parseFloat(getComputedStyle(k).marginRight || 0), 0) + parseFloat(cs.columnGap || 0) * (kids.length - 1);
    const nav = row.querySelector("nav"); const navGap = nav ? parseFloat(getComputedStyle(nav).columnGap) : null;
    const s = field.querySelector("[data-placeholder]"); const room = s.parentElement.clientWidth;
    const styles = [["13px", "0.08em"], ["13px", "0"], ["12px", "0.04em"], ["12px", "0"], ["11px", "0.08em"], ["11px", "0"]];
    const phrases = ["VIEW COMPOUNDS & PRICES", "SEARCH COMPOUNDS", "COMPOUNDS & PRICES", "VIEW PRICES", "SEARCH"];
    const out = {};
    for (const p of phrases) for (const [fs, ls] of styles) {
      const c = s.cloneNode(false); c.textContent = p; Object.assign(c.style, { visibility: "hidden", position: "absolute", overflow: "visible", maxWidth: "none", fontSize: fs, letterSpacing: ls });
      s.parentElement.appendChild(c); out[`${p} @ ${fs}/${ls}`] = Math.ceil(c.scrollWidth); c.remove();
    }
    return { rowInner: Math.round(inner), used: Math.round(used), free: Math.round(inner - used), slot: Math.round(slot.getBoundingClientRect().width), room, navGap, navItems: nav ? nav.children.length : 0, widths: out };
  });
  console.log(`\n=== ${width}px: header row ${r.rowInner}px, used ${r.used}px, FREE ${r.free}px · search slot ${r.slot}px, text room ${r.room}px · nav gap ${r.navGap}px × ${r.navItems - 1}`);
  if (width === 1280) for (const [k, v] of Object.entries(r.widths)) console.log(`  ${k}: ${v}px ${v <= r.room ? "fits" : `(${v - r.room}px short)`}`);
}
await browser.close(); edge.kill();
