import { toast } from "sonner";
import type { FinStmt } from "@/features/accountant/lib/accountantStore";

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Opens the statement in a print window ("Save as PDF" in the print dialog); no paid service involved.
export const printFinStmt = (fs: FinStmt, t: (k: string) => string, dir: "ltr" | "rtl", fmt: (n: number) => string) => {
  const w = window.open("", "_blank", "width=760,height=900");
  if (!w) { toast.error(t("incoming_download_failed")); return; }
  const row = (label: string, n: number) => `<tr><td>${esc(label)}</td><td class="v" dir="ltr">${esc(fmt(n))}</td></tr>`;
  w.document.write(`<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${esc(t("fs_title"))} ${esc(fs.year)}</title>
<style>body{font-family:system-ui,sans-serif;margin:40px;color:#111}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 20px;color:#555}
table{width:100%;border-collapse:collapse}td{padding:10px 8px;border-bottom:1px solid #ddd}td.v{text-align:end;font-weight:600}</style></head><body>
<h1>${esc(t("fs_title"))} — ${esc(fs.year)}</h1><p>${esc(fs.clientName)}</p>
<table>${row(t("tools_assets"), fs.assets)}${row(t("tools_liabilities"), fs.liabilities)}${row(t("tools_equity"), fs.equity)}${row(t("tools_revenue"), fs.revenue)}${row(t("tools_net_result"), fs.netResult)}</table>
</body></html>`);
  w.document.close();
  w.focus();
  // Give the new window a moment to lay out before the print dialog opens (Safari/Firefox print blank otherwise).
  setTimeout(() => w.print(), 250);
};
