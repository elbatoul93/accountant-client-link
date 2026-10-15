import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { computeSlots, parseG50Input } from "./compute.ts";
import { drawG50 } from "./draw.ts";

const RATE_LIMIT = 20; // PDFs per user per window (best effort, per isolate)
const RATE_WINDOW_MS = 10 * 60_000;

// Error codes the client can use to fall back (offer the XLSX, retry later).
type ErrorCode = "unauthenticated" | "forbidden" | "bad_request" | "rate_limited" | "not_configured" | "render_failed";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function fail(code: ErrorCode, status: number, message: string) {
  return jsonResponse({ error: message, code, retryable: code === "render_failed" || code === "rate_limited" }, status);
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
    if (overLimit(userData.user.id)) return fail("rate_limited", 429, "Too many PDFs, try again later");

    // 2) Input: the form values only. The server fills the official form itself, so a caller cannot make it print anything else.
    let payload: { input?: unknown; xlsxBase64?: unknown };
    try {
      payload = await req.json();
    } catch {
      return fail("bad_request", 400, "Invalid JSON body");
    }
    // A client from before this version posts a spreadsheet. Answering "retryable" makes it offer the Excel file instead of an error.
    if (payload.input === undefined && payload.xlsxBase64 !== undefined) {
      return fail("render_failed", 503, "Please reload the page to get PDFs");
    }
    const input = parseG50Input(payload.input);
    if (!input) return fail("bad_request", 400, "A company name is required");

    // 3) Draw the values onto the official form.
    const pdf = await drawG50(computeSlots(input, new Date()));
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < pdf.length; i += chunk) {
      binary += String.fromCharCode(...pdf.subarray(i, i + chunk));
    }
    return jsonResponse({ pdfBase64: btoa(binary) }, 200);
  } catch (e) {
    console.error("[g50-pdf] Unexpected error:", e instanceof Error ? e.message : String(e));
    return fail("render_failed", 500, "Could not generate the PDF");
  }
});
