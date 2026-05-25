import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";

interface PackOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  customerName?: string | null;
  organizationId: string;
  onPackComplete: () => void;
}

type FieldTank = {
  id: string;
  tank_name: string | null;
  tank_number: string;
  tank_type: string;
};

type OrderItem = {
  id: string;
  bull_catalog_id: string | null;
  custom_bull_name: string | null;
  units: number;
  units_received: number | null;
  bulls_catalog: { bull_name: string; naab_code: string | null } | null;
};

type InventoryRow = {
  id: string;
  tank_id: string;
  canister: string | null;
  sub_canister: string | null;
  units: number;
  customer_id: string | null;
  tanks: { tank_name: string | null; tank_number: string } | null;
};

type PullRow = {
  inventoryId: string;
  sourceTankId: string;
  sourceTankLabel: string;
  sourceCanister: string | null;
  available: number;
  customerId: string | null;
};

type DestRow = {
  id: string;
  fieldCanister: string;
  units: string;
  sourceInventoryId: string | null;
};

type BullSection = {
  key: string;
  bullCatalogId: string;
  bullName: string;
  naabCode: string | null;
  needed: number;
  pulls: PullRow[];
  destinations: DestRow[];
};

const newKey = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Math.random().toString(36).slice(2)}-${Date.now()}`);

const CUSTOMER_DELIVERY_VALUE = "__CUSTOMER_DELIVERY__";

const tankDisplay = (t: { tank_name: string | null; tank_number: string } | null) => {
  if (!t) return "—";
  return t.tank_name ? `${t.tank_name} (#${t.tank_number})` : `Tank #${t.tank_number}`;
};

// Default tank_return_expected based on tank type. Rentals come back;
// customer-owned tanks stay with the customer. Everything else defaults to
// "return expected" — that's the safe assumption for company tanks heading
// out.
function defaultReturnExpected(tankType: string | undefined): boolean {
  if (tankType === "customer_tank") return false;
  return true;
}

async function loadInventoryForBull(
  orgId: string,
  bullCatalogId: string,
  customerId: string | null,
): Promise<InventoryRow[]> {
  let query = supabase
    .from("tank_inventory")
    .select("id, tank_id, canister, sub_canister, units, customer_id, tanks!tank_inventory_tank_id_fkey(tank_name, tank_number)")
    .eq("organization_id", orgId)
    .eq("bull_catalog_id", bullCatalogId)
    .gt("units", 0);

  if (customerId) {
    query = query.or(`customer_id.is.null,customer_id.eq.${customerId}`);
  } else {
    query = query.is("customer_id", null);
  }

  const { data, error } = await query.order("units", { ascending: false });
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
    customerId: row.customer_id,
  }));

// Compute remaining units per source row given all destinations in a section.
function remainingByInventory(section: BullSection, excludeDestId?: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of section.pulls) map.set(p.inventoryId, p.available);
  for (const d of section.destinations) {
    if (d.id === excludeDestId) continue;
    if (!d.sourceInventoryId) continue;
    const u = Number(d.units) || 0;
    if (u <= 0) continue;
    map.set(d.sourceInventoryId, (map.get(d.sourceInventoryId) ?? 0) - u);
  }
  return map;
}

