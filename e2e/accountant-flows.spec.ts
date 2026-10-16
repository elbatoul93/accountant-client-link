import { test, expect, type Page } from "@playwright/test";
import { FakeSupabase } from "./fakeSupabase";

let backend: FakeSupabase;

test.beforeEach(async ({ page }) => {
  backend = new FakeSupabase();
  await backend.install(page);
  await page.addInitScript(() => localStorage.setItem("mgmtk_lang", "en"));
  backend.seed({ email: "amel@example.com", password: "right-password-1", role: "accountant", name: "Amel Accountant" });
});

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "right-password-1");
  await page.getByRole("button", { name: /sign ?in|log ?in/i }).click();
  await expect(page).toHaveURL(/\/dashboard\//);
}

async function addClient(page: Page, name: string, nif: string, email?: string) {
  await page.getByRole("button", { name: /add new client/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Amira Benali").fill(name);
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: /^SARL/ }).first().click();
  await dialog.getByPlaceholder("000016001234567").fill(nif);
  await dialog.getByRole("combobox").nth(1).click();
  await page.getByRole("option").first().click();
  if (email) await dialog.locator('input[type="email"]').fill(email);
  await dialog.getByRole("button", { name: /^save$/i }).click();
  await expect(dialog).toBeHidden();
}

test("accountant adds a client and an invoice, and both are saved to the database", async ({ page }) => {
  await signIn(page, "amel@example.com");
  await addClient(page, "Benali Trading", "000016001234567");
  await expect.poll(() => backend.rows("acc_clients").map((r) => r.name)).toEqual(["Benali Trading"]);
  expect(backend.rows("acc_clients")[0]).toMatchObject({ tax_id: "000016001234567", tax_regime: expect.any(String) });

  await page.getByRole("button", { name: /^invoices/i }).first().click();
  await page.getByRole("button", { name: /add invoice/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "Benali Trading" }).click();
  await dialog.locator('input[type="number"]').fill("120000");
  await dialog.getByRole("button", { name: /^save$/i }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => backend.rows("acc_invoices").map((r) => Number(r.amount))).toEqual([120000]);
  await expect(page.getByText(/120[\s\u202f,.]?000/).first()).toBeVisible();
});

