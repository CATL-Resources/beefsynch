import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, FileDown, Pencil, Trash2, Loader2, Package, Printer, MoreVertical, XCircle, CheckCircle2 } from "lucide-react";
import { OrderPrintSheet } from "@/components/orders/OrderPrintSheet";
import { useOrgRole } from "@/hooks/useOrgRole";
import { FulfillOrderDialog } from "@/components/orders/FulfillOrderDialog";
import NewOrderDialog, { EditOrderData } from "@/components/NewOrderDialog";
import { generateOrderPdf } from "@/lib/generateOrderPdf";
import { getBullDisplayName } from "@/lib/bullDisplay";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import ClickableRegNumber from "@/components/ClickableRegNumber";
import { MarkFulfilledModal } from "@/components/orders/MarkFulfilledModal";
import QuickBullEditDialog from "@/components/bulls/QuickBullEditDialog";
import ReceiveDialog from "@/components/orders/ReceiveDialog";
import ProductOrderItemsSection from "@/components/orders/ProductOrderItemsSection";
import PackOrderDialog from "@/components/orders/PackOrderDialog";

interface OrderRow {
  id: string;
  customer_id: string | null;
  order_date: string | null;
  order_status: "not_ordered" | "ordered" | "received";
  fulfillment_status: string;
  billing_status: string;
  project_id: string | null;
  semen_company_id: string | null;
  notes: string | null;
  placed_by: string | null;
  order_type: string;
  invoice_number: string | null;
  invoiced_at: string | null;
  manually_closed_at: string | null;
  manually_closed_by: string | null;
  manually_closed_reason: string | null;
  customers: { name: string; phone: string | null; email: string | null } | null;
  invoicing_company_id: string | null;
  semen_companies_invoicing?: { name: string } | null;
  customer_request_date?: string | null;
  needed_by?: string | null;
  expected_ship_date?: string | null;
  expected_arrival_date?: string | null;
}

