import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CC_API = "https://api.cloudconvert.com/v2";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("CLOUDCONVERT_API_KEY");
    if (!apiKey || apiKey.trim().length === 0) {
      console.error("[g50-pdf] CLOUDCONVERT_API_KEY missing or empty");
      return jsonResponse(
        { error: "CLOUDCONVERT_API_KEY is not configured in edge function secrets", stage: "config" },
        200,
      );
    }
    console.log(`[g50-pdf] API key loaded (length=${apiKey.length})`);

    let payload: { xlsxBase64?: string; fileName?: string };
    try {
      payload = await req.json();
    } catch (e) {
      return jsonResponse({ error: "Invalid JSON body", stage: "parse" }, 200);
    }
    const { xlsxBase64, fileName } = payload;
    if (!xlsxBase64 || !fileName) {
      return jsonResponse(
        { error: "xlsxBase64 and fileName are required", stage: "validate" },
        200,
      );
    }
    console.log(`[g50-pdf] Received file=${fileName}, base64Length=${xlsxBase64.length}`);

    const auth = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

    // Step 1: create job
    console.log("[g50-pdf] Creating CloudConvert job...");
    const jobRes = await fetch(`${CC_API}/jobs`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        tasks: {
          "import-1": {
            operation: "import/base64",
            file: xlsxBase64,
            filename: fileName,
          },
          "convert-1": {
            operation: "convert",
            input: "import-1",
            input_format: "xlsx",
            output_format: "pdf",
            engine: "libreoffice",
          },
          "export-1": {
            operation: "export/url",
            input: "convert-1",
          },
        },
      }),
    });
    const jobText = await jobRes.text();
    if (!jobRes.ok) {
      console.error(`[g50-pdf] Job create failed [${jobRes.status}]: ${jobText}`);
      return jsonResponse(
        {
          error: `CloudConvert job creation failed (HTTP ${jobRes.status})`,
          stage: "job-create",
          details: jobText,
          hint: jobRes.status === 401 || jobRes.status === 403
            ? "Check that CLOUDCONVERT_API_KEY is valid and has scopes: user.read, task.read, task.write"
            : undefined,
        },
        200,
      );
    }
    const job = JSON.parse(jobText);
    const jobId = job.data?.id;
    console.log(`[g50-pdf] Job created id=${jobId}`);

    // Step 2: wait for completion
    console.log("[g50-pdf] Waiting for job completion...");
    const waitRes = await fetch(`${CC_API}/jobs/${jobId}/wait`, { headers: auth });
    const waitText = await waitRes.text();
    if (!waitRes.ok) {
      console.error(`[g50-pdf] Wait failed [${waitRes.status}]: ${waitText}`);
      return jsonResponse(
        {
          error: `CloudConvert wait failed (HTTP ${waitRes.status})`,
          stage: "job-wait",
          details: waitText,
          hint: waitRes.status === 401 || waitRes.status === 403
            ? "Your CloudConvert API key is missing required scopes. Edit the key at https://cloudconvert.com/dashboard/api/v2/keys and enable: user.read, task.read, task.write"
            : undefined,
        },
        200,
      );
    }
    const waited = JSON.parse(waitText);
    const status = waited.data?.status;
    console.log(`[g50-pdf] Job finished with status=${status}`);

    if (status !== "finished") {
      const failedTask = waited.data?.tasks?.find((t: { status: string }) => t.status === "error");
      return jsonResponse(
        {
          error: `CloudConvert job did not finish (status=${status})`,
          stage: "job-status",
          failedTask: failedTask?.name,
          taskMessage: failedTask?.message,
          details: waited.data,
        },
        200,
      );
    }

    const exportTask = waited.data.tasks.find(
      (t: { name: string }) => t.name === "export-1",
    );
    const fileUrl = exportTask?.result?.files?.[0]?.url;
    if (!fileUrl) {
      console.error("[g50-pdf] No PDF URL in export task", JSON.stringify(exportTask));
      return jsonResponse(
        { error: "CloudConvert returned no PDF URL", stage: "export", details: exportTask },
        200,
      );
    }

    console.log(`[g50-pdf] Downloading PDF from ${fileUrl}`);
    const pdfRes = await fetch(fileUrl);
    if (!pdfRes.ok) {
      const errText = await pdfRes.text();
      return jsonResponse(
        { error: `PDF download failed (HTTP ${pdfRes.status})`, stage: "download", details: errText },
        200,
      );
    }
    const pdfBuf = new Uint8Array(await pdfRes.arrayBuffer());
    console.log(`[g50-pdf] PDF downloaded, size=${pdfBuf.length}`);

    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < pdfBuf.length; i += chunk) {
      binary += String.fromCharCode(...pdfBuf.subarray(i, i + chunk));
    }
    const pdfBase64 = btoa(binary);

    return jsonResponse({ pdfBase64 }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[g50-pdf] Unexpected error:", msg, stack);
    return jsonResponse({ error: msg, stage: "exception", stack }, 200);
  }
});
