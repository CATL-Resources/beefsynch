import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Plus, Trash2, CheckCircle2, AlertTriangle, Info, Loader2, Pencil } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { getBullDisplayLabel } from "@/lib/bullDisplay";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import BullCombobox from "@/components/BullCombobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface OrderItem {
  id: string;
  bull_catalog_id: string | null;
  custom_bull_name: string | null;
  units: number;
  bulls_catalog: {
    bull_name: string;
    naab_code: string | null;
  } | null;
}

interface InventoryLocation {
  tank_id: string;
  tank_number: string | number;
  tank_name: string | null;
  canister: string | null;
  units: number;
  customer_id: string | null;
  customer_name: string | null;
}

interface PullLine {
  key: string;
  bullCatalogId: string | null;
  bullName: string;
  bullCode: string | null;
  sourceTankId: string;
  sourceCanister: string;
  sourceCustomerId: string | null;
  units: string;
  destinationTankId: string;
  billable: boolean;
}

interface ReconciliationItem {
  bullName: string;
  bullCode: string | null;
  ordered: number;
  pulled: number;
}

const FulfillOrder = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgId } = useOrgRole();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [order, setOrder] = useState<{ id: string; customer_id: string | null; customer_name: string; order_date: string | null; fulfillment_status: string } | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  // bullCatalogId (or custom_bull_name) → fulfilled units (from prior direct sales)
  const [fulfilledByBull, setFulfilledByBull] = useState<Map<string, number>>(new Map());

  const [pullLines, setPullLines] = useState<PullLine[]>([]);
  const [inventoryByBull, setInventoryByBull] = useState<Record<string, InventoryLocation[]>>({});
  const [customerTanks, setCustomerTanks] = useState<Array<{ id: string; tank_number: string | number; tank_name: string | null }>>([]);

  const [reconciliation, setReconciliation] = useState<{ matched: ReconciliationItem[]; missing: ReconciliationItem[]; extra: ReconciliationItem[] } | null>(null);
  const [confirmRemoveItemId, setConfirmRemoveItemId] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: o }, { data: i }, { data: txns }] = await Promise.all([
      supabase
        .from("semen_orders")
        .select("id, customer_id, order_date, fulfillment_status, customers!semen_orders_customer_id_fkey(name)")
        .eq("id", id)
        .single(),
      supabase
        .from("semen_order_items")
        .select("id, bull_catalog_id, custom_bull_name, units, bulls_catalog(bull_name, naab_code)")
        .eq("semen_order_id", id),
      supabase
        .from("inventory_transactions")
        .select("bull_catalog_id, custom_bull_name, units_change")
        .eq("semen_order_id", id)
        .eq("transaction_type", "direct_sale"),
    ]);

    if (!o) {
      toast({ title: "Order not found", variant: "destructive" });
      setLoading(false);
      return;
    }

    setOrder({
      id: o.id,
      customer_id: o.customer_id,
      customer_name: (o as any).customers?.name || "Unknown",
      order_date: o.order_date,
      fulfillment_status: o.fulfillment_status,
    });
    setItems((i ?? []) as unknown as OrderItem[]);

    const fb = new Map<string, number>();
    for (const t of txns ?? []) {
      const k = (t as any).bull_catalog_id || (t as any).custom_bull_name || "";
      if (!k) continue;
      fb.set(k, (fb.get(k) || 0) + Math.abs((t as any).units_change || 0));
    }
    setFulfilledByBull(fb);

    if (o.customer_id) {
      const { data: tanks } = await supabase
        .from("tanks")
        .select("id, tank_number, tank_name")
        .eq("customer_id", o.customer_id)
        .order("tank_number");
      setCustomerTanks((tanks ?? []) as Array<{ id: string; tank_number: string | number; tank_name: string | null }>);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  // Fetch inventory for a bull on demand. Cached in inventoryByBull.
  const ensureInventoryFor = async (bullCatalogId: string | null, bullName: string) => {
    const key = bullCatalogId || `name:${bullName}`;
    if (inventoryByBull[key]) return inventoryByBull[key];
    if (!orgId) return [];

    let q = supabase
      .from("tank_inventory")
      .select("tank_id, canister, units, customer_id, tanks!tank_inventory_tank_id_fkey(tank_number, tank_name), customers!tank_inventory_customer_id_fkey(name)")
      .eq("organization_id", orgId)
      .gt("units", 0);
    if (bullCatalogId) q = q.eq("bull_catalog_id", bullCatalogId);
    else q = q.eq("custom_bull_name", bullName);

    const { data } = await q;
    const locs: InventoryLocation[] = (data ?? []).map((row: any) => ({
      tank_id: row.tank_id,
      tank_number: row.tanks?.tank_number ?? "?",
      tank_name: row.tanks?.tank_name ?? null,
      canister: row.canister,
      units: row.units,
      customer_id: row.customer_id,
      customer_name: row.customers?.name ?? null,
    }));
    setInventoryByBull((prev) => ({ ...prev, [key]: locs }));
    return locs;
  };

  // ─── Pull line management ────────────────────────────────────────
  const addPullLine = () => {
    setPullLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        bullCatalogId: null,
        bullName: "",
        bullCode: null,
        sourceTankId: "",
        sourceCanister: "",
        sourceCustomerId: null,
        units: "",
        destinationTankId: "",
        billable: true,
      },
    ]);
  };

  const removePullLine = (key: string) => {
    setPullLines((prev) => prev.filter((l) => l.key !== key));
  };

  const updatePullLine = (key: string, patch: Partial<PullLine>) => {
    setPullLines((prev) => prev.map((l) => l.key === key ? { ...l, ...patch } : l));
  };

  const handleBullSelect = async (key: string, name: string, catalogId: string | null, naabCode?: string | null) => {
    updatePullLine(key, {
      bullCatalogId: catalogId,
      bullName: name,
      bullCode: naabCode ?? null,
      sourceTankId: "",
      sourceCanister: "",
      sourceCustomerId: null,
      units: "",
    });
    if (name || catalogId) await ensureInventoryFor(catalogId, name);
  };

  const handleSourceSelect = (key: string, locKey: string) => {
    const line = pullLines.find((l) => l.key === key);
    if (!line) return;
    const invKey = line.bullCatalogId || `name:${line.bullName}`;
    const locs = inventoryByBull[invKey] || [];
    const [tankId, canister] = locKey.split("|");
    const loc = locs.find((l) => l.tank_id === tankId && (l.canister || "") === (canister || ""));
    if (!loc) return;
    const billable = !loc.customer_id; // company stock = billable, customer-owned = not
    updatePullLine(key, {
      sourceTankId: loc.tank_id,
      sourceCanister: loc.canister || "",
      sourceCustomerId: loc.customer_id,
      billable,
    });
  };

  // ─── Order item management (Section 1) ──────────────────────────
  const handleEditItemUnits = async (itemId: string, newUnits: number) => {
    const { error } = await supabase
      .from("semen_order_items")
      .update({ units: newUnits })
      .eq("id", itemId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, units: newUnits } : it));
    toast({ title: "Order item updated" });
  };

  const handleRemoveItem = async (itemId: string) => {
    setConfirmRemoveItemId(null);
    const { error } = await supabase.from("semen_order_items").delete().eq("id", itemId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== itemId));
    toast({ title: "Item removed" });
  };

  const handleAddItem = async () => {
    if (!order) return;
    const { data, error } = await supabase
      .from("semen_order_items")
      .insert({ semen_order_id: order.id, bull_catalog_id: null, custom_bull_name: "", units: 0 })
      .select("id, bull_catalog_id, custom_bull_name, units, bulls_catalog(bull_name, naab_code)")
      .single();
    if (error || !data) {
      toast({ title: "Error", description: error?.message ?? "Could not add item", variant: "destructive" });
      return;
    }
    setItems((prev) => [...prev, data as unknown as OrderItem]);
  };

  const handleEditItemBull = async (itemId: string, name: string, catalogId: string | null) => {
    const update = catalogId
      ? { bull_catalog_id: catalogId, custom_bull_name: null }
      : { bull_catalog_id: null, custom_bull_name: name };
    const { error } = await supabase
      .from("semen_order_items")
      .update(update)
      .eq("id", itemId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    // Re-fetch to refresh the joined bulls_catalog row
    await load();
  };

  // ─── Submit ──────────────────────────────────────────────────────
  const canSubmit = pullLines.length > 0 && pullLines.every((l) =>
    l.sourceTankId && parseInt(l.units) > 0
  );

  const handleSubmit = async () => {
    if (!order) return;
    setSaving(true);

    const successPulls: { bullCatalogId: string | null; bullName: string; bullCode: string | null; units: number }[] = [];
    let errorCount = 0;

    for (const line of pullLines) {
      const units = parseInt(line.units);
      if (!line.sourceTankId || !units || units <= 0) continue;

      const { error } = await supabase.rpc("record_direct_sale", {
        _input: {
          order_id: order.id,
          source_tank_id: line.sourceTankId,
          units,
          bull_catalog_id: line.bullCatalogId || null,
          bull_code: line.bullCode || null,
          bull_name: line.bullName || null,
          source_canister: line.sourceCanister || null,
          is_billable: line.billable,
          notes: "Fulfilled via Pull Ticket",
          destination_tank_id: line.destinationTankId || null,
        },
      });

      if (error) {
        errorCount++;
        toast({
          title: `Error: ${line.bullName}`,
          description: error.message,
          variant: "destructive",
        });
      } else {
        successPulls.push({
          bullCatalogId: line.bullCatalogId,
          bullName: line.bullName,
          bullCode: line.bullCode,
          units,
        });
      }
    }

    setSaving(false);

    if (successPulls.length === 0) {
      return; // Nothing succeeded; user can fix and retry.
    }

    // Build reconciliation. Compare the order items to actual pulls + prior fulfilled.
    await load();
    const pulledByKey = new Map<string, number>();
    for (const p of successPulls) {
      const k = p.bullCatalogId || p.bullName;
      pulledByKey.set(k, (pulledByKey.get(k) || 0) + p.units);
    }

    // Re-read the latest fulfilledByBull (after reload)
    const { data: txns } = await supabase
      .from("inventory_transactions")
      .select("bull_catalog_id, custom_bull_name, units_change")
      .eq("semen_order_id", order.id)
      .eq("transaction_type", "direct_sale");
    const totalPulledByKey = new Map<string, number>();
    for (const t of txns ?? []) {
      const k = (t as any).bull_catalog_id || (t as any).custom_bull_name || "";
      if (!k) continue;
      totalPulledByKey.set(k, (totalPulledByKey.get(k) || 0) + Math.abs((t as any).units_change || 0));
    }

    const matched: ReconciliationItem[] = [];
    const missing: ReconciliationItem[] = [];
    const orderKeys = new Set<string>();
    for (const it of items) {
      const k = it.bull_catalog_id || it.custom_bull_name || "";
      orderKeys.add(k);
      const pulled = totalPulledByKey.get(k) || 0;
      const recItem: ReconciliationItem = {
        bullName: it.bulls_catalog?.bull_name || it.custom_bull_name || "Unknown",
        bullCode: it.bulls_catalog?.naab_code || null,
        ordered: it.units,
        pulled,
      };
      if (pulled >= it.units) matched.push(recItem);
      else missing.push(recItem);
    }
    const extra: ReconciliationItem[] = [];
    for (const [k, units] of totalPulledByKey.entries()) {
      if (orderKeys.has(k)) continue;
      const fromPulls = successPulls.find((p) => (p.bullCatalogId || p.bullName) === k);
      extra.push({
        bullName: fromPulls?.bullName || "Unknown bull",
        bullCode: fromPulls?.bullCode || null,
        ordered: 0,
        pulled: units,
      });
    }

    setReconciliation({ matched, missing, extra });
    setPullLines([]);
    if (errorCount === 0) {
      toast({ title: `${successPulls.length} pull line(s) processed` });
    }
  };

  // ─── Render ──────────────────────────────────────────────────────
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
          <h1 className="text-2xl font-bold font-display tracking-tight">Fulfill Order — {order.customer_name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Order Date: {order.order_date ? format(parseISO(order.order_date), "MMMM d, yyyy") : "—"} · Status: {order.fulfillment_status.replace(/_/g, " ")}
          </p>
        </div>

        {/* SECTION 1 — Order reference */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Order reference</CardTitle>
            <Button variant="outline" size="sm" onClick={handleAddItem}>
              <Plus className="h-4 w-4 mr-1" /> Add item
            </Button>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items on this order.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bull</TableHead>
                    <TableHead className="text-right w-32">Ordered</TableHead>
                    <TableHead className="text-right w-32">Fulfilled</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => {
                    const k = it.bull_catalog_id || it.custom_bull_name || "";
                    const fulfilled = fulfilledByBull.get(k) || 0;
                    const status = fulfilled >= it.units && it.units > 0
                      ? "fulfilled"
                      : fulfilled > 0
                        ? "partial"
                        : "pending";
                    return (
                      <TableRow key={it.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{getBullDisplayLabel(it)}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            className="h-7 w-20 text-right text-sm ml-auto"
                            defaultValue={it.units}
                            onBlur={(e) => {
                              const v = parseInt(e.target.value) || 0;
                              if (v !== it.units) handleEditItemUnits(it.id, v);
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {fulfilled}
                        </TableCell>
                        <TableCell>
                          {status === "fulfilled" && (
                            <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Fulfilled
                            </Badge>
                          )}
                          {status === "partial" && (
                            <Badge variant="outline" className="text-xs">
                              {fulfilled} of {it.units}
                            </Badge>
                          )}
                          {status === "pending" && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              Pending
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setConfirmRemoveItemId(it.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* SECTION 2 — Pull ticket */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Pull ticket</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Add a line for each tank pull. Lines process independently; if one fails, the others still go through.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={addPullLine}>
              <Plus className="h-4 w-4 mr-1" /> Add pull line
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {pullLines.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No pull lines yet. Click "Add pull line" to record what's actually being pulled.
              </p>
            ) : (
              pullLines.map((line) => {
                const invKey = line.bullCatalogId || `name:${line.bullName}`;
                const locations = inventoryByBull[invKey] || [];
                const orderItem = items.find((it) =>
                  (it.bull_catalog_id && it.bull_catalog_id === line.bullCatalogId) ||
                  (!it.bull_catalog_id && it.custom_bull_name === line.bullName)
                );
                const orderedUnits = orderItem?.units ?? null;
                const fulfilledForThis = orderItem ? (fulfilledByBull.get(orderItem.bull_catalog_id || orderItem.custom_bull_name || "") || 0) : 0;
                const selectedLocKey = line.sourceTankId ? `${line.sourceTankId}|${line.sourceCanister || ""}` : "";
                const selectedLoc = locations.find((l) => l.tank_id === line.sourceTankId && (l.canister || "") === (line.sourceCanister || ""));
                const otherCustomerWarning = !!(selectedLoc?.customer_id && order.customer_id && selectedLoc.customer_id !== order.customer_id);

                return (
                  <div key={line.key} className="border border-border/40 rounded-lg p-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Bull</Label>
                          <BullCombobox
                            value={line.bullName}
                            catalogId={line.bullCatalogId}
                            onChange={(n, c, code) => handleBullSelect(line.key, n, c, code)}
                          />
                          {(line.bullName || line.bullCatalogId) && (
                            <div className="text-xs text-muted-foreground">
                              {orderedUnits != null
                                ? <>Order calls for {orderedUnits} · {fulfilledForThis} of {orderedUnits} fulfilled so far</>
                                : <>Not on this order — will be added as an extra pull</>
                              }
                            </div>
                          )}
                        </div>

                        {(line.bullName || line.bullCatalogId) && (
                          <div className="space-y-1">
                            <Label className="text-xs">Source tank</Label>
                            {locations.length === 0 ? (
                              <p className="text-xs text-destructive">No inventory found for this bull.</p>
                            ) : (
                              <Select value={selectedLocKey} onValueChange={(v) => handleSourceSelect(line.key, v)}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select source location" />
                                </SelectTrigger>
                                <SelectContent>
                                  {locations.map((loc) => {
                                    const otherCust = !!(loc.customer_id && order.customer_id && loc.customer_id !== order.customer_id);
                                    const lk = `${loc.tank_id}|${loc.canister || ""}`;
                                    const tankLabel = loc.tank_name ? `${loc.tank_number} — ${loc.tank_name}` : String(loc.tank_number);
                                    const ownerLabel = loc.customer_id
                                      ? (loc.customer_id === order.customer_id ? "this customer" : loc.customer_name || "different customer")
                                      : "company";
                                    return (
                                      <SelectItem key={lk} value={lk} disabled={otherCust}>
                                        {tankLabel}{loc.canister ? ` · can ${loc.canister}` : ""} — {loc.units}u ({ownerLabel}{otherCust ? " — locked" : ""})
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            )}
                            {otherCustomerWarning && (
                              <p className="text-xs text-destructive">
                                This tank belongs to a different customer. Pick another source.
                              </p>
                            )}
                          </div>
                        )}

                        {line.sourceTankId && (
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                            <div className="sm:col-span-3 space-y-1">
                              <Label className="text-xs">Units</Label>
                              <Input
                                type="number"
                                min={1}
                                value={line.units}
                                placeholder={selectedLoc ? `${selectedLoc.units} available` : ""}
                                onChange={(e) => updatePullLine(line.key, { units: e.target.value })}
                              />
                            </div>
                            <div className="sm:col-span-6 space-y-1">
                              <Label className="text-xs">Destination tank (optional)</Label>
                              <Select
                                value={line.destinationTankId || "none"}
                                onValueChange={(v) => updatePullLine(line.key, { destinationTankId: v === "none" ? "" : v })}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="None — don't track destination" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None — don't track destination</SelectItem>
                                  {customerTanks.map((t) => (
                                    <SelectItem key={t.id} value={t.id}>
                                      {t.tank_name ? `${t.tank_number} — ${t.tank_name}` : String(t.tank_number)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="sm:col-span-3 flex items-center gap-2 pb-2">
                              <Checkbox
                                id={`bill-${line.key}`}
                                checked={line.billable}
                                onCheckedChange={(c) => updatePullLine(line.key, { billable: !!c })}
                              />
                              <Label htmlFor={`bill-${line.key}`} className="text-xs cursor-pointer">
                                Billable
                              </Label>
                            </div>
                          </div>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                        onClick={() => removePullLine(line.key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => navigate(`/semen-orders/${order.id}`)}>
            Done
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !canSubmit}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Complete fulfillment
          </Button>
        </div>

        {reconciliation && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Reconciliation summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {reconciliation.matched.map((r, i) => (
                <div key={`m-${i}`} className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Matched: {r.bullName}{r.bullCode ? ` (${r.bullCode})` : ""} — ordered {r.ordered}, pulled {r.pulled}
                </div>
              ))}
              {reconciliation.missing.map((r, i) => (
                <div key={`x-${i}`} className="flex items-center gap-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  Not pulled: {r.bullName}{r.bullCode ? ` (${r.bullCode})` : ""} — ordered {r.ordered}, pulled {r.pulled}
                </div>
              ))}
              {reconciliation.extra.map((r, i) => (
                <div key={`e-${i}`} className="flex items-center gap-2 text-sm text-blue-700">
                  <Info className="h-4 w-4" />
                  Extra: {r.bullName}{r.bullCode ? ` (${r.bullCode})` : ""} — not on order, pulled {r.pulled}
                </div>
              ))}
              {reconciliation.matched.length === 0 && reconciliation.missing.length === 0 && reconciliation.extra.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing pulled.</p>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      <AlertDialog open={!!confirmRemoveItemId} onOpenChange={(o) => !o && setConfirmRemoveItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this item from the order?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the line from the order. Any units already pulled stay deducted from inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRemoveItemId && handleRemoveItem(confirmRemoveItemId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AppFooter />
    </div>
  );
};

export default FulfillOrder;
