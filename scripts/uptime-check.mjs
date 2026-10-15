// Lightweight production check (no browser): node scripts/uptime-check.mjs https://managementik.com
// Fails when /login is not served as HTML, or the script it references is missing or served as something else
// (the blank-page failure of 14 Oct). Retries a few times so one network blip does not open an issue.
const base = (process.argv[2] || "https://managementik.com").replace(/\/$/, "");

async function once() {
  const res = await fetch(`${base}/login`, { redirect: "follow", headers: { "user-agent": "managementik-uptime-check" } });
  if (res.status !== 200) throw new Error(`/login answered ${res.status}`);
  const type = res.headers.get("content-type") || "";
  if (!type.includes("text/html")) throw new Error(`/login content-type is ${type}`);
  const html = await res.text();
  if (!html.includes('id="root"')) throw new Error("/login HTML has no #root element");
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((s) => s.startsWith("/assets/"));
  if (srcs.length === 0) throw new Error("/login references no /assets script");
  for (const src of srcs) {
    const r = await fetch(new URL(src, base), { headers: { "user-agent": "managementik-uptime-check" } });
    const t = r.headers.get("content-type") || "";
    if (r.status !== 200 || !/javascript/.test(t)) throw new Error(`${src} answered ${r.status} as ${t || "no content-type"}`);
  }
}

let last;
for (let i = 1; i <= 3; i++) {
  try {
    await once();
    console.log(`OK ${base}`);
    process.exit(0);
  } catch (e) {
    last = e;
    console.log(`attempt ${i} failed: ${e.message}`);
    if (i < 3) await new Promise((r) => setTimeout(r, 20_000));
  }
}
console.error(`FAILED ${base}: ${last.message}`);
process.exit(1);
