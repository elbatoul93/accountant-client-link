import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Self-service erasure. Refuses while records under the 10-year retention rule exist (support handles those),
// otherwise deletes the auth user first (which cascades profile, messages, etc.) and then clears the storage folders.
// Order matters: a failed deleteUser must leave the account and its files intact; leftover files after a successful
// deleteUser are private, so cleanup is best effort: failures are logged and reported as cleanup_incomplete.
const BUCKET = "client-uploads";
const FOLDERS = (uid: string) => [uid, `accountant-shared/${uid}`, `accountant-legal/${uid}`];

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

async function removeFolder(admin: ReturnType<typeof createClient>, prefix: string) {
  // Page through the folder; objects are flat files under the prefix.
  for (let guard = 0; guard < 100; guard++) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 100 });
    if (error) throw error;
    if (!data || data.length === 0) return;
    const { error: rmErr } = await admin.storage.from(BUCKET).remove(data.map((o) => `${prefix}/${o.name}`));
    if (rmErr) throw rmErr;
  }
  throw new Error(`folder ${prefix} not emptied`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed", code: "bad_request" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ error: "Service not configured", code: "not_configured" }, 500);

    const user = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await user.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Not signed in", code: "unauthenticated" }, 401);
    const uid = userData.user.id;

    let body: { confirm?: unknown };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body", code: "bad_request" }, 400); }
    if (body.confirm !== "DELETE") return json({ error: 'Send {"confirm":"DELETE"}', code: "bad_request" }, 400);

    const { data: blockers, error: bErr } = await user.rpc("my_deletion_blockers");
    if (bErr) {
      console.error("[delete-account] blockers check failed:", bErr.message);
      return json({ error: "Could not check retained records", code: "check_failed" }, 500);
    }
    const held = (blockers ?? []).filter((b: { n: number }) => Number(b.n) > 0);
    if (held.length > 0) {
      return json({
        error: "Some records must be kept under the retention policy; contact support to complete the erasure",
        code: "retention_hold",
        held: held.map((b: { kind: string; n: number }) => ({ kind: b.kind, n: Number(b.n) })),
      }, 409);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) {
      console.error("[delete-account] deleteUser failed:", delErr.message);
      return json({ error: "Deletion failed", code: "delete_failed" }, 500);
    }
    const cleanup = await Promise.allSettled(FOLDERS(uid).map((prefix) => removeFolder(admin, prefix)));
    const failed = cleanup.flatMap((r, i) => (r.status === "rejected" ? [FOLDERS(uid)[i]] : []));
    for (const prefix of failed) console.error(`[delete-account] orphaned files under ${prefix}`);
    console.log(`[delete-account] erased ${uid}${failed.length ? " (storage cleanup incomplete)" : ""}`);
    return json({ ok: true, cleanup_incomplete: failed.length > 0 }, 200);
  } catch (e) {
    console.error("[delete-account] unexpected:", e instanceof Error ? e.message : String(e));
    return json({ error: "Unexpected error", code: "unexpected" }, 500);
  }
});
