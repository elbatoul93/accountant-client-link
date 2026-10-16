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
    // the ?lang= on the redirect URL set by src/features/auth/authRedirect.ts is read first
    const path = name === "confirmation" ? "/login" : "/reset-password";
    expect(html).toContain(`eq .RedirectTo "https://managementik.com${path}?lang=fr"`);
    expect(html).toContain(`eq .RedirectTo "https://www.managementik.com${path}?lang=en"`);
    expect(html).toContain(`eq .RedirectTo "https://accountant-client-link.pages.dev${path}?lang=ar"`);
    // Supabase rejects subjects over 255 characters
    expect(read(`${name}.subject.txt`).trim().length).toBeLessThanOrEqual(255);
  });
});
