// Post-deploy check: the login page must actually render in a real browser, with no script or
// stylesheet answered as HTML. Usage: node scripts/verify-site.mjs https://managementik.com
import { chromium } from "@playwright/test";

const base = process.argv[2];
if (!base) throw new Error("usage: verify-site.mjs <base url>");
const problems = [];
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const page = await browser.newPage();
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
page.on("response", (r) => {
  const ct = r.headers()["content-type"] || "";
  if (/\.(js|css)(\?|$)/.test(r.url()) && !/javascript|css/.test(ct)) problems.push(`${r.url()} answered ${r.status()} as ${ct}`);
});
await page.goto(`${base}/login`, { waitUntil: "networkidle", timeout: 45000 });
const rendered = await page.locator("#email").count();
await browser.close();
if (!rendered) problems.push("the login form did not render (blank page)");
if (problems.length) {
  console.error(`::error::${base}/login is broken:\n` + problems.join("\n"));
  process.exit(1);
}
console.log(`${base}/login renders`);
