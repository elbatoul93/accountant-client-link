import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

export interface G50ExportInput {
  companyName: string;
  activity?: string;
  address?: string;
  month: string;       // "01".."12" or ""
  trimestre?: string;  // "1".."4" or ""
  year: string;        // "2025"
  direction?: string;
  commune?: string;
  nif?: string;
  bp?: string;
  caHtTotal: number;
  caHtImposable: number;
  fileName: string;
}

const replaceDots = (existing: unknown, value: string): string => {
  const s = typeof existing === "string" ? existing : "";
  if (/\.{2,}/.test(s)) return s.replace(/\.{2,}/, value);
  return value;
};

function getNum(cell: ExcelJS.Cell): number {
  const v = cell.value as unknown;
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === "object") {
    const r = (v as { result?: unknown }).result;
    if (typeof r === "number") return r;
    if (typeof r === "string") {
      const n = Number(r);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

function applyPdfPrecalc(wb: ExcelJS.Workbook) {
  const tva = wb.getWorksheet("T.V.A");
  if (tva) {
    for (let row = 10; row <= 15; row++) {
      tva.getCell(`CH${row}`).value = Math.round(getNum(tva.getCell(`BQ${row}`)) * 0.09 * 100) / 100;
    }
    for (let row = 16; row <= 30; row++) {
      tva.getCell(`CH${row}`).value = Math.round(getNum(tva.getCell(`BQ${row}`)) * 0.19 * 100) / 100;
    }
    let ch31 = 0;
    for (let row = 10; row <= 30; row++) ch31 += getNum(tva.getCell(`CH${row}`));
    tva.getCell("CH31").value = ch31;
    tva.getCell("CD35").value = ch31;
    const cd36 = getNum(tva.getCell("CD36"));
    const cd38 = getNum(tva.getCell("CD38"));
    const cd40 = cd38 + cd36 + ch31;
    tva.getCell("CD40").value = cd40;
    let ao44 = 0;
    for (let row = 35; row <= 43; row++) ao44 += getNum(tva.getCell(`AO${row}`));
    tva.getCell("AO44").value = ao44;
    tva.getCell("CD41").value = ao44;
    tva.getCell("CD42").value = cd40 - ao44 > 0 ? cd40 - ao44 : 0;
    tva.getCell("CD44").value = ao44 - cd40 > 0 ? ao44 - cd40 : 0;
  }

  const recap = wb.getWorksheet("RECAP");
  if (recap) {
    const bm6 = getNum(recap.getCell("AQ6")) * getNum(recap.getCell("BI6"));
    const bm7 = getNum(recap.getCell("AQ7")) * getNum(recap.getCell("BI7"));
    const bm8 = getNum(recap.getCell("AQ8")) * getNum(recap.getCell("BI8"));
    recap.getCell("BM6").value = bm6;
    recap.getCell("BM7").value = bm7;
    recap.getCell("BM8").value = bm8;
    recap.getCell("BM9").value = bm6 + bm7 + bm8;
    let bp21 = 0;
    for (let row = 15; row <= 20; row++) bp21 += getNum(recap.getCell(`BP${row}`));
    recap.getCell("BP21").value = bp21;

    const ibsIrg = wb.getWorksheet("IBS-IRG");
    const tls = wb.getWorksheet("T.L.S");
    const dtimbre = wb.getWorksheet("D.TIMBRE");
    const tva2 = wb.getWorksheet("T.V.A");
    const y27 = ibsIrg ? getNum(ibsIrg.getCell("CQ34")) : 0;
    const y28 = ibsIrg ? getNum(ibsIrg.getCell("CQ40")) : 0;
    const y29 = ibsIrg ? getNum(ibsIrg.getCell("CQ46")) : 0;
    const y31 = ibsIrg ? getNum(ibsIrg.getCell("CQ56")) : 0;
    const y32 = tls ? getNum(tls.getCell("CL34")) : 0;
    const y33 = dtimbre ? getNum(dtimbre.getCell("BM9")) : 0;
    const y34 = dtimbre ? getNum(dtimbre.getCell("BP21")) : 0;
    const y35 = tva2 ? getNum(tva2.getCell("CD42")) : 0;
    recap.getCell("Y27").value = y27;
    recap.getCell("Y28").value = y28;
    recap.getCell("Y29").value = y29;
    recap.getCell("Y31").value = y31;
    recap.getCell("Y32").value = y32;
    recap.getCell("Y33").value = y33;
    recap.getCell("Y34").value = y34;
    recap.getCell("Y35").value = y35;
    const y36 = getNum(recap.getCell("Y36"));
    recap.getCell("Y39").value = y27 + y28 + y29 + getNum(recap.getCell("Y30")) + y31 + y32 + y33 + y34 + y35 + y36;

    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const yyyy = today.getFullYear();
    const dateStr = `${dd}/${mm}/${yyyy}`;
    recap.getCell("AT31").value = dateStr;
    recap.getCell("BK34").value = dateStr;
  }
}

async function buildG50Buffer(input: G50ExportInput, precalcForPdf = false): Promise<ArrayBuffer> {
  const res = await fetch("/templates/G50_template.xlsx");
  if (!res.ok) throw new Error("G50 template not found");
  const buf = await res.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const ibs = wb.getWorksheet("IBS-IRG");
  if (ibs) {
    const set = (addr: string, val: string | number) => {
      const cell = ibs.getCell(addr);
      cell.value = val;
    };
    const setDots = (addr: string, val: string) => {
      const cell = ibs.getCell(addr);
      cell.value = replaceDots(cell.value, val);
    };

    setDots("AK14", input.companyName || "");
    if (input.activity) setDots("AS20", input.activity);
    if (input.address) setDots("AN22", input.address);
    if (input.month) set("Y6", input.month);
    if (input.trimestre) set("U7", input.trimestre);
    if (input.year) set("Y9", input.year);
    if (input.direction) set("I7", input.direction);
    if (input.commune) set("H16", input.commune);

    const cols = ["D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R"];
    const nif = (input.nif || "").replace(/\D/g, "").slice(0, 15);
    cols.forEach((c, i) => {
      ibs.getCell(`${c}22`).value = nif[i] ?? null;
    });

    if (input.bp) {
      const bpCell = ibs.getCell("BW23");
      const cur = typeof bpCell.value === "string" ? bpCell.value : "BP : ";
      bpCell.value = cur.endsWith(" ") || cur.endsWith(":") ? `${cur}${input.bp}` : `${cur} ${input.bp}`;
    }
  }

  const tva = wb.getWorksheet("T.V.A");
  if (tva) {
    if (input.caHtTotal > 0) tva.getCell("AQ22").value = input.caHtTotal;
    if (input.caHtImposable > 0) tva.getCell("BQ22").value = input.caHtImposable;
  }

  if (precalcForPdf) applyPdfPrecalc(wb);

  return await wb.xlsx.writeBuffer() as ArrayBuffer;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function generateG50Xlsx(input: G50ExportInput) {
  const out = await buildG50Buffer(input);
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, input.fileName);
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[],
    );
  }
  return btoa(binary);
}

