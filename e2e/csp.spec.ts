import { test, expect, type Page } from "@playwright/test";
import { FakeSupabase } from "./fakeSupabase";
import { enforceCsp, realCsp } from "./csp";

// Signed-in screens under the Content-Security-Policy from public/_headers (OPS-6).
// A blocked script, style, font, image, frame or connection shows up as a violation.

let backend: FakeSupabase;
let violations: string[];

test.beforeEach(async ({ page }) => {
  backend = new FakeSupabase();
  await backend.install(page);
  violations = await enforceCsp(page);
  await page.addInitScript(() => localStorage.setItem("mgmtk_lang", "en"));
});

async function signIn(page: Page, email: string, password: string, dashboard: RegExp) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: /sign ?in|log ?in/i }).click();
  await expect(page).toHaveURL(dashboard);
}

/** Click every tab and open (then close) the first dialog trigger of a screen. */
async function exercise(page: Page) {
  for (const tab of await page.getByRole("tab").all()) {
    await tab.click();
    await page.waitForTimeout(100);
  }
  const add = page.getByRole("button", { name: /add (a )?(new )?client|invite/i }).first();
  if (await add.isVisible().catch(() => false)) {
    await add.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
  }
}

test("the enforced policy is the one in public/_headers", async ({ page }) => {
  expect(realCsp()).toContain("script-src 'self'");
  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible();
  expect(violations).toEqual([]);
});

test("active accountant: dashboard, tabs, dialog, account page, help", async ({ page }) => {
  backend.seed({ email: "amel@example.com", password: "right-password-1", role: "accountant", name: "Amel Accountant" });
  await signIn(page, "amel@example.com", "right-password-1", /\/dashboard\/accountant$/);
  await expect(page.getByText("Amel").first()).toBeVisible();
  await exercise(page);
  await page.goto("/account");
  await expect(page.getByText("amel@example.com").first()).toBeVisible();
  await page.goto("/help");
  await expect(page.locator("body")).not.toBeEmpty();
  expect(violations).toEqual([]);
});

test("client: dashboard, tabs and account page", async ({ page }) => {
  backend.seed({ email: "karim@example.com", password: "right-password-1", role: "client", name: "Karim Client" });
  await signIn(page, "karim@example.com", "right-password-1", /\/dashboard\/client$/);
  await expect(page.getByText("Karim").first()).toBeVisible();
  await exercise(page);
  await page.goto("/account");
  await expect(page.getByText("karim@example.com").first()).toBeVisible();
  expect(violations).toEqual([]);
});
