import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";
import { ar } from "@/lib/i18n/ar";
import { detectBrowserLang, formatDZD, interpolate } from "@/lib/format";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

describe("translations", () => {
  const dicts = { fr, ar } as Record<string, Record<string, string>>;

  it("has the same keys in every language", () => {
    for (const [name, d] of Object.entries(dicts)) {
      expect(Object.keys(d).sort(), name).toEqual(Object.keys(en).sort());
    }
  });

  it("keeps {placeholders} identical across languages", () => {
    for (const [name, d] of Object.entries(dicts)) {
      for (const k of Object.keys(en)) {
        expect(placeholders(d[k]), `${name}.${k}`).toBe(placeholders((en as Record<string, string>)[k]));
      }
    }
  });

  it("defines every key used as t(\"literal\") in the source", () => {
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) { if (f !== "i18n" && f !== "test") walk(p); continue; }
        if (!/\.tsx?$/.test(f)) continue;
        for (const m of readFileSync(p, "utf8").matchAll(/\bt\(\s*"([a-z0-9_]+)"/g)) used.add(m[1]);
      }
    };
    walk(join(process.cwd(), "src"));
    expect([...used].filter((k) => !(k in en))).toEqual([]);
  });
});

describe("format helpers", () => {
  it("interpolates every occurrence and leaves unknown placeholders", () => {
    expect(interpolate("{a} and {a} and {b}", { a: 1 })).toBe("1 and 1 and {b}");
  });

  it("detects the first supported browser language", () => {
    expect(detectBrowserLang(["de-DE", "fr-CA", "en"])).toBe("fr");
    expect(detectBrowserLang(["ar-DZ"])).toBe("ar");
    expect(detectBrowserLang(["de"])).toBeNull();
    expect(detectBrowserLang(undefined)).toBeNull();
  });

  it("formats dinars with whole numbers in every language", () => {
    for (const l of ["en", "fr", "ar"] as const) {
      expect(formatDZD(1234567.6, l).replace(/\D/g, "")).toBe("1234568");
      expect(formatDZD(1, l).endsWith("DA")).toBe(true);
    }
  });
});
