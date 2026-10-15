// Arabic letter shaping, done here because the font library's own shaper does not run in Deno.
// Turns Arabic letters (U+0621..U+064A) into their contextual presentation forms (U+FE70 block), which the font draws as
// plain glyphs. Output is in logical order; the caller reverses it for right-to-left drawing.
// Forms per letter: [isolated, final, initial, medial]; right-joining letters have only the first two.
const FORMS: Record<number, number[]> = {
  0x621: [0xfe80],
  0x622: [0xfe81, 0xfe82], 0x623: [0xfe83, 0xfe84], 0x624: [0xfe85, 0xfe86], 0x625: [0xfe87, 0xfe88],
  0x626: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c], 0x627: [0xfe8d, 0xfe8e],
  0x628: [0xfe8f, 0xfe90, 0xfe91, 0xfe92], 0x629: [0xfe93, 0xfe94],
  0x62a: [0xfe95, 0xfe96, 0xfe97, 0xfe98], 0x62b: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c],
  0x62c: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0], 0x62d: [0xfea1, 0xfea2, 0xfea3, 0xfea4],
  0x62e: [0xfea5, 0xfea6, 0xfea7, 0xfea8], 0x62f: [0xfea9, 0xfeaa], 0x630: [0xfeab, 0xfeac],
  0x631: [0xfead, 0xfeae], 0x632: [0xfeaf, 0xfeb0],
  0x633: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4], 0x634: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8],
  0x635: [0xfeb9, 0xfeba, 0xfebb, 0xfebc], 0x636: [0xfebd, 0xfebe, 0xfebf, 0xfec0],
  0x637: [0xfec1, 0xfec2, 0xfec3, 0xfec4], 0x638: [0xfec5, 0xfec6, 0xfec7, 0xfec8],
  0x639: [0xfec9, 0xfeca, 0xfecb, 0xfecc], 0x63a: [0xfecd, 0xfece, 0xfecf, 0xfed0],
  0x641: [0xfed1, 0xfed2, 0xfed3, 0xfed4], 0x642: [0xfed5, 0xfed6, 0xfed7, 0xfed8],
  0x643: [0xfed9, 0xfeda, 0xfedb, 0xfedc], 0x644: [0xfedd, 0xfede, 0xfedf, 0xfee0],
  0x645: [0xfee1, 0xfee2, 0xfee3, 0xfee4], 0x646: [0xfee5, 0xfee6, 0xfee7, 0xfee8],
  0x647: [0xfee9, 0xfeea, 0xfeeb, 0xfeec], 0x648: [0xfeed, 0xfeee], 0x649: [0xfeef, 0xfef0],
  0x64a: [0xfef1, 0xfef2, 0xfef3, 0xfef4],
};
// lam + alef variants: [isolated, final]
const LAM_ALEF: Record<number, number[]> = {
  0x622: [0xfef5, 0xfef6], 0x623: [0xfef7, 0xfef8], 0x625: [0xfef9, 0xfefa], 0x627: [0xfefb, 0xfefc],
};
const isMark = (c: number) => (c >= 0x64b && c <= 0x65f) || c === 0x670 || c === 0x640;
const joinsForward = (c: number) => (FORMS[c]?.length ?? 0) === 4; // can connect to the letter after it
const joinsBack = (c: number) => c in FORMS && c !== 0x621; // can connect to the letter before it

export function shapeArabic(text: string): string {
  const cps = [...text].map((ch) => ch.codePointAt(0)!).filter((c) => !isMark(c));
  const out: number[] = [];
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i];
    if (!(c in FORMS)) { out.push(c); continue; }
    const prev = cps[i - 1];
    const connectsBack = prev !== undefined && joinsForward(prev);
    if (c === 0x644 && cps[i + 1] in LAM_ALEF) {
      out.push(LAM_ALEF[cps[i + 1]][connectsBack ? 1 : 0]);
      i++;
      continue;
    }
    const f = FORMS[c];
    const connectsForward = joinsForward(c) && cps[i + 1] !== undefined && joinsBack(cps[i + 1]);
    let form = 0; // isolated
    if (f.length === 4) form = connectsBack && connectsForward ? 3 : connectsBack ? 1 : connectsForward ? 2 : 0;
    else if (f.length === 2 && connectsBack) form = 1;
    out.push(f[form]);
  }
  return String.fromCodePoint(...out);
}

export const ARABIC = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/;

/** Splits text into runs of Arabic and everything else, in logical order. Spaces and punctuation between an Arabic run and
 * a Latin or digit run stay with the Arabic side, so they land where a right-to-left reader expects them. The caller shapes
 * and reverses each Arabic run and lays the runs out right to left. */
export function bidiRuns(text: string): { rtl: boolean; s: string }[] {
  const chars = [...text];
  const isNeutral = (ch: string) => /[\s.,:;()\-/]/.test(ch);
  const nextStrongIsRtl = (from: number) => {
    for (let j = from; j < chars.length; j++) if (!isNeutral(chars[j])) return ARABIC.test(chars[j]);
    return true; // trailing neutrals belong to the Arabic side
  };
  const runs: { rtl: boolean; s: string }[] = [];
  chars.forEach((ch, i) => {
    const last = runs[runs.length - 1];
    if (isNeutral(ch)) {
      // between two Latin/digit stretches the neutral stays inside the left-to-right run
      if (last && (last.rtl || !nextStrongIsRtl(i + 1))) last.s += ch;
      else runs.push({ rtl: true, s: ch });
      return;
    }
    const rtl = ARABIC.test(ch);
    if (last && last.rtl === rtl) last.s += ch;
    else runs.push({ rtl, s: ch });
  });
  return runs;
}