test("accountant adds an employee, runs payroll, and the payslip is stored with the right amounts", async ({ page }) => {
  await signIn(page, "amel@example.com");
  await page.getByRole("button", { name: /^payroll/i }).first().click();
  await page.getByRole("button", { name: /add employee/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("123456789012").fill("123456789012");
  await dialog.locator("label", { hasText: /^Employee/ }).locator("..").locator("input").fill("Yacine Employee");
  await dialog.getByPlaceholder("40000").fill("60000");
  await dialog.getByRole("button", { name: /^save$/i }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Yacine Employee")).toBeVisible();

  await page.getByRole("button", { name: /run & post/i }).click();
  await expect(page.getByText(/payroll posted to journal/i).first()).toBeVisible();
  await expect.poll(() => backend.rows("acc_payslips").length).toBe(1);
  const slip = backend.rows("acc_payslips")[0];
  expect(slip).toMatchObject({ employee_name: "Yacine Employee", nss: "123456789012", basic: 60000, gross: 60000, ss_employee: 5400 });
  expect(slip.net).toBeCloseTo(slip.gross - slip.ss_employee - slip.irg, 2);
  expect(backend.rows("acc_payroll_runs")).toHaveLength(1);
  // Posting twice replaces the first payslip instead of duplicating it.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /run & post/i }).click();
  await expect.poll(() => backend.writes.filter((w) => w.table === "acc_payslips" && w.method === "POST").length).toBe(2);
  expect(backend.rows("acc_payslips")).toHaveLength(1);
});

test("accountant generates a G50 for a linked client and sends it: stored, uploaded and shared", async ({ page }) => {
  backend.seed({ email: "karim@example.com", password: "right-password-1", role: "client", name: "Karim Client" });
  backend.linkClient("karim@example.com", { tax_id: "000016001234567" });
  const karim = backend.users.find((u) => u.email === "karim@example.com")!;
  await signIn(page, "amel@example.com");

  await page.getByRole("button", { name: /^professional tools/i }).first().click();
  await page.getByRole("button", { name: /^G50 Generator/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "Karim Client" }).click();
  await dialog.getByPlaceholder("1000000").fill("1000000");
  await dialog.getByRole("button", { name: /generate.*pdf/i }).click();
  await expect(page.getByText(/g50.*(filed|locked)/i).first()).toBeVisible();
  expect(backend.g50PdfCalls).toHaveLength(1);
  expect(backend.g50PdfCalls[0]).toMatchObject({ nif: "000016001234567", caHt: 1000000, companyName: "Karim Client" });
  await expect.poll(() => backend.rows("g50_declarations").length).toBe(1);
  const g50 = backend.rows("g50_declarations")[0];
  expect(g50).toMatchObject({ client_id: karim.id, accountant_id: expect.any(String) });
  expect(g50.sent).toBeFalsy();

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^obligations/i }).first().click();
  await page.getByTitle("Send to client").click();
  await expect(page.getByText(/g50 sent to client/i).first()).toBeVisible();
  expect(backend.uploads.some((k) => k.includes(`shared-docs/${karim.id}/${g50.id}.pdf`))).toBe(true);
  expect(backend.rows("shared_documents")).toHaveLength(1);
  expect(backend.rows("shared_documents")[0]).toMatchObject({ client_id: karim.id, g50_declaration_id: g50.id });
  expect(backend.rows("g50_declarations")[0].sent).toBe(true);
  expect(backend.g50PdfCalls.length).toBeGreaterThan(1); // the download, then the client's copy
});

test("a G50 whose declaration fails to save tells the accountant instead of failing silently", async ({ page }) => {
  backend.seed({ email: "karim@example.com", password: "right-password-1", role: "client", name: "Karim Client" });
  backend.linkClient("karim@example.com", { tax_id: "000016001234567" });
  backend.failWrites.add("g50_declarations");
  await signIn(page, "amel@example.com");
  await page.getByRole("button", { name: /^professional tools/i }).first().click();
  await page.getByRole("button", { name: /^G50 Generator/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "Karim Client" }).click();
  await dialog.getByPlaceholder("1000000").fill("1000000");
  await dialog.getByRole("button", { name: /generate.*pdf/i }).click();
  await expect(page.getByText(/declaration was not saved/i).first()).toBeVisible();
  expect(backend.rows("g50_declarations")).toHaveLength(0);
  // Nothing is filed or locked when the save failed.
  await expect(page.getByText(/g50.*(filed|locked)/i)).toHaveCount(0);
  expect(backend.rows("acc_period_locks")).toHaveLength(0);
});

test("client reviews and signs a G50: signature saved, accountant notified", async ({ page }) => {
  const amel = backend.users.find((u) => u.email === "amel@example.com")!;
  backend.seed({ email: "karim@example.com", password: "right-password-1", role: "client", name: "Karim Client", linkedAccountantId: amel.id });
  const karim = backend.users.find((u) => u.email === "karim@example.com")!;
  backend.rows("acc_shared_documents").push({
    id: "doc-1", accountant_id: amel.id, client_ref: karim.id, client_name: "Karim Client", client_email: "karim@example.com",
    doc_type: "G50", label: "G50 2026-09 — 210 000 DA", doc_date: "2026-09-30", workflow: "sent", payload: JSON.stringify({ total: 210000 }),
    created_at: "2026-09-30T10:00:00Z", signed_at: null,
  });
  await signIn(page, "karim@example.com");
  await page.getByRole("tab", { name: /declarations for approval/i }).click();
  await expect(page.getByText("G50 2026-09 — 210 000 DA")).toBeVisible();
  await page.getByRole("button", { name: /review & sign/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: /click to sign/i }).click();
  await expect(page.getByText(/document signed successfully/i).first()).toBeVisible();

  const doc = backend.rows("acc_shared_documents")[0];
  expect(doc.signed_by).toBe("Karim Client");
  expect(doc.signed_at).toBeTruthy();
  expect(String(doc.signature_data_url)).toMatch(/^data:image\/png;base64,/);
  expect(backend.rows("notifications")).toHaveLength(1);
  expect(backend.rows("notifications")[0]).toMatchObject({ recipient_id: amel.id, type: "doc_signed", ref_id: "doc-1" });
  await expect(page.getByText(/digitally signed|signed/i).first()).toBeVisible();
});

test("example data: a G50 asks for the client to accept the invite first, and removing the example works", async ({ page }) => {
  await signIn(page, "amel@example.com");
  await page.waitForLoadState("networkidle"); // let the dashboard finish loading its data first
  await page.getByRole("button", { name: /load example data/i }).click();
  await expect.poll(() => backend.rows("acc_clients").map((r) => r.client_ref)).toEqual(["0d3e0000-0000-4000-8000-000000000001"]);
  await expect.poll(() => backend.rows("acc_invoices").length).toBe(1);

  await page.getByRole("button", { name: /^professional tools/i }).first().click();
  await page.getByRole("button", { name: /^G50 Generator/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: /Exemple SARL/ }).click();
  await dialog.getByPlaceholder("1000000").fill("1000000");
  await dialog.getByRole("button", { name: /generate.*pdf/i }).click();
  await expect(page.getByText(/not accepted the invitation/i).first()).toBeVisible();
  expect(backend.rows("g50_declarations")).toHaveLength(0);
  expect(backend.g50PdfCalls).toHaveLength(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /dashboard/i }).first().click();
  await page.getByRole("button", { name: /remove example data/i }).click();
  await expect.poll(() => backend.rows("acc_clients").length).toBe(0);
  expect(backend.rows("acc_invoices")).toHaveLength(0);
});

