// Rejects passwords found in known data breaches (Have I Been Pwned range API).
// Only the first 5 characters of the SHA-1 hash leave the browser (k-anonymity).
// Any failure (offline, blocked, timeout) lets the password through.
const TIMEOUT_MS = 4000;

async function sha1Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export async function isPasswordPwned(password: string): Promise<boolean> {
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        signal: ctrl.signal,
        headers: { "Add-Padding": "true" },
      });
      if (!res.ok) return false;
      const body = await res.text();
      return body.split("\n").some((line) => {
        const [s, count] = line.trim().split(":");
        return s === suffix && Number(count) > 0;
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}
