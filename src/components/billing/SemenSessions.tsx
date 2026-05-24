import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import SemenSessionCard, { InventoryRow } from "./SemenSessionCard";
import UnpackFromProjectDialog from "./UnpackFromProjectDialog";
import SectionHeader from "./SectionHeader";

interface SemenSessionsProps {
  billingId: string;
  projectId: string;
  organizationId: string | null | undefined;
  isEditing: boolean;
  onToggleEdit: () => void;
  locked: boolean;
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

export default function SemenSessions({ billingId, projectId, organizationId, isEditing, onToggleEdit, locked }: SemenSessionsProps) {
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
  const refetchInventory = () => {
    queryClient.invalidateQueries({ queryKey: ["semen_session_inventory_v2", billingId] });
    // The billable summary derives Used/Blown/Returned from this session
    // inventory; refresh its copy (and the invoicing totals downstream) so
    // the numbers update without a page reload.
    queryClient.invalidateQueries({ queryKey: ["semen_billable_session_inv_v2", billingId] });
    queryClient.invalidateQueries({ queryKey: ["semen_billable_v2", billingId] });
    queryClient.invalidateQueries({ queryKey: ["billing_invoice_semen_v2", billingId] });
  };

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

    // When end_units / blown_units change, recompute the session's head_count
    // (1 unit semen = 1 head bred). Skip if the user has clearly overridden the
    // count — we only overwrite when head_count is null/0 or matches the
    // currently auto-calculated total (i.e. user hasn't touched it).
    if (field === "end_units" || field === "blown_units") {
      const row = inventory.find((r) => r.id === rowId);
      const sessionId = row?.session_id;
      if (sessionId) {
        const { data: invRows } = await supabase
          .from("project_billing_session_inventory")
          .select("start_units, end_units, blown_units")
          .eq("session_id", sessionId);
        const totalUsed = (invRows || []).reduce((s: number, r: any) => {
          if (r.start_units != null && r.end_units != null) {
            return s + Math.max(0, r.start_units - r.end_units);
          }
          return s;
        }, 0);
        const totalBlown = (invRows || []).reduce(
          (s: number, r: any) => s + (r.blown_units || 0),
          0,
        );
        const nextHead = Math.max(0, totalUsed - totalBlown);
        // Auto-fill only when head_count is null/0 OR equals the previous
        // auto value derived from the prior inventory state. Compute the
        // previous auto value by reverting this single field on this row.
        const session = sessions.find((s) => s.id === sessionId);
        const currentHead = session?.head_count ?? 0;
        const prevAutoUsed = (invRows || []).reduce((s: number, r: any) => {
          const start = r.start_units;
          let end = r.end_units;
          if (r.id === rowId && field === "end_units") end = (row as any).end_units;
          if (start != null && end != null) return s + Math.max(0, start - end);
          return s;
        }, 0);
        const prevAutoBlown = (invRows || []).reduce((s: number, r: any) => {
          let blown = r.blown_units || 0;
          if (r.id === rowId && field === "blown_units") blown = (row as any).blown_units || 0;
          return s + blown;
        }, 0);
        const prevAuto = Math.max(0, prevAutoUsed - prevAutoBlown);
        const looksUntouched = currentHead === 0 || currentHead === null || currentHead === prevAuto;
        if (looksUntouched && nextHead !== currentHead) {
          await supabase
            .from("project_billing_sessions")
            .update({ head_count: nextHead })
            .eq("id", sessionId);
          refetchSessions();
        }
      }
    }

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
      // Only seed Session 1 rows that have never been written. Any value
      // (including 0) means a user or earlier seed already took ownership.
      if (r.start_units != null) return false;
      const k = `${r.bull_catalog_id || r.bull_name}|${r.canister || ""}`;
      const expected = packByKey.get(k);
      return expected != null;
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

  // Stat cards across the top of this section.
  const totalHead = visibleSessions.reduce((s, x) => s + (x.head_count ?? 0), 0);
  const visibleInventory = inventory.filter((r) =>
    visibleSessions.some((s) => s.id === r.session_id),
  );
  const totalUnitsUsed = visibleInventory.reduce(
    (s, r) => s + Math.max(0, (r.start_units ?? 0) - (r.end_units ?? 0)),
    0,
  );
  const totalBlown = visibleInventory.reduce((s, r) => s + (r.blown_units ?? 0), 0);

  return (
    <section className={`rounded-xl border bg-card/50 p-4 space-y-3 ${isEditing ? "border-primary/40 ring-1 ring-primary/30" : "border-border"}`}>
      <SectionHeader title="Semen: Used by Session" isEditing={isEditing} onToggleEdit={onToggleEdit} locked={locked} />
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Total head", value: totalHead, color: "text-foreground" },
          { label: "Total units used", value: totalUnitsUsed, color: "text-emerald-500" },
          { label: "Blown", value: totalBlown, color: totalBlown > 0 ? "text-destructive" : "text-muted-foreground" },
        ].map((c) => (
          <div key={c.label} className="rounded-lg bg-muted/30 px-3 py-2 text-center">
            <div className={`text-[28px] font-medium leading-none tabular-nums ${c.color}`}>{c.value}</div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1">{c.label}</div>
          </div>
        ))}
      </div>
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
                isEditing={isEditing}
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
      {isEditing && (
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addSession}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add session
        </Button>
      )}
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
            // Refresh the pack lookup that gates the Unpack button — once the
            // pack flips to 'unpacked' this query returns null and the button
            // disappears without a page reload.
            queryClient.invalidateQueries({ queryKey: ["semen_sessions_pack_v2", projectId] });
          }}
        />
      )}
    </section>
  );
}
