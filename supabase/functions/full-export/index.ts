import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";
// @deno-types="https://deno.land/x/zipjs@v2.7.52/index.d.ts"
import { BlobWriter, ZipWriter, TextReader } from "https://deno.land/x/zipjs@v2.7.52/index.js";

/**
 * full-export Edge Function
 *
 * Exports every public-schema table (plus auth.users, auth.identities, and
 * storage metadata) as a ZIP of JSONL files with a dependency-ordered manifest.
 *
 * Auth: service-role key only (passed in Authorization header).
 */

// Tables in foreign-key dependency order (parents first).
const TABLES_IN_ORDER: string[] = [
  "organizations",
  "organization_members",
  "pending_invites",
  "profiles",
  "naab_controllers",
  "stud_code_registry",
  "bulls_catalog",
  "bull_naab_codes",
  "bull_favorites",
  "customers",
  "semen_companies",
  "tanks",
  "projects",
  "protocol_events",
  "project_bulls",
  "project_contacts",
  "project_billing",
  "project_billing_labor",
  "project_billing_products",
  "project_billing_semen",
  "project_billing_sessions",
  "project_billing_session_inventory",
  "billing_products",
  "tank_inventory",
  "tank_fills",
  "tank_movements",
  "semen_orders",
  "semen_order_items",
  "product_order_items",
  "shipments",
  "inventory_transactions",
  "tank_packs",
  "tank_pack_lines",
  "tank_pack_projects",
  "tank_pack_orders",
  "tank_unpack_lines",
  "google_calendar_events",
  "receiving_report_audit_log",
];

const PAGE_SIZE = 1000;

/**
 * Fetch all rows from a table, paginating through the 1000-row PostgREST cap.
 */
