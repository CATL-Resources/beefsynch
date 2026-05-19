import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useOrgRole } from "@/hooks/useOrgRole";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BullCombobox from "@/components/BullCombobox";

interface PackForProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName?: string | null;
  organizationId: string;
  onPackComplete: () => void;
}

type FieldTank = { id: string; tank_name: string | null; tank_number: string };

type InventoryRow = {
  id: string;
  tank_id: string;
  canister: string | null;
  sub_canister: string | null;
  units: number;
  tanks: { tank_name: string | null; tank_number: string } | null;
};

type PullRow = {
  inventoryId: string;
  sourceTankId: string;
  sourceTankLabel: string;
  sourceCanister: string | null;
  available: number;
  units: string;
};

type BullSection = {
  key: string;
  bullCatalogId: string;
  bullName: string;
  naabCode: string | null;
  needed: number;
  fieldCanister: string;
  pulls: PullRow[];
  fromPlan: boolean;
};

const tankDisplay = (t: { tank_name: string | null; tank_number: string } | null) => {
  if (!t) return "—";
  return t.tank_name ? `${t.tank_name} (#${t.tank_number})` : `Tank #${t.tank_number}`;
};

async function loadInventoryForBull(orgId: string, bullCatalogId: string): Promise<InventoryRow[]> {
  const { data, error } = await supabase
    .from("tank_inventory")
    .select("id, tank_id, canister, sub_canister, units, tanks!tank_inventory_tank_id_fkey(tank_name, tank_number)")
    .eq("organization_id", orgId)
    .eq("bull_catalog_id", bullCatalogId)
    .is("customer_id", null)
    .gt("units", 0)
    .order("units", { ascending: false });
  if (error) {
    console.error("inventory load failed", error);
    return [];
  }
  return (data ?? []) as unknown as InventoryRow[];
}

const buildPulls = (inventory: InventoryRow[]): PullRow[] =>
  inventory.map((row) => ({
    inventoryId: row.id,
    sourceTankId: row.tank_id,
    sourceTankLabel: tankDisplay(row.tanks),
    sourceCanister: row.canister,
    available: row.units,
    units: "",
  }));

