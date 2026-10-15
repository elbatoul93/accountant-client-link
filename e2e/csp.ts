import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

/**
 * Applies the real Content-Security-Policy from public/_headers to every page load,
 * (vite preview does not read _headers) and records violations the browser reports.
 * Only change: the fake Supabase test origin is allowed next to *.supabase.co.
 */
export function realCsp(): string {
  const block = readFileSync("public/_headers", "utf8").split(/\n(?=\S)/).find((b) => b.startsWith("/*"));
  const line = block?.split("\n").find((l) => l.trim().startsWith("Content-Security-Policy:"));
  if (!line) throw new Error("No Content-Security-Policy under /* in public/_headers");
  return line
    .replace(/^\s*Content-Security-Policy:\s*/, "")
    .split("https://*.supabase.co").join("https://*.supabase.co https://*.supabase.test")
    .split("wss://*.supabase.co").join("wss://*.supabase.co wss://*.supabase.test");
}

export async function enforceCsp(page: Page): Promise<string[]> {
  const violations: string[] = [];
  const csp = realCsp();
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\//, async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), "content-security-policy": csp } });
  });
  await page.exposeFunction("__cspViolation", (v: string) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) =>
      (window as unknown as { __cspViolation: (v: string) => void }).__cspViolation(`${e.violatedDirective} blocked ${e.blockedURI} (${e.sourceFile ?? ""})`),
    );
  });
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  return violations;
}
