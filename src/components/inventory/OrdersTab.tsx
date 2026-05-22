import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isAfter, isBefore, differenceInCalendarDays } from "date-fns";
import {
  Search, Plus, CalendarIcon, Package, DollarSign, Clock, ShoppingCart, ClipboardList, ChevronDown, ChevronRight,
} from "lucide-react";

import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import NewOrderDialog, { EditOrderData } from "@/components/NewOrderDialog";
import PackOrderDialog from "@/components/orders/PackOrderDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOrgRole } from "@/hooks/useOrgRole";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
// Unified status pill — Open (red, needs work), Fulfilled (green, billable),
// Invoiced (purple, done), Cancelled (gray).
const unifiedStatusBadge = (status: string): { label: string; className: string } => {
  switch (status) {
    case "fulfilled": return { label: "Fulfilled", className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" };
    case "invoiced":  return { label: "Invoiced",  className: "bg-purple-500/20 text-purple-300 border-purple-500/40" };
    case "cancelled": return { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" };
    default:          return { label: "Open",      className: "bg-destructive/20 text-destructive border-destructive/30" };
  }
};
import { getBullDisplayName, getBullDisplayLabel } from "@/lib/bullDisplay";
import ReceivingTab from "@/components/inventory/ReceivingTab";

type ChipFilter = "all" | "open" | "fulfilled" | "invoiced";
type Tier = "open" | "fulfilled" | "invoiced";

const formatCompactDate = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = parseISO(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return format(d, sameYear ? "MMM d" : "MMM d, yyyy");
};

const isNeededBySoon = (iso: string | null | undefined) => {
  if (!iso) return false;
  const days = differenceInCalendarDays(parseISO(iso), new Date());
  return days <= 3;
};

const classify = (o: any): Tier | "cancelled" | null => {
  const s = o.status ?? "open";
  if (s === "cancelled") return "cancelled";
  if (s === "invoiced") return "invoiced";
  if (s === "fulfilled") return "fulfilled";
  return "open";
};

const OrdersTab = ({ orgId }: { orgId: string }) => {
  const navigate = useNavigate();
  const { role } = useOrgRole();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<EditOrderData | null>(null);
  const [search, setSearch] = useState("");
  const [chipFilter, setChipFilter] = useState<ChipFilter>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [subTab, setSubTab] = useState<"customer" | "inventory" | "shipments">("customer");
  const [newOrderDefaultType, setNewOrderDefaultType] = useState<"customer" | "inventory">("customer");
  const [tier3Open, setTier3Open] = useState(false);
  const [packingOrder, setPackingOrder] = useState<{ id: string; customerName: string | null } | null>(null);

  useEffect(() => {
    setSearch("");
    setChipFilter("all");
    setOrderStatusFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  }, [subTab]);

  // The "Mark as Ordered" / "Mark as Received" actions were removed when
  // order_status/fulfillment_status were collapsed into a single lifecycle.
  // Whether semen is in stock is now a question the inventory indicator
  // answers, not a status the user maintains.

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["semen_orders", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("semen_orders")
        .select("*, customers!semen_orders_customer_id_fkey(id, name), semen_companies!semen_orders_semen_company_id_fkey(name), semen_order_items(id, units, custom_bull_name, bull_catalog_id, bulls_catalog(bull_name)), product_order_items(id, quantity, product_name)")
        .eq("organization_id", orgId)
        .order("order_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: receivedOrderIds = [] } = useQuery({
    queryKey: ["received_order_ids", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipments")
        .select("semen_order_id")
        .eq("organization_id", orgId)
        .eq("status", "confirmed")
        .not("semen_order_id", "is", null);
      if (error) throw error;
      return [...new Set((data ?? []).map((r: any) => r.semen_order_id))];
    },
  });

  const receivedSet = useMemo(() => new Set(receivedOrderIds), [receivedOrderIds]);

  const { data: rawOnHand = [] } = useQuery({
    queryKey: ["orders_on_hand", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const PAGE = 1000;
      let from = 0;
      const all: any[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("tank_inventory")
          .select("bull_catalog_id, units")
          .eq("organization_id", orgId)
          .is("customer_id", null)
          .gt("units", 0)
          .not("bull_catalog_id", "is", null)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = data ?? [];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
  });

  const onHandMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rawOnHand) {
      if (!r.bull_catalog_id) continue;
      map.set(r.bull_catalog_id, (map.get(r.bull_catalog_id) || 0) + (r.units || 0));
    }
    return map;
  }, [rawOnHand]);

  const { data: onOrderMap = new Map<string, number>() } = useQuery({
    queryKey: ["orders_incoming", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: lineItems, error: lineErr } = await supabase
        .from("semen_order_items")
        .select("bull_catalog_id, units, semen_order_id, semen_orders!inner(order_type, fulfillment_status)")
        .not("bull_catalog_id", "is", null);
      if (lineErr) throw lineErr;

      const { data: receivedTxns, error: txnErr } = await supabase
        .from("inventory_transactions")
        .select("order_id, bull_catalog_id, units_change")
        .eq("transaction_type", "received")
        .not("order_id", "is", null)
        .not("bull_catalog_id", "is", null);
      if (txnErr) throw txnErr;

      const receivedMap = new Map<string, number>();
      for (const t of receivedTxns ?? []) {
        const key = `${t.order_id}|${t.bull_catalog_id}`;
        receivedMap.set(key, (receivedMap.get(key) || 0) + Math.abs(t.units_change));
      }

      const result = new Map<string, number>();
      for (const item of lineItems ?? []) {
        const so = (item as any).semen_orders;
        if (so?.order_type !== "inventory") continue;
        if (!["pending", "partially_fulfilled", "partially_filled"].includes(so?.fulfillment_status)) continue;
        const received = receivedMap.get(`${item.semen_order_id}|${item.bull_catalog_id}`) || 0;
        const outstanding = Math.max((item.units || 0) - received, 0);
        if (outstanding > 0) {
          result.set(item.bull_catalog_id, (result.get(item.bull_catalog_id) || 0) + outstanding);
        }
      }
      return result;
    },
  });

  const customerOrders = useMemo(
    () => orders.filter((o: any) => o.order_type === "customer"),
    [orders]
  );
  const inventoryOrders = useMemo(
    () => orders.filter((o: any) => o.order_type === "inventory"),
    [orders]
  );

  const scopedOrders = subTab === "customer" ? customerOrders : inventoryOrders;

  // Apply search + date filters (chip filter handled separately for tier rendering)
  const baseFiltered = useMemo(() => {
    const filtered = scopedOrders.filter((o: any) => {
      if (search) {
        const q = search.toLowerCase();
        const customerMatch = (o.customers?.name || "").toLowerCase().includes(q);
        const bullMatch = (o.semen_order_items || []).some((item: any) =>
          (item.bulls_catalog?.bull_name || "").toLowerCase().includes(q) ||
          (item.custom_bull_name || "").toLowerCase().includes(q)
        );
        if (!customerMatch && !bullMatch) return false;
      }
      if (o.order_date) {
        if (dateFrom && isBefore(parseISO(o.order_date), dateFrom)) return false;
        if (dateTo && isAfter(parseISO(o.order_date), dateTo)) return false;
      } else if (dateFrom || dateTo) {
        return false;
      }
      return true;
    });

    // Default sort: open first (needs action), then fulfilled, then invoiced,
    // with needed_by ascending breaking ties (soonest first).
    const statusRank = (s: string | null | undefined) =>
      s === "open" || !s ? 0 : s === "fulfilled" ? 1 : s === "invoiced" ? 2 : 3;
    return [...filtered].sort((a: any, b: any) => {
      const sa = statusRank(a.status);
      const sb = statusRank(b.status);
      if (sa !== sb) return sa - sb;
      const an = a.needed_by ? parseISO(a.needed_by).getTime() : Number.POSITIVE_INFINITY;
      const bn = b.needed_by ? parseISO(b.needed_by).getTime() : Number.POSITIVE_INFINITY;
      if (an !== bn) return an - bn;
      const ar = a.customer_request_date
        ? parseISO(a.customer_request_date).getTime()
        : a.created_at ? new Date(a.created_at).getTime() : Number.POSITIVE_INFINITY;
      const br = b.customer_request_date
        ? parseISO(b.customer_request_date).getTime()
        : b.created_at ? new Date(b.created_at).getTime() : Number.POSITIVE_INFINITY;
      return ar - br;
    });
  }, [scopedOrders, search, dateFrom, dateTo]);

  // Group by unified status. Cancelled orders go to their own bucket.
  const grouped = useMemo(() => {
    const tier1: any[] = []; // open
    const tier2: any[] = []; // fulfilled (needs invoice)
    const invoiced: any[] = []; // invoiced
    const tier3: any[] = []; // (kept for backwards-compat layout; unused now)
    const cancelled: any[] = [];
    for (const o of baseFiltered) {
      const t = classify(o);
      if (t === "open") tier1.push(o);
      else if (t === "fulfilled") tier2.push(o);
      else if (t === "invoiced") invoiced.push(o);
      else if (t === "cancelled") cancelled.push(o);
    }
    if (subTab === "inventory") {
      const sortReceived = (arr: any[]) => arr.sort((a: any, b: any) => {
        const aReceived = receivedSet.has(a.id) ? 1 : 0;
        const bReceived = receivedSet.has(b.id) ? 1 : 0;
        return aReceived - bReceived;
      });
      sortReceived(tier1);
      sortReceived(tier2);
    }
    return { tier1, tier2, invoiced, tier3, cancelled };
  }, [baseFiltered, subTab, receivedSet]);

  const totalOrders = scopedOrders.length;
  const totalUnits = useMemo(() => scopedOrders.reduce((sum: number, o: any) =>
    sum + (o.semen_order_items?.reduce((s: number, i: any) => s + (i.units || 0), 0) ?? 0), 0), [scopedOrders]);
  const pendingCount = scopedOrders.filter((o: any) => (o.status ?? "open") === "open").length;
  // Inventory orders are CATL's POs to suppliers — no customer to bill, so
  // they shouldn't count toward the unbilled tally.
  const unbilledCount = scopedOrders.filter((o: any) => o.billing_status === "unbilled" && o.order_type !== "inventory").length;

  const getBullSummary = (items: any[]) => {
    if (!items || items.length === 0) return "—";
    return items.map((i: any) => {
      const name = getBullDisplayName(i);
      return `${name} — ${i.units || 0}`;
    }).join(", ");
  };
  const getOrderUnits = (items: any[]) => items ? items.reduce((s: number, i: any) => s + (i.units || 0), 0) : 0;

  const getShortage = (bullCatalogId: string | null, orderedUnits: number) => {
    if (!bullCatalogId) return 0;
    const onHand = onHandMap.get(bullCatalogId) || 0;
    const incoming = (onOrderMap as Map<string, number>).get(bullCatalogId) || 0;
    const available = onHand + incoming;
    return Math.max(0, orderedUnits - available);
  };

  const renderCard = (order: any) => {
    const customerName = order.customers?.name
      || (order.order_type === "inventory"
        ? (order.placed_by ? `Inventory — ${order.placed_by}` : "Inventory Order")
        : "—");
    const totalUnitsRow = getOrderUnits(order.semen_order_items);
    const items = order.semen_order_items || [];
    const status = order.status ?? "open";
    const isUnfulfilled = status === "open";
    const displayStatus = unifiedStatusBadge(status);
    const neededByLabel = formatCompactDate(order.needed_by);
    const neededBySoon = isNeededBySoon(order.needed_by);
    const requestedLabel = formatCompactDate(order.customer_request_date) ?? formatCompactDate(order.created_at);
    const orderedLabel = formatCompactDate(order.order_date);

    return (
      <div
        key={order.id}
        onClick={() => navigate(`/semen-orders/${order.id}`)}
        className="p-4 space-y-3 hover:bg-secondary/50 transition-colors cursor-pointer active:bg-secondary/70"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground truncate">{customerName}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {order.semen_companies?.name && (
                <span className="text-xs text-muted-foreground">{order.semen_companies.name}</span>
              )}
              <Badge variant="outline" className={cn("text-[10px]", displayStatus.className)}>
                {displayStatus.label}
              </Badge>
              {order.order_type !== "inventory" && order.invoice_number && (
                <span className="text-[10px] text-muted-foreground">
                  #{order.invoice_number}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-muted-foreground">
              {requestedLabel && <span>Requested: <span className="text-foreground/80">{requestedLabel}</span></span>}
              {neededByLabel && (
                <span className={neededBySoon ? "font-semibold text-destructive" : ""}>
                  Needed by: {neededByLabel}
                </span>
              )}
              {orderedLabel && <span>Ordered: <span className="text-foreground/80">{orderedLabel}</span></span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className="text-right">
              <div className="text-lg font-bold tabular-nums leading-none">{totalUnitsRow}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">units</div>
            </div>
            {order.order_type === "customer" && status === "open" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setPackingOrder({ id: order.id, customerName: customerName });
                }}
              >
                <Package className="h-3.5 w-3.5 mr-1" /> Pack
              </Button>
            )}
          </div>
        </div>

        {items.length > 0 && (
          <div className="space-y-1 pl-0.5">
            {items.map((item: any, idx: number) => {
              const bullName = getBullDisplayLabel(item);
              const units = item.units || 0;
              const shortage = isUnfulfilled ? getShortage(item.bull_catalog_id, units) : 0;
              return (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="truncate">
                    {bullName} — <span className="tabular-nums">{units}</span>
                  </span>
                  {shortage > 0 && (
                    <span className="shrink-0 ml-2 text-xs font-medium tabular-nums" style={{ color: "#55BAAA" }}>
                      Short {shortage}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {Array.isArray((order as any).product_order_items) && (order as any).product_order_items.length > 0 && (
          <div className="space-y-0.5 pl-0.5 text-xs text-muted-foreground">
            {(order as any).product_order_items.map((p: any) => (
              <div key={p.id} className="truncate">
                {p.quantity} {p.product_name}
              </div>
            ))}
          </div>
        )}
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground pl-0.5">No items</div>
        )}
      </div>
    );
  };

  const TierSection = ({
    title, rows, defaultOpen, collapsible,
  }: { title: string; rows: any[]; defaultOpen: boolean; collapsible: boolean }) => {
    if (rows.length === 0) return null;
    const isOpen = collapsible ? tier3Open : true;
    return (
      <div className="rounded-lg border border-border/50 overflow-hidden">
        {collapsible ? (
          <button
            onClick={() => setTier3Open(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-semibold text-sm">{title}</span>
              <Badge variant="secondary" className="ml-1 h-5 px-2 text-xs">{rows.length}</Badge>
            </div>
          </button>
        ) : (
          <div className="px-4 py-3 bg-muted/40 flex items-center gap-2">
            <span className="font-semibold text-sm">{title}</span>
            <Badge variant="secondary" className="h-5 px-2 text-xs">{rows.length}</Badge>
          </div>
        )}
        {isOpen && (
          <div className="divide-y divide-border">
            {rows.map(renderCard)}
          </div>
        )}
      </div>
    );
  };

  // Build the list of orders per chip filter
  const flatList = useMemo(() => {
    if (chipFilter === "open") return grouped.tier1;
    if (chipFilter === "fulfilled") return grouped.tier2;
    if (chipFilter === "invoiced") return grouped.invoiced;
    return [];
  }, [chipFilter, grouped]);

  const showTiers = chipFilter === "all";
  // For "All": cancelled rolls into the done tier per spec
  const tier3Rows = chipFilter === "all"
    ? [...grouped.tier3, ...grouped.cancelled]
    : grouped.tier3;

  const noResults =
    (showTiers && grouped.tier1.length === 0 && grouped.tier2.length === 0 && grouped.invoiced.length === 0 && tier3Rows.length === 0)
    || (!showTiers && flatList.length === 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold font-display tracking-tight">Semen Orders</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/planning")}>
            <ClipboardList className="h-4 w-4" /> Planning
          </Button>
          {subTab !== "shipments" && (
            <Button className="gap-2" onClick={() => {
              setEditOrder(null);
              setNewOrderDefaultType(subTab === "inventory" ? "inventory" : "customer");
              setDialogOpen(true);
            }}><Plus className="h-4 w-4" /> New Order</Button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setSubTab("customer")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            subTab === "customer"
              ? "bg-primary text-primary-foreground"
              : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
          )}
        >
          Customer Orders
          <Badge variant="secondary" className="h-5 px-2 text-xs">{customerOrders.length}</Badge>
        </button>
        <button
          onClick={() => setSubTab("inventory")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            subTab === "inventory"
              ? "bg-primary text-primary-foreground"
              : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
          )}
        >
          Inventory Orders
          <Badge variant="secondary" className="h-5 px-2 text-xs">{inventoryOrders.length}</Badge>
        </button>
        <button
          onClick={() => setSubTab("shipments")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            subTab === "shipments"
              ? "bg-primary text-primary-foreground"
              : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
          )}
        >
          Shipments
        </button>
      </div>

      {subTab === "shipments" ? (
        <ReceivingTab orgId={orgId} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total Orders" value={totalOrders} delay={0} index={0} icon={ShoppingCart} />
            <StatCard title="Total Units" value={totalUnits} delay={100} index={1} icon={Package} />
            <StatCard title="Pending / Open" value={pendingCount} delay={200} index={2} icon={Clock} />
            <StatCard title="Unbilled" value={unbilledCount} delay={300} index={3} icon={DollarSign} />
          </div>

          {/* Single status filter row — the three lifecycle stages plus All */}
          <div className="flex flex-wrap gap-2 items-center">
            {([
              { key: "all", label: "All" },
              { key: "open", label: "Open" },
              { key: "fulfilled", label: "Fulfilled" },
              { key: "invoiced", label: "Invoiced" },
            ] as { key: ChipFilter; label: string }[]).map(chip => (
              <button
                key={chip.key}
                onClick={() => setChipFilter(chip.key)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  chipFilter === chip.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Search + date range */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px] max-w-xs relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search customer or bull..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("gap-2 text-sm", !dateFrom && "text-muted-foreground")}><CalendarIcon className="h-4 w-4" />{dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}</Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" /></PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("gap-2 text-sm", !dateTo && "text-muted-foreground")}><CalendarIcon className="h-4 w-4" />{dateTo ? format(dateTo, "MMM d, yyyy") : "To"}</Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" /></PopoverContent>
            </Popover>
            {(search || chipFilter !== "all" || dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setChipFilter("all"); setDateFrom(undefined); setDateTo(undefined); }}>Clear</Button>
            )}
          </div>

          {noResults && !isLoading ? (
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <EmptyState
                icon={ShoppingCart}
                title={scopedOrders.length === 0
                  ? subTab === "customer" ? "No customer orders" : "No inventory orders"
                  : "No results"}
                description={scopedOrders.length === 0
                  ? subTab === "customer"
                    ? "No customer orders to display yet."
                    : "No inventory orders to display yet."
                  : "No orders match your filters. Try adjusting your filters."}
                action={scopedOrders.length === 0
                  ? { label: "Create Order", onClick: () => {
                      setEditOrder(null);
                      setNewOrderDefaultType(subTab === "inventory" ? "inventory" : "customer");
                      setDialogOpen(true);
                    } }
                  : undefined}
              />
            </div>
          ) : showTiers ? (
            <div className="space-y-4">
              <TierSection title="Open" rows={grouped.tier1} defaultOpen collapsible={false} />
              <TierSection title="Fulfilled" rows={grouped.tier2} defaultOpen collapsible={false} />
              <TierSection title="Invoiced" rows={grouped.invoiced} defaultOpen={false} collapsible />
              {grouped.cancelled.length > 0 && (
                <TierSection title="Cancelled" rows={grouped.cancelled} defaultOpen={false} collapsible />
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="divide-y divide-border">
                {flatList.map(renderCard)}
              </div>
            </div>
          )}

          <NewOrderDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            editData={editOrder}
            initialOrderType={newOrderDefaultType}
          />

          {packingOrder && (
            <PackOrderDialog
              open={!!packingOrder}
              onOpenChange={(open) => { if (!open) setPackingOrder(null); }}
              orderId={packingOrder.id}
              customerName={packingOrder.customerName}
              organizationId={orgId}
              onPackComplete={() => {
                setPackingOrder(null);
                queryClient.invalidateQueries({ queryKey: ["semen_orders", orgId] });
              }}
            />
          )}
        </>
      )}
    </div>
  );
};

export default OrdersTab;
