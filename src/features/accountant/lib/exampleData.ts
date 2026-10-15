import { supabase } from "@/integrations/supabase/client";

// The five document tables are tied to acc_clients with ON DELETE RESTRICT, so a client with records cannot be
// deleted until those records are gone. Example data has to go child-first, in this order.
const DOC_TABLES = [
  "acc_invoices", "acc_declarations", "acc_financial_statements", "acc_legal_documents", "acc_shared_documents",
] as const;

/** Delete the given clients (by client_ref) together with their records, children first. Throws on the first error. */
export const removeClientsWithRecords = async (accId: string, clientRefs: string[]): Promise<void> => {
  if (!clientRefs.length) return;
  for (const table of DOC_TABLES) {
    const { error } = await supabase.from(table).delete().eq("accountant_id", accId).in("client_ref", clientRefs);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  const { error } = await supabase.from("acc_clients").delete().eq("accountant_id", accId).in("client_ref", clientRefs);
  if (error) throw new Error(`acc_clients: ${error.message}`);
};