test("client sees a filed G50 in the total due and the shared document under 'from my accountant'", async ({ page }) => {
  const amel = backend.users.find((u) => u.email === "amel@example.com")!;
  backend.seed({ email: "karim@example.com", password: "right-password-1", role: "client", name: "Karim Client", linkedAccountantId: amel.id });
  const karim = backend.users.find((u) => u.email === "karim@example.com")!;
  backend.rows("acc_clients").push({
    id: "c-1", accountant_id: amel.id, client_ref: karim.id, name: "Karim Client", tax_regime: "REEL", status: "active", data: {},
  });
  backend.rows("acc_declarations").push({
    id: "d-1", accountant_id: amel.id, client_ref: karim.id, client_name: "Karim Client",
    decl_type: "G50", amount: 264500, due_date: "2999-12-20", status: "filed", created_at: "2026-10-01T10:00:00Z",
  });
  backend.rows("acc_shared_documents").push({
    id: "doc-1", accountant_id: amel.id, client_ref: karim.id, client_name: "Karim Client", client_email: "karim@example.com",
    doc_type: "G50", label: "G50 2026-10 — 264 500 DA", doc_date: "2026-10-01", workflow: "sent", payload: JSON.stringify({ total: 264500 }),
    created_at: "2026-10-01T10:00:00Z", signed_at: null,
  });
  await signIn(page, "karim@example.com");
  const obligations = page.locator("div", { has: page.getByRole("heading", { name: /tax & social obligations/i }) }).last();
  await expect(obligations.getByText(/total amount due/i)).toBeVisible();
  await expect(obligations.getByText(/264[\s\u202f,.]?500/).first()).toBeVisible();
  await expect(obligations.getByText(/^0\s*DA$/)).toHaveCount(0);
  const fromAcc = page.locator("div", { has: page.getByRole("heading", { name: /documents from my accountant/i }) }).last();
  await expect(fromAcc.getByText("G50 2026-10 — 264 500 DA")).toBeVisible();
  await expect(fromAcc.getByText(/pending sync/i)).toHaveCount(0);
});

test("a filed G50 past its due date stays in the total due as overdue until the next period is filed", async ({ page }) => {
  const amel = backend.users.find((u) => u.email === "amel@example.com")!;
  backend.seed({ email: "karim@example.com", password: "right-password-1", role: "client", name: "Karim Client", linkedAccountantId: amel.id });
  const karim = backend.users.find((u) => u.email === "karim@example.com")!;
  backend.rows("acc_clients").push({
    id: "c-1", accountant_id: amel.id, client_ref: karim.id, name: "Karim Client", tax_regime: "REEL", status: "active", data: {},
  });
  backend.rows("acc_declarations").push({
    id: "d-1", accountant_id: amel.id, client_ref: karim.id, client_name: "Karim Client",
    decl_type: "G50", amount: 264500, due_date: "2020-01-20", status: "filed", created_at: "2020-01-05T10:00:00Z",
  });
  await signIn(page, "karim@example.com");
  const obligations = page.locator("div", { has: page.getByRole("heading", { name: /tax & social obligations/i }) }).last();
  await expect(obligations.getByText(/264[\s\u202f,.]?500/).first()).toBeVisible();
  await expect(obligations.getByText(/^overdue$/i)).toBeVisible();
});

