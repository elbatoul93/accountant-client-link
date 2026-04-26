/**
 * Algerian National Accounting Plan (PCN / SCF — Plan Comptable National).
 * Classes 1..7. Keys are the standard codes used by Algerian SCF.
 * This is a working subset covering the accounts the engine posts to and
 * those most commonly used by accountants on a daily basis.
 */
export type PcnClass = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface PcnAccount {
  /** SCF account code, e.g. "411" */
  code: string;
  /** French name (official) */
  label: string;
  /** Arabic name */
  labelAr: string;
  /** SCF class 1..7 */
  class: PcnClass;
  /** Normal balance side */
  nature: "debit" | "credit";
  /** Bilan/TCR mapping */
  statement: "BILAN_ACTIF" | "BILAN_PASSIF" | "TCR_PRODUIT" | "TCR_CHARGE";
}

export const PCN: PcnAccount[] = [
  // ===== Class 1 — Capitaux (Passif / Equity) =====
  { code: "101", label: "Capital social", labelAr: "رأس المال الاجتماعي", class: 1, nature: "credit", statement: "BILAN_PASSIF" },
  { code: "106", label: "Réserves", labelAr: "الاحتياطات", class: 1, nature: "credit", statement: "BILAN_PASSIF" },
  { code: "120", label: "Résultat de l'exercice (bénéfice)", labelAr: "نتيجة السنة (ربح)", class: 1, nature: "credit", statement: "BILAN_PASSIF" },
  { code: "129", label: "Résultat de l'exercice (perte)", labelAr: "نتيجة السنة (خسارة)", class: 1, nature: "debit", statement: "BILAN_PASSIF" },
  { code: "164", label: "Emprunts auprès des établissements de crédit", labelAr: "قروض من المؤسسات المالية", class: 1, nature: "credit", statement: "BILAN_PASSIF" },

  // ===== Class 2 — Immobilisations (Actif) =====
  { code: "211", label: "Terrains", labelAr: "الأراضي", class: 2, nature: "debit", statement: "BILAN_ACTIF" },
  { code: "213", label: "Constructions", labelAr: "البناءات", class: 2, nature: "debit", statement: "BILAN_ACTIF" },
  { code: "215", label: "Installations techniques, matériel & outillage", labelAr: "التجهيزات و الأدوات", class: 2, nature: "debit", statement: "BILAN_ACTIF" },
  { code: "218", label: "Autres immobilisations corporelles", labelAr: "تثبيتات عينية أخرى", class: 2, nature: "debit", statement: "BILAN_ACTIF" },
  { code: "281", label: "Amortissements des immobilisations", labelAr: "اهتلاك التثبيتات", class: 2, nature: "credit", statement: "BILAN_ACTIF" },

  // ===== Class 3 — Stocks (Actif) =====
  { code: "30",  label: "Stocks de marchandises", labelAr: "مخزون البضائع", class: 3, nature: "debit", statement: "BILAN_ACTIF" },
  { code: "31",  label: "Matières premières & fournitures", labelAr: "المواد الأولية واللوازم", class: 3, nature: "debit", statement: "BILAN_ACTIF" },
  { code: "35",  label: "Stocks de produits finis", labelAr: "مخزون المنتجات التامة", class: 3, nature: "debit", statement: "BILAN_ACTIF" },

  // ===== Class 4 — Tiers =====
  { code: "401", label: "Fournisseurs", labelAr: "الموردون", class: 4, nature: "credit", statement: "BILAN_PASSIF" },
  { code: "404", label: "Fournisseurs d'immobilisations", labelAr: "موردو التثبيتات", class: 4, nature: "credit", statement: "BILAN_PASSIF" },
  { code: "411", label: "Clients", labelAr: "الزبائن", class: 4, nature: "debit", statement: "BILAN_ACTIF" },
  { code: "421", label: "Personnel — Rémunérations dues", labelAr: "الأجور المستحقة للعاملين", class: 4, nature: "credit", statement: "BILAN_PASSIF" },
  { code: "431", label: "Sécurité sociale (CNAS)", labelAr: "الضمان الاجتماعي (كناس)", class: 4, nature: "credit", statement: "BILAN_PASSIF" },
  { code: "432", label: "Autres organismes sociaux (CASNOS / CACOBATPH)", labelAr: "هيئات اجتماعية أخرى (كازنوس/كاكوبات)", class: 4, nature: "credit", statement: "BILAN_PASSIF" },
  { code: "442", label: "État — Impôts sur les bénéfices (IBS)", labelAr: "الدولة — ضريبة على الأرباح (IBS)", class: 4, nature: "credit", statement: "BILAN_PASSIF" },
  { code: "4421", label: "État — TAP", labelAr: "الدولة — الرسم على النشاط المهني", class: 4, nature: "credit", statement: "BILAN_PASSIF" },
  { code: "4422", label: "État — IRG / Salaires", labelAr: "الدولة — الضريبة على الدخل/أجور", class: 4, nature: "credit", statement: "BILAN_PASSIF" },
  { code: "44551", label: "TVA collectée (sur ventes)", labelAr: "الرسم على القيمة المضافة المحصل (مبيعات)", class: 4, nature: "credit", statement: "BILAN_PASSIF" },
  { code: "44562", label: "TVA déductible (sur achats)", labelAr: "الرسم على القيمة المضافة القابل للخصم (مشتريات)", class: 4, nature: "debit", statement: "BILAN_ACTIF" },
  { code: "44567", label: "TVA à décaisser / crédit de TVA", labelAr: "الرسم على القيمة المضافة المستحق", class: 4, nature: "credit", statement: "BILAN_PASSIF" },

  // ===== Class 5 — Trésorerie =====
  { code: "512", label: "Banque", labelAr: "البنك", class: 5, nature: "debit", statement: "BILAN_ACTIF" },
  { code: "530", label: "Caisse", labelAr: "الصندوق", class: 5, nature: "debit", statement: "BILAN_ACTIF" },

  // ===== Class 6 — Charges =====
  { code: "60",  label: "Achats consommés", labelAr: "المشتريات المستهلكة", class: 6, nature: "debit", statement: "TCR_CHARGE" },
  { code: "601", label: "Achats de marchandises", labelAr: "مشتريات بضائع", class: 6, nature: "debit", statement: "TCR_CHARGE" },
  { code: "611", label: "Sous-traitance générale", labelAr: "المناولة العامة", class: 6, nature: "debit", statement: "TCR_CHARGE" },
  { code: "613", label: "Locations", labelAr: "الإيجارات", class: 6, nature: "debit", statement: "TCR_CHARGE" },
  { code: "621", label: "Personnel extérieur à l'entreprise", labelAr: "موظفون خارجيون", class: 6, nature: "debit", statement: "TCR_CHARGE" },
  { code: "631", label: "Rémunérations du personnel", labelAr: "أجور المستخدمين", class: 6, nature: "debit", statement: "TCR_CHARGE" },
  { code: "635", label: "Impôts, taxes & versements assimilés (TAP)", labelAr: "ضرائب ورسوم (TAP)", class: 6, nature: "debit", statement: "TCR_CHARGE" },
  { code: "6351", label: "TAP — Charge", labelAr: "الرسم على النشاط المهني", class: 6, nature: "debit", statement: "TCR_CHARGE" },
  { code: "645", label: "Charges de sécurité sociale & prévoyance", labelAr: "تكاليف الضمان الاجتماعي", class: 6, nature: "debit", statement: "TCR_CHARGE" },
  { code: "6451", label: "Cotisations CNAS (part patronale)", labelAr: "اشتراكات كناس (الحصة المخدومة)", class: 6, nature: "debit", statement: "TCR_CHARGE" },
  { code: "6452", label: "Cotisations CASNOS / CACOBATPH", labelAr: "اشتراكات كازنوس/كاكوبات", class: 6, nature: "debit", statement: "TCR_CHARGE" },
  { code: "681", label: "Dotations aux amortissements", labelAr: "مخصصات الاهتلاك", class: 6, nature: "debit", statement: "TCR_CHARGE" },
  { code: "695", label: "Impôts sur les bénéfices (IBS)", labelAr: "ضريبة على الأرباح (IBS)", class: 6, nature: "debit", statement: "TCR_CHARGE" },

  // ===== Class 7 — Produits =====
  { code: "70",  label: "Ventes & produits annexes", labelAr: "المبيعات", class: 7, nature: "credit", statement: "TCR_PRODUIT" },
  { code: "701", label: "Ventes de produits finis", labelAr: "مبيعات المنتجات التامة", class: 7, nature: "credit", statement: "TCR_PRODUIT" },
  { code: "707", label: "Ventes de marchandises", labelAr: "مبيعات البضائع", class: 7, nature: "credit", statement: "TCR_PRODUIT" },
  { code: "708", label: "Produits des activités annexes", labelAr: "منتجات الأنشطة الثانوية", class: 7, nature: "credit", statement: "TCR_PRODUIT" },
  { code: "76",  label: "Produits financiers", labelAr: "المنتجات المالية", class: 7, nature: "credit", statement: "TCR_PRODUIT" },
];

const BY_CODE = new Map(PCN.map((a) => [a.code, a]));
export const getPcn = (code: string): PcnAccount | undefined => BY_CODE.get(code);

/** First matching account by code prefix (used to map a code like "70123" → "70"). */
export const getPcnByPrefix = (code: string): PcnAccount | undefined => {
  if (BY_CODE.has(code)) return BY_CODE.get(code);
  // try shorter prefixes (5,4,3,2,1)
  for (let len = code.length - 1; len >= 1; len--) {
    const hit = BY_CODE.get(code.slice(0, len));
    if (hit) return hit;
  }
  return undefined;
};

/** Class of an arbitrary account code (first digit). */
export const classOf = (code: string): PcnClass | null => {
  const d = parseInt(code.charAt(0), 10);
  return d >= 1 && d <= 7 ? (d as PcnClass) : null;
};

export const searchPcn = (q: string, limit = 25): PcnAccount[] => {
  const s = q.trim().toLowerCase();
  if (!s) return PCN.slice(0, limit);
  return PCN.filter(
    (a) =>
      a.code.startsWith(s) ||
      a.label.toLowerCase().includes(s) ||
      a.labelAr.includes(q.trim()),
  ).slice(0, limit);
};
