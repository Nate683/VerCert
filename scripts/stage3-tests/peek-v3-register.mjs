// LOCAL ONLY. Debug: fill /register with synthetic data, submit, and print the form's error and the
// /api/auth/register response (status + error text only; no field values are printed).
import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
import os from "os";
import path from "path";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const edge = spawn(EDGE, ["--headless=new", `--user-data-dir=${path.join(os.tmpdir(), `edge-peek-reg-${Date.now()}`)}`, "--remote-debugging-port=9345", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser; for (let i = 0; i < 40 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9345" }); } catch { await sleep(250); } }
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 860 });
await page.setCookie({ name: "vericert_age_ack", value: "1", domain: "localhost", path: "/" });
page.on("response", async (r) => { if (r.url().includes("/api/auth/register")) { let body = ""; try { body = JSON.parse(await r.text()).error ?? "(ok)"; } catch { body = "(non-JSON)"; } console.log("register response:", r.status(), body); } });
await page.goto("http://localhost:3300/register", { waitUntil: "networkidle0" });
await page.type("#register-first-name", "Testfirst"); await page.type("#register-last-name", "Testlast");
await page.type("#register-email", `peek.${Date.now()}@example.invalid`);
const cat = await page.evaluate(() => [...document.querySelectorAll("#register-research-category option")].map((o) => o.value).filter(Boolean)[1]);
await page.select("#register-research-category", cat);
await page.type("#register-phone", "(555) 123-4567");
await page.type("#register-password", "Synthetic-Pass-9x!"); await page.type("#register-password-confirm", "Synthetic-Pass-9x!");
await page.click("#register-acknowledgment");
const fields = await page.evaluate(() => [...document.querySelectorAll("form input, form select")].map((el) => `${el.id}:${el.type === "checkbox" ? el.checked : el.type === "password" ? `len${el.value.length}` : el.value.length ? "filled" : "EMPTY"}${el.required ? "*" : ""}`).join(" "));
console.log("fields:", fields);
await page.evaluate(() => [...document.querySelectorAll("form button")].find((b) => b.type === "submit").click());
await sleep(4000);
console.log("url:", new URL(page.url()).pathname, "| alert:", await page.evaluate(() => document.querySelector('form [role="alert"]')?.innerText ?? "none"),
  "| invalid fields:", await page.evaluate(() => [...document.querySelectorAll("form :invalid")].map((e) => e.id).join(",") || "none"));
await browser.close(); edge.kill();