export default function PackForProjectDialog({
  open, onOpenChange, projectId, projectName, organizationId, onPackComplete,
}: PackForProjectDialogProps) {
  const { userId } = useOrgRole();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldTanks, setFieldTanks] = useState<FieldTank[]>([]);
  const [selectedFieldTankId, setSelectedFieldTankId] = useState<string>("");
  const [bullSections, setBullSections] = useState<BullSection[]>([]);
  const [addingExtra, setAddingExtra] = useState(false);

  // Reset + load when opened
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setBullSections([]);
      setSelectedFieldTankId("");
      setAddingExtra(false);

      const [tanksRes, plannedRes] = await Promise.all([
        supabase
          .from("tanks")
          .select("id, tank_name, tank_number, tank_type, nitrogen_status, location_status")
          .eq("organization_id", organizationId)
          .eq("location_status", "here")
          .eq("nitrogen_status", "wet")
          .order("tank_number"),
        supabase
          .from("project_bulls")
          .select("bull_catalog_id, units, bulls_catalog(bull_name, naab_code)")
          .eq("project_id", projectId)
          .not("bull_catalog_id", "is", null),
      ]);

      if (cancelled) return;
      if (tanksRes.error) toast({ title: "Could not load tanks", description: tanksRes.error.message, variant: "destructive" });
      setFieldTanks((tanksRes.data ?? []) as FieldTank[]);

      const planned = (plannedRes.data ?? []) as Array<{
        bull_catalog_id: string;
        units: number;
        bulls_catalog: { bull_name: string; naab_code: string | null } | null;
      }>;

      const sections: BullSection[] = [];
      let idx = 0;
      for (const pb of planned) {
        if (!pb.bull_catalog_id) continue;
        const inventory = await loadInventoryForBull(organizationId, pb.bull_catalog_id);
        if (cancelled) return;
        idx += 1;
        sections.push({
          key: pb.bull_catalog_id,
          bullCatalogId: pb.bull_catalog_id,
          bullName: pb.bulls_catalog?.bull_name ?? "(unnamed bull)",
          naabCode: pb.bulls_catalog?.naab_code ?? null,
          needed: pb.units,
          fieldCanister: String(idx),
          pulls: buildPulls(inventory),
          fromPlan: true,
        });
      }
      if (!cancelled) {
        setBullSections(sections);
        setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [open, projectId, organizationId]);

  const updateSection = (key: string, patch: Partial<BullSection>) =>
    setBullSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const updatePull = (sectionKey: string, inventoryId: string, units: string) => {
    const digits = units.replace(/[^0-9]/g, "");
    setBullSections((prev) => prev.map((s) =>
      s.key === sectionKey
        ? { ...s, pulls: s.pulls.map((p) => (p.inventoryId === inventoryId ? { ...p, units: digits } : p)) }
        : s,
    ));
  };

  const removeExtraSection = (key: string) =>
    setBullSections((prev) => prev.filter((s) => !(s.key === key && !s.fromPlan)));

  const handleAddExtraBull = async (
    _name: string,
    catalogId: string | null,
    naabCode?: string | null,
  ) => {
    setAddingExtra(false);
    if (!catalogId) return;
    if (bullSections.some((s) => s.bullCatalogId === catalogId)) {
      toast({ title: "Already in the pack", description: "That bull is already listed." });
      return;
    }
    const inventory = await loadInventoryForBull(organizationId, catalogId);
    const { data: bullRow } = await supabase
      .from("bulls_catalog")
      .select("bull_name, naab_code")
      .eq("id", catalogId)
      .maybeSingle();
    setBullSections((prev) => [
      ...prev,
      {
        key: catalogId,
        bullCatalogId: catalogId,
        bullName: bullRow?.bull_name ?? _name,
        naabCode: bullRow?.naab_code ?? naabCode ?? null,
        needed: 0,
        fieldCanister: String(prev.length + 1),
        pulls: buildPulls(inventory),
        fromPlan: false,
      },
    ]);
  };

  const totals = useMemo(() => {
    let unitsTotal = 0;
    let bullsTotal = 0;
    for (const s of bullSections) {
      const sectionUnits = s.pulls.reduce((sum, p) => sum + (Number(p.units) || 0), 0);
      if (sectionUnits > 0) {
        bullsTotal += 1;
        unitsTotal += sectionUnits;
      }
    }
    return { unitsTotal, bullsTotal };
  }, [bullSections]);

  const canSubmit = !!selectedFieldTankId && totals.unitsTotal > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Look up the current user's display name for packed_by
      let packedBy: string | null = null;
      if (userId) {
        const { data: member } = await supabase
          .from("organization_members")
          .select("display_name")
          .eq("organization_id", organizationId)
          .eq("user_id", userId)
          .maybeSingle();
        packedBy = member?.display_name ?? null;
      }

      const lines: Array<{
        source_tank_id: string;
        bull_catalog_id: string;
        bull_name: string;
        bull_code: string | null;
        source_canister: string | null;
        field_canister: string | null;
        units: number;
      }> = [];

      for (const s of bullSections) {
        for (const p of s.pulls) {
          const units = Number(p.units) || 0;
          if (units <= 0) continue;
          if (units > p.available) {
            throw new Error(`${s.bullName}: pull (${units}) exceeds available (${p.available}) in ${p.sourceTankLabel}.`);
          }
          lines.push({
            source_tank_id: p.sourceTankId,
            bull_catalog_id: s.bullCatalogId,
            bull_name: s.bullName,
            bull_code: s.naabCode,
            source_canister: p.sourceCanister,
            field_canister: s.fieldCanister.trim() || null,
            units,
          });
        }
      }

      if (lines.length === 0) throw new Error("Add at least one pull amount.");

      const payload = {
        organization_id: organizationId,
        pack_type: "project",
        field_tank_id: selectedFieldTankId,
        packed_at: new Date().toISOString(),
        packed_by: packedBy,
        project_ids: [projectId],
        order_ids: [] as string[],
        pickup_order_ids: [] as string[],
        lines,
      };

      const { data, error } = await supabase.rpc("pack_tank", { _input: payload });
      if (error) throw error;
      const result = data as { ok?: boolean; pack_id?: string } | null;
      if (!result?.ok) throw new Error("Pack failed: invalid response from server");

      toast({ title: "Tank packed successfully" });
      onPackComplete();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Pack failed", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pack tank{projectName ? ` — ${projectName}` : ""}</DialogTitle>
          <DialogDescription>
            Select a field tank and confirm where to pull each bull from.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Field tank picker */}
          <div className="space-y-1.5">
            <Label htmlFor="field-tank">Field tank</Label>
            <select
              id="field-tank"
              value={selectedFieldTankId}
              onChange={(e) => setSelectedFieldTankId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select a tank…</option>
              {fieldTanks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tank_name ? `${t.tank_name} (#${t.tank_number})` : `Tank #${t.tank_number}`} — wet, here
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading planned bulls and inventory…
            </div>
          ) : (
            <div className="space-y-4">
              {bullSections.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No bulls on this project plan. Add one below.</p>
              )}

              {bullSections.map((s) => {
                const sectionPulled = s.pulls.reduce((sum, p) => sum + (Number(p.units) || 0), 0);
                return (
                  <div key={s.key} className="rounded-lg border border-border/60 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-medium text-sm">
                          {s.bullName}
                          {s.naabCode && <span className="ml-2 text-xs text-muted-foreground">{s.naabCode}</span>}
                          {!s.fromPlan && (
                            <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-600">Extra</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s.fromPlan ? `Need ${s.needed}` : "Not on project plan"}
                          {sectionPulled > 0 && <> · Pulling {sectionPulled}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground" htmlFor={`canister-${s.key}`}>Field can</Label>
                        <Input
                          id={`canister-${s.key}`}
                          value={s.fieldCanister}
                          onChange={(e) => updateSection(s.key, { fieldCanister: e.target.value })}
                          className="h-8 w-20 text-xs"
                        />
                        {!s.fromPlan && (
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => removeExtraSection(s.key)}
                            aria-label="Remove extra bull"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {s.pulls.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No company inventory available for this bull.</p>
                    ) : (
                      <div className="space-y-1">
                        {s.pulls.map((p) => (
                          <div key={p.inventoryId} className="flex items-center gap-2 text-xs">
                            <div className="flex-1 min-w-0 truncate">
                              <span className="font-medium">{p.sourceTankLabel}</span>
                              {p.sourceCanister && <span className="text-muted-foreground"> · can {p.sourceCanister}</span>}
                              <span className="ml-2 text-emerald-600">{p.available} avail</span>
                            </div>
                            <Label className="text-muted-foreground" htmlFor={`pull-${p.inventoryId}`}>Pull</Label>
                            <Input
                              id={`pull-${p.inventoryId}`}
                              type="text"
                              inputMode="numeric"
                              value={p.units}
                              placeholder={String(p.available)}
                              onChange={(e) => updatePull(s.key, p.inventoryId, e.target.value)}
                              className="h-8 w-20 text-right text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {addingExtra ? (
                <div className="rounded-lg border border-dashed border-border p-3">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Add a bull not on the plan</Label>
                  <BullCombobox value="" catalogId={null} onChange={handleAddExtraBull} />
                  <div className="mt-2 flex justify-end">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAddingExtra(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setAddingExtra(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add bull
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between gap-2">
          <div className="text-xs text-muted-foreground self-center">
            Total: {totals.unitsTotal} units from {totals.bullsTotal} bull{totals.bullsTotal === 1 ? "" : "s"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Pack tank
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
