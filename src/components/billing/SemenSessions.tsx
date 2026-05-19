import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import SemenSessionCard, { InventoryRow } from "./SemenSessionCard";

interface SemenSessionsProps {
  billingId: string;
  projectId: string;
}

type SessionRow = {
  id: string;
  session_date: string | null;
  head_count: number | null;
  session_type: string | null;
  sort_order: number | null;
};

type SessionInvRow = {
  id: string;
  session_id: string;
  bull_name: string;
  bull_code: string | null;
  bull_catalog_id: string | null;
  canister: string;
  start_units: number | null;
  end_units: number | null;
  blown_units: number | null;
  sort_order: number | null;
};

export default function SemenSessions({ billingId, projectId }: SemenSessionsProps) {
  const queryClient = useQueryClient();

  const { data: sessions = [] } = useQuery({
    queryKey: ["semen_sessions_v2", billingId],
    enabled: !!billingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_billing_sessions")
        .select("id, session_date, head_count, session_type, sort_order")
        .eq("billing_id", billingId)
        .eq("session_type", "field_session")
        .order("session_date")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ["semen_session_inventory_v2", billingId],
    enabled: !!billingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_billing_session_inventory")
        .select("id, session_id, bull_name, bull_code, bull_catalog_id, canister, start_units, end_units, blown_units, sort_order")
        .eq("billing_id", billingId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as SessionInvRow[];
    },
  });

  const rowsBySession = useMemo(() => {
    const m = new Map<string, InventoryRow[]>();
    for (const r of inventory) {
      const arr = m.get(r.session_id) || [];
      arr.push(r);
      m.set(r.session_id, arr);
    }
    return m;
  }, [inventory]);

  const refetchSessions = () => queryClient.invalidateQueries({ queryKey: ["semen_sessions_v2", billingId] });
  const refetchInventory = () => queryClient.invalidateQueries({ queryKey: ["semen_session_inventory_v2", billingId] });

  const saveSessionField = async (id: string, field: "session_date" | "head_count", value: any) => {
    const { error } = await supabase
      .from("project_billing_sessions")
      .update({ [field]: value })
      .eq("id", id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Session saved" });
    refetchSessions();
  };

  const saveCell = async (rowId: string, field: "start_units" | "end_units" | "blown_units", value: number | null) => {
    const { error } = await supabase
      .from("project_billing_session_inventory")
      .update({ [field]: value })
      .eq("id", rowId);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved" });
    refetchInventory();
  };

  const addSession = async () => {
    // Pull pack lines via tank_pack_projects → tank_pack_lines
    const { data: links } = await supabase
      .from("tank_pack_projects")
      .select("tank_pack_id")
      .eq("project_id", projectId);
    const packIds = (links ?? []).map((l: any) => l.tank_pack_id);
    let packLines: any[] = [];
    if (packIds.length > 0) {
      const { data } = await supabase
        .from("tank_pack_lines")
        .select("bull_name, bull_code, bull_catalog_id, field_canister, units")
        .in("tank_pack_id", packIds)
        .order("field_canister");
      packLines = data ?? [];
    }

    // For Start pre-fill: session 1 uses pack units, S2+ uses previous session's end.
    const prevSessionId = sessions[sessions.length - 1]?.id;
    const prevRowsByKey = new Map<string, number | null>();
    if (prevSessionId) {
      for (const r of inventory.filter((x) => x.session_id === prevSessionId)) {
        prevRowsByKey.set(`${r.bull_catalog_id || r.bull_name}|${r.canister}`, r.end_units);
      }
    }

    const { data: created, error } = await supabase
      .from("project_billing_sessions")
      .insert({
        billing_id: billingId,
        session_date: format(new Date(), "yyyy-MM-dd"),
        session_label: "Breeding",
        session_type: "field_session",
        time_of_day: null,
        head_count: null,
        crew: null,
        notes: null,
        sort_order: sessions.length,
      })
      .select("id")
      .single();
    if (error || !created) {
      toast({ title: "Could not add session", description: error?.message, variant: "destructive" });
      return;
    }
    if (packLines.length > 0) {
      const invInserts = packLines.map((pl, i) => {
        const key = `${pl.bull_catalog_id || pl.bull_name}|${pl.field_canister || ""}`;
        const start = prevSessionId ? prevRowsByKey.get(key) ?? null : pl.units;
        return {
          billing_id: billingId,
          session_id: created.id,
          bull_name: pl.bull_name,
          bull_code: pl.bull_code,
          bull_catalog_id: pl.bull_catalog_id,
          canister: pl.field_canister || "",
          start_units: start,
          end_units: null,
          blown_units: null,
          sort_order: i,
        };
      });
      await supabase.from("project_billing_session_inventory").insert(invInserts);
    }
    toast({ title: "Session added" });
    refetchSessions();
    refetchInventory();
  };

  return (
    <section className="space-y-3 pt-4 mt-4 border-t-2 border-border">
      <h2 className="text-lg font-semibold">Semen: used by session</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No breeding sessions yet.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s, i) => (
            <SemenSessionCard
              key={s.id}
              sessionId={s.id}
              index={i}
              date={s.session_date}
              headCount={s.head_count}
              rows={(rowsBySession.get(s.id) ?? []).slice().sort((a, b) =>
                a.bull_name.localeCompare(b.bull_name) || a.canister.localeCompare(b.canister, undefined, { numeric: true })
              )}
              onSessionField={saveSessionField}
              onCellChange={saveCell}
            />
          ))}
        </div>
      )}
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addSession}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add session
      </Button>
    </section>
  );
}
