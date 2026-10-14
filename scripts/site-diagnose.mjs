// Compares the production domain with the built-in pages.dev address and loads /login in Chromium.
import { chromium } from "@playwright/test";

const HOSTS = ["https://managementik.com", "https://accountant-client-link.pages.dev"];
const out = {};

async function get(url, ua) {
  const res = await fetch(url, { redirect: "manual", headers: ua ? { "user-agent": ua } : {} });
  const body = await res.text();
  const h = Object.fromEntries(res.headers.entries());
  return { status: res.status, h, body };
}
const pick = (h) => Object.fromEntries(["content-type", "cf-cache-status", "age", "cache-control", "etag", "server", "location", "cf-mitigated", "content-length"].map((k) => [k, h[k]]).filter(([, v]) => v !== undefined));

for (const host of HOSTS) {
  out[host] = {};
  const root = await get(host + "/");
  const bundle = (root.body.match(/assets\/index-[A-Za-z0-9_-]*\.js/) || [])[0];
  const css = (root.body.match(/assets\/index-[A-Za-z0-9_-]*\.css/) || [])[0];
  out[host].root = { status: root.status, ...pick(root.h), bundle, css, htmlLength: root.body.length, htmlHead: root.body.slice(0, 1500) };
  for (const path of ["/login", ...(bundle ? ["/" + bundle] : []), ...(css ? ["/" + css] : []), "/assets/does-not-exist-12345.js"]) {
    const r = await get(host + path);
    out[host][path] = { status: r.status, ...pick(r.h), startsWith: r.body.slice(0, 80).replace(/\s+/g, " ") };
  }
}

// Same asset requested from the other host's bundle name
const a = out[HOSTS[0]].root, b = out[HOSTS[1]].root;
out.sameHtml = a.htmlHead === b.htmlHead;
out.sameBundle = a.bundle === b.bundle;

// Browser load
const browser = await chromium.launch();
for (const host of HOSTS) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const log = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) log.push(`${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
  page.on("response", (r) => { const ct = r.headers()["content-type"] || ""; if (/\.(js|css)(\?|$)/.test(r.url()) && !/javascript|css/.test(ct)) log.push(`BAD MIME ${r.status()} ${ct} ${r.url()}`); });
  page.on("requestfailed", (r) => log.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  await page.goto(host + "/login", { waitUntil: "networkidle", timeout: 45000 }).catch((e) => log.push("goto: " + e.message));
  const hasForm = await page.locator("#email").count();
  out[host].browser = { loginFormRendered: hasForm > 0, bodyTextStart: (await page.locator("body").innerText().catch(() => "")).slice(0, 120), log };
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 2));
