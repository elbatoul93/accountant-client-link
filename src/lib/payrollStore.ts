import { supabase } from "@/integrations/supabase/client";
import { computePayslip, type PayrollEmployee, type PayslipRecord } from "@/lib/accounting/payroll";

/**
 * Persistence of payroll runs (acc_payroll_runs / acc_payslips).
 * Errors never block the local posting: if the tables are missing or the write fails the
 * caller keeps working and the annual declaration falls back to an estimate.
 */

/** Record the payslip of one employee for a month (idempotent: posting twice replaces the first). */
export const recordPayslip = async (
  e: PayrollEmployee,
  clientRef: string | undefined,
  period: string,
  journalBatchId?: string,
): Promise<boolean> => {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const accountantId = auth.user?.id;
    if (!accountantId) return false;
    const ref = clientRef ?? null;

    let q = supabase.from("acc_payroll_runs").select("id,status").eq("accountant_id", accountantId).eq("period", period);
    q = ref ? q.eq("client_ref", ref) : q.is("client_ref", null);
    const { data: existing, error: selErr } = await q.maybeSingle();
    if (selErr) throw selErr;
    if (existing?.status === "final") return false; // immutable snapshot

    let runId = existing?.id as string | undefined;
    if (!runId) {
      const { data: created, error: insErr } = await supabase.from("acc_payroll_runs")
        .insert({ accountant_id: accountantId, client_ref: ref, period, journal_batch_id: journalBatchId ?? null })
        .select("id").single();
      if (insErr) throw insErr;
      runId = created.id;
    }

    const p = computePayslip(e);
    // Replace an earlier posting of the same employee in this run.
    let del = supabase.from("acc_payslips").delete().eq("run_id", runId!).eq("employee_name", e.name);
    del = e.nss ? del.eq("nss", e.nss) : del.is("nss", null);
    const { error: delErr } = await del;
    if (delErr) throw delErr;
    const { error: slipErr } = await supabase.from("acc_payslips").insert({
      run_id: runId!, accountant_id: accountantId, client_ref: ref,
      employee_name: e.name, nss: e.nss ?? null,
      basic: p.basic, iew: p.iew, prc: p.prc, other: p.other,
      gross: p.gross, ss_base: p.ssBase, ss_employee: p.ssEmployee,
      taxable: p.taxable, irg: p.irg, net: p.net,
      ss_employer: p.ssEmployer, employer_cost: p.employerCost,
    });
    if (slipErr) throw slipErr;
    return true;
  } catch (err) {
    console.warn("payroll run not saved", err);
    return false;
  }
};

/** Freeze a month's payroll run once the period is declared (no-op when there is none). */
export const finalizePayrollRun = async (clientRef: string | undefined, period: string): Promise<void> => {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    let q = supabase.from("acc_payroll_runs").update({ status: "final" })
      .eq("accountant_id", auth.user.id).eq("period", period).eq("status", "draft");
    q = clientRef ? q.eq("client_ref", clientRef) : q.is("client_ref", null);
    const { error } = await q;
    if (error) throw error;
  } catch (err) {
    console.warn("payroll run not finalised", err);
  }
};

/** Payslips actually paid during `year` (all clients, or one). Empty when none or unavailable. */
export const loadPayslips = async (year: number, clientRef?: string): Promise<PayslipRecord[]> => {
  try {
    let q = supabase.from("acc_payroll_runs").select("id,period,client_ref,acc_payslips(*)")
      .gte("period", `${year}-01`).lte("period", `${year}-12`);
    if (clientRef) q = q.eq("client_ref", clientRef);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).flatMap((run) =>
      ((run as unknown as { period: string; acc_payslips: Array<Record<string, unknown>> }).acc_payslips ?? []).map((s) => ({
        employeeKey: `${run.client_ref ?? ""}:${(s.nss as string | null) || (s.employee_name as string)}`,
        name: s.employee_name as string,
        nss: (s.nss as string | null) ?? undefined,
        period: run.period,
        gross: Number(s.gross), ssEmployee: Number(s.ss_employee), taxable: Number(s.taxable),
        irg: Number(s.irg), net: Number(s.net),
      })));
  } catch (err) {
    console.warn("payslips not loaded", err);
    return [];
  }
};
