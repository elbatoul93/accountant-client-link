import { supabase } from "@/integrations/supabase/client";

// The subscription RPCs ship in a later migration, so they are not in the generated types yet.
type LooseRpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
export const billingRpc: LooseRpc = (fn, args) => (supabase.rpc as unknown as LooseRpc).call(supabase, fn, args);

export type SubState = "unrestricted" | "trial" | "active" | "grace" | "read_only";

export interface MySubscription {
  plan: string; state: SubState; trial_ends_at: string | null; paid_until: string | null;
  grace_days: number; ends_at: string | null;
}

export interface AdminSubscription {
  user_id: string; name: string; email: string; company: string | null; account_status: string;
  plan: string; state: SubState; trial_ends_at: string | null; paid_until: string | null; grace_days: number;
}

export interface Receipt {
  id: string; receipt_no: string; accountant_id: string | null;
  payer: { name?: string; company?: string; email?: string };
  issuer: Record<string, string>;
  amount: number; currency: string; method: string; plan: string;
  period_months: number; period_start: string; period_end: string; paid_at: string;
  note: string | null; voided_at: string | null; void_reason: string | null;
}

export const daysLeft = (iso: string | null, now = Date.now()): number | null =>
  iso ? Math.ceil((new Date(iso).getTime() - now) / 86_400_000) : null;
