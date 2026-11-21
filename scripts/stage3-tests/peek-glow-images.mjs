// LOCAL ONLY. Lists the images on the local GLOW product page (signed in), to see how the hero vial is rendered.
import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const edge = spawn(EDGE, ["--headless=new", "--user-data-dir=" + process.env.TEMP + "/edge-peek-r1", "--remote-debugging-port=9336", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = new TextEncoder();
async function sign(v) { const d = await crypto.subtle.digest("SHA-256", enc.encode("demo-session-secret")); const k = await crypto.subtle.importKey("raw", d, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return Buffer.from(await crypto.subtle.sign("HMAC", k, enc.encode(v))).toString("hex"); }
const s = `demo-customer~s~${Date.now()}.${Date.now() + 3600_000}`;
let browser; for (let i = 0; i < 40 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9336" }); } catch { await sleep(250); } }
const page = await browser.newPage();
await page.setCookie({ name: "vericert_customer_session", value: `${s}.${await sign(s)}`, domain: "localhost", path: "/" }, { name: "vericert_age_ack", value: "1", domain: "localhost", path: "/" });
await page.goto("http://localhost:3300/shop/glow-blend", { waitUntil: "networkidle0" });
console.log(JSON.stringify(await page.evaluate(() => ({
  main: Boolean(document.querySelector("main")),
  imgs: [...document.querySelectorAll("img")].map((i) => ({ alt: i.alt, src: i.getAttribute("src")?.slice(0, 70), inHeader: Boolean(i.closest("header")), inFooter: Boolean(i.closest("footer")) })),
  gallery: [...document.querySelectorAll("[data-gallery], [data-product-gallery], [class*=gallery]")].length,
  svgVials: document.querySelectorAll("svg").length,
})), null, 1));
await browser.close(); edge.kill();
