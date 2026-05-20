import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useOrgRole } from "@/hooks/useOrgRole";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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
  key: string; // unique per section — same bull can have multiple sections (canister splits)
  bullCatalogId: string;
  bullName: string;
  naabCode: string | null;
  needed: number;
  fieldCanister: string;
  pulls: PullRow[];
  fromPlan: boolean;
  projects: string[]; // project names this bull is needed for
};

const newSectionKey = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sec-${Math.random().toString(36).slice(2)}-${Date.now()}`);

type ProjectOption = { id: string; name: string };

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
  const [availableProjects, setAvailableProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);

  // Reset on open. Always seed with the parent project.
  useEffect(() => {
    if (!open) return;
    setBullSections([]);
    setSelectedFieldTankId("");
    setAddingExtra(false);
    setSelectedProjectIds([projectId]);
  }, [open, projectId]);

  // Load tanks + the projects the user can add (Confirmed or In Field in this org).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [tanksRes, projectsRes] = await Promise.all([
        supabase
          .from("tanks")
          .select("id, tank_name, tank_number, tank_type, nitrogen_status, location_status")
          .eq("organization_id", organizationId)
          .eq("location_status", "here")
          .eq("nitrogen_status", "wet")
          .order("tank_number"),
        supabase
          .from("projects")
          .select("id, name")
          .eq("organization_id", organizationId)
          .in("status", ["Confirmed", "In Field"])
          .order("name"),
      ]);
      if (cancelled) return;
      if (tanksRes.error) toast({ title: "Could not load tanks", description: tanksRes.error.message, variant: "destructive" });
      setFieldTanks((tanksRes.data ?? []) as FieldTank[]);
      // Make sure the parent project is always selectable even if its status
      // doesn't match the filter (e.g. already In Field with a prior pack).
      const projects = (projectsRes.data ?? []) as ProjectOption[];
      if (!projects.some((p) => p.id === projectId) && projectName) {
        projects.unshift({ id: projectId, name: projectName });
      }
      setAvailableProjects(projects);
    })();
    return () => { cancelled = true; };
  }, [open, organizationId, projectId, projectName]);

  // Reload bull sections whenever the selected-projects set changes.
  useEffect(() => {
    if (!open || selectedProjectIds.length === 0) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      const { data: plannedData } = await supabase
        .from("project_bulls")
        .select("project_id, bull_catalog_id, units, bulls_catalog(bull_name, naab_code), projects:project_id(name)")
        .in("project_id", selectedProjectIds)
        .not("bull_catalog_id", "is", null);

      if (cancelled) return;

      const planned = (plannedData ?? []) as Array<{
        project_id: string;
        bull_catalog_id: string;
        units: number;
        bulls_catalog: { bull_name: string; naab_code: string | null } | null;
        projects: { name: string } | null;
      }>;

      // Roll up by bull: same bull across projects = one section with combined need.
      const byBull = new Map<string, {
        bullName: string;
        naabCode: string | null;
        needed: number;
        projects: string[];
      }>();
      for (const pb of planned) {
        if (!pb.bull_catalog_id) continue;
        const entry = byBull.get(pb.bull_catalog_id);
        const projName = pb.projects?.name ?? "(project)";
        if (entry) {
          entry.needed += pb.units;
          if (!entry.projects.includes(projName)) entry.projects.push(projName);
        } else {
          byBull.set(pb.bull_catalog_id, {
            bullName: pb.bulls_catalog?.bull_name ?? "(unnamed bull)",
            naabCode: pb.bulls_catalog?.naab_code ?? null,
            needed: pb.units,
            projects: [projName],
          });
        }
      }

      // Snapshot previous sections so we can preserve user-entered pull
      // amounts, field canisters, and any manually-added duplicate sections
      // for the same bull across reloads.
      let prevSections: BullSection[] = [];
      setBullSections((cur) => { prevSections = cur; return cur; });
      const prevFromPlanByBull = new Map<string, BullSection>();
      for (const s of prevSections) {
        if (s.fromPlan && !prevFromPlanByBull.has(s.bullCatalogId)) {
          prevFromPlanByBull.set(s.bullCatalogId, s);
        }
      }

      const sections: BullSection[] = [];
      let idx = 0;
      for (const [bullCatalogId, info] of byBull.entries()) {
        const inventory = await loadInventoryForBull(organizationId, bullCatalogId);
        if (cancelled) return;
        const previous = prevFromPlanByBull.get(bullCatalogId);
        idx += 1;
        // Merge previous pull amounts onto the freshly-loaded inventory rows.
        const prevPullByInv = new Map<string, string>();
        if (previous) for (const p of previous.pulls) prevPullByInv.set(p.inventoryId, p.units);
        const pulls = buildPulls(inventory).map((p) => ({
          ...p,
          units: prevPullByInv.get(p.inventoryId) ?? "",
        }));
        sections.push({
          key: previous?.key ?? newSectionKey(),
          bullCatalogId,
          bullName: info.bullName,
          naabCode: info.naabCode,
          needed: info.needed,
          fieldCanister: previous?.fieldCanister ?? String(idx),
          pulls,
          fromPlan: true,
          projects: info.projects,
        });
      }

      // Carry over every non-fromPlan section (off-plan extras AND
      // duplicate canister-splits for plan bulls).
      const carryExtras = prevSections.filter((s) => !s.fromPlan);

      if (!cancelled) {
        setBullSections([...sections, ...carryExtras]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, selectedProjectIds, organizationId]);

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

  // Removes any section by key — used for off-plan extras AND for the extra
  // canister-split sections a user added on top of a planned bull.
  const removeExtraSection = (key: string) =>
    setBullSections((prev) => prev.filter((s) => !(s.key === key && !s.fromPlan)));

  // Add another canister for an existing bull. Reuses the bull metadata from
  // the source section but starts fresh with an empty field canister + pulls.
  const addCanisterSplit = async (sourceKey: string) => {
    const source = bullSections.find((s) => s.key === sourceKey);
    if (!source) return;
    const inventory = await loadInventoryForBull(organizationId, source.bullCatalogId);
    setBullSections((prev) => [
      ...prev,
      {
        key: newSectionKey(),
        bullCatalogId: source.bullCatalogId,
        bullName: source.bullName,
        naabCode: source.naabCode,
        needed: 0,
        fieldCanister: "",
        pulls: buildPulls(inventory),
        fromPlan: false,
        projects: source.projects,
      },
    ]);
  };

  const handleAddExtraBull = async (
    _name: string,
    catalogId: string | null,
    naabCode?: string | null,
  ) => {
    setAddingExtra(false);
    if (!catalogId) return;
    // Duplicate bulls ARE allowed — same bull can go into multiple field
    // canisters. The pack_tank RPC writes one tank_pack_lines row per pull
    // and there's no unique constraint on (pack_id, bull_catalog_id).
    const inventory = await loadInventoryForBull(organizationId, catalogId);
    const { data: bullRow } = await supabase
      .from("bulls_catalog")
      .select("bull_name, naab_code")
      .eq("id", catalogId)
      .maybeSingle();
    setBullSections((prev) => [
      ...prev,
      {
        key: newSectionKey(),
        bullCatalogId: catalogId,
        bullName: bullRow?.bull_name ?? _name,
        naabCode: bullRow?.naab_code ?? naabCode ?? null,
        needed: 0,
        fieldCanister: String(prev.length + 1),
        pulls: buildPulls(inventory),
        fromPlan: false,
        projects: [],
      },
    ]);
  };

  const toggleProject = (id: string) => {
    setSelectedProjectIds((prev) => {
      if (prev.includes(id)) {
        // Don't allow removing the parent project — that's the project the
        // user is actively working on.
        if (id === projectId) return prev;
        return prev.filter((p) => p !== id);
      }
      return [...prev, id];
    });
  };

  const selectedProjectsForChips = selectedProjectIds
    .map((id) => availableProjects.find((p) => p.id === id))
    .filter((p): p is ProjectOption => !!p);

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

  const canSubmit = !!selectedFieldTankId && totals.unitsTotal > 0 && selectedProjectIds.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
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

      // First pass: aggregate pulls per source inventory row so a bull
      // split across multiple field canisters can't over-allocate from the
      // same source slot. Capacity (available) is shared across sections.
      const pullByInv = new Map<string, { units: number; available: number; label: string; bullName: string }>();
      for (const s of bullSections) {
        for (const p of s.pulls) {
          const units = Number(p.units) || 0;
          if (units <= 0) continue;
          const entry = pullByInv.get(p.inventoryId);
          if (entry) {
            entry.units += units;
          } else {
            pullByInv.set(p.inventoryId, {
              units,
              available: p.available,
              label: p.sourceTankLabel + (p.sourceCanister ? ` · can ${p.sourceCanister}` : ""),
              bullName: s.bullName,
            });
          }
        }
      }
      for (const [, agg] of pullByInv) {
        if (agg.units > agg.available) {
          throw new Error(
            `${agg.bullName}: total pull across canisters (${agg.units}) exceeds available (${agg.available}) in ${agg.label}.`,
          );
        }
      }

      for (const s of bullSections) {
        for (const p of s.pulls) {
          const units = Number(p.units) || 0;
          if (units <= 0) continue;
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
        project_ids: selectedProjectIds,
        order_ids: [] as string[],
        pickup_order_ids: [] as string[],
        lines,
      };

      const { data, error } = await supabase.rpc("pack_tank", { _input: payload });
      if (error) throw error;
      const result = data as { ok?: boolean; pack_id?: string } | null;
      if (!result?.ok) throw new Error("Pack failed: invalid response from server");

      // Advance every packed project to "In Field" (only from pre-pack stages).
      await supabase
        .from("projects")
        .update({ status: "In Field" })
        .in("id", selectedProjectIds)
        .in("status", ["Tentative", "Confirmed"]);

      toast({
        title: "Tank packed successfully",
        description: selectedProjectIds.length > 1
          ? `Linked to ${selectedProjectIds.length} projects.`
          : undefined,
      });
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
            Select a field tank and confirm where to pull each bull from. Add additional projects to send out in the same tank.
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

          {/* Multi-project picker */}
          <div className="space-y-1.5">
            <Label>Projects in this pack</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {selectedProjectsForChips.map((p) => (
                <Badge
                  key={p.id}
                  variant="outline"
                  className="bg-primary/10 text-primary border-primary/30 gap-1 pl-2 pr-1 py-0.5 text-xs"
                >
                  {p.name}
                  {p.id !== projectId && (
                    <button
                      type="button"
                      onClick={() => toggleProject(p.id)}
                      className="hover:bg-primary/20 rounded p-0.5"
                      aria-label={`Remove ${p.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
              <Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add project
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search projects…" className="h-9" />
                    <CommandList>
                      <CommandEmpty>No matching projects.</CommandEmpty>
                      <CommandGroup>
                        {availableProjects
                          .filter((p) => p.id !== projectId)
                          .map((p) => {
                            const checked = selectedProjectIds.includes(p.id);
                            return (
                              <CommandItem
                                key={p.id}
                                value={p.name}
                                onSelect={() => toggleProject(p.id)}
                                className="flex items-center gap-2"
                              >
                                <div className={`h-4 w-4 rounded border flex items-center justify-center ${checked ? "bg-primary border-primary" : "border-input"}`}>
                                  {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                                </div>
                                <span className="text-sm">{p.name}</span>
                              </CommandItem>
                            );
                          })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Only Confirmed and In Field projects show here.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading planned bulls and inventory…
            </div>
          ) : (
            <div className="space-y-4">
              {bullSections.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No bulls on any selected project plan. Add one below.</p>
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
                          {s.fromPlan ? `Need ${s.needed}` : "Not on any plan"}
                          {sectionPulled > 0 && <> · Pulling {sectionPulled}</>}
                          {s.projects.length > 1 && (
                            <> · <span className="text-foreground/70">{s.projects.join(", ")}</span></>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground" htmlFor={`canister-${s.key}`}>Field can</Label>
                        <Input
                          id={`canister-${s.key}`}
                          value={s.fieldCanister}
                          onChange={(e) => updateSection(s.key, { fieldCanister: e.target.value })}
                          className="h-8 w-20 text-xs"
                          placeholder="—"
                        />
                        {!s.fromPlan && (
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => removeExtraSection(s.key)}
                            aria-label="Remove section"
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
                            <Label className="text-muted-foreground" htmlFor={`pull-${s.key}-${p.inventoryId}`}>Pull</Label>
                            <Input
                              id={`pull-${s.key}-${p.inventoryId}`}
                              type="text"
                              inputMode="numeric"
                              value={p.units}
                              placeholder="—"
                              onChange={(e) => updatePull(s.key, p.inventoryId, e.target.value)}
                              className="h-8 w-20 text-right text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {s.pulls.length > 0 && (
                      <div className="pt-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                          onClick={() => addCanisterSplit(s.key)}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Split into another canister
                        </Button>
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
            {selectedProjectIds.length > 1 && <> · {selectedProjectIds.length} projects</>}
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
