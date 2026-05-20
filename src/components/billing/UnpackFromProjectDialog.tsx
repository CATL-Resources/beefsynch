import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useOrgRole } from "@/hooks/useOrgRole";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UnpackFromProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packId: string;
  fieldTankId: string;
  fieldTankLabel?: string | null;
  organizationId: string;
  billingId: string | null;
  projectName?: string | null;
  onUnpackComplete: () => void;
}

type PackLineRow = {
  id: string;
  bull_catalog_id: string | null;
  bull_name: string | null;
  bull_code: string | null;
  source_tank_id: string;
  source_canister: string | null;
  field_canister: string | null;
  units: number;
  bulls_catalog: { bull_name: string; naab_code: string | null } | null;
  tanks: { tank_name: string | null; tank_number: string } | null;
};

type TankOption = {
  id: string;
  tank_name: string | null;
  tank_number: string;
};

type ReturnRow = {
  packLineId: string;
  bullCatalogId: string | null;
  bullName: string;
  bullCode: string | null;
  fieldCanister: string | null;
  unitsPacked: number;
  unitsRemaining: number;
  destinationTankId: string;
  destinationCanister: string;
  unitsReturning: string;
};

const tankLabel = (t: { tank_name: string | null; tank_number: string } | null | undefined) => {
  if (!t) return "—";
  return t.tank_name ? `${t.tank_name} (#${t.tank_number})` : `Tank #${t.tank_number}`;
};

const tankOptionLabel = (t: TankOption) =>
  t.tank_name ? `${t.tank_name} (#${t.tank_number})` : `Tank #${t.tank_number}`;