export async function generateG50PdfBytes(input: G50ExportInput): Promise<Uint8Array> {
  const xlsxBuf = await buildG50Buffer(input, true);
  const xlsxBase64 = arrayBufferToBase64(xlsxBuf);
  const xlsxName = input.fileName.replace(/\.pdf$/i, ".xlsx");

  const { data, error } = await supabase.functions.invoke("g50-pdf", {
    body: { xlsxBase64, fileName: xlsxName },
  });
  if (error) {
    console.error("g50-pdf invoke error:", error, "data:", data);
    const detail = data?.error || data?.details || error.message;
    const hint = data?.hint ? ` (${data.hint})` : "";
    throw new Error(`PDF conversion failed: ${detail}${hint}`);
  }
  if (data?.error) {
    console.error("g50-pdf returned error:", data);
    throw new Error(`PDF conversion failed: ${data.error}${data.hint ? ` — ${data.hint}` : ""}`);
  }
  if (!data?.pdfBase64) throw new Error("PDF conversion failed: no PDF returned");

  const bin = atob(data.pdfBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function generateG50Pdf(input: G50ExportInput) {
  const bytes = await generateG50PdfBytes(input);
  const pdfName = input.fileName.replace(/\.xlsx$/i, ".pdf");
  downloadBlob(new Blob([bytes], { type: "application/pdf" }), pdfName);
}
