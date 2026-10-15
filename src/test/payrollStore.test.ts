import { describe, it, expect, vi, beforeEach } from "vitest";

const state = { user: "acc-1" as string | null, run: null as null | { id: string; status: string }, selErr: null as null | { message: string }, slipErr: null as null | { message: string } };
const log: string[] = [];
const chain = (table: string, op: string, result: () => unknown) => {
  log.push(`${table}.${op}`);
  const b: Record<string, unknown> = {};
  for (const f of ["eq", "is", "select", "gte", "lte"]) b[f] = () => b;
  b.maybeSingle = async () => result();
  b.single = async () => ({ data: { id: "run-new" }, error: null });
  b.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res);
  return b;
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) },
    from: (table: string) => ({
      select: () => chain(table, "select", () => ({ data: state.run, error: state.selErr })),
      insert: () => chain(table, "insert", () => ({ error: table === "acc_payslips" ? state.slipErr : null })),
      delete: () => chain(table, "delete", () => ({ error: null })),
      update: () => chain(table, "update", () => ({ error: null })),
    }),
  },
}));

import { recordPayslip } from "@/features/accountant/lib/payrollStore";
import type { PayrollEmployee } from "@/lib/accounting/payroll";

const emp = { name: "Karim", nss: "123", basic: 60000, iew: 0, prc: 0, other: 0 } as unknown as PayrollEmployee;

beforeEach(() => { log.length = 0; Object.assign(state, { user: "acc-1", run: null, selErr: null, slipErr: null }); vi.spyOn(console, "warn").mockImplementation(() => {}); });

describe("recordPayslip", () => {
  it("does nothing when signed out", async () => {
    state.user = null;
    expect(await recordPayslip(emp, "c1", "2026-03")).toBe(false);
    expect(log).toEqual([]);
  });
  it("creates the run, replaces an earlier payslip of the employee and inserts the new one", async () => {
    expect(await recordPayslip(emp, "c1", "2026-03")).toBe(true);
    expect(log).toEqual(["acc_payroll_runs.select", "acc_payroll_runs.insert", "acc_payslips.delete", "acc_payslips.insert"]);
  });
  it("reuses an existing draft run", async () => {
    state.run = { id: "run-1", status: "draft" };
    expect(await recordPayslip(emp, "c1", "2026-03")).toBe(true);
    expect(log).not.toContain("acc_payroll_runs.insert");
  });
  it("never touches a finalised run", async () => {
    state.run = { id: "run-1", status: "final" };
    expect(await recordPayslip(emp, "c1", "2026-03")).toBe(false);
    expect(log).toEqual(["acc_payroll_runs.select"]);
  });
  it("reports failure instead of throwing", async () => {
    state.slipErr = { message: "no table" };
    expect(await recordPayslip(emp, undefined, "2026-03")).toBe(false);
    state.slipErr = null; state.selErr = { message: "down" };
    expect(await recordPayslip(emp, undefined, "2026-03")).toBe(false);
  });
});
