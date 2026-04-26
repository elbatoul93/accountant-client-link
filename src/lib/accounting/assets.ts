// Algerian asset depreciation engine — linear amortization at official tax rates.
// Source: Code des Impôts Directs (CIDTA) art. 174, simplified mainstream rates.

export type AssetCategory =
  | "buildings"          // Constructions / bâtiments
  | "industrial"         // Matériel & outillage industriel
  | "office"             // Mobilier & équipement de bureau
  | "computers"          // Matériel informatique
  | "vehicles"           // Véhicules de transport
  | "intangible";        // Logiciels, brevets, frais d'établissement

/** Algerian linear depreciation rates by category (annual, %).
 *  Duration = 100 / rate (years). */
export const ASSET_RATES: Record<AssetCategory, { rate: number; years: number; pcn: string }> = {
  buildings:  { rate: 5,  years: 20, pcn: "213" }, // Constructions
  industrial: { rate: 10, years: 10, pcn: "215" }, // Installations techniques
  office:     { rate: 10, years: 10, pcn: "218" }, // Autres immobilisations corporelles
  computers:  { rate: 25, years: 4,  pcn: "2183" },// Matériel informatique
  vehicles:   { rate: 20, years: 5,  pcn: "2182" },// Matériel de transport
  intangible: { rate: 20, years: 5,  pcn: "205" }, // Logiciels, concessions
};

export interface FixedAsset {
  id: string;
  clientId?: string;
  label: string;
  category: AssetCategory;
  /** Date d'acquisition YYYY-MM-DD */
  acquiredAt: string;
  /** Valeur d'origine HT (DA) */
  cost: number;
  /** Optional override of annual rate (%) */
  rateOverride?: number;
}

export interface AmortizationRow {
  year: number;
  annuity: number;     // dotation
  cumulated: number;   // amortissement cumulé
  vnc: number;         // valeur nette comptable
}

/** Build full linear amortization schedule for one asset. */
export const buildAmortizationSchedule = (a: FixedAsset): AmortizationRow[] => {
  const meta = ASSET_RATES[a.category];
  const rate = (a.rateOverride ?? meta.rate) / 100;
  const years = Math.round(1 / rate);
  const annuity = a.cost * rate;
  const startYear = parseInt(a.acquiredAt.slice(0, 4), 10);
  const rows: AmortizationRow[] = [];
  let cumulated = 0;
  for (let i = 0; i < years; i++) {
    cumulated = Math.min(a.cost, cumulated + annuity);
    rows.push({
      year: startYear + i,
      annuity: i === years - 1 ? a.cost - (cumulated - annuity) : annuity,
      cumulated,
      vnc: Math.max(0, a.cost - cumulated),
    });
  }
  return rows;
};

/** Sum of dotations for a given year across all assets of a client. */
export const yearlyDotation = (assets: FixedAsset[], year: number): number => {
  let total = 0;
  for (const a of assets) {
    const sch = buildAmortizationSchedule(a);
    const row = sch.find((r) => r.year === year);
    if (row) total += row.annuity;
  }
  return total;
};
