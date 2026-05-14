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

async function buildG50Buffer(input: G50ExportInput): Promise<ArrayBuffer> {
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

export async function generateG50Pdf(input: G50ExportInput) {
  const xlsxBuf = await buildG50Buffer(input);
  const xlsxBase64 = arrayBufferToBase64(xlsxBuf);
  const xlsxName = input.fileName.replace(/\.pdf$/i, ".xlsx");
  const pdfName = input.fileName.replace(/\.xlsx$/i, ".pdf");

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
  downloadBlob(new Blob([bytes], { type: "application/pdf" }), pdfName);
}