export default function PackOrderDialog({
  open, onOpenChange, orderId, customerName, organizationId, onPackComplete,
}: PackOrderDialogProps) {
  const { userId } = useOrgRole();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldTanks, setFieldTanks] = useState<FieldTank[]>([]);
  const [selectedFieldTankId, setSelectedFieldTankId] = useState<string>("");
  const [orderCustomerId, setOrderCustomerId] = useState<string | null>(null);
  const [bullSections, setBullSections] = useState<BullSection[]>([]);
  const [tankReturnExpected, setTankReturnExpected] = useState<boolean>(true);
  // Track whether the user has manually toggled the checkbox so we don't keep
  // overwriting it when they change tanks.
  const [returnToggled, setReturnToggled] = useState(false);
  const [notes, setNotes] = useState("");

  const handleCustomerDelivery = async () => {
    if (!orderCustomerId || !organizationId) return;

    // Look for an existing delivery tank for this customer
    const { data: existing } = await supabase
      .from("tanks")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("customer_id", orderCustomerId)
      .eq("tank_type", "customer_tank")
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      setSelectedFieldTankId(existing.id);
      if (!returnToggled) {
        setTankReturnExpected(false);
      }
      return;
    }

    // Create a new delivery tank for this customer
    // Get customer name for the tank_name
    const { data: custData } = await supabase
      .from("customers")
      .select("name")
      .eq("id", orderCustomerId)
      .maybeSingle();

    const custName = custData?.name || "Customer";

    // Get next available tank number
    const { data: maxRow } = await supabase
      .from("tanks")
      .select("tank_number")
      .eq("organization_id", organizationId)
      .order("tank_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Parse highest tank number and increment. Fall back to 9100 if something goes wrong.
    const maxNum = maxRow?.tank_number ? parseInt(maxRow.tank_number, 10) : 9000;
    const nextNum = (isNaN(maxNum) ? 9000 : maxNum) + 1;

    const { data: newTank, error } = await supabase
      .from("tanks")
      .insert({
        organization_id: organizationId,
        tank_name: custName,
        tank_number: String(nextNum),
        tank_type: "customer_tank",
        location_status: "out",
        nitrogen_status: "unknown",
        customer_id: orderCustomerId,
      })
      .select("id")
      .single();

    if (error || !newTank?.id) {
      toast({
        title: "Could not create delivery tank",
        description: error?.message ?? "Unknown error",
        variant: "destructive",
      });
      setSelectedFieldTankId("");
      return;
    }

    setSelectedFieldTankId(newTank.id);
    if (!returnToggled) {
      setTankReturnExpected(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setBullSections([]);
    setSelectedFieldTankId("");
    setTankReturnExpected(true);
    setReturnToggled(false);
    setNotes("");
  }, [open, orderId]);

  // Auto-update return-expected when the user picks a different tank (only
  // until they manually toggle the checkbox).
  useEffect(() => {
    if (returnToggled) return;
    const tank = fieldTanks.find((t) => t.id === selectedFieldTankId);
    setTankReturnExpected(defaultReturnExpected(tank?.tank_type));
  }, [selectedFieldTankId, fieldTanks, returnToggled]);

  // Load tanks + order items + per-bull inventory on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [tanksRes, orderRes, itemsRes] = await Promise.all([
        // ALL "here + wet" tanks — rentals, customer tanks, inventory tanks.
        // The user picks the right destination for this order; we don't
        // pre-filter to one ownership class.
        supabase
          .from("tanks")
          .select("id, tank_name, tank_number, tank_type")
          .eq("organization_id", organizationId)
          .eq("location_status", "here")
          .eq("nitrogen_status", "wet")
          .order("tank_number"),
        supabase
          .from("semen_orders")
          .select("id, customer_id")
          .eq("id", orderId)
          .maybeSingle(),
        supabase
          .from("semen_order_items")
          .select("id, bull_catalog_id, custom_bull_name, units, units_received, bulls_catalog(bull_name, naab_code)")
          .eq("semen_order_id", orderId),
      ]);
      if (cancelled) return;

      if (tanksRes.error) {
        toast({ title: "Could not load tanks", description: tanksRes.error.message, variant: "destructive" });
      }
      setFieldTanks((tanksRes.data ?? []) as FieldTank[]);

      const customerId = (orderRes.data as { customer_id: string | null } | null)?.customer_id ?? null;
      setOrderCustomerId(customerId);
      const items = (itemsRes.data ?? []) as unknown as OrderItem[];

      const sections: BullSection[] = [];
      for (const item of items) {
        if (!item.bull_catalog_id) continue;
        const remaining = Math.max(0, (item.units || 0) - (item.units_received || 0));
        if (remaining <= 0) continue;
        const inventory = await loadInventoryForBull(organizationId, item.bull_catalog_id, customerId);
        if (cancelled) return;
        const pulls = buildPulls(inventory);
        const firstSourceId = pulls[0]?.inventoryId ?? null;
        sections.push({
          key: newKey(),
          bullCatalogId: item.bull_catalog_id,
          bullName: item.bulls_catalog?.bull_name ?? item.custom_bull_name ?? "(unnamed bull)",
          naabCode: item.bulls_catalog?.naab_code ?? null,
          needed: remaining,
          pulls,
          destinations: [
            {
              id: newKey(),
              fieldCanister: String(sections.length + 1),
              units: String(remaining),
              sourceInventoryId: firstSourceId,
            },
          ],
        });
      }

      if (!cancelled) {
        setBullSections(sections);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, orderId, organizationId]);

  const updateDestination = (sectionKey: string, destId: string, patch: Partial<DestRow>) => {
    setBullSections((prev) => prev.map((s) => {
      if (s.key !== sectionKey) return s;
      return {
        ...s,
        destinations: s.destinations.map((d) => (d.id === destId ? { ...d, ...patch } : d)),
      };
    }));
  };

  const addDestination = (sectionKey: string) => {
    setBullSections((prev) => prev.map((s) => {
      if (s.key !== sectionKey) return s;
      const remaining = remainingByInventory(s);
      const suggested = s.pulls.find((p) => (remaining.get(p.inventoryId) ?? 0) > 0)
        ?? s.pulls[0]
        ?? null;
      return {
        ...s,
        destinations: [
          ...s.destinations,
          {
            id: newKey(),
            fieldCanister: "",
            units: "",
            sourceInventoryId: suggested?.inventoryId ?? null,
          },
        ],
      };
    }));
  };

  const removeDestination = (sectionKey: string, destId: string) => {
    setBullSections((prev) => prev.map((s) => {
      if (s.key !== sectionKey) return s;
      if (s.destinations.length <= 1) return s;
      return { ...s, destinations: s.destinations.filter((d) => d.id !== destId) };
    }));
  };

  const totals = useMemo(() => {
    let unitsTotal = 0;
    let bullsTotal = 0;
    for (const s of bullSections) {
      const sectionUnits = s.destinations.reduce((sum, d) => sum + (Number(d.units) || 0), 0);
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
        is_billable: boolean;
      }> = [];

      // Per-bull source allocation. Each destination row carries a chosen
      // source; overflow falls through to the next available pull.
      const sourceRemaining = new Map<string, number>();
      for (const s of bullSections) {
        for (const p of s.pulls) {
          if (!sourceRemaining.has(p.inventoryId)) sourceRemaining.set(p.inventoryId, p.available);
        }
      }

      for (const s of bullSections) {
        for (const d of s.destinations) {
          let need = Number(d.units) || 0;
          if (need <= 0) continue;
          const chosen = s.pulls.find((p) => p.inventoryId === d.sourceInventoryId);
          const others = s.pulls.filter((p) => p.inventoryId !== d.sourceInventoryId);
          const order = chosen ? [chosen, ...others] : s.pulls;
          for (const p of order) {
            if (need <= 0) break;
            const remaining = sourceRemaining.get(p.inventoryId) ?? 0;
            if (remaining <= 0) continue;
            const take = Math.min(remaining, need);
            lines.push({
              source_tank_id: p.sourceTankId,
              bull_catalog_id: s.bullCatalogId,
              bull_name: s.bullName,
              bull_code: s.naabCode,
              source_canister: p.sourceCanister,
              field_canister: d.fieldCanister.trim() || null,
              units: take,
              is_billable: p.customerId === null,
            });
            sourceRemaining.set(p.inventoryId, remaining - take);
            need -= take;
          }
          if (need > 0) {
            throw new Error(
              `${s.bullName}: not enough inventory to fill ${d.units} units` +
                (d.fieldCanister ? ` for canister ${d.fieldCanister}` : "") +
                ".",
            );
          }
        }
      }

      if (lines.length === 0) throw new Error("Add at least one canister with units.");

      const payload = {
        organization_id: organizationId,
        pack_type: "order",
        field_tank_id: selectedFieldTankId,
        packed_at: new Date().toISOString(),
        packed_by: packedBy,
        project_ids: [] as string[],
        order_ids: [orderId],
        pickup_order_ids: [] as string[],
        tank_return_expected: tankReturnExpected,
        notes: notes.trim() || null,
        lines,
      };

      const { data, error } = await supabase.rpc("pack_tank", { _input: payload });
      if (error) throw error;
      const result = data as { ok?: boolean; pack_id?: string } | null;
      if (!result?.ok) throw new Error("Pack failed: invalid response from server");

      // Safety net: if the RPC didn't honor tank_return_expected from the
      // payload, stamp it directly on the pack we just created. Trigger logic
      // on tank_pack_lines handles fulfillment_status recalc.
      if (result.pack_id) {
        await supabase
          .from("tank_packs")
          .update({ tank_return_expected: tankReturnExpected, notes: notes.trim() || null })
          .eq("id", result.pack_id);
      }

      toast({
        title: "Tank packed successfully",
        description: customerName ? `Order packed for ${customerName}.` : undefined,
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
          <DialogTitle>Pack order{customerName ? ` — ${customerName}` : ""}</DialogTitle>
          <DialogDescription>
            Pack semen ordered by the customer into a tank — a rental, an
            inventory tank, or the customer's own tank.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Field tank picker */}
          <div className="space-y-1.5">
            <Label htmlFor="field-tank">Field tank</Label>
            <select
              id="field-tank"
              value={selectedFieldTankId && !fieldTanks.find(t => t.id === selectedFieldTankId) ? CUSTOMER_DELIVERY_VALUE : selectedFieldTankId}
              onChange={(e) => {
                const val = e.target.value;
                if (val === CUSTOMER_DELIVERY_VALUE) {
                  handleCustomerDelivery();
                } else {
                  setSelectedFieldTankId(val);
                }
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select a tank…</option>
              {orderCustomerId && (
                <option value={CUSTOMER_DELIVERY_VALUE}>
                  📦 Customer Delivery — {customerName || "customer's tank"}
                </option>
              )}
              {fieldTanks.map((t) => (
                <option key={t.id} value={t.id}>
                  {tankDisplay(t)} — {t.tank_type.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          {/* Tank return expected */}
          <div className="flex items-start gap-2">
            <Checkbox
              id="tank-return-expected"
              checked={tankReturnExpected}
              onCheckedChange={(checked) => {
                setReturnToggled(true);
                setTankReturnExpected(checked === true);
              }}
            />
            <div className="space-y-0.5">
              <Label htmlFor="tank-return-expected" className="text-sm cursor-pointer">
                Tank return expected?
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Defaults to yes for rentals / inventory tanks, no for customer-owned tanks.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading order items and inventory…
            </div>
          ) : (
            <div className="space-y-4">
              {bullSections.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  No remaining bulls to pack on this order.
                </p>
              )}

              {bullSections.map((s) => {
                const sectionTotal = s.destinations.reduce((sum, d) => sum + (Number(d.units) || 0), 0);
                const totalAvailable = s.pulls.reduce((sum, p) => sum + p.available, 0);
                const overAlloc = sectionTotal > totalAvailable;
                return (
                  <div key={s.key} className="rounded-lg border border-border/60 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-medium text-sm">
                          {s.bullName}
                          {s.naabCode && <span className="ml-2 text-xs text-muted-foreground">{s.naabCode}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Ordered {s.needed}
                          {sectionTotal > 0 && <> · Packing {sectionTotal}</>}
                        </div>
                      </div>
                    </div>

                    {/* Source inventory */}
                    {s.pulls.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No available inventory for this bull.</p>
                    ) : (
                      <div className="space-y-0.5 text-[11px] text-muted-foreground border-l-2 border-border/60 pl-2">
                        {s.pulls.map((p) => (
                          <div key={p.inventoryId} className="flex items-center gap-2">
                            <span className="font-medium text-foreground/80">{p.sourceTankLabel}</span>
                            {p.sourceCanister && <span> · can {p.sourceCanister}</span>}
                            {p.customerId && (
                              <Badge
                                variant="outline"
                                className="h-4 px-1 py-0 text-[9px] font-medium border-amber-500/40 text-amber-700 bg-amber-50"
                              >
                                Customer owned
                              </Badge>
                            )}
                            <span className="ml-auto text-emerald-600 tabular-nums">{p.available} avail</span>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="text-foreground/70">Total available</span>
                          <span className={`ml-auto tabular-nums font-medium ${overAlloc ? "text-destructive" : "text-foreground/80"}`}>
                            {totalAvailable}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Destination canisters */}
                    {s.pulls.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Pack into</div>
                        {s.destinations.map((d) => {
                          const remaining = remainingByInventory(s, d.id);
                          const chosenRemaining = d.sourceInventoryId
                            ? (remaining.get(d.sourceInventoryId) ?? 0) - (Number(d.units) || 0)
                            : 0;
                          const shortByPick = d.sourceInventoryId != null && (Number(d.units) || 0) > 0 && chosenRemaining < 0;
                          return (
                            <div key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
                              <Label className="text-muted-foreground" htmlFor={`fc-${s.key}-${d.id}`}>Field can</Label>
                              <Input
                                id={`fc-${s.key}-${d.id}`}
                                value={d.fieldCanister}
                                placeholder="—"
                                onChange={(e) => updateDestination(s.key, d.id, { fieldCanister: e.target.value })}
                                className="h-8 w-16 text-xs"
                              />
                              <Label className="text-muted-foreground ml-1" htmlFor={`du-${s.key}-${d.id}`}>Units</Label>
                              <Input
                                id={`du-${s.key}-${d.id}`}
                                type="text"
                                inputMode="numeric"
                                value={d.units}
                                placeholder="—"
                                onChange={(e) => updateDestination(s.key, d.id, { units: e.target.value.replace(/[^0-9]/g, "") })}
                                className="h-8 w-20 text-right text-xs"
                              />
                              <Label className="text-muted-foreground ml-1" htmlFor={`src-${s.key}-${d.id}`}>Source</Label>
                              <select
                                id={`src-${s.key}-${d.id}`}
                                value={d.sourceInventoryId ?? ""}
                                onChange={(e) =>
                                  updateDestination(s.key, d.id, { sourceInventoryId: e.target.value || null })
                                }
                                className={`h-8 rounded-md border bg-background px-2 text-xs ${shortByPick ? "border-destructive text-destructive" : "border-input"}`}
                              >
                                {s.pulls.map((p) => {
                                  const left = (remaining.get(p.inventoryId) ?? 0);
                                  const ownerTag = p.customerId ? " · customer owned" : "";
                                  const label = `${p.sourceTankLabel}${p.sourceCanister ? ` · can ${p.sourceCanister}` : ""}${ownerTag} — ${left} remaining`;
                                  return (
                                    <option
                                      key={p.inventoryId}
                                      value={p.inventoryId}
                                      style={left <= 0 ? { color: "#888" } : undefined}
                                    >
                                      {label}
                                    </option>
                                  );
                                })}
                              </select>
                              {s.destinations.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeDestination(s.key, d.id)}
                                  className="text-destructive hover:text-destructive/80 text-base leading-none px-1"
                                  aria-label="Remove canister"
                                >
                                  ×
                                </button>
                              )}
                              {shortByPick && (
                                <span className="basis-full text-[11px] text-destructive">
                                  Selected source only has {(remaining.get(d.sourceInventoryId!) ?? 0)} units — overflow will pull from the next available source.
                                </span>
                              )}
                            </div>
                          );
                        })}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                          onClick={() => addDestination(s.key)}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add canister
                        </Button>
                        {overAlloc && (
                          <div className="text-[11px] text-destructive">
                            Packing {sectionTotal} exceeds the {totalAvailable} units available for this bull.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="pack-notes" className="text-sm">Notes (optional)</Label>
            <Input
              id="pack-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., loaner tank to Jim until Friday"
              className="h-9 text-sm"
            />
          </div>
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
