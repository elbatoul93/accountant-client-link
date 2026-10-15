import { PDFDocument, PDFFont } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import { BACKGROUND_PDF_BASE64 } from "./assets/background.ts";
import { CALADEA_BASE64, CALADEA_BOLD_BASE64, CARLITO_BASE64, CARLITO_BOLD_BASE64, DEJAVU_BASE64 } from "./assets/fonts.ts";
import { LAYOUT } from "./assets/layout.ts";
import { ARABIC, bidiRuns, shapeArabic } from "./arabic.ts";

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const MIN_SCALE = 0.6;

/** Draws the computed values onto the official G50 background and returns the PDF. */
export async function drawG50(values: Record<string, string>): Promise<Uint8Array> {
  const doc = await PDFDocument.load(b64(BACKGROUND_PDF_BASE64));
  // The library's own Arabic shaper does not run in Deno, so the Arabic font is laid out glyph by glyph; shapeArabic()
  // has already chosen the contextual forms.
  const arabicBytes = b64(DEJAVU_BASE64);
  doc.registerFontkit({
    create: (bytes: Uint8Array, name?: string) => {
      const font = fontkit.create(bytes, name);
      if (bytes === arabicBytes) {
        // pdf-lib only reads `glyphs` from the result
        font.layout = ((text: string) => ({ glyphs: [...text].map((ch) => font.glyphForCodePoint(ch.codePointAt(0)!)) })) as unknown as typeof font.layout;
      }
      return font;
    },
  } as typeof fontkit);
  const embed = (data: string) => doc.embedFont(b64(data), { subset: true });
  const fonts: Record<string, PDFFont> = {
    Carlito: await embed(CARLITO_BASE64),
    "Carlito-bold": await embed(CARLITO_BOLD_BASE64),
    Caladea: await embed(CALADEA_BASE64),
    "Caladea-bold": await embed(CALADEA_BOLD_BASE64),
  };
  const arabic = await doc.embedFont(arabicBytes, { subset: true });
  const pages = doc.getPages();

  for (const [id, text] of Object.entries(values)) {
    const slot = LAYOUT[id];
    if (!slot || !text) continue;
    const isAr = ARABIC.test(text);
    const font = isAr ? arabic : fonts[slot.bold ? `${slot.font}-bold` : slot.font];
    // Visual order: Arabic strings read right to left, so their runs are laid out in reverse.
    const layoutRuns = (t: string) => (isAr ? bidiRuns(t).reverse() : [{ rtl: false, s: t }]);
    let runs = layoutRuns(text);
    // An Arabic run is shaped, then reversed into drawing order (the font is laid out left to right).
    const visual = (r: { rtl: boolean; s: string }) => (r.rtl ? [...shapeArabic(r.s)].reverse().join("") : r.s);
    const measure = (size: number) => runs.map((r) => font.widthOfTextAtSize(visual(r), size));
    let size = slot.size;
    let widths = measure(size);
    const total = () => widths.reduce((a, b) => a + b, 0);
    if (total() > slot.maxW) {
      size = Math.max(size * MIN_SCALE, size * (slot.maxW / total()));
      widths = measure(size);
    }
    // Still too wide at the smallest size: cut the end and mark it, rather than print over the neighbouring labels.
    for (let n = [...text].length; total() > slot.maxW && n > 1; n--) {
      runs = layoutRuns([...text].slice(0, n - 1).join("").trimEnd() + "\u2026");
      widths = measure(size);
    }
    const anchor = text === "-" && slot.zeroX ? slot.zeroX : slot.x; // a zero dash sits left of where digits end
    let x = slot.align === "left" ? anchor : slot.align === "right" ? anchor - total() : anchor - total() / 2;
    runs.forEach((r, i) => {
      pages[slot.page].drawText(visual(r), { x, y: slot.y, size, font });
      x += widths[i];
    });
  }
  doc.setTitle("G50");
  return await doc.save();
}
