import { test, expect, type Page } from "@playwright/test";
import { FakeSupabase } from "./fakeSupabase";

// Admin screens against the in-browser fake backend (e2e/fakeSupabase.ts). The database rules behind
// these calls (who may call them, numbering, immutability) are tested in supabase/tests/*.test.sql;
// these tests check the screens send the right calls and show the result. No live system is touched.

let backend: FakeSupabase;

test.beforeEach(async ({ page }) => {
  backend = new FakeSupabase();
  await backend.install(page);
  await page.addInitScript(() => localStorage.setItem("mgmtk_lang", "en"));
  backend.seed({ email: "boss@example.com", password: "right-password-1", role: "accountant", name: "Boss Admin" });
  backend.makeAdmin("boss@example.com");
  backend.seed({ email: "newfirm@example.com", password: "right-password-1", role: "accountant", name: "Nadia Newfirm", company: "Newfirm SARL", accountStatus: "pending" });
});

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "right-password-1");
  await page.getByRole("button", { name: /sign ?in|log ?in/i }).click();
  await expect(page).toHaveURL(/\/dashboard\//);
}

test("admin activates a pending accountant account", async ({ page }) => {
  await signIn(page, "boss@example.com");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Accountant accounts" })).toBeVisible();
  await expect(page.getByText("1 waiting for activation")).toBeVisible();

  await expect(page.getByText("newfirm@example.com").first()).toBeVisible();
  await page.getByRole("button", { name: "Activate" }).click();
  await expect(page.getByText("Account activated.")).toBeVisible();
  await expect(page.getByText("0 waiting for activation")).toBeVisible();

  const call = backend.rpcCalls.find((c) => c.name === "admin_set_accountant_status");
  expect(call).toMatchObject({ args: { _status: "active" }, user: "boss@example.com" });
  expect(call?.args._user_id).toBe(backend.users.find((u) => u.email === "newfirm@example.com")!.id);
  expect(backend.users.find((u) => u.email === "newfirm@example.com")!.accountStatus).toBe("active");
});

test("a non-admin who opens /admin is sent away and sees no admin data", async ({ page }) => {
  backend.activate("newfirm@example.com");
  await signIn(page, "newfirm@example.com");
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);
  await expect(page.getByText("Accountant accounts")).toHaveCount(0);
  expect(backend.rpcCalls.map((c) => c.name)).not.toContain("admin_list_accountants");
});

test("admin records a cash payment: numbered receipt is printed and listed, then voided with a reason", async ({ page }) => {
  await signIn(page, "boss@example.com");
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Plans and receipts" }).click();
  const newfirm = backend.users.find((u) => u.email === "newfirm@example.com")!;

  await page.getByRole("button", { name: "Manage" }).nth(1).click();
  await page.locator(`#amt-${newfirm.id}`).fill("5000");
  await page.locator(`#mon-${newfirm.id}`).fill("12");
  await page.locator(`#note-${newfirm.id}`).fill("Cash at the office");
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Record payment and print receipt" }).click();
  await expect(page.getByText("Payment recorded.")).toBeVisible();

  const call = backend.rpcCalls.find((c) => c.name === "admin_record_payment");
  expect(call?.args).toMatchObject({ _accountant_id: newfirm.id, _amount: 5000, _period_months: 12, _method: "cash", _note: "Cash at the office" });

  const receipt = await popup;
  await receipt.waitForLoadState();
  await expect(receipt.locator("body")).toContainText("REC-2026-000001");
  await expect(receipt.locator("body")).toContainText("5000 DZD");
  await expect(receipt.locator("body")).toContainText("Nadia Newfirm");
  await receipt.close();

  await expect(page.getByText("REC-2026-000001").first()).toBeVisible();
  page.once("dialog", (d) => d.accept("Paid twice by mistake"));
  await page.getByRole("button", { name: "Void" }).click();
  const voidCall = backend.rpcCalls.find((c) => c.name === "admin_void_receipt");
  expect(voidCall?.args).toMatchObject({ _receipt_id: "rec-1", _reason: "Paid twice by mistake" });
  await expect(page.getByText("Receipt voided.")).toBeVisible();
  await expect(page.getByText("voided", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Void" })).toHaveCount(0);
});
