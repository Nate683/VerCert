// LOCAL ONLY. Debug: at 1280px signed out, focus the public search, wait, type "b", and log any navigation.
import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const edge = spawn(EDGE, ["--headless=new", "--user-data-dir=" + process.env.TEMP + "/edge-peek-v2", "--remote-debugging-port=9339", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser; for (let i = 0; i < 40 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9339" }); } catch { await sleep(250); } }
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.setCookie({ name: "vericert_age_ack", value: "1", domain: "localhost", path: "/" });
const t0 = Date.now();
page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log(`+${Date.now() - t0}ms NAVIGATED to`, f.url()); });
page.on("request", (r) => { if (r.isNavigationRequest()) console.log(`+${Date.now() - t0}ms navigation request ${r.url()} (${r.resourceType()})`); });
await page.goto("http://localhost:3300/about", { waitUntil: "networkidle0" });
console.log(`+${Date.now() - t0}ms loaded; idling 40 s`);
await sleep(40000);
const vis = await page.evaluate(() => [...document.querySelectorAll("[data-public-search]")].map((e) => ({ visible: e.offsetParent !== null, rect: e.getBoundingClientRect().toJSON() })));
console.log("boxes:", JSON.stringify(vis));
const input = await page.evaluateHandle(() => [...document.querySelectorAll("[data-public-search]")].find((e) => e.offsetParent !== null).querySelector("input"));
await input.focus(); await sleep(5000);
await input.type("b"); await sleep(1500);
console.log("url after typing:", page.url());
await browser.close(); edge.kill();
