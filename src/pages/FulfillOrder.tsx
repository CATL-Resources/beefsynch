import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft, CheckCircle2, AlertTriangle, Lock, Loader2, Printer, Package, Truck,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { getBullDisplayLabel } from "@/lib/bullDisplay";
import { generatePackingListPdf, type PackingListLine } from "@/lib/generatePackingListPdf";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const SELECT_SIRES_ID = "630b12de-74bc-407a-8ee5-1ea17df18881";

interface OrderRow {
  id: string;
  customer_id: string | null;
  order_date: string | null;
  order_status: "not_ordered" | "ordered" | "received";
  fulfillment_status: string;
  customers: { name: string } | null;
}

interface OrderItem {
  id: string;
  bull_catalog_id: string | null;
  custom_bull_name: string | null;
  units: number;
  bulls_catalog: { bull_name: string; naab_code: string | null } | null;
}

interface SourceLocation {
  tank_id: string;
  tank_number: string | number;
  tank_name: string | null;
  canister: string;
  units: number;
  owner_company_id: string | null;
}

interface FulfilledHistory {
  bullKey: string;
  bullName: string;
  bullCode: string | null;
  units: number;
  source_tank_label: string;
  source_canister: string | null;
  destination_canister: string | null;
  fulfilled_at: string;
}

