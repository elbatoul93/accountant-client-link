// The G50 dialog's amounts are computed by the same function the g50-pdf function uses to fill the form,
// so the total in the dialog is the total printed on the form.
export { g50Amounts, G50_VAT_RATES } from "../../supabase/functions/g50-pdf/compute";
