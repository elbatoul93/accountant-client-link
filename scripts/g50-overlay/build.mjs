// Regenerates the assets the g50-pdf edge function draws on:
//   supabase/functions/g50-pdf/assets/background.ts  the official form, rendered once by LibreOffice, variable cells left empty
//   supabase/functions/g50-pdf/assets/layout.ts      where each variable cell sits on that PDF (page, anchor, baseline, size, font)
// Needs: node, exceljs (devDependency), LibreOffice (soffice) and poppler (pdftotext) on PATH.
// Run after any change to public/templates/G50_template.xlsx or to the variable cell list below:
//   node scripts/g50-overlay/build.mjs
import ExcelJS from "exceljs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(root, "supabase/functions/g50-pdf/assets");
const TEMPLATE = join(root, "public/templates/G50_template.xlsx");

// Every cell the app fills or whose formula depends on one, plus the two TODAY() cells.
// kind: text | num0 ("#,##0") | acc0 / acc2 (accounting, "-" for zero) | date
const IBS = "IBS-IRG", TVA = "T.V.A", RECAP = "RECAP", TIMBRE = "D.TIMBRE";
const NIF_COLS = "DEFGHIJKLMNOPQR".split("");
const CELLS = [
  ...["AK14", "AS20", "AN22", "Y6", "Y7", "Y9", "I7", "H16", "BW23"].map((a) => [IBS, a, "text"]),
  ...NIF_COLS.map((c) => [IBS, `${c}22`, "text"]),
  [TVA, "AQ22", "num0"], [TVA, "BQ22", "num0"], [TVA, "CH22", "acc2"], [TVA, "CH31", "num0"],
  [TVA, "CD35", "acc2"], [TVA, "CD40", "acc2"], [TVA, "CD42", "acc2"],
  [RECAP, "Y35", "acc0"], [RECAP, "Y39", "acc0"], [RECAP, "AT31", "date"], [RECAP, "BK34", "date"],
  // The other amounts the G50 dialog adds to its total: IBS acompte (IBS-IRG line 1), IRG on salaries (line 4),
  // TAP as "Autres impots et taxes" (D.TIMBRE block 7), VAT at 9% (T.V.A row 11), and the lines of RECAP that carry them.
  [IBS, "BX30", "acc0"], [IBS, "BX34", "acc0"], [IBS, "AY50", "num0"], [IBS, "BX50", "acc0"], [IBS, "BX56", "acc0"],
  [TVA, "AQ11", "num0"], [TVA, "BQ11", "num0"], [TVA, "CH11", "acc2"],
  [TIMBRE, "H15", "text"], [TIMBRE, "AS15", "num0"], [TIMBRE, "BL15", "text"], [TIMBRE, "BP15", "acc2"], [TIMBRE, "BP21", "acc2"],
  [RECAP, "Y27", "acc0"], [RECAP, "Y31", "acc0"], [RECAP, "Y34", "acc0"],
];
// Helper cells that carry a total to RECAP but sit outside the printed table, where LibreOffice shows them as "###".
const HIDDEN = [[IBS, "CQ34"], [IBS, "CQ40"], [IBS, "CQ46"], [IBS, "CQ56"], [TIMBRE, "AQ8"]]; // AQ8 (=F8) prints a stray 0 in the stamp-duty table
const FONT_FILE = { Calibri: "Carlito", Cambria: "Caladea" };
const METRICS = { Carlito: { asc: 1950 / 2048 }, Caladea: { asc: 1.05 } };

const tmp = mkdtempSync(join(tmpdir(), "g50-"));
const render = async (name, mutate) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  for (const [s, a] of HIDDEN) wb.getWorksheet(s).getCell(a).value = null;
  // CH12:CH15 share the formula of CH11, which is cleared below; give each its own so the file can be written.
  for (let r = 12; r <= 15; r++) wb.getWorksheet(TVA).getCell(`CH${r}`).value = { formula: `BQ${r}*0.09` };
  mutate(wb);
  const xlsx = join(tmp, `${name}.xlsx`);
  await wb.xlsx.writeFile(xlsx);
  execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", tmp, xlsx], { stdio: "ignore" });
  return join(tmp, `${name}.pdf`);
};
const words = (pdf) => {
  const html = join(tmp, "w.html");
  execFileSync("pdftotext", ["-bbox", pdf, html]);
  const out = [];
  readFileSync(html, "utf8").split("<page ").slice(1).forEach((blk, page) => {
    const h = /height="([\d.]+)"/.exec(blk)[1];
    for (const m of blk.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)<\/word>/g))
      out.push({ page, h: +h, x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: m[5] });
  });
  return out;
};

