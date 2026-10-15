import type ExcelJS from "exceljs";
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
  const { default: ExcelJSLib } = await import("exceljs");
  const wb = new ExcelJSLib.Workbook();
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
    if (input.trimestre) set("Y7", input.trimestre); // U7 holds the "Trimestre" label
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

/** Error from the g50-pdf function. `code`/`retryable` come from the new function; the old one sends neither. */
export class G50PdfError extends Error {
  constructor(message: string, public code?: string, public retryable?: boolean) {
    super(message);
    this.name = "G50PdfError";
  }
}

/** True when the PDF is unavailable for a reason the user cannot fix, so the XLSX is a sensible substitute. */
export const isG50PdfUnavailable = (e: unknown): boolean => {
  if (!(e instanceof G50PdfError)) return false;
  if (e.code) return e.retryable === true || e.code === "not_configured" || e.code === "provider_rejected";
  return true; // legacy function: no code, treat any failure as a provider problem
};

export async function generateG50PdfBytes(input: G50ExportInput): Promise<Uint8Array> {
  // The function draws these values onto the official form itself; it never receives a spreadsheet.
  const { fileName: _fileName, ...fields } = input;
  const { data, error } = await supabase.functions.invoke("g50-pdf", { body: { input: fields } });
  type Body = { error?: string; hint?: string; code?: string; retryable?: boolean };
  if (error) {
    // Non-2xx responses put the JSON body on error.context
    let body: Body | undefined = data ?? undefined;
    try { body = body ?? (await (error as { context?: Response }).context?.json()); } catch { /* not JSON */ }
    console.error("g50-pdf invoke error:", error, "body:", body);
    const detail = body?.error || error.message;
    const hint = body?.hint ? ` (${body.hint})` : "";
    // Network failures (no response body) are retryable.
    const retryable = body?.retryable ?? (body?.code ? undefined : !(error as { context?: Response }).context);
    throw new G50PdfError(`PDF conversion failed: ${detail}${hint}`, body?.code, retryable);
  }
  if (data?.error) {
    console.error("g50-pdf returned error:", data);
    throw new G50PdfError(`PDF conversion failed: ${data.error}${data.hint ? ` — ${data.hint}` : ""}`, data.code, data.retryable);
  }
  if (!data?.pdfBase64) throw new G50PdfError("PDF conversion failed: no PDF returned");

  const bin = atob(data.pdfBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Download the G50 as PDF. When the PDF service is unavailable, the Excel file is
 * downloaded instead so the accountant is never blocked. Returns which format was saved.
 */
export async function generateG50Pdf(input: G50ExportInput): Promise<"pdf" | "xlsx-fallback"> {
  try {
    const bytes = await generateG50PdfBytes(input);
    const pdfName = input.fileName.replace(/\.xlsx$/i, ".pdf");
    downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), pdfName);
    return "pdf";
  } catch (e) {
    if (!isG50PdfUnavailable(e)) throw e;
    await generateG50Xlsx({ ...input, fileName: input.fileName.replace(/\.pdf$/i, ".xlsx") });
    return "xlsx-fallback";
  }
}
