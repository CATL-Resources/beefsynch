import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BullCombobox from "@/components/BullCombobox";

interface EditPackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packId: string;
  organizationId: string;
  fieldTankId: string;
  onEditComplete: () => void;
}

type PackLine = {
  id: string;
  bull_catalog_id: string | null;
  bull_name: string | null;
  bull_code: string | null;
  source_tank_id: string;
  source_canister: string | null;
  field_canister: string | null;
  units: number;
  bulls_catalog: { bull_name: string; naab_code: string | null } | null;
};

type InventoryRow = {
  id: string;
  tank_id: string;
  canister: string | null;
  units: number;
  tanks: { tank_name: string | null; tank_number: string } | null;
};

const tankDisplay = (t: { tank_name: string | null; tank_number: string } | null) => {
  if (!t) return "—";
  return t.tank_name ? `${t.tank_name} (#${t.tank_number})` : `Tank #${t.tank_number}`;
};

export default function EditPackDialog({
  open, onOpenChange, packId, organizationId, fieldTankId, onEditComplete,
}: EditPackDialogProps) {
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<PackLine[]>([]);
  // Per-line draft units while user is typing — committed on blur.
  const [unitDrafts, setUnitDrafts] = useState<Record<string, string>>({});
  const [savingLineId, setSavingLineId] = useState<string | null>(null);

  const [deletingLine, setDeletingLine] = useState<PackLine | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Add-line flow state
  const [addOpen, setAddOpen] = useState(false);
  const [addBullCatalogId, setAddBullCatalogId] = useState<string | null>(null);
  const [addBullName, setAddBullName] = useState<string>("");
  const [addBullCode, setAddBullCode] = useState<string | null>(null);
  const [addInventory, setAddInventory] = useState<InventoryRow[]>([]);
  const [addSourceId, setAddSourceId] = useState<string>("");
  const [addUnits, setAddUnits] = useState<string>("");
  const [addFieldCanister, setAddFieldCanister] = useState<string>("");
  const [addSubmitting, setAddSubmitting] = useState(false);

  const fetchLines = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tank_pack_lines")
      .select("id, bull_catalog_id, bull_name, bull_code, source_tank_id, source_canister, field_canister, units, bulls_catalog(bull_name, naab_code)")
      .eq("tank_pack_id", packId);
    setLoading(false);
    if (error) {
      toast({ title: "Could not load pack lines", description: error.message, variant: "destructive" });
      return;
    }
    setLines((data as any[]) ?? []);
    setUnitDrafts({});
  };

  useEffect(() => {
    if (!open) return;
    fetchLines();
    setAddOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, packId]);

  const commitUnits = async (line: PackLine, raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next) || next <= 0) {
      toast({ title: "Invalid units", description: "Units must be greater than zero.", variant: "destructive" });
      setUnitDrafts((d) => ({ ...d, [line.id]: String(line.units) }));
      return;
    }
    if (next === line.units) return;
    setSavingLineId(line.id);
    const { error } = await supabase.rpc("update_pack_line", {
      _input: {
        line_id: line.id,
        units: next,
        source_tank_id: line.source_tank_id,
        bull_catalog_id: line.bull_catalog_id,
        bull_name: line.bull_name,
        bull_code: line.bull_code,
        source_canister: line.source_canister,
        field_canister: line.field_canister,
      },
    });
    setSavingLineId(null);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      setUnitDrafts((d) => ({ ...d, [line.id]: String(line.units) }));
      return;
    }
    toast({ title: "Pack line updated" });
    await fetchLines();
    onEditComplete();
  };

  const handleDelete = async () => {
    if (!deletingLine) return;
    setDeleteSubmitting(true);
    const { error } = await supabase.rpc("delete_pack_line", {
      _input: { line_id: deletingLine.id },
    });
    setDeleteSubmitting(false);
    if (error) {
      toast({ title: "Could not remove line", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Pack line removed" });
    setDeletingLine(null);
    await fetchLines();
    onEditComplete();
  };

  const resetAddForm = () => {
    setAddBullCatalogId(null);
    setAddBullName("");
    setAddBullCode(null);
    setAddInventory([]);
    setAddSourceId("");
    setAddUnits("");
    setAddFieldCanister("");
  };

  const handlePickAddBull = async (name: string, catalogId: string | null, naabCode?: string | null) => {
    if (!catalogId) {
      toast({ title: "Pick a catalog bull", description: "Custom bulls aren't supported when adding to a pack here." });
      return;
    }
    setAddBullCatalogId(catalogId);
    setAddBullName(name);
    setAddBullCode(naabCode ?? null);
    const { data, error } = await supabase
      .from("tank_inventory")
      .select("id, tank_id, canister, units, tanks!tank_inventory_tank_id_fkey(tank_name, tank_number)")
      .eq("organization_id", organizationId)
      .eq("bull_catalog_id", catalogId)
      .is("customer_id", null)
      .gt("units", 0)
      .order("units", { ascending: false });
    if (error) {
      toast({ title: "Inventory lookup failed", description: error.message, variant: "destructive" });
      return;
    }
    setAddInventory((data as any[]) ?? []);
    setAddSourceId("");
  };

  const addCanSubmit = !!addBullCatalogId && !!addSourceId && Number(addUnits) > 0 && !addSubmitting;

  const handleAddLine = async () => {
    if (!addCanSubmit) return;
    const source = addInventory.find((r) => r.id === addSourceId);
    if (!source) return;
    const units = Number(addUnits);
    if (units > source.units) {
      toast({ title: "Not enough available", description: `${source.units} units available in ${tankDisplay(source.tanks)}.`, variant: "destructive" });
      return;
    }
    setAddSubmitting(true);
    const { error } = await supabase.rpc("add_pack_line", {
      _input: {
        pack_id: packId,
        source_tank_id: source.tank_id,
        bull_catalog_id: addBullCatalogId,
        bull_name: addBullName,
        bull_code: addBullCode,
        source_canister: source.canister,
        field_canister: addFieldCanister.trim() || null,
        units,
      },
    });
    setAddSubmitting(false);
    if (error) {
      toast({ title: "Add failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Pack line added" });
    setAddOpen(false);
    resetAddForm();
    await fetchLines();
    onEditComplete();
  };

  const sortedLines = useMemo(
    () =>
      [...lines].sort((a, b) =>
        (a.field_canister ?? "").localeCompare(b.field_canister ?? "", undefined, { numeric: true }),
      ),
    [lines],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit pack lines</DialogTitle>
            <DialogDescription>
              Adjust units, remove a bull, or add a new line. Changes apply to inventory immediately.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="space-y-2">
              {sortedLines.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No pack lines.</p>
              )}
              {sortedLines.map((line) => {
                const bullName = line.bulls_catalog?.bull_name || line.bull_name || "(unknown)";
                const naab = line.bulls_catalog?.naab_code || line.bull_code || null;
                const draft = unitDrafts[line.id] ?? String(line.units);
                return (
                  <div key={line.id} className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{bullName}</div>
                      <div className="text-xs text-muted-foreground">
                        {naab ?? "—"}
                        {line.field_canister && <> · Field can {line.field_canister}</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor={`units-${line.id}`} className="text-xs text-muted-foreground">Units</Label>
                      <Input
                        id={`units-${line.id}`}
                        type="text"
                        inputMode="numeric"
                        value={draft}
                        disabled={savingLineId === line.id}
                        onChange={(e) =>
                          setUnitDrafts((d) => ({ ...d, [line.id]: e.target.value.replace(/[^0-9]/g, "") }))
                        }
                        onBlur={() => commitUnits(line, draft)}
                        className="h-8 w-20 text-right text-xs"
                      />
                      {savingLineId === line.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeletingLine(line)}
                        aria-label="Remove line"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* Add line area */}
              {addOpen ? (
                <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Add bull</Label>
                    <BullCombobox value={addBullName} catalogId={addBullCatalogId} onChange={handlePickAddBull} />
                  </div>

                  {addBullCatalogId && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Source</Label>
                        {addInventory.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">
                            No company inventory available for this bull.
                          </p>
                        ) : (
                          <select
                            value={addSourceId}
                            onChange={(e) => setAddSourceId(e.target.value)}
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          >
                            <option value="">Select a source…</option>
                            {addInventory.map((row) => (
                              <option key={row.id} value={row.id}>
                                {tankDisplay(row.tanks)}
                                {row.canister ? ` · can ${row.canister}` : ""} — {row.units} avail
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground" htmlFor="add-units">Units to pull</Label>
                          <Input
                            id="add-units"
                            type="text"
                            inputMode="numeric"
                            value={addUnits}
                            onChange={(e) => setAddUnits(e.target.value.replace(/[^0-9]/g, ""))}
                            className="h-9 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground" htmlFor="add-field-can">Field canister</Label>
                          <Input
                            id="add-field-can"
                            value={addFieldCanister}
                            onChange={(e) => setAddFieldCanister(e.target.value)}
                            placeholder="e.g. 4"
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost" size="sm" className="h-8 text-xs"
                      onClick={() => { setAddOpen(false); resetAddForm(); }}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" className="h-8 text-xs" onClick={handleAddLine} disabled={!addCanSubmit}>
                      {addSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                      Add line
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setAddOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add bull
                </Button>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingLine} onOpenChange={(o) => !o && setDeletingLine(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this pack line?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingLine && (
                <>
                  Remove {deletingLine.bulls_catalog?.bull_name || deletingLine.bull_name || "bull"} (
                  {deletingLine.units} unit{deletingLine.units === 1 ? "" : "s"}) from this pack? The semen will be
                  returned to the source tank.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