const colNum = (L) => [...L].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const split = (a) => /^([A-Z]+)(\d+)$/.exec(a).slice(1);
const inRange = (m, a) => {
  const [t, b] = m.split(":").map(split), [col, row] = split(a);
  return colNum(col) >= colNum(t[0]) && colNum(col) <= colNum(b[0]) && +row >= +t[1] && +row <= +b[1];
};
// Cell facts straight from the template (font, alignment, number format).
const facts = {};
{
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  for (const [s, a, kind] of CELLS) {
    const c = wb.getWorksheet(s).getCell(a);
    const fmt = c.numFmt || "";
    const h = c.alignment?.horizontal;
    // Width of the (merged) cell in the units of the sheet; scaled to PDF points below.
    const ws = wb.getWorksheet(s);
    const range = ws.model.merges?.find((m) => inRange(m, a)) ?? `${a}:${a}`;
    const [c0, c1] = range.split(":").map((x) => colNum(/[A-Z]+/.exec(x)[0]));
    let px = 0;
    for (let n = c0; n <= c1; n++) px += (ws.getColumn(n).width ?? 8.43) * 7 * 1.058; // 1.058 calibrated against LibreOffice's column widths
    facts[`${s}!${a}`] = {
      widthPt: px * 0.75, fontSize: c.font?.size ?? 11,
      font: FONT_FILE[c.font?.name] ?? "Carlito", bold: !!c.font?.bold,
      align: /\* /.test(fmt) ? "right" : h === "center" ? "center" : "left",
    };
  }
}

const bgPdf = await render("background", (wb) => {
  for (const [s, a] of CELLS) wb.getWorksheet(s).getCell(a).value = null;
});
const bgWords = words(bgPdf);

const letters = "bcdfghjkmnpqrsv";
const markerFor = new Map();
const mkPdf = await render("markers", (wb) => {
  CELLS.forEach(([s, a, kind], i) => {
    const cell = wb.getWorksheet(s).getCell(a);
    let m;
    if (kind === "text") m = a.endsWith("22") && NIF_COLS.includes(a.replace("22", "")) ? letters[NIF_COLS.indexOf(a.replace("22", ""))] : `Qx${String(i).padStart(2, "0")}x`;
    else if (kind === "date") m = `Qx${String(i).padStart(2, "0")}x`;
    else m = 1000 + i; // formatted by LibreOffice, e.g. 1,009 / 1,009.00
    cell.value = m;
    markerFor.set(String(m), `${s}!${a}`);
    if (typeof m === "number") { markerFor.set(m.toLocaleString("en-US"), `${s}!${a}`); markerFor.set(m.toLocaleString("en-US", { minimumFractionDigits: 2 }), `${s}!${a}`); }
  });
});
const key = (w) => `${w.page}|${w.x0.toFixed(1)}|${w.y0.toFixed(1)}|${w.t}`;
const seen = new Set(bgWords.map(key));
const layout = {};
const w0 = {};
for (const w of words(mkPdf)) {
  if (seen.has(key(w))) continue;
  const id = markerFor.get(w.t);
  if (!id) throw new Error(`unexpected word in marker render: ${w.t}`);
  if (layout[id]) throw new Error(`marker found twice: ${id}`);
  const f = facts[id];
  const size = (w.y1 - w.y0) / (f.font === "Carlito" ? 1.2207 : 1.3);
  w0[id] = w;
  layout[id] = {
    page: w.page, align: f.align, font: f.font, bold: f.bold,
    x: +(f.align === "left" ? w.x0 : f.align === "right" ? w.x1 : (w.x0 + w.x1) / 2).toFixed(2),
    y: +(w.h - (w.y0 + METRICS[f.font].asc * size)).toFixed(2), // PDF baseline, from the bottom
    size: +size.toFixed(2),
    maxW: +(f.widthPt * (size / f.fontSize)).toFixed(1), // cell width on the PDF, for shrinking long text
  };
}
// Accounting cells draw a zero as "-" a little left of where digits end; measure where.
const zeroPdf = await render("zeros", (wb) => {
  for (const [s, a, kind] of CELLS) if (kind.startsWith("acc")) wb.getWorksheet(s).getCell(a).value = 0;
});
for (const w of words(zeroPdf)) {
  if (w.t !== "-" || seen.has(key(w))) continue;
  const id = Object.keys(layout).find((k) => layout[k].page === w.page && Math.abs(w0[k].y0 - w.y0) < 1 && Math.abs(w0[k].x1 - w.x1) < 12);
  if (id) layout[id].zeroX = +w.x1.toFixed(2);
}
for (const [s, a] of CELLS) if (!layout[`${s}!${a}`]) throw new Error(`no position found for ${s}!${a}`);

mkdirSync(outDir, { recursive: true });
const b64 = readFileSync(bgPdf).toString("base64");
writeFileSync(join(outDir, "background.ts"), `// Generated by scripts/g50-overlay/build.mjs. Do not edit.\nexport const BACKGROUND_PDF_BASE64 =\n  "${b64}";\n`);
writeFileSync(join(outDir, "layout.ts"), `// Generated by scripts/g50-overlay/build.mjs. Do not edit.\nexport type Align = "left" | "center" | "right";\nexport interface Slot { page: number; align: Align; font: "Carlito" | "Caladea"; bold: boolean; x: number; y: number; size: number; maxW: number; zeroX?: number }\nexport const LAYOUT: Record<string, Slot> = ${JSON.stringify(layout, null, 2)};\n`);
console.log(`background ${(b64.length * 0.75 / 1024).toFixed(0)} KB, ${Object.keys(layout).length} slots`);
