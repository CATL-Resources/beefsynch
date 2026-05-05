import { useEffect, useMemo, useState } from "react";
import { Loader2, Package } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FulfillLine {
  bull_catalog_id: string | null;
  bull_name: string;
  bull_code: string | null;
  ordered: number;
  fulfilled: number;
}

interface FulfillOrderDialogProps {
  orderId: string;
  customerName: string;
  organizationId: string;
  lines: FulfillLine[];
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

interface LineState {
  units: string;
  tankId: string;
  canister: string;
  billable: boolean;
  deliveryMethod: string;
}

interface InventoryLocation {
  tank_id: string;
  tank_number: string | number;
  tank_name: string | null;
  canister: string | null;
  units: number;
  customer_id: string | null;
  owner: string | null;
}

const DELIVERY_METHODS = [
  { value: "pickup", label: "Customer pickup" },
  { value: "drop_off", label: "We dropped off" },
  { value: "shipped", label: "Shipped" },
] as const;

export const FulfillOrderDialog = ({
  orderId,
  customerName,
  organizationId,
  lines,
  trigger,
  onSuccess,
}: FulfillOrderDialogProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lineStates, setLineStates] = useState<LineState[]>([]);

  const [inventoryByBull, setInventoryByBull] = useState<Record<string, InventoryLocation[]>>({});
  const [inventoryLoading, setInventoryLoading] = useState(false);

  const activeBulls = useMemo(
    () => lines.filter((l) => l.ordered - l.fulfilled > 0),
    [lines]
  );

  // Reset line states when dialog opens
  useEffect(() => {
    if (!open) return;
    setLineStates(
      activeBulls.map((l) => ({
        units: String(l.ordered - l.fulfilled),
        tankId: "",
        canister: "",
        billable: true,
        deliveryMethod: "pickup",
      }))
    );
    setInventoryByBull({});
  }, [open, lines]);

