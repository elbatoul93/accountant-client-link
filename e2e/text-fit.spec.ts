import { appendFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { FakeSupabase } from "./fakeSupabase";
import { scanTextFit, type TextFitIssue } from "./textFit";

// Text must not touch or cross the border of the button, field, tab, badge or card that holds it.
// Every screen is scanned in Arabic (RTL), French and English at desktop and phone width; French and Arabic
// labels are the longest and the ones most likely to break a box that fits the English label.

const LANGS = ["ar", "fr", "en"] as const;
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844 },
];

let backend: FakeSupabase;
let found: string[] = [];

async function scan(page: Page, where: string) {
  const issues: TextFitIssue[] = await scanTextFit(page);
  for (const i of issues) found.push(`${where} | ${i.kind} | <${i.tag.toLowerCase()}> "${i.text}" | ${i.detail} | ${i.cls}`);
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "right-password-1");
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/dashboard\//);
  await page.waitForLoadState("networkidle");
}

async function seedAccountant(_page: Page) {
    // Long names and every kind of record, so rows, badges and tables hold realistic text.
    const amel = backend.users.find((u) => u.email === "amel@example.com")!;
    const karim = backend.users.find((u) => u.email === "karim@example.com")!;
    backend.rows("acc_clients").push(
      { id: "c-1", accountant_id: amel.id, client_ref: karim.id, name: "Karim Client", company: "Société Algérienne de Commerce et de Distribution Générale SARL", tax_id: "000016001234567", email: "karim.long-address@example.com", tax_regime: "REEL", status: "active", data: { legal_form: "SARL", phone: "0550 12 34 56" } },
      { id: "c-2", accountant_id: amel.id, client_ref: "0d3e0000-0000-4000-8000-000000000002", name: "عبد الرحمان بن عبد القادر الجزائري", company: "شركة المغرب العربي للتجارة والخدمات ذات المسؤولية المحدودة", tax_id: "000016009876543", email: "ar@example.com", tax_regime: "IFU", status: "review", data: {} },
    );
    backend.rows("acc_invoices").push(
      { id: "i-1", accountant_id: amel.id, client_ref: karim.id, client_name: "Karim Client", amount: 1234567.89, invoice_date: "2026-10-01", status: "pending", created_at: "2026-10-01T10:00:00Z" },
      { id: "i-2", accountant_id: amel.id, client_ref: "0d3e0000-0000-4000-8000-000000000002", client_name: "عبد الرحمان بن عبد القادر الجزائري", amount: 98000, invoice_date: "2026-09-01", status: "paid", created_at: "2026-09-01T10:00:00Z" },
    );
    backend.rows("acc_declarations").push(
      { id: "d-1", accountant_id: amel.id, client_ref: karim.id, client_name: "Karim Client", decl_type: "G50", amount: 264500, due_date: "2999-12-20", status: "filed", created_at: "2026-10-01T10:00:00Z" },
      { id: "d-2", accountant_id: amel.id, client_ref: karim.id, client_name: "Karim Client", decl_type: "IRG", amount: 12000, due_date: "2020-01-20", status: "pending", created_at: "2026-10-01T10:00:00Z" },
    );
    backend.rows("acc_employees").push(
      { id: "e-1", accountant_id: amel.id, client_ref: karim.id, name: "Mohamed Abderrahmane Benabdallah-Boumediene", position: "Directeur administratif et financier", basic: 185000, iew: 0, prc: 0, other: 0, dependents: 3, nss: "123456789012", hire_date: "2024-01-01", end_date: null, created_at: "2026-01-01T00:00:00Z" },
    );
}

async function closeOverlays(page: Page) {
  for (let k = 0; k < 5; k++) {
    if (!(await page.locator("[role=dialog]:visible, [role=alertdialog]:visible, [role=listbox]:visible").count())) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  }
  await page.reload();
  await page.waitForLoadState("networkidle");
}

async function openEveryDialog(page: Page, where: string) {
  const buttons = page.locator("main button:visible");
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const btn = page.locator("main button:visible").nth(i);
    if (!(await btn.isVisible().catch(() => false)) || !(await btn.isEnabled().catch(() => false))) continue;
    const name = ((await btn.textContent().catch(() => "")) ?? "").trim().slice(0, 24);
    await btn.click({ timeout: 2000 }).catch(() => undefined);
    const dialog = page.locator("[role=dialog]:visible, [role=alertdialog]:visible").last();
    if (await dialog.count()) {
      await page.waitForTimeout(150);
      await scan(page, `${where} dialog "${name}"`);
      const selects = dialog.getByRole("combobox");
      for (let j = 0; j < Math.min(await selects.count(), 3); j++) {
        await selects.nth(j).click({ timeout: 2000 }).catch(() => undefined);
        await scan(page, `${where} dialog "${name}" select ${j}`);
        await page.keyboard.press("Escape");
      }
      await closeOverlays(page);
    }
  }
}

