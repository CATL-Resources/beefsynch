import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import SemenSessionCard, { InventoryRow } from "./SemenSessionCard";
import UnpackFromProjectDialog from "./UnpackFromProjectDialog";

interface SemenSessionsProps {
  billingId: string;
  projectId: string;
  organizationId: string | null | undefined;
}

type ProtocolEventRow = { event_name: string; event_date: string | null };

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

export default function SemenSessions({ billingId, projectId, organizationId }: SemenSessionsProps) {
  const queryClient = useQueryClient();
  const [unpackOpen, setUnpackOpen] = useState(false);

  // Sessions only count as breeding sessions if they happened AFTER the
  // project's last PGF event. Pull protocol events to derive that cutoff.
  const { data: protocolEvents = [] } = useQuery({
    queryKey: ["protocol_events_for_sessions_v2", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("protocol_events")
        .select("event_name, event_date")
        .eq("project_id", projectId);
      if (error) throw error;
      return (data ?? []) as ProtocolEventRow[];
    },
  });
  const lastPgfDate = useMemo(() => {
    const pgfDates = protocolEvents
      .filter((e) => /pgf/i.test(e.event_name || "") && e.event_date)
      .map((e) => e.event_date as string)
      .sort();
    return pgfDates.length ? pgfDates[pgfDates.length - 1] : null;
  }, [protocolEvents]);

  // Pack info needed for the unpack dialog.
  const { data: packInfo } = useQuery({
    queryKey: ["semen_sessions_pack_v2", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data: links } = await supabase
        .from("tank_pack_projects")
        .select("tank_pack_id, tank_packs(id, status, field_tank_id, tanks:field_tank_id(tank_name, tank_number))")
        .eq("project_id", projectId);
      const pack = (links ?? [])
        .map((l: any) => l.tank_packs)
        .find((p: any) => p && p.status !== "unpacked" && p.status !== "cancelled");
      return pack as { id: string; field_tank_id: string; tanks: { tank_name: string | null; tank_number: string } | null } | null;
    },
  });

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

  // Pack lines indexed by (bull_catalog_id|bull_name) + canister — used both
  // for Session 1 self-heal and the addSession prefill.
  const { data: packLineList = [] } = useQuery({
    queryKey: ["semen_sessions_packlines_v2", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data: links } = await supabase
        .from("tank_pack_projects")
        .select("tank_pack_id")
        .eq("project_id", projectId);
      const ids = (links ?? []).map((l: any) => l.tank_pack_id).filter(Boolean);
      if (ids.length === 0) return [] as any[];
      const { data } = await supabase
        .from("tank_pack_lines")
        .select("bull_catalog_id, bull_name, bull_code, field_canister, units")
        .in("tank_pack_id", ids);
      return data ?? [];
    },
  });

  // One-time self-heal: pre-#82 code path may have written start_units for
  // Session 1 rows that don't match the pack line by bull + canister. If
  // such a row exists AND the user clearly hasn't touched it yet (no end /
  // blown entered), align start_units to the matching pack line's units.
  useEffect(() => {
    if (sessions.length === 0 || inventory.length === 0 || packLineList.length === 0) return;
    const firstSession = sessions[0];
    const packByKey = new Map<string, number>();
    for (const pl of packLineList) {
      const k = `${pl.bull_catalog_id || pl.bull_name}|${pl.field_canister || ""}`;
      packByKey.set(k, (packByKey.get(k) ?? 0) + (pl.units ?? 0));
    }
    const toFix = inventory.filter((r) => {
      if (r.session_id !== firstSession.id) return false;
      if (r.end_units != null || r.blown_units != null) return false; // untouched only
      const k = `${r.bull_catalog_id || r.bull_name}|${r.canister || ""}`;
      const expected = packByKey.get(k);
      return expected != null && expected !== (r.start_units ?? 0);
    });
    if (toFix.length === 0) return;
    Promise.all(
      toFix.map((r) => {
        const k = `${r.bull_catalog_id || r.bull_name}|${r.canister || ""}`;
        const expected = packByKey.get(k);
        return supabase
          .from("project_billing_session_inventory")
          .update({ start_units: expected })
          .eq("id", r.id);
      }),
    ).then(() => refetchInventory());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length, inventory.length, packLineList.length]);

  // Only sessions after the last PGF event count as breeding sessions.
  // Existing pre-PGF session rows are left in the DB but hidden here.
  const visibleSessions = useMemo(() => {
    if (!lastPgfDate) return sessions;
    return sessions.filter((s) => (s.session_date ?? "") > lastPgfDate);
  }, [sessions, lastPgfDate]);

  return (
    <section className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
      <h2 className="text-base font-bold tracking-tight uppercase text-muted-foreground">Semen: Used by Session</h2>
      {visibleSessions.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No breeding sessions yet
          {lastPgfDate ? ` — events on/before ${format(new Date(lastPgfDate), "MMM d")} stay in the protocol schedule.` : "."}
        </p>
      ) : (
        <div className="space-y-3">
          {visibleSessions.map((s, i) => (
            <div key={s.id} className="space-y-2">
              <SemenSessionCard
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
              {i === visibleSessions.length - 1 && packInfo && organizationId && (
                <Button
                  variant="destructive"
                  className="w-full h-9"
                  onClick={() => setUnpackOpen(true)}
                >
                  <Package className="h-4 w-4 mr-1.5" /> Unpack tank
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addSession}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add session
      </Button>
      {packInfo && organizationId && (
        <UnpackFromProjectDialog
          open={unpackOpen}
          onOpenChange={setUnpackOpen}
          packId={packInfo.id}
          fieldTankId={packInfo.field_tank_id}
          fieldTankLabel={
            packInfo.tanks?.tank_name
              ? `${packInfo.tanks.tank_name} (#${packInfo.tanks.tank_number})`
              : packInfo.tanks?.tank_number
                ? `Tank #${packInfo.tanks.tank_number}`
                : null
          }
          organizationId={organizationId}
          billingId={billingId}
          projectName={null}
          onUnpackComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["semen_session_inventory_v2", billingId] });
            queryClient.invalidateQueries({ queryKey: ["semen_billable_v2", billingId] });
            queryClient.invalidateQueries({ queryKey: ["semen_packed_v2", projectId] });
          }}
        />
      )}
    </section>
  );
}