export default function UnpackFromProjectDialog({
  open, onOpenChange, packId, fieldTankId, fieldTankLabel, organizationId, billingId, projectName, onUnpackComplete,
}: UnpackFromProjectDialogProps) {
  const { userId } = useOrgRole();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [packLines, setPackLines] = useState<PackLineRow[]>([]);
  const [destinationTanks, setDestinationTanks] = useState<TankOption[]>([]);
  const [returnRows, setReturnRows] = useState<ReturnRow[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      const [linesRes, tanksRes, usedRes] = await Promise.all([
        supabase
          .from("tank_pack_lines")
          .select("id, bull_catalog_id, bull_name, bull_code, source_tank_id, source_canister, field_canister, units, bulls_catalog(bull_name, naab_code), tanks!tank_pack_lines_source_tank_id_fkey(tank_name, tank_number)")
          .eq("tank_pack_id", packId),
        supabase
          .from("tanks")
          .select("id, tank_name, tank_number")
          .eq("organization_id", organizationId)
          .eq("location_status", "here")
          .eq("nitrogen_status", "wet")
          .order("tank_number"),
        billingId
          ? supabase
              .from("project_billing_session_inventory")
              .select("bull_catalog_id, start_units, end_units, session_id, project_billing_sessions!inner(sort_order, session_date)")
              .eq("billing_id", billingId)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (cancelled) return;

      const lines = (linesRes.data ?? []) as PackLineRow[];
      const destTanks = (tanksRes.data ?? []) as TankOption[];

      // Include any source tanks that aren't already in the wet/here list,
      // so the user can always return to the origin.
      const haveIds = new Set(destTanks.map((t) => t.id));
      const missingSourceTankIds = Array.from(
        new Set(lines.map((l) => l.source_tank_id).filter((id) => !haveIds.has(id))),
      );
      let augmented = destTanks;
      if (missingSourceTankIds.length > 0) {
        const { data: extras } = await supabase
          .from("tanks")
          .select("id, tank_name, tank_number")
          .in("id", missingSourceTankIds);
        if (extras) augmented = [...destTanks, ...(extras as TankOption[])];
      }

      // Remaining = the last session's End value for that bull. Summing
      // (start - end) across sessions double-counts whenever sessions don't
      // chain cleanly (a PM session that re-starts from the packed value
      // instead of the previous End). Treating NULL end_units as 0 also
      // marked incomplete sessions as 100% used.
      const usedRows = (usedRes.data ?? []) as Array<{
        bull_catalog_id: string | null;
        end_units: number | null;
        project_billing_sessions?: { sort_order: number | null; session_date: string | null } | null;
      }>;
      const lastEndByBull = new Map<string, number>();
      const sorted = usedRows
        .filter((r) => r.bull_catalog_id && r.end_units != null)
        .slice()
        .sort((a, b) => {
          const aOrd = a.project_billing_sessions?.sort_order ?? 0;
          const bOrd = b.project_billing_sessions?.sort_order ?? 0;
          if (aOrd !== bOrd) return bOrd - aOrd;
          const aDate = a.project_billing_sessions?.session_date ?? "";
          const bDate = b.project_billing_sessions?.session_date ?? "";
          return bDate.localeCompare(aDate);
        });
      for (const r of sorted) {
        if (!r.bull_catalog_id) continue;
        if (!lastEndByBull.has(r.bull_catalog_id)) {
          lastEndByBull.set(r.bull_catalog_id, r.end_units ?? 0);
        }
      }

      // Roll up packed totals per bull so split pulls can divvy the
      // remaining proportionally.
      const packedByBull = new Map<string, number>();
      for (const l of lines) {
        if (!l.bull_catalog_id) continue;
        packedByBull.set(l.bull_catalog_id, (packedByBull.get(l.bull_catalog_id) ?? 0) + (l.units ?? 0));
      }

      const rows: ReturnRow[] = lines.map((l) => {
        const totalPacked = l.bull_catalog_id ? packedByBull.get(l.bull_catalog_id) ?? 0 : (l.units ?? 0);
        const lastEnd = l.bull_catalog_id ? lastEndByBull.get(l.bull_catalog_id) : undefined;
        // Proportional share of the bull's remaining for this specific pack
        // line. If no session has reported End yet, all of it is still here.
        const remaining = lastEnd == null
          ? (l.units ?? 0)
          : totalPacked > 0
            ? Math.round((lastEnd * (l.units ?? 0)) / totalPacked)
            : (l.units ?? 0);
        return {
          packLineId: l.id,
          bullCatalogId: l.bull_catalog_id,
          bullName: l.bulls_catalog?.bull_name ?? l.bull_name ?? "(unknown)",
          bullCode: l.bulls_catalog?.naab_code ?? l.bull_code ?? null,
          fieldCanister: l.field_canister,
          unitsPacked: l.units ?? 0,
          unitsRemaining: remaining,
          destinationTankId: l.source_tank_id,
          destinationCanister: l.source_canister ?? "",
          unitsReturning: String(remaining),
        };
      });

      setPackLines(lines);
      setDestinationTanks(augmented);
      setReturnRows(rows);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [open, packId, organizationId, billingId]);

  const updateRow = (packLineId: string, patch: Partial<ReturnRow>) =>
    setReturnRows((prev) => prev.map((r) => (r.packLineId === packLineId ? { ...r, ...patch } : r)));

  // Build grouped display: bulls with remaining > 0 render their rows; bulls
  // with all-used render a single grayed-out summary line. The submit payload
  // still includes every pack line (with units_returning = 0 if used).
  const grouped = useMemo(() => {
    const byBull = new Map<string, { bullName: string; bullCode: string | null; remaining: number; rows: ReturnRow[] }>();
    for (const r of returnRows) {
      const key = r.bullCatalogId ?? `name:${r.bullName}`;
      const entry = byBull.get(key);
      if (entry) {
        entry.remaining += r.unitsRemaining;
        entry.rows.push(r);
      } else {
        byBull.set(key, { bullName: r.bullName, bullCode: r.bullCode, remaining: r.unitsRemaining, rows: [r] });
      }
    }
    return Array.from(byBull.entries()).map(([key, v]) => ({ key, ...v }));
  }, [returnRows]);

  const totals = useMemo(() => {
    let units = 0;
    const bullsWithReturn = new Set<string>();
    for (const r of returnRows) {
      const n = Number(r.unitsReturning) || 0;
      if (n > 0) {
        units += n;
        bullsWithReturn.add(r.bullCatalogId ?? r.bullName);
      }
    }
    return { units, bulls: bullsWithReturn.size };
  }, [returnRows]);

  const canSubmit = !submitting && returnRows.every((r) => {
    const n = Number(r.unitsReturning);
    if (!Number.isFinite(n) || n < 0) return false;
    if (n > 0 && !r.destinationTankId) return false;
    return true;
  });

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      let unpackedBy: string | null = null;
      if (userId) {
        const { data: member } = await supabase
          .from("organization_members")
          .select("display_name")
          .eq("organization_id", organizationId)
          .eq("user_id", userId)
          .maybeSingle();
        unpackedBy = member?.display_name ?? null;
      }

      const payload = {
        pack_id: packId,
        unpacked_by: unpackedBy,
        lines: returnRows.map((r) => ({
          bull_catalog_id: r.bullCatalogId,
          bull_name: r.bullName,
          bull_code: r.bullCode,
          field_canister: r.fieldCanister || null,
          destination_tank_id: r.destinationTankId,
          destination_canister: r.destinationCanister || null,
          units_returning: Number(r.unitsReturning) || 0,
          units_packed: r.unitsPacked,
        })),
      };

      const { data, error } = await supabase.rpc("unpack_tank", { _input: payload });
      if (error) throw error;
      const result = data as { ok?: boolean; lines_processed?: number } | null;
      if (!result?.ok) throw new Error("Unpack failed: invalid response from server");

      toast({ title: "Tank unpacked", description: `${totals.units} units returned to storage.` });
      onUnpackComplete();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Unpack failed", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Unpack tank{projectName ? ` — ${projectName}` : ""}</DialogTitle>
          <DialogDescription>
            Return remaining semen from {fieldTankLabel || "the field tank"} back to storage.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading pack and session data…
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No pack lines on this pack.</p>
            )}

            {grouped.map((g) => {
              if (g.remaining <= 0) {
                return (
                  <div key={g.key} className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2 opacity-60">
                    <div>
                      <span className="text-sm font-medium">{g.bullName}</span>
                      {g.bullCode && <span className="ml-2 text-xs text-muted-foreground">{g.bullCode}</span>}
                    </div>
                    <span className="text-xs text-muted-foreground italic">All used</span>
                  </div>
                );
              }
              return (
                <div key={g.key} className="rounded-lg border border-border/60 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="text-sm font-medium">{g.bullName}</span>
                      {g.bullCode && <span className="ml-2 text-xs text-muted-foreground">{g.bullCode}</span>}
                    </div>
                    <span className="text-sm font-semibold">{g.remaining} remaining</span>
                  </div>

                  {g.rows.map((row) => {
                    if (row.unitsRemaining === 0) return null;
                    const sourceLine = packLines.find((p) => p.id === row.packLineId);
                    return (
                      <div key={row.packLineId} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 sm:gap-3 items-end">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground" htmlFor={`dest-tank-${row.packLineId}`}>
                            Return to
                            {sourceLine && (
                              <span className="ml-2 text-[10px] text-muted-foreground">
                                (from {tankLabel(sourceLine.tanks)}{sourceLine.source_canister ? ` · can ${sourceLine.source_canister}` : ""})
                              </span>
                            )}
                          </Label>
                          <div className="flex gap-2">
                            <select
                              id={`dest-tank-${row.packLineId}`}
                              value={row.destinationTankId}
                              onChange={(e) => updateRow(row.packLineId, { destinationTankId: e.target.value })}
                              className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                            >
                              <option value="">Select tank…</option>
                              {destinationTanks.map((t) => (
                                <option key={t.id} value={t.id}>{tankOptionLabel(t)}</option>
                              ))}
                            </select>
                            <Input
                              aria-label="Destination canister"
                              placeholder="canister"
                              value={row.destinationCanister}
                              onChange={(e) => updateRow(row.packLineId, { destinationCanister: e.target.value })}
                              className="h-9 w-24 text-sm"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground" htmlFor={`units-${row.packLineId}`}>Units</Label>
                          <Input
                            id={`units-${row.packLineId}`}
                            type="text"
                            inputMode="numeric"
                            value={row.unitsReturning}
                            onChange={(e) =>
                              updateRow(row.packLineId, { unitsReturning: e.target.value.replace(/[^0-9]/g, "") })
                            }
                            className="h-9 w-24 text-right text-sm"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              This will return {fieldTankLabel || "the field tank"} to storage and mark it as <span className="font-medium">here</span>.
            </div>
          </div>
        )}

        <DialogFooter className="sm:justify-between gap-2">
          <div className="text-xs text-muted-foreground self-center">
            Returning {totals.units} units across {totals.bulls} bull{totals.bulls === 1 ? "" : "s"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unpack and return
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