for (const lang of LANGS) {
  for (const vp of VIEWPORTS) {
    test.describe(`${lang} ${vp.name}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test.beforeEach(async ({ page }) => {
        found = [];
        backend = new FakeSupabase();
        await backend.install(page);
        await page.addInitScript((l) => localStorage.setItem("mgmtk_lang", l), lang);
        backend.seed({ email: "amel@example.com", password: "right-password-1", role: "accountant", name: "Amel Accountant", company: "Cabinet Amel Comptabilité" });
        backend.seed({ email: "karim@example.com", password: "right-password-1", role: "client", name: "Karim Client" });
        backend.linkClient("karim@example.com", { tax_id: "000016001234567" });
        backend.seed({ email: "boss@example.com", password: "right-password-1", role: "accountant", name: "Boss Admin" });
        backend.makeAdmin("boss@example.com");
        backend.seed({ email: "newfirm@example.com", password: "right-password-1", role: "accountant", name: "Nadia Newfirm", company: "Newfirm SARL", accountStatus: "pending" });
      });

      test.afterEach(() => {
        if (process.env.TEXT_FIT_REPORT && found.length) appendFileSync(process.env.TEXT_FIT_REPORT, found.map((f) => `${test.info().titlePath[1]} | ${f}`).join("\n") + "\n");
        expect(found, found.join("\n")).toEqual([]);
      });

      test("public pages", async ({ page }) => {
        for (const path of ["/", "/login", "/signup", "/forgot-password", "/privacy", "/terms", "/help", "/no-such-page"]) {
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          await scan(page, path);
        }
        // Signup as the other account type, and a field error state.
        await page.goto("/signup");
        const tabs = page.getByRole("tab");
        for (let i = 0; i < (await tabs.count()); i++) {
          await tabs.nth(i).click();
          await scan(page, `/signup tab ${i}`);
        }
        await page.goto("/login");
        await page.locator("form button[type=submit]").click();
        await scan(page, "/login empty submit");
      });

      test("accountant dashboard, every section and dialog", async ({ page }) => {
        await seedAccountant(page);
        await signIn(page, "amel@example.com");
        await scan(page, "accountant dashboard");
        const nav = vp.name === "desktop" ? page.locator("aside nav button") : page.locator("aside [role=combobox]");
        if (vp.name === "desktop") {
          const n = await nav.count();
          for (let i = 0; i < n; i++) {
            await page.locator("aside nav button").nth(i).click();
            await page.waitForLoadState("networkidle");
            await scan(page, `accountant section ${i}`);
            for (const tab of await page.getByRole("tab").all()) {
              await tab.click();
              await scan(page, `accountant section ${i} tab ${(await tab.textContent())?.slice(0, 20)}`);
            }
          }
        } else {
          await nav.click();
          const count = await page.getByRole("option").count();
          await page.keyboard.press("Escape");
          for (let i = 0; i < count; i++) {
            await nav.click();
            await page.getByRole("option").nth(i).click();
            await page.waitForLoadState("networkidle");
            await scan(page, `accountant section ${i}`);
            for (const tab of await page.getByRole("tab").all()) {
              await tab.click();
              await scan(page, `accountant section ${i} tab ${(await tab.textContent())?.slice(0, 20)}`);
            }
          }
        }
      });

      test("accountant dialogs, popovers and client profile", async ({ page }) => {
        // The slow sweep (it clicks every button on every screen) runs where text is longest: French on desktop, Arabic on a phone.
        test.skip(!((lang === "fr" && vp.name === "desktop") || (lang === "ar" && vp.name === "phone")));
        test.setTimeout(300_000);
        await seedAccountant(page);
        await signIn(page, "amel@example.com");
        const sections = vp.name === "desktop" ? await page.locator("aside nav button").count() : 17;
        for (let i = 0; i < sections; i++) {
          await closeOverlays(page);
          if (vp.name === "desktop") await page.locator("aside nav button").nth(i).click();
          else {
            await page.locator("aside [role=combobox]").click();
            await page.getByRole("option").nth(i).click();
          }
          await page.waitForLoadState("networkidle");
          await openEveryDialog(page, `accountant section ${i}`);
        }
        await closeOverlays(page);
        if (vp.name === "desktop") await page.locator("aside nav button").nth(5).click();
        else { await page.locator("aside [role=combobox]").click(); await page.getByRole("option").nth(5).click(); }
        await page.locator("main tbody tr").first().click();
        await page.waitForLoadState("networkidle");
        await scan(page, "client profile");
        const tabCount = await page.getByRole("tab").count();
        for (let i = 0; i < tabCount; i++) {
          const tab = page.getByRole("tab").nth(i);
          if (!(await tab.count())) break; // a button on the previous tab left the profile
          await tab.click({ timeout: 3000 });
          const label = (await tab.textContent())?.slice(0, 20);
          await scan(page, `client profile tab ${label}`);
          await openEveryDialog(page, `client profile tab ${label}`);
        }
      });

      test("client dashboard", async ({ page }) => {
        await signIn(page, "karim@example.com");
        await scan(page, "client dashboard");
        for (const tab of await page.getByRole("tab").all()) {
          await tab.click();
          await scan(page, `client tab ${(await tab.textContent())?.slice(0, 20)}`);
        }
        await page.goto("/account");
        await page.waitForLoadState("networkidle");
        await scan(page, "/account");
      });

      test("admin", async ({ page }) => {
        await signIn(page, "boss@example.com");
        await page.goto("/admin");
        await page.waitForLoadState("networkidle");
        await scan(page, "/admin");
        for (const tab of await page.getByRole("tab").all()) {
          await tab.click();
          await scan(page, `admin tab ${(await tab.textContent())?.slice(0, 20)}`);
        }
      });
    });
  }
}
