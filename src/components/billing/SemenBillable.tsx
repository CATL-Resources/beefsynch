import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface SemenBillableProps {
  billingId: string;
  projectId: string;
}

type SemenRow = {
  id: string;
  bull_catalog_id: string | null;
  bull_name: string;
  bull_code: string | null;
  units_packed: number | null;
  units_returned: number | null;
  units_blown: number | null;
  units_billable: number | null;
  unit_price: number | null;
  line_total: number | null;
  invoicing_company_id: string | null;
  semen_companies?: { name: string } | null;
};

type SessionInvRow = {
  bull_catalog_id: string | null;
  bull_name: string;
  blown_units: number | null;
  end_units: number | null;
  session_id: string;
};

type SessionMetaRow = { id: string; session_date: string | null; session_type: string | null };

type PackLineRow = {
  bull_catalog_id: string | null;
  bull_name: string;
  bull_code: string | null;
  units: number;
  invoicing_company_id: string | null;
};

const formatCurrency = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toFixed(2)}`;

function companyBadge(name: string | null | undefined) {
  if (!name) return <Badge variant="outline" className="bg-gray-500/10 text-gray-300 border-gray-500/30 text-[10px]">—</Badge>;
  if (/select/i.test(name)) return <Badge variant="outline" className="bg-blue-500/15 text-blue-300 border-blue-400/40 text-[10px]">Select</Badge>;
  if (/catl/i.test(name)) return <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-400/40 text-[10px]">CATL</Badge>;
  return <Badge variant="outline" className="text-[10px]">{name}</Badge>;
}

export default function SemenBillable({ billingId, projectId }: SemenBillableProps) {
  const queryClient = useQueryClient();

  const { data: rows = [] } = useQuery({
    queryKey: ["semen_billable_v2", billingId],
    enabled: !!billingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_billing_semen")
        .select("*, semen_companies:invoicing_company_id(name)")
        .eq("billing_id", billingId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as SemenRow[];
    },
  });

  // Pull pack lines (for packed totals + auto-create) and session inventory
  // (for blown totals).
  const { data: packLines = [] } = useQuery({
    queryKey: ["semen_billable_pack_v2", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data: links } = await supabase
        .from("tank_pack_projects")
        .select("tank_pack_id")
        .eq("project_id", projectId);
      const ids = (links ?? []).map((l: any) => l.tank_pack_id).filter(Boolean);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("tank_pack_lines")
        .select("bull_catalog_id, bull_name, bull_code, units, invoicing_company_id")
        .in("tank_pack_id", ids);
      if (error) throw error;
      return (data ?? []) as PackLineRow[];
    },
  });

  const { data: invRows = [] } = useQuery({
    queryKey: ["semen_billable_session_inv_v2", billingId],
    enabled: !!billingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_billing_session_inventory")
        .select("bull_catalog_id, bull_name, blown_units, end_units, session_id")
        .eq("billing_id", billingId);
      if (error) throw error;
      return (data ?? []) as SessionInvRow[];
    },
  });

  // Sessions, sorted by date — the latest field_session's End values are
  // the suggested Returned figures for Section 3.
  const { data: sessionMeta = [] } = useQuery({
    queryKey: ["semen_billable_session_meta_v2", billingId],
    enabled: !!billingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_billing_sessions")
        .select("id, session_date, session_type")
        .eq("billing_id", billingId)
        .eq("session_type", "field_session")
        .order("session_date");
      if (error) throw error;
      return (data ?? []) as SessionMetaRow[];
    },
  });

  const packedByBull = useMemo(() => {
    const m = new Map<string, number>();
    for (const pl of packLines) {
      const k = pl.bull_catalog_id || pl.bull_name;
      m.set(k, (m.get(k) ?? 0) + (pl.units ?? 0));
    }
    return m;
  }, [packLines]);

  const blownByBull = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of invRows) {
      const k = r.bull_catalog_id || r.bull_name;
      m.set(k, (m.get(k) ?? 0) + (r.blown_units ?? 0));
    }
    return m;
  }, [invRows]);

  // Suggested Returned per bull = sum of End values on the last field session.
  const suggestedReturnedByBull = useMemo(() => {
    const m = new Map<string, number>();
    const lastSession = sessionMeta[sessionMeta.length - 1];
    if (!lastSession) return m;
    for (const r of invRows) {
      if (r.session_id !== lastSession.id) continue;
      const k = r.bull_catalog_id || r.bull_name;
      m.set(k, (m.get(k) ?? 0) + (r.end_units ?? 0));
    }
    return m;
  }, [invRows, sessionMeta]);

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["semen_billable_v2", billingId] });

  // One-shot auto-fill: once unpack populates session End values, push them
  // into project_billing_semen.units_returned and recompute units_billable +
  // line_total for any row the user clearly hasn't touched yet
  // (units_returned still null or 0). Manual edits are preserved because we
  // only write when units_returned is the default.
  const autoFillDone = useRef(false);
  useEffect(() => {
    if (autoFillDone.current) return;
    if (rows.length === 0 || suggestedReturnedByBull.size === 0) return;

    const updates: Array<{ id: string; units_returned: number; units_billable: number; line_total: number }> = [];
    for (const r of rows) {
      const k = r.bull_catalog_id || r.bull_name;
      const suggested = suggestedReturnedByBull.get(k);
      if (suggested == null) continue;
      if (r.units_returned !== 0 && r.units_returned !== null) continue; // user already edited
      const packed = packedByBull.get(k) ?? r.units_packed ?? 0;
      const blown = blownByBull.get(k) ?? r.units_blown ?? 0;
      const returned = suggested;
      const used = Math.max(0, packed - returned);
      const billable = Math.max(0, used - blown);
      const price = r.unit_price ?? 0;
      const line_total = Number((billable * price).toFixed(2));
      updates.push({ id: r.id, units_returned: returned, units_billable: billable, line_total });
    }
    if (updates.length === 0) return;
    autoFillDone.current = true;
    Promise.all(
      updates.map((u) =>
        supabase
          .from("project_billing_semen")
          .update({
            units_returned: u.units_returned,
            units_billable: u.units_billable,
            line_total: u.line_total,
          })
          .eq("id", u.id),
      ),
    ).then(() => refetch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, suggestedReturnedByBull, packedByBull, blownByBull]);

  // Auto-create semen rows once when pack lines exist but no semen rows do.
  useEffect(() => {
    if (rows.length > 0 || packLines.length === 0) return;
    const byBull = new Map<string, { bull_name: string; bull_code: string | null; bull_catalog_id: string | null; units: number; invoicing_company_id: string | null; mixed: boolean }>();
    for (const pl of packLines) {
      const k = pl.bull_catalog_id || pl.bull_name;
      const entry = byBull.get(k);
      if (entry) {
        entry.units += pl.units ?? 0;
        if (entry.invoicing_company_id !== pl.invoicing_company_id) entry.mixed = true;
      } else {
        byBull.set(k, {
          bull_name: pl.bull_name,
          bull_code: pl.bull_code,
          bull_catalog_id: pl.bull_catalog_id,
          units: pl.units ?? 0,
          invoicing_company_id: pl.invoicing_company_id,
          mixed: false,
        });
      }
    }
    const inserts = Array.from(byBull.values()).map((b, i) => ({
      billing_id: billingId,
      bull_catalog_id: b.bull_catalog_id,
      bull_name: b.bull_name,
      bull_code: b.bull_code,
      units_packed: b.units,
      units_returned: 0,
      units_blown: 0,
      units_billable: b.units,
      unit_price: 0,
      line_total: 0,
      sort_order: i,
      invoicing_company_id: b.mixed ? null : b.invoicing_company_id,
    }));
    if (inserts.length === 0) return;
    supabase.from("project_billing_semen").insert(inserts).then(() => refetch());
  }, [rows.length, packLines, billingId]);

  const computeLineTotal = (billable: number | null, price: number | null) =>
    Number((Number(billable ?? 0) * Number(price ?? 0)).toFixed(2));

  const saveField = async (row: SemenRow, patch: Partial<SemenRow>) => {
    const next: any = { ...row, ...patch };
    next.line_total = computeLineTotal(next.units_billable, next.unit_price);
    const { id, semen_companies, ...rest } = next;
    const { error } = await supabase
      .from("project_billing_semen")
      .update(rest)
      .eq("id", id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Semen line saved" });
    refetch();
  };

  // Derived per-row display values
  const display = rows.map((r) => {
    const k = r.bull_catalog_id || r.bull_name;
    const packed = packedByBull.get(k) ?? r.units_packed ?? 0;
    const blown = blownByBull.get(k) ?? r.units_blown ?? 0;
    const returned = r.units_returned ?? 0;
    const used = Math.max(0, packed - returned);
    return { row: r, packed, blown, returned, used };
  });

  // Subtotals by company
  const subtotals = new Map<string, { billable: number; total: number }>();
  for (const d of display) {
    const company = d.row.semen_companies?.name || "Unknown";
    const cur = subtotals.get(company) || { billable: 0, total: 0 };
    cur.billable += d.row.units_billable ?? 0;
    cur.total += d.row.line_total ?? 0;
    subtotals.set(company, cur);
  }

  return (
    <section className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
      <h2 className="text-base font-bold tracking-tight uppercase text-muted-foreground">Semen: Billable Summary</h2>
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Bull</th>
              <th className="text-left px-3 py-2 font-medium w-[90px]">NAAB</th>
              <th className="text-right px-3 py-2 font-medium w-[70px]">Packed</th>
              <th className="text-right px-3 py-2 font-medium w-[80px]">Returned</th>
              <th className="text-right px-3 py-2 font-medium w-[70px]">Used</th>
              <th className="text-right px-3 py-2 font-medium w-[70px]">Blown</th>
              <th className="text-right px-3 py-2 font-medium w-[80px] text-emerald-600">Billable</th>
              <th className="text-right px-3 py-2 font-medium w-[80px]">Price</th>
              <th className="text-right px-3 py-2 font-medium w-[90px]">Total</th>
              <th className="text-left px-3 py-2 font-medium w-[80px]">Inv.</th>
            </tr>
          </thead>
          <tbody>
            {display.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-4 text-center text-muted-foreground">No semen lines yet.</td></tr>
            ) : display.map(({ row: r, packed, blown, returned, used }) => (
              <tr key={r.id} className="border-t border-border/40">
                <td className="px-3 py-2 font-medium truncate">{r.bull_name}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.bull_code || "—"}</td>
                <td className="px-3 py-2 text-right italic text-muted-foreground tabular-nums">{packed}</td>
                <td className="px-3 py-2 text-right">
                  {(() => {
                    const k = r.bull_catalog_id || r.bull_name;
                    const suggested = suggestedReturnedByBull.get(k);
                    const placeholder = suggested != null ? String(suggested) : "—";
                    return (
                      <Input
                        inputMode="numeric"
                        className="h-7 w-[64px] text-right text-xs ml-auto"
                        defaultValue={r.units_returned ?? ""}
                        placeholder={placeholder}
                        onBlur={(e) => {
                          const v = e.target.value === "" ? 0 : Number(e.target.value);
                          if (v === returned) return;
                          saveField(r, { units_returned: v });
                        }}
                      />
                    );
                  })()}
                </td>
                <td className="px-3 py-2 text-right italic text-muted-foreground tabular-nums">{used || "—"}</td>
                <td className="px-3 py-2 text-right italic text-muted-foreground tabular-nums">{blown || "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Input
                    inputMode="numeric"
                    className="h-7 w-[68px] text-right text-xs ml-auto text-emerald-600 font-semibold"
                    defaultValue={r.units_billable ?? ""}
                    placeholder="—"
                    onBlur={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      if (v === r.units_billable) return;
                      saveField(r, { units_billable: v });
                    }}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <Input
                    inputMode="decimal"
                    className="h-7 w-[68px] text-right text-xs ml-auto"
                    defaultValue={r.unit_price ?? ""}
                    placeholder="—"
                    onBlur={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      if (v === r.unit_price) return;
                      saveField(r, { unit_price: v });
                    }}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.line_total)}</td>
                <td className="px-3 py-2">{companyBadge(r.semen_companies?.name)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 text-xs">
        {Array.from(subtotals.entries()).map(([company, { billable, total }]) => (
          <span key={company} className="text-muted-foreground">
            <span className="font-medium text-foreground">{company}:</span> {billable} units · {formatCurrency(total)}
          </span>
        ))}
      </div>
    </section>
  );
}
