// Does the production domain's edge cache the SPA fallback (index.html answered for a missing /assets file)?
const HOST = "https://managementik.com";
const stamp = Date.now();
const show = async (label, url) => {
  const r = await fetch(url, { redirect: "manual" });
  const body = await r.text();
  const h = r.headers;
  console.log(label, JSON.stringify({ url, status: r.status, ct: h.get("content-type"), cfCache: h.get("cf-cache-status"), age: h.get("age"), cc: h.get("cache-control"), starts: body.slice(0, 30).replace(/\s+/g, " ") }));
};
for (const ext of ["js", "css", "png", "json"]) {
  const u = `${HOST}/assets/zz-probe-${stamp}.${ext}`;
  await show(`${ext} #1`, u);
  await show(`${ext} #2`, u);
}
// Non-asset unknown path and a missing static file outside /assets
await show("route #1", `${HOST}/zz-probe-${stamp}`);
await show("route #2", `${HOST}/zz-probe-${stamp}`);
await show("root-js #1", `${HOST}/zz-probe-${stamp}.js`);
await show("root-js #2", `${HOST}/zz-probe-${stamp}.js`);
