import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";

interface Target {
  name: string;
  okStatus: number[];
  expectsAuth: boolean;
}

const TARGETS: Target[] = [
  { name: "full-export", okStatus: [200, 204], expectsAuth: true },
  { name: "health-check", okStatus: [200, 204], expectsAuth: true },
  { name: "function-monitor", okStatus: [200, 204], expectsAuth: true },
  { name: "auth-email-hook", okStatus: [200, 204, 400], expectsAuth: false },
  { name: "import-bull-catalog", okStatus: [200, 204, 400], expectsAuth: false },
  { name: "match-inventory-to-catalog", okStatus: [200, 204, 400], expectsAuth: false },
  { name: "google-calendar-config", okStatus: [200, 204, 400, 401], expectsAuth: false },
  { name: "bull-chat", okStatus: [200, 401, 403], expectsAuth: false },
  { name: "invite-member", okStatus: [200, 401, 403], expectsAuth: false },
  { name: "resend-invite", okStatus: [200, 401, 403], expectsAuth: false },
];

const TIMEOUT_MS = 10000;

interface ProbeResult {
  function_name: string;
  status_code: number | null;
  response_ms: number | null;
  ok: boolean;
  notes: string | null;
}

async function probe(supabaseUrl: string, serviceRoleKey: string, t: Target): Promise<ProbeResult> {
  const url = `${supabaseUrl}/functions/v1/${t.name}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(t.expectsAuth ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
      },
      body: JSON.stringify({ __health_probe: true }),
      signal: ctrl.signal,
    });
    const ms = Date.now() - start;
    clearTimeout(timer);
    const ok = t.okStatus.includes(res.status);
    return {
      function_name: t.name,
      status_code: res.status,
      response_ms: ms,
      ok,
      notes: ok ? null : `Unexpected status ${res.status}`,
    };
  } catch (err: any) {
    clearTimeout(timer);
    const ms = Date.now() - start;
    const aborted = err?.name === "AbortError";
    return {
      function_name: t.name,
      status_code: null,
      response_ms: ms,
      ok: false,
      notes: aborted ? `Timeout after ${TIMEOUT_MS}ms` : `Network error: ${err?.message ?? err}`,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!serviceRoleKey || !supabaseUrl) {
      return new Response(JSON.stringify({ error: "Missing Supabase env vars" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized - service-role key required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any = null;
    try { body = await req.json(); } catch (_e) { body = null; }
    const isProbe = body?.__health_probe === true;
    if (isProbe) {
      return new Response(JSON.stringify({ ok: true, probe: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = await Promise.all(
      TARGETS.map((t) => probe(supabaseUrl, serviceRoleKey, t)),
    );

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await supabase.from("edge_function_health_log").insert(
      results.map((r) => ({
        function_name: r.function_name,
        status_code: r.status_code,
        response_ms: r.response_ms,
        ok: r.ok,
        notes: r.notes,
      })),
    );

    const broken = results.filter((r) => !r.ok);

    if (broken.length > 0 && resendApiKey) {
      const rowsHtml = broken
        .map(
          (r) => `<tr>
        <td style="padding:6px 10px;border:1px solid #ddd"><code>${r.function_name}</code></td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center">${r.status_code ?? "-"}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${r.response_ms ?? "-"}</td>
        <td style="padding:6px 10px;border:1px solid #ddd">${r.notes ?? ""}</td>
      </tr>`,
        )
        .join("");

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "BeefSynch <backups@mail.beefsynch.com>",
          to: ["office@catlresources.com"],
          subject: `BeefSynch Edge Function Monitor - ${broken.length} broken`,
          html: `
            <p><strong>${broken.length} of ${results.length}</strong> Edge Functions failed their health probe.</p>
            <table style="border-collapse:collapse;font-size:13px">
              <thead><tr style="background:#222;color:#fff">
                <th style="padding:6px 10px;border:1px solid #222;text-align:left">Function</th>
                <th style="padding:6px 10px;border:1px solid #222">Status</th>
                <th style="padding:6px 10px;border:1px solid #222">Resp ms</th>
                <th style="padding:6px 10px;border:1px solid #222;text-align:left">Note</th>
              </tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
            <p style="color:#666;font-size:12px">Run at ${new Date().toISOString()} - BeefSynch by Chuteside, LLC</p>
          `,
        }),
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total: results.length,
        broken: broken.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("function-monitor failed:", err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