test("a filed G50 drops out of the total due once the next period's G50 is filed", async ({ page }) => {
  const amel = backend.users.find((u) => u.email === "amel@example.com")!;
  backend.seed({ email: "karim@example.com", password: "right-password-1", role: "client", name: "Karim Client", linkedAccountantId: amel.id });
  const karim = backend.users.find((u) => u.email === "karim@example.com")!;
  backend.rows("acc_clients").push({
    id: "c-1", accountant_id: amel.id, client_ref: karim.id, name: "Karim Client", tax_regime: "REEL", status: "active", data: {},
  });
  for (const [id, due, amount] of [["d-1", "2020-01-20", 111000], ["d-2", "2999-02-20", 222000]] as const) {
    backend.rows("acc_declarations").push({
      id, accountant_id: amel.id, client_ref: karim.id, client_name: "Karim Client",
      decl_type: "G50", amount, due_date: due, status: "filed", created_at: "2020-01-05T10:00:00Z",
    });
  }
  await signIn(page, "karim@example.com");
  const obligations = page.locator("div", { has: page.getByRole("heading", { name: /tax & social obligations/i }) }).last();
  await expect(obligations.getByText(/total amount due/i)).toBeVisible();
  await expect(obligations.getByText(/222[\s\u202f,.]?000/).first()).toBeVisible();
  await expect(obligations.getByText(/333[\s\u202f,.]?000/)).toHaveCount(0);
  await expect(obligations.getByText(/^overdue$/i)).toHaveCount(0);
});

test("on a short desktop screen the accountant sidebar scrolls on its own, without moving the page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await signIn(page, "amel@example.com");
  const aside = page.locator("aside").first();
  await expect(aside).toBeVisible();
  const box = await aside.evaluate((el) => ({ overflowY: getComputedStyle(el).overflowY, scrollable: el.scrollHeight > el.clientHeight }));
  expect(box).toEqual({ overflowY: "auto", scrollable: true });
  await aside.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  expect(await aside.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("the 'Extract obligations' tool lets the accountant pick the client instead of always opening the first one", async ({ page }) => {
  await signIn(page, "amel@example.com");
  await addClient(page, "Benali Trading", "000016001234567");
  await addClient(page, "Zerrouki Freres", "000016007654321");
  await page.getByRole("button", { name: /^professional tools/i }).first().click();
  await page.getByRole("button", { name: /extract obligations/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toContainText(/Zerrouki Freres/);
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "Benali Trading" }).click();
  await expect(dialog.getByRole("heading")).toContainText(/Benali Trading/);
});

test("saved financial statements can be reopened and edited by the accountant", async ({ page }) => {
  await signIn(page, "amel@example.com");
  await addClient(page, "Benali Trading", "000016001234567");
  await page.getByRole("button", { name: /^professional tools/i }).first().click();
  await page.getByRole("button", { name: /financial statements builder|^open$/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "Benali Trading" }).click();
  await dialog.locator('input[type="number"]').first().fill("1000000");
  await dialog.getByRole("button", { name: /save statements/i }).click();
  await expect.poll(() => backend.rows("acc_financial_statements").map((r) => Number(r.assets))).toEqual([1000000]);
  await expect(dialog.getByText(/1[\s\u202f,.]?000[\s\u202f,.]?000/).first()).toBeVisible();
  await dialog.getByRole("button", { name: /^edit$/i }).click();
  await dialog.locator('input[type="number"]').first().fill("2000000");
  await dialog.getByRole("button", { name: /save statements/i }).click();
  await expect.poll(() => backend.rows("acc_financial_statements").map((r) => Number(r.assets))).toEqual([2000000]);
  expect(backend.rows("acc_financial_statements")).toHaveLength(1);
});

test("the client sees the saved financial statements of their accountant", async ({ page }) => {
  const amel = backend.users.find((u) => u.email === "amel@example.com")!;
  backend.seed({ email: "karim@example.com", password: "right-password-1", role: "client", name: "Karim Client", linkedAccountantId: amel.id });
  const karim = backend.users.find((u) => u.email === "karim@example.com")!;
  backend.rows("acc_clients").push({
    id: "c-1", accountant_id: amel.id, client_ref: karim.id, name: "Karim Client", tax_regime: "REEL", status: "active", data: {},
  });
  backend.rows("acc_financial_statements").push({
    id: "fs-1", accountant_id: amel.id, client_ref: karim.id, client_name: "Karim Client", fiscal_year: "2025",
    assets: 5000000, liabilities: 1000000, equity: 4000000, revenue: 7500000, net_result: 640000, created_at: "2026-10-01T10:00:00Z",
  });
  await signIn(page, "karim@example.com");
  const card = page.locator("div", { has: page.getByRole("heading", { name: /^financial statements$/i }) }).last();
  await expect(card.getByText("2025")).toBeVisible();
  await expect(card.getByText(/640[\s\u202f,.]?000/).first()).toBeVisible();
});