function OrderDateField({
  label, value, onSave, warnIfSoon,
}: {
  label: string;
  value: string | null | undefined;
  onSave: (d: Date | null) => void;
  warnIfSoon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? parseISO(value) : null;
  const isSoon = warnIfSoon && value
    ? differenceInCalendarDays(parseISO(value), new Date()) <= 3
    : false;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "text-sm hover:underline tabular-nums",
              date
                ? isSoon ? "font-semibold text-destructive" : "font-medium text-foreground"
                : "text-muted-foreground italic",
            )}
          >
            {date ? format(date, date.getFullYear() === new Date().getFullYear() ? "MMM d" : "MMM d, yyyy") : "—"}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={date ?? undefined}
            onSelect={(d) => { setOpen(false); onSave(d ?? null); }}
            className="p-3 pointer-events-auto"
          />
          {date && (
            <div className="px-3 pb-3">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs w-full"
                onClick={() => { setOpen(false); onSave(null); }}
              >
                Clear
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function InvoiceNumberInput({
  initial,
  onSave,
}: {
  initial: string | null;
  onSave: (raw: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(initial ?? "");
  useEffect(() => { setValue(initial ?? ""); }, [initial]);
  const commit = () => {
    if ((value.trim() || null) !== (initial ?? null)) {
      onSave(value);
    }
  };
  return (
    <Input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder="e.g., INV-1042"
      className="h-8 w-48 text-sm"
    />
  );
}

interface ItemRow {
  id: string;
  units: number;
  units_received: number;
  item_status: string;
  custom_bull_name: string | null;
  bull_catalog_id: string | null;
  invoicing_company_id: string | null;
  bulls_catalog: {
    bull_name: string;
    company: string;
    registration_number: string;
    naab_code: string | null;
    breed: string;
  } | null;
  semen_companies?: { name: string } | null;
}

interface ProjectRef {
  id: string;
  name: string;
}

// Given an array of unpack lines for a pack, return a map of
// "bull key" → total units_returned. Bull key is catalog_id if present,
// otherwise bull_name (to catch custom bulls).
function unpackReturnsByBull(unpackLines: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const ul of (unpackLines || [])) {
    const key = ul.bull_catalog_id || ul.bull_name || "";
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (ul.units_returned || 0));
  }
  return map;
}

const SemenOrderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgId } = useOrgRole();
  
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [project, setProject] = useState<ProjectRef | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editBullId, setEditBullId] = useState<string | null>(null);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [closingOrder, setClosingOrder] = useState(false);
  const [cancellingItemId, setCancellingItemId] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [packDialogOpen, setPackDialogOpen] = useState(false);
  const [markFulfilledOpen, setMarkFulfilledOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [packData, setPackData] = useState<any[]>([]);
  const [directSaleTxns, setDirectSaleTxns] = useState<any[]>([]);
  const [supplyItems, setSupplyItems] = useState<any[]>([]);
  const [receiveLines, setReceiveLines] = useState<any[]>([]);
  const [billableByBull, setBillableByBull] = useState<Map<string, number>>(new Map());
  const [availability, setAvailability] = useState<
    Record<string, { total: number; locations: Array<{ tank: string; canister: string; units: number; owner: string }> }>
  >({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [oRes, iRes] = await Promise.all([
        supabase.from("semen_orders").select("*, customers!semen_orders_customer_id_fkey(name, phone, email), semen_companies_invoicing:semen_companies!semen_orders_invoicing_company_id_fkey(name)").eq("id", id).single(),
        supabase
          .from("semen_order_items")
          .select("*, bulls_catalog(bull_name, company, registration_number, naab_code, breed), semen_companies!semen_order_items_invoicing_company_id_fkey(name)")
          .eq("semen_order_id", id),
      ]);

      if (oRes.error) {
        console.error("Order load error:", oRes.error);
        toast({ title: "Error loading order", description: oRes.error.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      if (oRes.data) {
        setOrder(oRes.data as unknown as OrderRow);
        if (oRes.data.project_id) {
          const { data: pData } = await supabase
            .from("projects")
            .select("id, name")
            .eq("id", oRes.data.project_id)
            .single();
          if (pData) setProject(pData as ProjectRef);
        }
        if (oRes.data.semen_company_id) {
          const { data: cData } = await supabase
            .from("semen_companies")
            .select("name")
            .eq("id", oRes.data.semen_company_id)
            .single();
          if (cData) setCompanyName(cData.name);
        } else {
          setCompanyName(null);
        }
      }
      if (iRes.data) setItems(iRes.data as unknown as ItemRow[]);

      // Fetch linked packs (for customer orders filled from inventory)
      const { data: packLinks } = await supabase
        .from("tank_pack_orders")
        .select(`
          tank_pack_id,
          tank_packs(
            id, status, pack_type, packed_at, field_tank_id,
            tanks!tank_packs_field_tank_id_fkey(tank_number, tank_name),
            tank_pack_lines(bull_name, bull_code, bull_catalog_id, units, source_tank_id, source_canister, field_canister,
              tanks!tank_pack_lines_source_tank_id_fkey(tank_number, tank_name)
            ),
            tank_unpack_lines(bull_name, bull_code, bull_catalog_id, units_returned, destination_canister, destination_tank_id,
              tanks!tank_unpack_lines_destination_tank_id_fkey(tank_number, tank_name)
            )
          )
        `)
        .eq("semen_order_id", id);
      setPackData(packLinks || []);

      // Fetch direct sale / withdrawal transactions linked to this order
      const { data: directTxns } = await supabase
        .from("inventory_transactions")
        .select("bull_catalog_id, custom_bull_name, units_change, transaction_type")
        .eq("order_id", id)
        .in("transaction_type", ["direct_sale", "withdrawal"]);
      setDirectSaleTxns(directTxns || []);

      // Fetch product/supply items for this order (new product_order_items table)
      const { data: supplyData } = await supabase
        .from("product_order_items")
        .select("*")
        .eq("semen_order_id", id)
        .order("created_at");
      setSupplyItems(supplyData ?? []);

      // Fetch received-into-tank transactions for "Where it went" column
      const { data: rxLines } = await supabase
        .from("inventory_transactions")
        .select(`
          id, units_change, created_at,
          bull_catalog_id, bull_code, custom_bull_name,
          tanks(tank_number, tank_name),
          tank_inventory!inventory_transactions_inventory_item_id_fkey(canister, sub_canister)
        `)
        .eq("order_id", id)
        .eq("transaction_type", "received")
        .order("created_at", { ascending: true });
      setReceiveLines((rxLines as any[]) ?? []);

      // Authoritative fulfilled/billable counts per bull (covers pack lines,
      // direct sales, customer pickups, withdrawals, reinventory adjustments).
      const { data: billableRows, error: billableErr } = await supabase.rpc(
        "get_billable_units_for_order",
        { _order_id: id },
      );
      if (billableErr) {
        console.error("get_billable_units_for_order error:", billableErr);
        setBillableByBull(new Map());
      } else {
        const m = new Map<string, number>();
        for (const r of (billableRows ?? []) as Array<{ bull_catalog_id: string | null; bull_name: string | null; units: number }>) {
          const k = r.bull_catalog_id ?? r.bull_name ?? "";
          if (!k) continue;
          m.set(k, (m.get(k) ?? 0) + (r.units ?? 0));
        }
        setBillableByBull(m);
      }
    } catch (err: any) {
      console.error("Order detail load failed:", err);
      toast({ title: "Error loading order", description: err?.message || "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  // Fetch availability-in-inventory for each bull on the order
  useEffect(() => {
    if (!items || items.length === 0) return;
    setAvailabilityLoading(true);
    (async () => {
      try {
        const catalogIds = items.filter((i) => i.bull_catalog_id).map((i) => i.bull_catalog_id as string);
        const customNames = items
          .filter((i) => !i.bull_catalog_id && i.custom_bull_name)
          .map((i) => i.custom_bull_name as string);

        const orFilters: string[] = [];
        if (catalogIds.length > 0) orFilters.push(`bull_catalog_id.in.(${catalogIds.join(",")})`);
        if (customNames.length > 0) {
          const safeNames = customNames.map((n) => `"${n.replace(/"/g, "")}"`).join(",");
          orFilters.push(`custom_bull_name.in.(${safeNames})`);
        }
        if (orFilters.length === 0) {
          setAvailability({});
          return;
        }

        const { data, error } = await supabase
          .from("tank_inventory")
          .select("bull_catalog_id, custom_bull_name, canister, units, owner, storage_type, tanks!tank_inventory_tank_id_fkey(tank_name, tank_number)")
          .is("customer_id", null)
          .gt("units", 0)
          .or(orFilters.join(","));

        if (error) throw error;

        const mapByKey: Record<string, { total: number; locations: Array<{ tank: string; canister: string; units: number; owner: string }> }> = {};
        for (const row of (data || []) as any[]) {
          const key = row.bull_catalog_id || `custom:${row.custom_bull_name}`;
          if (!mapByKey[key]) mapByKey[key] = { total: 0, locations: [] };
          mapByKey[key].total += row.units;
          mapByKey[key].locations.push({
            tank: row.tanks?.tank_name || row.tanks?.tank_number || "—",
            canister: row.canister || "?",
            units: row.units,
            owner: row.owner,
          });
        }

        const byItemId: Record<string, { total: number; locations: Array<{ tank: string; canister: string; units: number; owner: string }> }> = {};
        for (const item of items) {
          const key = item.bull_catalog_id || `custom:${item.custom_bull_name}`;
          byItemId[item.id] = mapByKey[key] || { total: 0, locations: [] };
        }
        setAvailability(byItemId);
      } catch (err) {
        console.error("Failed to load inventory availability", err);
        setAvailability({});
      } finally {
        setAvailabilityLoading(false);
      }
    })();
  }, [items]);

  const openEdit = () => {
    if (!order) return;
    setEditOpen(true);
  };

  const handleDeleteOrder = async () => {
    if (!id) return;
    setDeletingOrder(true);
    try {
      const { error } = await supabase.from("semen_orders").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Order deleted" });
      navigate("/inventory-dashboard?tab=orders");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingOrder(false);
    }
  };

  // Setting an invoice number flips fulfillment_status to "invoiced" and
  // stamps invoiced_at via a DB trigger. Clearing it reverts both.
  const saveInvoiceNumber = async (raw: string) => {
    if (!order) return;
    const next = raw.trim() ? raw.trim() : null;
    if ((next ?? null) === (order.invoice_number ?? null)) return;
    const { error } = await supabase
      .from("semen_orders")
      .update({ invoice_number: next })
      .eq("id", order.id);
    if (error) {
      toast({ title: "Could not save invoice #", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: next ? `Invoice saved (#${next})` : "Invoice number cleared" });
    load();
  };



  const saveOrderDate = async (
    field: "customer_request_date" | "needed_by" | "order_date" | "expected_ship_date" | "expected_arrival_date",
    value: Date | null,
  ) => {
    if (!order) return;
    const next = value ? format(value, "yyyy-MM-dd") : null;
    const { error } = await supabase
      .from("semen_orders")
      .update({ [field]: next })
      .eq("id", order.id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved" });
    load();
  };

  const getEditData = (): EditOrderData | null => {
    if (!order) return null;
    return {
      id: order.id,
      customer_id: order.customer_id,
      order_date: order.order_date,
      order_status: order.order_status,
      fulfillment_status: order.fulfillment_status,
      billing_status: order.billing_status,
      project_id: order.project_id,
      semen_company_id: order.semen_company_id,
      notes: order.notes,
      placed_by: order.placed_by,
      order_type: order.order_type,
      inventory_owner: (order as any).inventory_owner ?? null,
      needed_by: (order as any).needed_by ?? null,
      customer_request_date: (order as any).customer_request_date ?? null,
      bulls: items.map((i) => ({
        name: i.bulls_catalog?.bull_name || i.custom_bull_name || "",
        catalogId: i.bull_catalog_id,
        naabCode: i.bulls_catalog?.naab_code ?? null,
        units: i.units,
      })),
    };
  };

  const customerName = order?.customers?.name || "—";

  const handleExportPdf = () => {
    if (!order) return;

    const totalOrdered = items.reduce((s, i) => s + (i.units || 0), 0);

    let reconData: {
      type: "packed";
      lines: { bull_name: string; bull_code: string | null; units: number; source: string }[];
      totalOrdered: number;
      totalFulfilled: number;
    } | null = null;

    if (order.order_type === "customer" && packData && packData.length > 0) {
      const lines: { bull_name: string; bull_code: string | null; units: number; source: string }[] = [];
      for (const link of packData) {
        const pack = link.tank_packs;
        if (!pack) continue;
        const returnsByBull = unpackReturnsByBull(pack.tank_unpack_lines || []);
        for (const line of (pack.tank_pack_lines || [])) {
          const srcTank = line.tanks;
          const key = line.bull_catalog_id || line.bull_name || "";
          const returned = returnsByBull.get(key) || 0;
          const used = Math.max(0, (line.units || 0) - returned);
          lines.push({
            bull_name: line.bull_name,
            bull_code: line.bull_code || null,
            units: used,
            source: srcTank ? `${srcTank.tank_number}${srcTank.tank_name ? " — " + srcTank.tank_name : ""}` : "—",
          });
        }
      }
      reconData = {
        type: "packed",
        lines,
        totalOrdered,
        totalFulfilled: lines.reduce((s, l) => s + l.units, 0),
      };
    }

    generateOrderPdf(
      {
        customer_name: customerName,
        order_date: order.order_date,
        fulfillment_status: order.fulfillment_status,
        billing_status: order.billing_status,
        notes: order.notes,
        project_name: project?.name || null,
      },
      items.map((item: any) => ({
        ...item,
        bills_through: item.semen_companies?.name || null,
        fulfilled: billableByBull.get(item.bull_catalog_id || item.custom_bull_name || "") ?? 0,
      })),
      reconData,
      supplyItems,
    );
    toast({ title: "PDF downloaded" });
  };

  const totalUnits = items.reduce((s, i) => s + (i.units || 0), 0);
  const isInventory = order?.order_type === "inventory";
  const hasOpenItems = items.some(
    (i) => i.item_status === "pending" || i.item_status === "partially_received",
  );

  // Group received transactions by bull so the Order Items table can show
  // "Where it went" inline per line. Key by catalog id when present, otherwise
  // by lowercased bull name, matching the OrderShipmentReconciliation logic
  // we replaced.
  const bullKey = (catalogId: string | null, name: string | null) =>
    catalogId ? `cat:${catalogId}` : `name:${(name || "").toLowerCase().trim()}`;
  const receivesByBull = new Map<string, typeof receiveLines>();
  for (const r of receiveLines) {
    const k = bullKey(r.bull_catalog_id, r.custom_bull_name || r.bull_code);
    if (!receivesByBull.has(k)) receivesByBull.set(k, []);
    receivesByBull.get(k)!.push(r);
  }

  const handleCloseOrder = async () => {
    if (!order) return;
    setClosingOrder(true);
    try {
      const openIds = items
        .filter((i) => i.item_status === "pending" || i.item_status === "partially_received")
        .map((i) => i.id);
      if (openIds.length > 0) {
        const { error: itemErr } = await supabase
          .from("semen_order_items")
          .update({ item_status: "cancelled" })
          .in("id", openIds);
        if (itemErr) throw itemErr;
      }
      const { data: userData } = await supabase.auth.getUser();
      const { error: orderErr } = await supabase
        .from("semen_orders")
        .update({
          manually_closed_at: new Date().toISOString(),
          manually_closed_by: userData.user?.id ?? null,
          manually_closed_reason: "Closed from order detail",
        })
        .eq("id", order.id);
      if (orderErr) throw orderErr;
      toast({ title: "Order closed" });
      load();
    } catch (err: any) {
      toast({ title: "Close failed", description: err.message ?? String(err), variant: "destructive" });
    } finally {
      setClosingOrder(false);
    }
  };

  const handleCancelItem = async (itemId: string) => {
    setCancellingItemId(itemId);
    try {
      const { error } = await supabase
        .from("semen_order_items")
        .update({ item_status: "cancelled" })
        .eq("id", itemId);
      if (error) throw error;
      toast({ title: "Line cancelled" });
      load();
    } catch (err: any) {
      toast({ title: "Cancel failed", description: err.message ?? String(err), variant: "destructive" });
    } finally {
      setCancellingItemId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
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
      <div className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
        {/* Top actions */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            {isInventory && !["fulfilled", "cancelled"].includes(order.fulfillment_status) && (
              <Button
                size="sm"
                disabled={!hasOpenItems}
                onClick={() => setReceiveOpen(true)}
              >
                <Package className="h-4 w-4 mr-1" /> Receive Shipment
              </Button>
            )}
            {["fulfilled", "cancelled"].includes(order.fulfillment_status) && (
              <span className="text-xs text-muted-foreground italic self-center">
                {order.fulfillment_status === "fulfilled" ? "Fulfilled — locked" : "Cancelled — locked"}
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {((order as any).status ?? "open") === "open" && (
                  <DropdownMenuItem onClick={() => setMarkFulfilledOpen(true)}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Mark Fulfilled
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleExportPdf}>
                  <FileDown className="h-4 w-4 mr-2" /> Export PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-2" /> Print Bill
                </DropdownMenuItem>
                {isInventory && hasOpenItems && ((order as any).status ?? "open") === "open" && (
                  <DropdownMenuItem
                    onClick={() => setCloseConfirmOpen(true)}
                    disabled={closingOrder}
                  >
                    <XCircle className="h-4 w-4 mr-2" /> Close Order
                  </DropdownMenuItem>
                )}
                {((order as any).status ?? "open") === "open" && (
                  <>
                    <DropdownMenuItem onClick={openEdit}>
                      <Pencil className="h-4 w-4 mr-2" /> Edit Order
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setDeleteConfirmOpen(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete Order
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Close Order confirmation */}
        <AlertDialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Close this order?</AlertDialogTitle>
              <AlertDialogDescription>
                All remaining pending or partially received lines will be cancelled.
                Units already received will not be affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  await handleCloseOrder();
                  setCloseConfirmOpen(false);
                }}
                disabled={closingOrder}
              >
                {closingOrder && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Close Order
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Order confirmation */}
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Order</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the order for {customerName}. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteOrder}
                disabled={deletingOrder}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletingOrder && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold font-display tracking-tight">{customerName}</h1>
            {order.order_type === "inventory" && (
              <Badge variant="outline" className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">
                Inventory Order
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Order Date: {order.order_date ? format(parseISO(order.order_date), "MMMM d, yyyy") : "—"}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {(() => {
              const s = (order as any).status ?? "open";
              const map: Record<string, { label: string; className: string }> = {
                open:      { label: "Open",      className: "bg-destructive/20 text-destructive border-destructive/30" },
                fulfilled: { label: "Fulfilled", className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
                invoiced:  { label: "Invoiced",  className: "bg-purple-500/20 text-purple-300 border-purple-500/40" },
                cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" },
              };
              const pill = map[s] ?? map.open;
              return (
                <Badge variant="outline" className={cn("text-xs", pill.className)}>
                  {pill.label}
                </Badge>
              );
            })()}
            {order.order_type === "customer" && ((order as any).status ?? "open") === "open" && (
              <Button
                size="sm"
                onClick={() => setPackDialogOpen(true)}
              >
                <Package className="h-4 w-4 mr-2" />
                Pack Order
              </Button>
            )}
          </div>
          {!isInventory && order.invoice_number && (
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2">
              <span>
                Invoice #{order.invoice_number}
                {order.invoiced_at && <> · {format(parseISO(order.invoiced_at), "MMM d, yyyy")}</>}
              </span>
              {order.fulfillment_status === "invoiced" && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Clear the invoice number? The order will revert to Fulfilled.")) {
                      saveInvoiceNumber("");
                    }
                  }}
                  className="text-xs text-muted-foreground hover:text-destructive underline"
                >
                  Revert
                </button>
              )}
            </p>
          )}

        </div>

        {/* Dates timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dates</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <OrderDateField
              label="Requested"
              value={order.customer_request_date}
              onSave={(d) => saveOrderDate("customer_request_date", d)}
            />
            <OrderDateField
              label="Needed by"
              value={order.needed_by}
              onSave={(d) => saveOrderDate("needed_by", d)}
              warnIfSoon
            />
            <OrderDateField
              label="Ordered"
              value={order.order_date}
              onSave={(d) => saveOrderDate("order_date", d)}
            />
            <OrderDateField
              label="Shipped"
              value={order.expected_ship_date}
              onSave={(d) => saveOrderDate("expected_ship_date", d)}
            />
            <OrderDateField
              label="Arrives"
              value={order.expected_arrival_date}
              onSave={(d) => saveOrderDate("expected_arrival_date", d)}
            />
          </CardContent>
        </Card>

        {/* Details card — compact inline labels */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Order Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-muted-foreground shrink-0">Customer</span>
              <span className="font-medium truncate">
                {order.customer_id ? (
                  <Link to={`/customers/${order.customer_id}`} className="text-primary hover:underline">
                    {customerName}
                  </Link>
                ) : customerName}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-muted-foreground shrink-0">Phone</span>
              <span className="font-medium">{order.customers?.phone || "—"}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-muted-foreground shrink-0">Email</span>
              <span className="font-medium truncate">{order.customers?.email || "—"}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-muted-foreground shrink-0">Order Date</span>
              <span className="font-medium">{order.order_date ? format(parseISO(order.order_date), "MMMM d, yyyy") : "—"}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-muted-foreground shrink-0">Placed By</span>
              <span className="font-medium">{order.placed_by || "—"}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-muted-foreground shrink-0">Semen Company</span>
              <span className="font-medium">{companyName || "—"}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-muted-foreground shrink-0">Bills Through</span>
              <span className="font-medium">
                {order.invoicing_company_id
                  ? (order.semen_companies_invoicing?.name || "—")
                  : items.some((i: any) => i.invoicing_company_id) ? "Mixed" : "—"}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-muted-foreground shrink-0">Project</span>
              <span className="font-medium">
                {project ? (
                  <Link to={`/project/${project.id}`} className="text-primary hover:underline">
                    {project.name}
                  </Link>
                ) : "—"}
              </span>
            </div>
            {!isInventory && (
              <div className="flex items-baseline gap-2 sm:col-span-2">
                <span className="text-muted-foreground shrink-0">Invoice #</span>
                <InvoiceNumberInput
                  initial={order.invoice_number}
                  onSave={saveInvoiceNumber}
                />
                {order.invoiced_at && (
                  <span className="text-xs text-emerald-600 shrink-0">
                    Invoiced {format(parseISO(order.invoiced_at), "MMM d, yyyy")}
                  </span>
                )}
              </div>
            )}
            {order.notes && (
              <div className="sm:col-span-2 flex items-baseline gap-2">
                <span className="text-muted-foreground shrink-0">Notes</span>
                <span className="font-medium whitespace-pre-wrap">{order.notes}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inventory order — per-item receive/cancel table */}
        {isInventory && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Items</CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No bulls added to this order.</p>
              ) : (
                <div className="rounded-lg border border-border/50 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead>Bull</TableHead>
                        <TableHead>NAAB</TableHead>
                        <TableHead className="text-right">Ordered</TableHead>
                        <TableHead className="text-right">Received</TableHead>
                        <TableHead>Where it went</TableHead>
                        <TableHead className="w-32"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => {
                        const ordered = item.units || 0;
                        const received = item.units_received || 0;
                        const pending = Math.max(0, ordered - received);
                        const status = item.item_status || "pending";
                        const isCancelled = status === "cancelled";
                        const canCancel = status === "pending" || status === "partially_received";
                        const receivedClass =
                          received === 0
                            ? "text-muted-foreground"
                            : received < ordered
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-emerald-600 dark:text-emerald-400";
                        const lines = receivesByBull.get(bullKey(item.bull_catalog_id, item.custom_bull_name)) ?? [];
                        return (
                          <TableRow key={item.id} className={isCancelled ? "opacity-50" : ""}>
                            <TableCell className="font-medium">
                              {getBullDisplayName(item)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {item.bulls_catalog?.naab_code ?? "—"}
                            </TableCell>
                            <TableCell className="text-right">{ordered}</TableCell>
                            <TableCell className={cn("text-right font-medium", receivedClass)}>{received}</TableCell>
                            <TableCell className="text-xs">
                              {lines.length === 0 ? (
                                <span className="text-muted-foreground italic">Nothing received yet</span>
                              ) : (
                                <div className="space-y-0.5">
                                  {lines.map((l) => {
                                    const tank = l.tanks?.tank_name || (l.tanks?.tank_number ? `Tank #${l.tanks.tank_number}` : null);
                                    const can = l.tank_inventory?.canister
                                      ? `can ${l.tank_inventory.canister}${l.tank_inventory.sub_canister ? `-${l.tank_inventory.sub_canister}` : ""}`
                                      : null;
                                    return (
                                      <div key={l.id} className="text-muted-foreground">
                                        {tank ? <span className="text-foreground">{tank}</span> : <span>(deleted tank)</span>}
                                        {can && <span> / {can}</span>}
                                        <span> — {l.units_change}u</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {canCancel && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs text-destructive hover:text-destructive"
                                      disabled={cancellingItemId === item.id}
                                    >
                                      Cancel Line
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Cancel this line?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Cancel remaining {pending} unit{pending === 1 ? "" : "s"} of {getBullDisplayName(item)}?
                                        {received > 0 && ` Units already received (${received}) will not be affected.`}
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Keep</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleCancelItem(item.id)}>
                                        Cancel Line
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Bull Summary — unified lifecycle view (customer orders) */}
        {!isInventory && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bull Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {items.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No bulls added to this order.</p>
            ) : (
              <>
                {/* Column headers */}
                <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/40">
                  <div className="col-span-3">Bull</div>
                  <div className="col-span-2 text-right">Ordered</div>
                  <div className="col-span-2 text-right">On Hand</div>
                  <div className="col-span-2 text-right">Fulfilled</div>
                  <div className="col-span-1 text-center">Billed</div>
                  <div className="col-span-2 text-right">Status</div>
                </div>

                {items.map((item) => {
                  const avail = availability[item.id];
                  const availTotal = avail?.total ?? 0;
                  const ordered = item.units ?? 0;

                  // Compute packed & used for this bull across all linked packs
                  const bullKey = item.bull_catalog_id || item.custom_bull_name || "";
                  let totalPacked = 0;
                  let totalReturned = 0;
                  const packDetails: Array<{
                    tankName: string;
                    sourceTank: string;
                    fieldCanister: string;
                    packed: number;
                    returned: number;
                    used: number;
                    packedAt: string;
                    status: string;
                  }> = [];

                  for (const link of (packData || [])) {
                    const pack = link.tank_packs;
                    if (!pack) continue;
                    const fieldTank = pack.tanks;
                    const returnMap = unpackReturnsByBull(pack.tank_unpack_lines || []);

                    for (const line of (pack.tank_pack_lines || [])) {
                      const lineKey = line.bull_catalog_id || line.bull_name || "";
                      if (lineKey !== bullKey) continue;

                      const linePacked = line.units || 0;
                      const lineReturned = returnMap.get(lineKey) || 0;
                      const lineUsed = Math.max(0, linePacked - lineReturned);

                      totalPacked += linePacked;
                      totalReturned += lineReturned;

                      const srcTank = line.tanks;
                      packDetails.push({
                        tankName: fieldTank ? `${fieldTank.tank_number}${fieldTank.tank_name ? ` — ${fieldTank.tank_name}` : ""}` : "Unknown",
                        sourceTank: srcTank ? `${srcTank.tank_number}${srcTank.tank_name ? ` — ${srcTank.tank_name}` : ""}` : "—",
                        fieldCanister: line.field_canister || "—",
                        packed: linePacked,
                        returned: lineReturned,
                        used: lineUsed,
                        packedAt: pack.packed_at ? format(new Date(pack.packed_at), "MMM d, yyyy") : "",
                        status: pack.status || "",
                      });
                    }
                  }

                  // Fulfilled is sourced from get_billable_units_for_order — covers
                  // pack lines, direct sales, customer pickups, withdrawals, and
                  // reinventory adjustments. The pack-line totals above are kept
                  // only for the expandable pack-record breakdown below.
                  const fulfilledUnits = billableByBull.get(bullKey) ?? 0;
                  const outstanding = Math.max(0, ordered - fulfilledUnits);
                  const isFullyFilled = outstanding === 0 && ordered > 0;

                  return (
                    <div key={item.id} className="rounded-lg border border-border/30 bg-card/30">
                      {/* Main row */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 px-3 py-3 items-start">
                        {/* Bull info */}
                        <div className="col-span-3">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-sm">
                              {getBullDisplayName(item)}
                            </span>
                            {item.bull_catalog_id && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditBullId(item.bull_catalog_id); }}
                                className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
                                title="Edit bull info"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          {item.bulls_catalog?.naab_code && (
                            <div className="text-xs text-muted-foreground">{item.bulls_catalog.naab_code}</div>
                          )}
                          {item.bulls_catalog?.company && (
                            <div className="text-xs text-muted-foreground">{item.bulls_catalog.company}</div>
                          )}
                          {item.bulls_catalog?.registration_number && (
                            <div className="text-xs">
                              <ClickableRegNumber
                                registrationNumber={item.bulls_catalog.registration_number}
                                breed={item.bulls_catalog.breed}
                              />
                            </div>
                          )}
                          {/* Bills Through badge — driven entirely by
                              invoicing_company_id on the order item (set by a
                              DB trigger). NULL means "Needs Review", not
                              "Customer Owned" — customer-owned semen never
                              flows through the order system. */}
                          <div className="mt-0.5">
                            {(() => {
                              if (!item.invoicing_company_id) {
                                return <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium">Needs Review</span>;
                              }
                              const companyName = (item as any).semen_companies?.name as string | undefined;
                              if (companyName?.includes("Select")) {
                                return <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 text-[10px] font-medium">Billable · Select</span>;
                              }
                              if (companyName?.includes("CATL")) {
                                return <span className="inline-flex items-center rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-2 py-0.5 text-[10px] font-medium">Billable · CATL</span>;
                              }
                              return <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 text-[10px] font-medium">Billable · {companyName ?? "Unknown"}</span>;
                            })()}
                          </div>
                        </div>

                        {/* Ordered */}
                        <div className="col-span-2 text-right">
                          <span className="sm:hidden text-xs text-muted-foreground mr-1">Ordered:</span>
                          <span className="font-medium">{ordered}</span>
                        </div>

                        {/* On Hand */}
                        <div className="col-span-2 text-right">
                          <span className="sm:hidden text-xs text-muted-foreground mr-1">On Hand:</span>
                          {availabilityLoading ? (
                            <span className="text-xs text-muted-foreground">...</span>
                          ) : (
                            <span className={cn(
                              "font-medium",
                              availTotal === 0 ? "text-destructive" : availTotal >= ordered ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                            )}>
                              {availTotal}
                            </span>
                          )}
                        </div>

                        {/* Fulfilled */}
                        <div className="col-span-2 text-right">
                          <span className="sm:hidden text-xs text-muted-foreground mr-1">Fulfilled:</span>
                          <span className="font-medium">{fulfilledUnits > 0 ? fulfilledUnits : "—"}</span>
                          {totalReturned > 0 && (
                            <div className="text-xs text-muted-foreground">({totalPacked} packed · {totalReturned} returned)</div>
                          )}
                        </div>

                        {/* Billed */}
                        <div className="col-span-1 text-center">
                          <span className="sm:hidden text-xs text-muted-foreground mr-1">Billed:</span>
                          {order.fulfillment_status === "invoiced" || order.billing_status === "invoiced" ? (
                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">✓</span>
                          ) : order.invoice_number ? (
                            <span className="text-xs text-muted-foreground">#{order.invoice_number}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>

                        {/* Status */}
                        <div className="col-span-2 text-right">
                          {isFullyFilled ? (
                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ Filled</span>
                          ) : outstanding > 0 && fulfilledUnits > 0 ? (
                            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{outstanding} outstanding</span>
                          ) : availTotal === 0 && fulfilledUnits === 0 ? (
                            <span className="text-xs font-medium text-destructive">Not in stock</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>

                      {/* On-hand location details (expandable) */}
                      {!availabilityLoading && avail && avail.locations.length > 0 && (
                        <details className="px-3 pb-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            {avail.locations.length} location{avail.locations.length !== 1 ? "s" : ""} in inventory
                          </summary>
                          <div className="mt-1 ml-2 space-y-0.5">
                            {avail.locations.map((loc, idx) => (
                              <div key={idx} className="text-[11px] text-muted-foreground">
                                {loc.tank} / can {loc.canister} — {loc.units}u ({loc.owner})
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {/* Pack details (expandable) */}
                      {packDetails.length > 0 && (
                        <details className="px-3 pb-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            {packDetails.length} pack record{packDetails.length !== 1 ? "s" : ""}
                          </summary>
                          <div className="mt-1 ml-2 space-y-1">
                            {packDetails.map((pd, idx) => (
                              <div key={idx} className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
                                <span>→ {pd.tankName}</span>
                                <span>from {pd.sourceTank}</span>
                                <span>can {pd.fieldCanister}</span>
                                <span className="font-medium text-foreground">{pd.packed}u packed</span>
                                {pd.returned > 0 && <span>{pd.returned}u returned · {pd.used}u used</span>}
                                <span>{pd.packedAt}</span>
                                <Badge variant="outline" className="text-[10px] capitalize h-4">{pd.status}</Badge>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}

                {/* Totals row */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 px-3 py-2 bg-muted/20 rounded-lg font-semibold text-sm mt-2">
                  <div className="col-span-3 text-right">Totals</div>
                  <div className="col-span-2 text-right">{totalUnits}</div>
                  <div className="col-span-2 text-right">
                    {availabilityLoading ? "..." : Object.values(availability).reduce((s, a) => s + a.total, 0)}
                  </div>
                  <div className="col-span-2 text-right">
                    {(() => {
                      let packed = 0;
                      for (const link of (packData || [])) {
                        const pack = link.tank_packs;
                        if (!pack) continue;
                        for (const line of (pack.tank_pack_lines || [])) {
                          packed += line.units || 0;
                        }
                      }
                      return packed > 0 ? packed : "—";
                    })()}
                  </div>
                  <div className="col-span-1"></div>
                  <div className="col-span-2 text-right">
                    {(() => {
                      let totalFulfilled = 0;
                      for (const it of items) {
                        const k = it.bull_catalog_id || it.custom_bull_name || "";
                        totalFulfilled += billableByBull.get(k) ?? 0;
                      }
                      const outstanding = Math.max(0, totalUnits - totalFulfilled);
                      if (outstanding === 0 && totalUnits > 0) return <span className="text-emerald-600 dark:text-emerald-400">✓ All filled</span>;
                      if (outstanding > 0 && totalFulfilled > 0) return <span className="text-amber-600 dark:text-amber-400">{outstanding} outstanding</span>;
                      return "—";
                    })()}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        )}

        {/* Products & supplies */}
        {id && (
          <ProductOrderItemsSection orderId={id} orgId={orgId} />
        )}

      </div>

      {/* Print-only billing sheet. Hidden on screen, revealed by window.print() via @media print rules in index.css. */}
      <OrderPrintSheet
        order={order}
        items={items}
        customerName={customerName}
        fulfilledByBull={billableByBull}
      />

      <NewOrderDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) load();
        }}
        editData={getEditData()}
      />
      {editBullId && (
        <QuickBullEditDialog
          open={!!editBullId}
          onOpenChange={(open) => { if (!open) setEditBullId(null); }}
          bullCatalogId={editBullId}
        />
      )}
      {isInventory && order && id && (
        <ReceiveDialog
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
          orderId={id}
          orderType={order.order_type}
          semenCompanyId={order.semen_company_id}
          semenCompanyName={companyName}
          customerId={order.customer_id}
          items={items.map((i) => ({
            id: i.id,
            units: i.units,
            units_received: i.units_received ?? 0,
            item_status: i.item_status ?? "pending",
            bull_name: getBullDisplayName(i),
            naab_code: i.bulls_catalog?.naab_code ?? null,
            bull_catalog_id: i.bull_catalog_id,
          }))}
          onReceived={() => load()}
        />
      )}
      {order && orgId && (
        <PackOrderDialog
          open={packDialogOpen}
          onOpenChange={setPackDialogOpen}
          orderId={order.id}
          customerName={customerName}
          organizationId={orgId}
          onPackComplete={() => load()}
        />
      )}
      {order && (
        <MarkFulfilledModal
          orderId={order.id}
          customerName={customerName}
          unitsOrdered={items.reduce((s, i) => s + (i.units || 0), 0)}
          unitsFilled={
            packData.reduce((s: number, link: any) => {
              const lines = link.tank_packs?.tank_pack_lines || [];
              return s + lines.reduce((s2: number, l: any) => s2 + (l.units || 0), 0);
            }, 0) +
            directSaleTxns.reduce((s: number, txn: any) => s + Math.abs(txn.units_change || 0), 0)
          }
          open={markFulfilledOpen}
          onOpenChange={setMarkFulfilledOpen}
          onSuccess={() => load()}
        />
      )}
      <AppFooter />
    </div>
  );
};

export default SemenOrderDetail;
