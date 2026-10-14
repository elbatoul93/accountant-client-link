import { test, expect } from "@playwright/test";
import { FakeSupabase } from "./fakeSupabase";

let backend: FakeSupabase;

test.beforeEach(async ({ page }) => {
  backend = new FakeSupabase();
  await backend.install(page);
  // Default UI language is Arabic; the selectors below use ids, but English text is easier to read in failures.
  await page.addInitScript(() => localStorage.setItem("mgmtk_lang", "en"));
});

test("accountant signs up, confirms the email, signs in and waits for activation", async ({ page }) => {
  await page.goto("/signup");
  await page.fill("#name", "Amel Test");
  await page.fill("#email", "amel@example.com");
  await page.fill("#password", "correct-horse-1");

  // Consent is required before the request is sent.
  await page.getByRole("button", { name: /sign ?up|create/i }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(backend.signupCalls).toHaveLength(0);

  await page.locator("#accept-terms").click();
  await page.getByRole("button", { name: /sign ?up|create/i }).click();

  // Email confirmation is on: the user is sent to the login page with the address prefilled.
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("#email")).toHaveValue("amel@example.com");
  expect(backend.signupCalls[0]).toMatchObject({ email: "amel@example.com", data: { role: "accountant", name: "Amel Test" } });

  // Signing in before confirming shows the resend option, not a crash.
  await page.fill("#password", "correct-horse-1");
  await page.getByRole("button", { name: /sign ?in|log ?in/i }).click();
  await expect(page.getByRole("button", { name: /resend/i })).toBeVisible();

  // After the email link is clicked, sign-in works. New accountants wait for an admin.
  backend.confirm("amel@example.com");
  await page.getByRole("button", { name: /sign ?in|log ?in/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/accountant$/);
  await expect(page.getByRole("status")).toBeVisible(); // "account pending" screen

  // Once an admin activates the account, a reload shows the real dashboard.
  backend.activate("amel@example.com");
  await page.reload();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByText("Amel Test").first()).toBeVisible();
});

test("wrong password shows an error and stays on the login page", async ({ page }) => {
  backend.seed({ email: "karim@example.com", password: "right-password-1", role: "client", name: "Karim Client" });
  await page.goto("/login");
  await page.fill("#email", "karim@example.com");
  await page.fill("#password", "wrong-password-1");
  await page.getByRole("button", { name: /sign ?in|log ?in/i }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("client signs in, lands on the client dashboard and keeps the session on reload", async ({ page }) => {
  backend.seed({ email: "karim@example.com", password: "right-password-1", role: "client", name: "Karim Client" });
  await page.goto("/login");
  await page.fill("#email", "karim@example.com");
  await page.fill("#password", "right-password-1");
  await page.getByRole("button", { name: /sign ?in|log ?in/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/client$/);
  await expect(page.getByText("Karim").first()).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/dashboard\/client$/);
  await expect(page.getByText("Karim").first()).toBeVisible();
});

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/dashboard/client");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard/accountant");
  await expect(page).toHaveURL(/\/login$/);
});
