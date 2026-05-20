import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface SemenPackedProps {
  projectId: string;
}

type PackLineRow = {
  id: string;
  bull_name: string | null;
  bull_code: string | null;
  bull_catalog_id: string | null;
  field_canister: string | null;
  units: number;
  is_billable: boolean | null;
  invoicing_company_id: string | null;
  tank_pack_id: string;
  semen_companies?: { name: string } | null;
};

function companyBadge(name: string | null | undefined) {
  if (!name) return <Badge variant="outline" className="bg-gray-500/10 text-gray-300 border-gray-500/30 text-[10px]">Unknown</Badge>;
  if (/select/i.test(name)) return <Badge variant="outline" className="bg-blue-500/15 text-blue-300 border-blue-400/40 text-[10px]">{name}</Badge>;
  if (/catl/i.test(name)) return <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-400/40 text-[10px]">{name}</Badge>;
  return <Badge variant="outline" className="text-[10px]">{name}</Badge>;
}

export default function SemenPacked({ projectId }: SemenPackedProps) {
  const queryClient = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["semen_packed_v2", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      // The project link goes through tank_pack_projects. That table is the
      // authoritative bridge — using customer_id alone would collide with
      // other projects for the same customer.
      const { data: links } = await supabase
        .from("tank_pack_projects")
        .select("tank_pack_id")
        .eq("project_id", projectId);
      const packIds = (links ?? []).map((l: any) => l.tank_pack_id).filter(Boolean);
      if (packIds.length === 0) return [];
      const { data, error } = await supabase
        .from("tank_pack_lines")
        .select("id, bull_name, bull_code, bull_catalog_id, field_canister, units, is_billable, invoicing_company_id, tank_pack_id, semen_companies:invoicing_company_id(name)")
        .in("tank_pack_id", packIds)
        .order("field_canister");
      if (error) throw error;
      return (data ?? []) as PackLineRow[];
    },
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["semen_packed_v2", projectId] });

  const saveUnits = async (id: string, prev: number, val: string) => {
    const next = val === "" ? prev : Number(val);
    if (!Number.isFinite(next) || next === prev) return;
    const { error } = await supabase
      .from("tank_pack_lines")
      .update({ units: next })
      .eq("id", id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Pack line updated" });
    refetch();
  };

  const toggleBillable = async (id: string, current: boolean | null) => {
    const next = !current;
    const { error } = await supabase
      .from("tank_pack_lines")
      .update({ is_billable: next })
      .eq("id", id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: next ? "Marked billable" : "Marked non-billable" });
    refetch();
  };

  return (
    <section className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
      <h2 className="text-base font-bold tracking-tight uppercase text-muted-foreground">Semen: Packed</h2>
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Bull</th>
              <th className="text-left px-3 py-2 font-medium w-[110px]">NAAB</th>
              <th className="text-left px-3 py-2 font-medium w-[90px]">Canister</th>
              <th className="text-right px-3 py-2 font-medium w-[90px]">Units</th>
              <th className="text-center px-3 py-2 font-medium w-[100px]">Billable?</th>
              <th className="text-left px-3 py-2 font-medium w-[150px]">Invoicing co.</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">No tank packed yet for this project.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-border/40">
                <td className="px-3 py-2 font-medium truncate">{r.bull_name || "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.bull_code || "—"}</td>
                <td className="px-3 py-2">{r.field_canister || "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Input
                    inputMode="numeric"
                    className="h-7 w-[70px] text-right text-xs ml-auto"
                    defaultValue={r.units}
                    onBlur={(e) => saveUnits(r.id, r.units, e.target.value)}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => toggleBillable(r.id, r.is_billable)}
                    className={`inline-flex items-center justify-center rounded-full h-6 px-2.5 text-[11px] font-medium transition-colors cursor-pointer ${
                      r.is_billable === false
                        ? "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                        : "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                    }`}
                  >
                    {r.is_billable === false ? "No" : "Yes"}
                  </button>
                </td>
                <td className="px-3 py-2">{companyBadge(r.semen_companies?.name)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
