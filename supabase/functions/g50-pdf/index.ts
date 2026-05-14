import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CC_API = "https://api.cloudconvert.com/v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("CLOUDCONVERT_API_KEY");
    if (!apiKey) throw new Error("CLOUDCONVERT_API_KEY not configured");

    const { xlsxBase64, fileName } = await req.json();
    if (!xlsxBase64 || !fileName) throw new Error("xlsxBase64 and fileName required");

    const auth = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

    // Create job: import base64 -> convert xlsx->pdf -> export url
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
    if (!jobRes.ok) {
      const txt = await jobRes.text();
      throw new Error(`CloudConvert job create failed [${jobRes.status}]: ${txt}`);
    }
    const job = await jobRes.json();
    const jobId = job.data.id;

    // Wait for completion
    const waitRes = await fetch(`${CC_API}/jobs/${jobId}/wait`, { headers: auth });
    if (!waitRes.ok) {
      const txt = await waitRes.text();
      throw new Error(`CloudConvert wait failed [${waitRes.status}]: ${txt}`);
    }
    const waited = await waitRes.json();
    if (waited.data.status !== "finished") {
      throw new Error(`CloudConvert job status: ${waited.data.status}`);
    }

    const exportTask = waited.data.tasks.find(
      (t: { name: string }) => t.name === "export-1",
    );
    const fileUrl = exportTask?.result?.files?.[0]?.url;
    if (!fileUrl) throw new Error("No PDF URL returned");

    const pdfRes = await fetch(fileUrl);
    if (!pdfRes.ok) throw new Error(`PDF download failed [${pdfRes.status}]`);
    const pdfBuf = new Uint8Array(await pdfRes.arrayBuffer());

    // base64 encode
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < pdfBuf.length; i += chunk) {
      binary += String.fromCharCode(...pdfBuf.subarray(i, i + chunk));
    }
    const pdfBase64 = btoa(binary);

    return new Response(JSON.stringify({ pdfBase64 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("g50-pdf error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
