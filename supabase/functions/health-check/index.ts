import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";

// ============================================================================
// BeefSynch health-check Edge Function — runs the 20-check data-integrity SQL
// once per call. Service-role auth only (cron + manual ops).
//
// Scheduled: weekly Mon 07:00 UTC via cron.job 'weekly-health-check'.
// Pattern follows full-export: verify_jwt:false at the platform level,
// with a manual `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` check inside.
// ============================================================================

interface CheckRow {
  sort_order: number;
  check_name: string;
  status: "PASS" | "FAIL" | "INFO";
  fail_count: number;
  sample_ids: string | null;
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function rowHtml(r: CheckRow): string {
  const isFail = r.status === "FAIL";
  const isInfo = r.status === "INFO";
  const bg = isFail ? "#ffe5e5" : isInfo ? "#fff7d6" : "#eaf7ea";
  const fg = isFail ? "#a00" : isInfo ? "#7a5d00" : "#1f7a1f";
  const sample = r.sample_ids
    ? `<div style="font-size:11px;color:#555;margin-top:2px;max-width:520px;word-break:break-all">${escapeHtml(r.sample_ids)}</div>`
    : "";
  return `<tr style="background:${bg}">
    <td style="padding:8px 10px;border:1px solid #ddd"><strong>${escapeHtml(r.check_name)}</strong>${sample}</td>
    <td style="padding:8px 10px;border:1px solid #ddd;color:${fg};font-weight:600;text-align:center">${r.status}</td>
    <td style="padding:8px 10px;border:1px solid #ddd;text-align:right">${r.fail_count}</td>
  </tr>`;
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

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase.rpc("run_health_checks");
    if (error) throw new Error(`run_health_checks failed: ${error.message}`);
    const rows = (data ?? []) as CheckRow[];

    const failed = rows.filter((r) => r.status === "FAIL");
    const info = rows.filter((r) => r.status === "INFO");
    const passed = rows.filter((r) => r.status === "PASS");
    const overallFail = failed.length > 0;
    const subjectStatus = overallFail ? "FAIL" : "PASS";
    const dateStr = new Date().toISOString().slice(0, 10);
    const subject = `BeefSynch Health Check - ${subjectStatus} (${rows.length} checks, ${failed.length} failing) - ${dateStr}`;

    const orderedRows = [...failed, ...info, ...passed];

    const html = `
      <p>Weekly data integrity check for BeefSynch.</p>
      <p>
        <strong>${rows.length}</strong> checks run.
        <span style="color:#a00"><strong>${failed.length}</strong> failing</span>,
        <span style="color:#7a5d00"><strong>${info.length}</strong> info</span>,
        <span style="color:#1f7a1f"><strong>${passed.length}</strong> passing</span>.
      </p>
      <table style="border-collapse:collapse;font-size:13px;width:100%;max-width:780px">
        <thead>
          <tr style="background:#222;color:#fff">
            <th style="padding:8px 10px;border:1px solid #222;text-align:left">Check</th>
            <th style="padding:8px 10px;border:1px solid #222;text-align:center;width:80px">Status</th>
            <th style="padding:8px 10px;border:1px solid #222;text-align:right;width:80px">Count</th>
          </tr>
        </thead>
        <tbody>${orderedRows.map(rowHtml).join("")}</tbody>
      </table>
      <p style="color:#666;font-size:12px;margin-top:18px">Run at ${new Date().toISOString()} - BeefSynch by Chuteside, LLC</p>
    `;

    if (!resendApiKey) {
      return new Response(JSON.stringify({ ok: true, email_sent: false, rows }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "BeefSynch <backups@mail.beefsynch.com>",
        to: ["office@catlresources.com"],
        subject,
        html,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      throw new Error(`Resend API error (${emailRes.status}): ${errBody}`);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        email_sent: true,
        overall_status: subjectStatus,
        total_checks: rows.length,
        fail_count: failed.length,
        info_count: info.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("health-check failed:", err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
