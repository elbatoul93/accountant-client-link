import { supabase } from "@/integrations/supabase/client";

// acc_ibs_prior_year ships in a later migration, so it is not in the generated types yet.
// While the table is missing every call fails quietly and the amount stays a manual entry.
type Row = { amount: number | string };
type Table = {
  select: (cols: string) => { eq: (c: string, v: string | number) => { eq: (c: string, v: string | number) => {
    maybeSingle: () => PromiseLike<{ data: Row | null; error: { message: string } | null }> } } };
  upsert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
};
const table = () => (supabase as unknown as { from: (t: string) => Table }).from("acc_ibs_prior_year");

/** IBS N-1 saved for this client and acompte year, or null when none is stored (or the table is not live yet). */
export const loadIbsPrior = async (clientRef: string, year: number): Promise<number | null> => {
  try {
    const { data, error } = await table().select("amount").eq("client_ref", clientRef).eq("year", year).maybeSingle();
    if (error || !data) return null;
    const n = Number(data.amount);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
};

/** Save IBS N-1 for this client and acompte year. Returns false when it could not be stored. */
export const saveIbsPrior = async (clientRef: string, year: number, amount: number): Promise<boolean> => {
  if (!clientRef || !Number.isFinite(amount) || amount < 0) return false;
  try {
    const { data: au } = await supabase.auth.getUser();
    const accId = au.user?.id;
    if (!accId) return false;
    const { error } = await table().upsert({ accountant_id: accId, client_ref: clientRef, year, amount });
    if (error) { console.warn("[ibsPrior]", error.message); return false; }
    return true;
  } catch {
    return false;
  }
};
