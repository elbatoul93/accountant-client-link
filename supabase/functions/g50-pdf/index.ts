import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CC_API = "https://api.cloudconvert.com/v2";
const MAX_BASE64_LENGTH = 15_000_000;
const CC_TIMEOUT_MS = 45_000;
const RATE_LIMIT = 20; // conversions per user per window (best effort, per isolate)
const RATE_WINDOW_MS = 10 * 60_000;

// Error codes the client can use to fall back (offer the XLSX, print from the browser, retry later).
type ErrorCode =
  | "unauthenticated" | "forbidden" | "bad_request" | "too_large" | "rate_limited"
  | "not_configured" | "provider_unavailable" | "provider_rejected";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function fail(code: ErrorCode, status: number, message: string) {
  return jsonResponse({ error: message, code, retryable: code === "provider_unavailable" || code === "rate_limited" }, status);
}

const hits = new Map<string, number[]>();
function overLimit(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  return false;
}

// fetch with timeout and a bounded retry on network errors and 5xx/429 (idempotent calls only).
async function providerFetch(url: string, init: RequestInit, retries: number): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(CC_TIMEOUT_MS) });
      if (res.status < 500 && res.status !== 429) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw lastErr;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("bad_request", 405, "Method not allowed");

  try {
    // 1) Caller must be a signed-in accountant (verify_jwt only proves a valid token exists).
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) {
      console.error("[g50-pdf] Supabase env missing");
      return fail("not_configured", 500, "Service not configured");
    }
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return fail("unauthenticated", 401, "Not signed in");
    const { data: profile } = await supabase
      .from("profiles").select("user_type").eq("user_id", userData.user.id).maybeSingle();
    if (profile?.user_type !== "accountant") return fail("forbidden", 403, "Accountants only");
    if (overLimit(userData.user.id)) return fail("rate_limited", 429, "Too many conversions, try again later");

    // 2) Input validation.
    const apiKey = Deno.env.get("CLOUDCONVERT_API_KEY");
    if (!apiKey || apiKey.trim().length === 0) {
      console.error("[g50-pdf] CLOUDCONVERT_API_KEY missing or empty");
      return fail("not_configured", 503, "PDF conversion is not configured");
    }

    let payload: { xlsxBase64?: unknown; fileName?: unknown };
    try {
      payload = await req.json();
    } catch {
      return fail("bad_request", 400, "Invalid JSON body");
    }
    const { xlsxBase64, fileName } = payload;
    if (typeof xlsxBase64 !== "string" || typeof fileName !== "string" || !xlsxBase64 || !fileName) {
      return fail("bad_request", 400, "xlsxBase64 and fileName are required");
    }
    if (xlsxBase64.length > MAX_BASE64_LENGTH) return fail("too_large", 413, "File too large");
    // xlsx is a zip: base64 of "PK\x03\x04" starts with "UEsDB".
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(xlsxBase64) || !xlsxBase64.startsWith("UEsDB")) {
      return fail("bad_request", 400, "Not a valid xlsx file");
    }
    const safeName = (fileName.replace(/[^\w.-]+/g, "_").replace(/\.+/g, ".").slice(0, 100) || "g50") +
      (/\.xlsx$/i.test(fileName) ? "" : ".xlsx");

    const auth = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

    // 3) Create the job. Retried: nothing is billed until a job exists, and a failed create has no side effect.
    let jobRes: Response;
    try {
      jobRes = await providerFetch(`${CC_API}/jobs`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          tasks: {
            "import-1": { operation: "import/base64", file: xlsxBase64, filename: safeName },
            "convert-1": {
              operation: "convert", input: "import-1", input_format: "xlsx",
              output_format: "pdf", engine: "libreoffice",
            },
            "export-1": { operation: "export/url", input: "convert-1" },
          },
        }),
      }, 2);
    } catch (e) {
      console.error("[g50-pdf] CloudConvert unreachable:", e instanceof Error ? e.message : String(e));
      return fail("provider_unavailable", 503, "PDF service temporarily unavailable");
    }
    if (!jobRes.ok) {
      console.error(`[g50-pdf] Job create failed [${jobRes.status}]`);
      // 401/402/403 mean our key or quota is the problem: not retryable by the user.
      return jobRes.status >= 500 || jobRes.status === 429
        ? fail("provider_unavailable", 503, "PDF service temporarily unavailable")
        : fail("provider_rejected", 502, "PDF service rejected the request");
    }
    const jobId = (await jobRes.json())?.data?.id;
    if (!jobId) return fail("provider_unavailable", 502, "PDF service returned no job");

    // 4) Wait for completion (GET is idempotent, so it is retried).
    let waited;
    try {
      const waitRes = await providerFetch(`${CC_API}/jobs/${jobId}/wait`, { headers: auth }, 1);
      if (!waitRes.ok) {
        console.error(`[g50-pdf] Wait failed [${waitRes.status}]`);
        return fail("provider_unavailable", 503, "PDF service temporarily unavailable");
      }
      waited = await waitRes.json();
    } catch (e) {
      console.error("[g50-pdf] Wait error:", e instanceof Error ? e.message : String(e));
      return fail("provider_unavailable", 503, "PDF service temporarily unavailable");
    }
    if (waited.data?.status !== "finished") {
      console.error(`[g50-pdf] Job ended with status=${waited.data?.status}`);
      return fail("provider_rejected", 502, "PDF conversion failed");
    }

    const exportTask = waited.data.tasks.find((t: { name: string }) => t.name === "export-1");
    const fileUrl = exportTask?.result?.files?.[0]?.url;
    if (!fileUrl) return fail("provider_unavailable", 502, "PDF service returned no file");

    // 5) Download the PDF.
    let pdfRes: Response;
    try {
      pdfRes = await providerFetch(fileUrl, {}, 1);
    } catch {
      return fail("provider_unavailable", 503, "PDF service temporarily unavailable");
    }
    if (!pdfRes.ok) return fail("provider_unavailable", 502, "PDF download failed");
    const pdfBuf = new Uint8Array(await pdfRes.arrayBuffer());

    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < pdfBuf.length; i += chunk) {
      binary += String.fromCharCode(...pdfBuf.subarray(i, i + chunk));
    }
    return jsonResponse({ pdfBase64: btoa(binary) }, 200);
  } catch (e) {
    console.error("[g50-pdf] Unexpected error:", e instanceof Error ? e.message : String(e));
    return fail("provider_unavailable", 500, "Unexpected error");
  }
});