async function fetchAllRows(
  supabase: ReturnType<typeof createClient>,
  table: string,
): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch ${table} (offset ${from}): ${error.message}`);
    }

    if (!data || data.length === 0) break;
    allRows.push(...data);

    if (data.length < PAGE_SIZE) break; // last page
    from += PAGE_SIZE;
  }

  return allRows;
}

/**
 * Convert an array of row objects into JSONL (one JSON object per line).
 */
function toJsonl(rows: Record<string, unknown>[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n");
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Auth: service role key OR authenticated owner/admin --------------------
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization");

    if (authHeader === `Bearer ${serviceRoleKey}`) {
      // Service role access — OK
    } else if (authHeader) {
      // Try as user JWT — verify they are an org owner or admin
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: { user }, error: userErr } = await userClient.auth.getUser();
      if (userErr || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized — invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Check that user is owner or admin of at least one org
      const svcClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: membership } = await svcClient
        .from("organization_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("accepted", true)
        .in("role", ["owner", "admin"])
        .limit(1);
      if (!membership || membership.length === 0) {
        return new Response(
          JSON.stringify({ error: "Forbidden — owner or admin role required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Unauthorized — no credentials provided" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // --- Build ZIP --------------------------------------------------------------
    const blobWriter = new BlobWriter("application/zip");
    const zipWriter = new ZipWriter(blobWriter);

    const manifest: {
      exported_at: string;
      tables: { name: string; row_count: number }[];
      auth_users_count: number | null;
      auth_identities_count: number | null;
      storage_files: { bucket: string; file_count: number }[];
    } = {
      exported_at: new Date().toISOString(),
      tables: [],
      auth_users_count: null,
      auth_identities_count: null,
      storage_files: [],
    };

    // 1. Export all public tables ------------------------------------------------
    for (const table of TABLES_IN_ORDER) {
      const rows = await fetchAllRows(supabase, table);
      const jsonl = toJsonl(rows);
      await zipWriter.add(`${table}.jsonl`, new TextReader(jsonl));
      manifest.tables.push({ name: table, row_count: rows.length });
    }

    // 2. Export auth.users and auth.identities via SQL functions -----------------
    try {
      // Use SECURITY DEFINER functions that query auth schema directly
      const { data: usersRows, error: usersErr } = await supabase.rpc("export_auth_users");
      if (usersErr) throw new Error(`export_auth_users failed: ${usersErr.message}`);

      const { data: identitiesRows, error: idErr } = await supabase.rpc("export_auth_identities");
      if (idErr) throw new Error(`export_auth_identities failed: ${idErr.message}`);

      await zipWriter.add("auth_users.jsonl", new TextReader(toJsonl(usersRows ?? [])));
      manifest.auth_users_count = (usersRows ?? []).length;

      await zipWriter.add("auth_identities.jsonl", new TextReader(toJsonl(identitiesRows ?? [])));
      manifest.auth_identities_count = (identitiesRows ?? []).length;
    } catch (authErr: any) {
      const note = JSON.stringify({
        error: "Could not export auth tables",
        message: authErr?.message ?? String(authErr),
        hint: "You may need to re-create users manually in the new project.",
      });
      await zipWriter.add("auth_users_ERROR.json", new TextReader(note));
      manifest.auth_users_count = null;
      manifest.auth_identities_count = null;
    }

    // 3. Export storage metadata --------------------------------------------------
    const buckets = ["shipment-documents", "email-assets", "documents"];
    for (const bucket of buckets) {
      try {
        const allFiles: Record<string, unknown>[] = [];
        let offset = 0;
        while (true) {
          const { data, error } = await supabase.storage
            .from(bucket)
            .list("", { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });

          if (error) throw error;
          if (!data || data.length === 0) break;

          for (const file of data) {
            // Skip folder placeholders
            if (file.id) {
              allFiles.push({
                bucket,
                path: file.name,
                size: (file.metadata as any)?.size ?? null,
                mimetype: (file.metadata as any)?.mimetype ?? null,
                created_at: file.created_at,
                updated_at: file.updated_at,
              });
            }
          }

          if (data.length < 1000) break;
          offset += 1000;
        }

        // Also recurse one level of folders
        const { data: topLevel } = await supabase.storage
          .from(bucket)
          .list("", { limit: 1000, sortBy: { column: "name", order: "asc" } });

        if (topLevel) {
          for (const item of topLevel) {
            // If it looks like a folder (no id), list its contents
            if (!item.id) {
              let folderOffset = 0;
              while (true) {
                const { data: folderFiles, error: folderErr } = await supabase.storage
                  .from(bucket)
                  .list(item.name, { limit: 1000, offset: folderOffset, sortBy: { column: "name", order: "asc" } });
                if (folderErr || !folderFiles || folderFiles.length === 0) break;
                for (const f of folderFiles) {
                  if (f.id) {
                    allFiles.push({
                      bucket,
                      path: `${item.name}/${f.name}`,
                      size: (f.metadata as any)?.size ?? null,
                      mimetype: (f.metadata as any)?.mimetype ?? null,
                      created_at: f.created_at,
                      updated_at: f.updated_at,
                    });
                  }
                }
                if (folderFiles.length < 1000) break;
                folderOffset += 1000;
              }
            }
          }
        }

        await zipWriter.add(`storage_${bucket.replace(/-/g, "_")}.jsonl`, new TextReader(toJsonl(allFiles)));
        manifest.storage_files.push({ bucket, file_count: allFiles.length });
      } catch (storageErr: any) {
        const note = JSON.stringify({
          error: `Could not list files in bucket ${bucket}`,
          message: storageErr?.message ?? String(storageErr),
        });
        await zipWriter.add(`storage_${bucket.replace(/-/g, "_")}_ERROR.json`, new TextReader(note));
        manifest.storage_files.push({ bucket, file_count: 0 });
      }
    }

    // 4. Write manifest -----------------------------------------------------------
    await zipWriter.add("manifest.json", new TextReader(JSON.stringify(manifest, null, 2)));

    // 5. Finalize ZIP -------------------------------------------------------------
    await zipWriter.close();
    const zipBlob = await blobWriter.getData();
    const arrayBuffer = await zipBlob.arrayBuffer();

    const dateStr = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(arrayBuffer), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="beefsynch_export_${dateStr}.zip"`,
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
