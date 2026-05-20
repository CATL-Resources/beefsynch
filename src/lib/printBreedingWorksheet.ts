import { supabase } from "@/integrations/supabase/client";
import { generateWorksheetPdf } from "./generateWorksheetPdf";

/**
 * Loads all data the breeding worksheet needs straight from the database
 * and generates the PDF. Same output regardless of which page invokes it,
 * so ProjectDetail and ProjectBilling produce identical worksheets.
 */
export async function printBreedingWorksheet(project: any) {
  if (!project?.id) return;

  // 1. Project events + bulls (with NAAB code)
  const [eventsRes, bullsRes, billingRes] = await Promise.all([
    supabase
      .from("protocol_events")
      .select("*")
      .eq("project_id", project.id)
      .order("event_date", { ascending: true }),
    supabase
      .from("project_bulls")
      .select("*, bulls_catalog(bull_name, naab_code, registration_number, company)")
      .eq("project_id", project.id),
    supabase
      .from("project_billing")
      .select("id")
      .eq("project_id", project.id)
      .maybeSingle(),
  ]);

  const events = eventsRes.data ?? [];
  const bulls = bullsRes.data ?? [];
  const billingId = billingRes.data?.id ?? null;

  // 2. Tank pack (via link table) + pack lines
  const { data: packLinks } = await supabase
    .from("tank_pack_projects")
    .select("tank_packs(id, status, pack_type, field_tank_id, tanks:field_tank_id(id, tank_number, tank_name))")
    .eq("project_id", project.id);
  const firstPack = (packLinks ?? [])
    .map((pl: any) => pl.tank_packs)
    .find(Boolean) || null;

  let packLineRows: { bull_name: string; bull_code: string | null; canister: string; packed: number }[] = [];
  let unpackLineRows: { bull_name: string; bull_code: string | null; units_returned: number; destination_label: string | null }[] = [];
  if (firstPack?.id) {
    const { data: plData } = await supabase
      .from("tank_pack_lines")
      .select("bull_name, bull_code, field_canister, units")
      .eq("tank_pack_id", firstPack.id)
      .order("bull_name")
      .order("field_canister");
    if (plData) {
      // Aggregate by bull + field canister: when the same bull goes into the
      // same canister from multiple source tanks (e.g. 60 from Bertha + 20
      // from Aaron → can 4), the worksheet should show one row with the
      // combined total (80), not two split rows.
      const agg = new Map<string, { bull_name: string; bull_code: string | null; canister: string; packed: number }>();
      for (const pl of plData) {
        const bullName = pl.bull_name || "";
        const bullCode = pl.bull_code || null;
        const canister = pl.field_canister || "";
        const key = `${bullName}|${bullCode ?? ""}|${canister}`;
        const entry = agg.get(key);
        if (entry) {
          entry.packed += pl.units ?? 0;
        } else {
          agg.set(key, { bull_name: bullName, bull_code: bullCode, canister, packed: pl.units ?? 0 });
        }
      }
      packLineRows = Array.from(agg.values()).sort((a, b) => {
        const n = a.bull_name.localeCompare(b.bull_name);
        if (n !== 0) return n;
        return a.canister.localeCompare(b.canister, undefined, { numeric: true });
      });
    }

    // Returned-summary data: only relevant when unpacked, but it's cheap to
    // fetch unconditionally and let the PDF generator gate on pack status.
    const { data: unpackData } = await supabase
      .from("tank_unpack_lines")
      .select("bull_name, bull_code, units_returned, destination_canister, tanks:destination_tank_id(tank_name, tank_number)")
      .eq("tank_pack_id", firstPack.id);
    if (unpackData) {
      unpackLineRows = unpackData.map((ul: any) => {
        const tank = ul.tanks;
        const tankPart = tank
          ? (tank.tank_name ? `${tank.tank_name} (#${tank.tank_number})` : `Tank #${tank.tank_number}`)
          : null;
        const canPart = ul.destination_canister ? ` / can ${ul.destination_canister}` : "";
        return {
          bull_name: ul.bull_name || "",
          bull_code: ul.bull_code || null,
          units_returned: ul.units_returned ?? 0,
          destination_label: tankPart ? `${tankPart}${canPart}` : null,
        };
      });
    }
  }

  // 3. Billing-scoped data
  let products: any[] = [];
  let semenLines: { bull_name: string; bull_code: string | null; units_packed: number | null; units_blown: number | null; units_billable: number | null }[] = [];
  let breedOnly: { id: string; session_label: string | null; session_date: string; time_of_day: string | null; sort_order: number | null }[] = [];
  let inventory: any[] = [];
  let laborEntries: { description: string; labor_dates: string | null }[] = [];

  if (billingId) {
    const [productsRes, semRes, sessRes, invRes, laborRes] = await Promise.all([
      supabase
        .from("project_billing_products")
        .select("*")
        .eq("billing_id", billingId)
        .order("sort_order"),
      supabase
        .from("project_billing_semen")
        .select("bull_name, bull_code, units_packed, units_blown, units_billable")
        .eq("billing_id", billingId)
        .order("sort_order"),
      supabase
        .from("project_billing_sessions")
        .select("id, session_label, session_date, time_of_day, sort_order")
        .eq("billing_id", billingId)
        .order("sort_order"),
      supabase
        .from("project_billing_session_inventory")
        .select("*")
        .eq("billing_id", billingId)
        .order("sort_order"),
      supabase
        .from("project_billing_labor")
        .select("description, labor_dates")
        .eq("billing_id", billingId)
        .order("sort_order"),
    ]);

    products = productsRes.data ?? [];

    semenLines = (semRes.data ?? []).map((sl: any) => ({
      bull_name: sl.bull_name || "",
      bull_code: sl.bull_code || null,
      units_packed: sl.units_packed ?? null,
      units_blown: sl.units_blown ?? null,
      units_billable: sl.units_billable ?? null,
    }));

    breedOnly = (sessRes.data ?? [])
      .filter((s: any) => {
        const label = (s.session_label || "").toLowerCase();
        return label.includes("breed") || label.includes("ai ") || label === "ai" || label.includes("tai");
      })
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.session_date.localeCompare(b.session_date));

    inventory = invRes.data ?? [];

    laborEntries = (laborRes.data ?? []).map((l: any) => ({
      description: l.description || "",
      labor_dates: l.labor_dates || null,
    }));
  }

  // 4. Per-bull/canister session detail rows
  const bullCanisterMap = new Map<string, {
    bull_name: string; bull_code: string | null; canister: string; packed: number;
    sessions: Record<number, { start: number | null; end: number | null }>;
    returned: number | null;
  }>();

  for (const inv of inventory) {
    const key = `${inv.bull_catalog_id || inv.bull_name}|${inv.canister}`;
    if (!bullCanisterMap.has(key)) {
      bullCanisterMap.set(key, {
        bull_name: inv.bull_name,
        bull_code: inv.bull_code,
        canister: inv.canister,
        packed: 0,
        sessions: {},
        returned: null,
      });
    }
    const entry = bullCanisterMap.get(key)!;
    const sessIdx = breedOnly.findIndex(s => s.id === inv.session_id);
    if (sessIdx >= 0) {
      entry.sessions[sessIdx] = { start: inv.start_units, end: inv.end_units };
    }
    if (inv.returned_units != null) entry.returned = Math.max(entry.returned ?? 0, inv.returned_units);
  }

  for (const [, entry] of bullCanisterMap) {
    const matchingPL = packLineRows.find(pl =>
      pl.bull_name === entry.bull_name && pl.canister === entry.canister
    );
    if (matchingPL) entry.packed = matchingPL.packed;
  }

  const sessionDetailRows = Array.from(bullCanisterMap.values()).sort((a, b) =>
    a.bull_name.localeCompare(b.bull_name) || a.canister.localeCompare(b.canister, undefined, { numeric: true })
  );

  // 5. Generate
  generateWorksheetPdf(project, events, bulls, products, firstPack, {
    semenLines,
    breedingSessions: breedOnly,
    sessionDetails: sessionDetailRows,
    packLines: packLineRows,
    laborEntries,
    unpackLines: unpackLineRows,
    packStatus: firstPack?.status ?? null,
  });
}