const FulfillOrder = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgId } = useOrgRole();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  // bullCatalogId|custom_bull_name → already-fulfilled units
  const [fulfilledByBull, setFulfilledByBull] = useState<Map<string, number>>(new Map());
  const [history, setHistory] = useState<FulfilledHistory[]>([]);

  const [customerTanks, setCustomerTanks] = useState<Array<{ id: string; tank_number: string | number; tank_name: string | null }>>([]);
  const [destTankCanisters, setDestTankCanisters] = useState<string[]>([]);
  const [destinationMode, setDestinationMode] = useState<"tank" | "pickup">("tank");
  const [destTankId, setDestTankId] = useState<string>("");

  // Per-item, per-source-location pull amount (string for raw input).
  const [pulls, setPulls] = useState<Record<string, Record<string, string>>>({});
  const [destCanisters, setDestCanisters] = useState<Record<string, string>>({});

  const [inventoryByBull, setInventoryByBull] = useState<Record<string, SourceLocation[]>>({});

  const [lastReceipt, setLastReceipt] = useState<PackingListLine[] | null>(null);

  const sourceKey = (loc: SourceLocation) => `${loc.tank_id}|${loc.canister}`;

  const itemBullKey = (it: OrderItem) => it.bull_catalog_id || `name:${it.custom_bull_name || ""}`;

  const load = async () => {
    if (!id) return;
    setLoading(true);

    const [{ data: o }, { data: i }, { data: txns }] = await Promise.all([
      supabase
        .from("semen_orders")
        .select("id, customer_id, order_date, order_status, fulfillment_status, customers!semen_orders_customer_id_fkey(name)")
        .eq("id", id)
        .single(),
      supabase
        .from("semen_order_items")
        .select("id, bull_catalog_id, custom_bull_name, units, bulls_catalog(bull_name, naab_code)")
        .eq("semen_order_id", id),
      supabase
        .from("inventory_transactions")
        .select("bull_catalog_id, custom_bull_name, units_change, transaction_type, created_at, tank_id, source_canister, destination_canister, tanks!inventory_transactions_tank_id_fkey(tank_number, tank_name)")
        .eq("semen_order_id", id)
        .in("transaction_type", ["direct_sale", "customer_pickup"])
        .order("created_at", { ascending: true }),
    ]);

    if (!o) {
      toast({ title: "Order not found", variant: "destructive" });
      setLoading(false);
      return;
    }

    setOrder(o as unknown as OrderRow);
    setItems((i ?? []) as unknown as OrderItem[]);

    // Walk transactions: only the negative (withdrawal) rows count toward
    // "fulfilled units"; the positive deposit halves on the destination tank
    // would double-count.
    const fb = new Map<string, number>();
    const hist: FulfilledHistory[] = [];
    for (const t of (txns ?? []) as any[]) {
      if (t.units_change >= 0) continue;
      const k = t.bull_catalog_id || `name:${t.custom_bull_name || ""}`;
      fb.set(k, (fb.get(k) || 0) + Math.abs(t.units_change));
      hist.push({
        bullKey: k,
        bullName: t.custom_bull_name || "",
        bullCode: null,
        units: Math.abs(t.units_change),
        source_tank_label: t.tanks
          ? (t.tanks.tank_name || `Tank ${t.tanks.tank_number}`)
          : "Tank",
        source_canister: t.source_canister,
        destination_canister: t.destination_canister,
        fulfilled_at: t.created_at,
      });
    }
    setFulfilledByBull(fb);
    setHistory(hist);

    if (o.customer_id) {
      const { data: tanks } = await supabase
        .from("tanks")
        .select("id, tank_number, tank_name")
        .eq("customer_id", o.customer_id)
        .order("tank_number");
      const list = (tanks ?? []) as Array<{ id: string; tank_number: string | number; tank_name: string | null }>;
      setCustomerTanks(list);
      if (list.length > 0 && !destTankId) setDestTankId(list[0].id);
    }

    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // Look up company-stock locations for each ordered bull.
  useEffect(() => {
    if (!orgId || items.length === 0) return;
    (async () => {
      const next: Record<string, SourceLocation[]> = {};
      for (const it of items) {
        if (!it.bull_catalog_id) {
          next[itemBullKey(it)] = [];
          continue;
        }
        const { data } = await supabase
          .from("tank_inventory")
          .select("tank_id, canister, units, owner_company_id, tanks!tank_inventory_tank_id_fkey(tank_number, tank_name)")
          .eq("organization_id", orgId)
          .is("customer_id", null)
          .eq("bull_catalog_id", it.bull_catalog_id)
          .gt("units", 0)
          .order("units", { ascending: false });
        next[itemBullKey(it)] = (data ?? []).map((r: any) => ({
          tank_id: r.tank_id,
          tank_number: r.tanks?.tank_number ?? "?",
          tank_name: r.tanks?.tank_name ?? null,
          canister: r.canister || "",
          units: r.units,
          owner_company_id: r.owner_company_id,
        }));
      }
      setInventoryByBull(next);
    })();
  }, [orgId, items]);

  // Load existing canisters in the destination tank to suggest in the picker.
  useEffect(() => {
    if (!destTankId) { setDestTankCanisters([]); return; }
    (async () => {
      const { data } = await supabase
        .from("tank_inventory")
        .select("canister")
        .eq("tank_id", destTankId)
        .gt("units", 0);
      const set = new Set<string>();
      for (const r of (data ?? []) as any[]) {
        if (r.canister) set.add(String(r.canister));
      }
      const sorted = Array.from(set).sort((a, b) => {
        const an = parseInt(a, 10); const bn = parseInt(b, 10);
        return Number.isNaN(an) || Number.isNaN(bn) ? a.localeCompare(b) : an - bn;
      });
      setDestTankCanisters(sorted);
    })();
  }, [destTankId]);

  const ownerLabel = (id: string | null): "Select" | "CATL" | "—" => {
    if (!id) return "—";
    return id === SELECT_SIRES_ID ? "Select" : "CATL";
  };

  const lineLocked = (it: OrderItem): boolean => {
    const fulfilled = fulfilledByBull.get(itemBullKey(it)) || 0;
    return fulfilled >= it.units && it.units > 0;
  };

  const remainingForItem = (it: OrderItem): number => {
    const fulfilled = fulfilledByBull.get(itemBullKey(it)) || 0;
    return Math.max(0, it.units - fulfilled);
  };

  const sumPulls = (itemId: string): number => {
    const map = pulls[itemId] || {};
    let total = 0;
    for (const v of Object.values(map)) {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n) && n > 0) total += n;
    }
    return total;
  };

  const itemStatus = (it: OrderItem): "locked" | "matched" | "partial" | "untouched" => {
    if (lineLocked(it)) return "locked";
    const remaining = remainingForItem(it);
    const sum = sumPulls(it.id);
    if (sum === 0) return "untouched";
    if (sum >= remaining) return "matched";
    return "partial";
  };

  const hasAnyPulls = useMemo(() => {
    return items.some((it) => sumPulls(it.id) > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulls, items]);

  const allMatched = useMemo(() => {
    const editable = items.filter((it) => !lineLocked(it));
    return editable.length > 0 && editable.every((it) => sumPulls(it.id) >= remainingForItem(it));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulls, items, fulfilledByBull]);

  const canFulfill = !saving && hasAnyPulls && (destinationMode === "pickup" || !!destTankId);

  const updatePull = (itemId: string, sourceK: string, value: string) => {
    setPulls((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), [sourceK]: value },
    }));
  };

  const updateDestCanister = (itemId: string, value: string) => {
    setDestCanisters((prev) => ({ ...prev, [itemId]: value }));
  };

  const saveOrderOnly = async () => {
    // Order itself is unchanged here; this button is for the case where
    // someone opened the page and changed nothing they wanted persisted.
    // Just return to detail.
    if (!order) return;
    navigate(`/semen-orders/${order.id}`);
  };

  const fulfill = async () => {
    if (!order) return;
    setSaving(true);

    // Build the lines payload + receipt for the packing list.
    const lines: any[] = [];
    const receipt: PackingListLine[] = [];

    for (const it of items) {
      if (lineLocked(it) || !it.bull_catalog_id) continue;
      const map = pulls[it.id] || {};
      const locs = inventoryByBull[itemBullKey(it)] || [];
      for (const loc of locs) {
        const raw = map[sourceKey(loc)];
        const n = parseInt(raw || "", 10);
        if (Number.isNaN(n) || n <= 0) continue;
        const destCan = destinationMode === "tank"
          ? (destCanisters[it.id]?.trim() || "1")
          : null;
        lines.push({
          bull_catalog_id: it.bull_catalog_id,
          source_tank_id: loc.tank_id,
          source_canister: loc.canister || null,
          pull_units: n,
          dest_canister: destCan,
        });
        receipt.push({
          bull_name: it.bulls_catalog?.bull_name || it.custom_bull_name || "Unknown",
          bull_code: it.bulls_catalog?.naab_code || null,
          units: n,
          source_tank_label: loc.tank_name ? `${loc.tank_number} — ${loc.tank_name}` : String(loc.tank_number),
          source_canister: loc.canister || null,
          destination_canister: destinationMode === "tank" ? destCan : null,
          bills_through: ownerLabel(loc.owner_company_id),
        });
      }
    }

    if (lines.length === 0) {
      toast({ title: "Nothing to fulfill", description: "Enter pull amounts first." });
      setSaving(false);
      return;
    }

    const { data, error } = await supabase.rpc("fulfill_order_lines" as any, {
      _order_id: order.id,
      _lines: lines as any,
      _dest_tank_id: destinationMode === "tank" ? destTankId : null,
      _is_pickup: destinationMode === "pickup",
    });

    if (error) {
      toast({ title: "Fulfillment failed", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    const result = data as { lines_processed?: number } | null;
    toast({ title: "Order fulfilled", description: `${result?.lines_processed ?? lines.length} pull line(s) processed` });
    setLastReceipt(receipt);
    setPulls({});
    await load();
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }
  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Order not found.
      </div>
    );
  }

  const customerName = order.customers?.name || "Unknown";
  const orderedTotal = items.reduce((s, i) => s + (i.units || 0), 0);
  const fulfilledTotal = items.reduce((s, i) => s + (fulfilledByBull.get(itemBullKey(i)) || 0), 0);
  const lockedItems = items.filter(lineLocked).length;

  const fulfillLabel = (() => {
    if (saving) return "Fulfilling…";
    if (!hasAnyPulls) return "Fulfill order — fill in pull amounts first";
    if (allMatched) return "Fulfill order";
    const editable = items.filter((it) => !lineLocked(it));
    const filled = editable.filter((it) => sumPulls(it.id) > 0).length;
    return `Fulfill available (${filled} of ${editable.length} bulls)`;
  })();

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-6 space-y-6 max-w-5xl">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/semen-orders/${order.id}`)} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to order
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Fulfill Order — {customerName}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Order Date: {order.order_date ? format(parseISO(order.order_date), "MMMM d, yyyy") : "—"} · Status: {order.fulfillment_status.replace(/_/g, " ")}
          </p>
          {orderedTotal > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {fulfilledTotal} of {orderedTotal} units already fulfilled
              {lockedItems > 0 && ` · ${lockedItems} bull line(s) locked`}
            </p>
          )}
        </div>

        {/* Destination */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Destination</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={destinationMode} onValueChange={(v) => setDestinationMode(v as "tank" | "pickup")} className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="tank" id="dest-tank" />
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Pack into customer tank</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="pickup" id="dest-pickup" />
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Customer pickup (semen leaves inventory)</span>
              </label>
            </RadioGroup>

            {destinationMode === "tank" && (
              <div className="space-y-1 max-w-md">
                <Label className="text-xs">Destination tank</Label>
                {customerTanks.length === 0 ? (
                  <p className="text-xs text-destructive">
                    {customerName} has no tanks on file. Add one before packing.
                  </p>
                ) : (
                  <Select value={destTankId} onValueChange={setDestTankId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {customerTanks.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.tank_name ? `${t.tank_number} — ${t.tank_name}` : String(t.tank_number)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bull lines */}
        {items.length === 0 ? (
          <Card><CardContent className="py-6 text-sm text-muted-foreground text-center">No items on this order.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {items.map((it) => {
              const status = itemStatus(it);
              const remaining = remainingForItem(it);
              const fulfilled = fulfilledByBull.get(itemBullKey(it)) || 0;
              const locs = inventoryByBull[itemBullKey(it)] || [];
              const sum = sumPulls(it.id);
              const cardBorder =
                status === "matched" ? "border-emerald-500/50" :
                status === "partial" ? "border-amber-500/50" :
                status === "locked" ? "border-border/30" :
                "border-border/40";
              return (
                <Card key={it.id} className={cardBorder + " border"}>
                  <CardContent className="py-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {status === "matched" && <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />}
                        {status === "partial" && <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />}
                        {status === "locked" && <Lock className="h-4 w-4 text-muted-foreground shrink-0" />}
                        {status === "untouched" && <span className="h-5 w-5 rounded-full border-2 border-muted-foreground/40 inline-block shrink-0" />}
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{getBullDisplayLabel(it)}</div>
                          <div className="text-xs text-muted-foreground">
                            {status === "locked"
                              ? `Fulfilled — ${fulfilled} of ${it.units}`
                              : status === "matched"
                                ? `Pulled ${sum} of ${remaining}`
                                : status === "partial"
                                  ? `Pulled ${sum} of ${remaining}`
                                  : `Need ${remaining}`}
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        need {remaining}
                      </Badge>
                    </div>

                    {status === "locked" ? (
                      <p className="text-xs text-muted-foreground italic pl-7">
                        This bull was already fulfilled in a previous fulfillment.
                      </p>
                    ) : !it.bull_catalog_id ? (
                      <p className="text-xs text-muted-foreground italic pl-7">
                        Custom bull (no catalog link) — pull from inventory not supported.
                      </p>
                    ) : locs.length === 0 ? (
                      <p className="text-xs text-destructive pl-7">
                        No company inventory found for this bull.
                      </p>
                    ) : (
                      <div className="space-y-2 pl-7">
                        <Label className="text-xs text-muted-foreground">Pulling from</Label>
                        {locs.map((loc) => {
                          const k = sourceKey(loc);
                          const value = pulls[it.id]?.[k] ?? "";
                          const has = parseInt(value, 10) > 0;
                          return (
                            <div key={k} className={`flex items-center gap-3 text-sm ${has ? "bg-emerald-500/10 rounded-md px-2 py-1" : "px-2 py-1"}`}>
                              <div className="min-w-0 flex-1">
                                <div className="truncate">
                                  {loc.tank_name ? `${loc.tank_number} — ${loc.tank_name}` : String(loc.tank_number)}
                                  {loc.canister && <span className="text-muted-foreground"> · can {loc.canister}</span>}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {loc.units} available
                                  {loc.owner_company_id && (
                                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                                      {ownerLabel(loc.owner_company_id)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="text-muted-foreground">→</span>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                className="h-8 w-20 text-right text-sm"
                                placeholder="0"
                                value={value}
                                onChange={(e) => updatePull(it.id, k, e.target.value.replace(/[^0-9]/g, ""))}
                              />
                            </div>
                          );
                        })}

                        {destinationMode === "tank" && sumPulls(it.id) > 0 && (
                          <div className="flex items-center gap-2 text-xs pt-1">
                            <Label className="text-xs text-muted-foreground">Into canister</Label>
                            <Input
                              type="text"
                              className="h-8 w-24 text-sm"
                              placeholder={destTankCanisters[0] ?? "1"}
                              list={`dest-cans-${it.id}`}
                              value={destCanisters[it.id] ?? ""}
                              onChange={(e) => updateDestCanister(it.id, e.target.value)}
                            />
                            <datalist id={`dest-cans-${it.id}`}>
                              {destTankCanisters.map((c) => (
                                <option key={c} value={c} />
                              ))}
                            </datalist>
                            {destTankCanisters.length > 0 && (
                              <span className="text-muted-foreground">
                                existing: {destTankCanisters.join(", ")}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center justify-end gap-2 pb-4">
          <Button variant="outline" onClick={saveOrderOnly} disabled={saving}>
            Save order only
          </Button>
          <Button onClick={fulfill} disabled={!canFulfill}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {fulfillLabel}
          </Button>
        </div>

        {lastReceipt && (
          <Card className="border-emerald-500/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Packing list ready
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {lastReceipt.length} pull line(s) recorded. Print or download the packing list for the customer.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generatePackingListPdf({
                    customerName,
                    orderDate: order.order_date,
                    fulfilledAt: new Date().toISOString(),
                    destinationTank: destinationMode === "tank"
                      ? customerTanks.find((t) => t.id === destTankId) ?? null
                      : null,
                    isPickup: destinationMode === "pickup",
                    lines: lastReceipt,
                  })}
                >
                  <Printer className="h-4 w-4 mr-1" /> Download PDF
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setLastReceipt(null)}>
                  Done
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {history.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-muted-foreground">Previous fulfillments</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              {history.map((h, idx) => (
                <div key={idx} className="text-xs text-muted-foreground">
                  {format(parseISO(h.fulfilled_at), "MMM d, yyyy h:mm a")} ·
                  {" "}{h.units} units from {h.source_tank_label}
                  {h.source_canister && ` can ${h.source_canister}`}
                  {h.destination_canister && ` → can ${h.destination_canister}`}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
      <AppFooter />
    </div>
  );
};

export default FulfillOrder;