  // Fetch inventory locations for each bull when dialog opens
  useEffect(() => {
    if (!open || activeBulls.length === 0) return;
    setInventoryLoading(true);

    const bullIds = activeBulls
      .map((b) => b.bull_catalog_id)
      .filter((id): id is string => !!id);

    if (bullIds.length === 0) {
      setInventoryLoading(false);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("tank_inventory")
        .select("tank_id, bull_catalog_id, canister, units, customer_id, owner, tanks!tank_inventory_tank_id_fkey(tank_number, tank_name)")
        .in("bull_catalog_id", bullIds)
        .gt("units", 0);

      const byBull: Record<string, InventoryLocation[]> = {};
      for (const row of data ?? []) {
        const bullId = row.bull_catalog_id;
        if (!byBull[bullId]) byBull[bullId] = [];
        byBull[bullId].push({
          tank_id: row.tank_id,
          tank_number: row.tanks?.tank_number ?? "?",
          tank_name: row.tanks?.tank_name ?? null,
          canister: row.canister,
          units: row.units,
          customer_id: row.customer_id,
          owner: row.owner,
        });
      }
      setInventoryByBull(byBull);
      setInventoryLoading(false);

      // Auto-select tank + canister when only one location exists
      setLineStates((prev) => {
        const next = [...prev];
        for (let i = 0; i < activeBulls.length; i++) {
          const bullId = activeBulls[i].bull_catalog_id;
          if (!bullId || !byBull[bullId]) continue;
          const locs = byBull[bullId];
          if (locs.length === 1 && next[i] && !next[i].tankId) {
            const loc = locs[0];
            const isCompanyTank = !loc.customer_id;
            next[i] = {
              ...next[i],
              tankId: loc.tank_id,
              canister: loc.canister || "",
              billable: isCompanyTank,
            };
          }
        }
        return next;
      });
    })();
  }, [open, activeBulls]);

  const updateLine = (idx: number, field: keyof LineState, value: string | boolean) => {
    setLineStates((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleLocationSelect = (idx: number, locationKey: string) => {
    const [tankId, canister] = locationKey.split("|");
    const bullId = activeBulls[idx]?.bull_catalog_id;
    const locs = bullId ? inventoryByBull[bullId] : [];
    const loc = locs?.find((l) => l.tank_id === tankId && (l.canister || "") === (canister || ""));
    const isCompanyTank = loc ? !loc.customer_id : true;

    setLineStates((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], tankId, canister: canister || "", billable: isCompanyTank };
      return next;
    });
  };

  const canSubmit = lineStates.some(
    (ls) => ls.tankId && parseInt(ls.units) > 0
  );

  const handleSubmit = async () => {
    setSaving(true);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < activeBulls.length; i++) {
      const bull = activeBulls[i];
      const ls = lineStates[i];
      if (!ls) continue;

      const units = parseInt(ls.units);
      if (!ls.tankId || !units || units <= 0) continue;

      const deliveryLabel = DELIVERY_METHODS.find((d) => d.value === ls.deliveryMethod)?.label || ls.deliveryMethod;

      const { error } = await supabase.rpc("record_direct_sale", {
        _input: {
          order_id: orderId,
          source_tank_id: ls.tankId,
          units,
          bull_catalog_id: bull.bull_catalog_id || null,
          bull_code: bull.bull_code || null,
          bull_name: bull.bull_name || null,
          source_canister: ls.canister || null,
          is_billable: ls.billable,
          notes: deliveryLabel,
        },
      });

      if (error) {
        console.error(`Fulfill error for ${bull.bull_name}:`, error);
        toast({
          title: `Error: ${bull.bull_name}`,
          description: error.message,
          variant: "destructive",
        });
        errorCount++;
      } else {
        successCount++;
      }
    }

    setSaving(false);

    if (successCount > 0) {
      toast({
        title: `Fulfilled ${successCount} bull${successCount !== 1 ? "s" : ""}`,
        description: errorCount > 0 ? `${errorCount} failed` : undefined,
      });
      setOpen(false);
      onSuccess?.();
    }
  };

  const locationLabel = (loc: InventoryLocation) => {
    const tank = loc.tank_name ? `${loc.tank_number} — ${loc.tank_name}` : String(loc.tank_number);
    const can = loc.canister ? `, can ${loc.canister}` : "";
    return `${tank}${can} (${loc.units}u${loc.owner ? " · " + loc.owner : ""})`;
  };

  const locationKey = (loc: InventoryLocation) => `${loc.tank_id}|${loc.canister || ""}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fulfill Order — {customerName}</DialogTitle>
          <DialogDescription>
            Select where the semen is coming from and how it's being delivered.
          </DialogDescription>
        </DialogHeader>

        {activeBulls.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            All bulls on this order are fully fulfilled.
          </p>
        ) : (
          <div className="space-y-4">
            {activeBulls.map((bull, idx) => {
              const remaining = bull.ordered - bull.fulfilled;
              const ls = lineStates[idx];
              if (!ls) return null;

              const bullId = bull.bull_catalog_id;
              const locations = bullId ? (inventoryByBull[bullId] || []) : [];
              const selectedKey = ls.tankId ? `${ls.tankId}|${ls.canister || ""}` : "";

              return (
                <div key={`${bull.bull_catalog_id || bull.bull_name}-${idx}`} className="border border-border/40 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{bull.bull_name}</div>
                      {bull.bull_code && (
                        <div className="text-xs text-muted-foreground">{bull.bull_code}</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {remaining} of {bull.ordered} remaining
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Source</Label>
                    {inventoryLoading ? (
                      <p className="text-xs text-muted-foreground">Loading inventory...</p>
                    ) : locations.length === 0 ? (
                      <p className="text-xs text-destructive">Not found in inventory</p>
                    ) : locations.length === 1 ? (
                      <div className="text-sm border rounded-md px-3 py-2 bg-muted/30">
                        {locationLabel(locations[0])}
                      </div>
                    ) : (
                      <Select value={selectedKey} onValueChange={(v) => handleLocationSelect(idx, v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((loc) => (
                            <SelectItem key={locationKey(loc)} value={locationKey(loc)}>
                              {locationLabel(loc)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-3 space-y-1">
                      <Label className="text-xs">Units</Label>
                      <Input
                        type="number"
                        min="1"
                        value={ls.units}
                        onChange={(e) => updateLine(idx, "units", e.target.value)}
                      />
                    </div>

                    <div className="sm:col-span-5 space-y-1">
                      <Label className="text-xs">Delivery</Label>
                      <Select value={ls.deliveryMethod} onValueChange={(v) => updateLine(idx, "deliveryMethod", v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DELIVERY_METHODS.map((d) => (
                            <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="sm:col-span-4 flex items-center gap-2 pb-2">
                      <Checkbox
                        id={`billable-${idx}`}
                        checked={ls.billable}
                        onCheckedChange={(checked) => updateLine(idx, "billable", !!checked)}
                      />
                      <Label htmlFor={`billable-${idx}`} className="text-xs cursor-pointer">
                        Billable
                      </Label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !canSubmit}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Package className="h-4 w-4 mr-2" />
            Fulfill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
