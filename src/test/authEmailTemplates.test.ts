import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(`supabase/templates/${f}`, "utf8");

describe("Supabase auth email templates", () => {
  it("match the generator output (run node scripts/auth-emails/build.mjs)", () => {
    expect(() => execFileSync("node", ["scripts/auth-emails/build.mjs", "--check"], { stdio: "pipe" })).not.toThrow();
  });

  it.each(["confirmation", "recovery"])("%s has an rtl Arabic block, a French block and the link in every language", (name) => {
    const html = read(`${name}.html`);
    expect(html).toContain('dir="rtl" lang="ar"');
    expect(html).toContain('lang="fr"');
    expect(html).toContain('lang="en"');
    // ar, fr, en, plus the ar+fr fallback shown when no language is known
    expect(html.match(/\{\{ \.ConfirmationURL \}\}/g)).toHaveLength(5);
    expect(read(`${name}.subject.txt`)).toContain("Managementik");
  });
});
