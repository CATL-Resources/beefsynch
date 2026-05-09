import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, FileDown, Pencil, Trash2, Loader2, Package, Printer } from "lucide-react";
import { OrderPrintSheet } from "@/components/orders/OrderPrintSheet";
import { useOrgRole } from "@/hooks/useOrgRole";
import { FulfillOrderDialog } from "@/components/orders/FulfillOrderDialog";
import NewOrderDialog, { EditOrderData } from "@/components/NewOrderDialog";
import { generateOrderPdf } from "@/lib/generateOrderPdf";
import { getBullDisplayName } from "@/lib/bullDisplay";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import ClickableRegNumber from "@/components/ClickableRegNumber";
import { OrderShipmentReconciliation } from "@/components/inventory/OrderShipmentReconciliation";
import { fulfillmentColors, billingColors } from "@/lib/badgeStyles";
import { InvoiceOrderModal } from "@/components/orders/InvoiceOrderModal";
import { MarkFulfilledModal } from "@/components/orders/MarkFulfilledModal";
import QuickBullEditDialog from "@/components/bulls/QuickBullEditDialog";

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
}

interface ItemRow {
  id: string;
  units: number;
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
  const [packData, setPackData] = useState<any[]>([]);
  const [directSaleTxns, setDirectSaleTxns] = useState<any[]>([]);
  const [supplyItems, setSupplyItems] = useState<any[]>([]);
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

      // Fetch supply items for this order
      const { data: supplyData } = await supabase
        .from("order_supply_items")
        .select("*")
        .eq("semen_order_id", id)
        .order("created_at");
      setSupplyItems(supplyData ?? []);
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

  const markOrderInvoiced = async () => {
    if (!order) return;
    const { error } = await supabase
      .from("semen_orders")
      .update({ invoiced_at: new Date().toISOString(), billing_status: "invoiced" })
      .eq("id", order.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Order marked invoiced" });
    load();
  };

  const revertOrderInvoiced = async () => {
    if (!order) return;
    if (!window.confirm("Are you sure? This will move the order back to the billable queue.")) return;
    const { error } = await supabase
      .from("semen_orders")
      .update({ invoiced_at: null, billing_status: "unbilled" })
      .eq("id", order.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Reverted to unbilled" });
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
      })),
      reconData,
      supplyItems,
    );
    toast({ title: "PDF downloaded" });
  };

  const totalUnits = items.reduce((s, i) => s + (i.units || 0), 0);

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
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/receive-shipment?order=${id}`)}
            >
              <Package className="h-4 w-4 mr-1" /> Receive Shipment
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPdf}>
              <FileDown className="h-4 w-4 mr-1" /> Export PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" /> Print Bill
            </Button>
            {!["fulfilled", "cancelled"].includes(order.fulfillment_status) && (
              <Button
                size="sm"
                disabled={items.length === 0}
                title={
                  items.length === 0
                    ? "Add items before fulfilling"
                    : (order as any).order_status === "not_ordered"
                      ? "This order has not been placed yet — fulfilling will record a direct sale"
                      : undefined
                }
                variant={(order as any).order_status === "not_ordered" ? "outline" : "default"}
                onClick={() => navigate(`/semen-orders/${order.id}/fulfill`)}
              >
                <Package className="h-4 w-4 mr-1" /> Fulfill Order
              </Button>
            )}
            {!["fulfilled", "cancelled"].includes(order.fulfillment_status) ? (
              <>
                <Button variant="outline" size="sm" onClick={openEdit}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit Order
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4 mr-1" /> Delete Order
                    </Button>
                  </AlertDialogTrigger>
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
              </>
            ) : (
              <span className="text-xs text-muted-foreground italic self-center">
                {order.fulfillment_status === "fulfilled" ? "Fulfilled — locked" : "Cancelled — locked"}
              </span>
            )}
          </div>
        </div>

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
            <Badge
              variant="outline"
              className={cn(
                "capitalize text-xs",
                order.order_status === "received"
                  ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                  : order.order_status === "ordered"
                    ? "bg-blue-500/15 text-blue-700 border-blue-500/30"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {order.order_status.replace(/_/g, " ")}
            </Badge>
            <Badge variant="outline" className={cn("capitalize text-xs", fulfillmentColors[order.fulfillment_status] || "")}>
              {order.fulfillment_status.replace(/_/g, " ")}
            </Badge>
            <Badge variant="outline" className={cn("capitalize text-xs", billingColors[order.billing_status] || "")}>
              {order.billing_status}
            </Badge>
            {order.invoice_number && (
              <Badge variant="outline" className="text-xs">
                #{order.invoice_number}
              </Badge>
            )}
            {order.invoiced_at ? (
              <span className="inline-flex items-center gap-2 text-xs text-emerald-600">
                <span>Invoiced {format(parseISO(order.invoiced_at), "MMM d, yyyy")}</span>
                <button
                  type="button"
                  onClick={revertOrderInvoiced}
                  className="text-muted-foreground hover:text-destructive underline"
                >
                  Revert
                </button>
              </span>
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={markOrderInvoiced}>
                Mark Invoiced
              </Button>
            )}
          </div>

          {order.order_type === "customer" && (() => {
            // Compute fulfilled units per bull line from pack data
            const fulfilledByBull = new Map<string, number>();
            for (const link of packData || []) {
              const pack = link.tank_packs;
              if (!pack) continue;
              const returnsByBull = unpackReturnsByBull(pack.tank_unpack_lines || []);
              for (const pl of (pack.tank_pack_lines || [])) {
                const k = pl.bull_catalog_id || pl.bull_name || "";
                if (!k) continue;
                const used = Math.max(0, (pl.units || 0) - (returnsByBull.get(k) || 0));
                fulfilledByBull.set(k, (fulfilledByBull.get(k) || 0) + used);
              }
            }
            // Also count direct sales and withdrawals as fulfilled
            for (const txn of directSaleTxns) {
              const k = txn.bull_catalog_id || txn.custom_bull_name || "";
              const used = Math.abs(txn.units_change || 0);
              fulfilledByBull.set(k, (fulfilledByBull.get(k) || 0) + used);
            }
            const directSaleLines = items.map((it) => {
              const k = it.bull_catalog_id || it.bulls_catalog?.bull_name || it.custom_bull_name || "";
              return {
                bull_catalog_id: it.bull_catalog_id,
                bull_name: getBullDisplayName(it),
                bull_code: it.bulls_catalog?.naab_code || null,
                ordered: it.units || 0,
                fulfilled: fulfilledByBull.get(k) || 0,
              };
            });
            const hasRemaining = directSaleLines.some((l) => l.ordered - l.fulfilled > 0);
            const canDirectSale =
              !["fulfilled", "cancelled"].includes(order.fulfillment_status) &&
              hasRemaining &&
              !!orgId;
            return (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {order.fulfillment_status === "partially_fulfilled" && (
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
                    trigger={<Button size="sm" variant="outline">Mark Fulfilled</Button>}
                    onSuccess={() => load()}
                  />
                )}
                {canDirectSale && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/semen-orders/${order.id}/fulfill`)}
                  >
                    <Package className="h-4 w-4 mr-2" />
                    Fulfill Order
                  </Button>
                )}
                {order.billing_status === "unbilled" &&
                  ["partially_fulfilled", "fulfilled"].includes(
                    order.fulfillment_status,
                  ) && (
                    <InvoiceOrderModal
                      orderId={order.id}
                      customerName={customerName}
                      trigger={<Button size="sm">Invoice</Button>}
                      onSuccess={() => load()}
                    />
                  )}
              </div>
            );
          })()}
        </div>

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
            <div className="flex items-baseline gap-2">
              <span className="text-muted-foreground shrink-0">Invoice</span>
              <span className="font-medium">
                {order.invoice_number ? `#${order.invoice_number}` : "—"}
              </span>
            </div>
            {order.notes && (
              <div className="sm:col-span-2 flex items-baseline gap-2">
                <span className="text-muted-foreground shrink-0">Notes</span>
                <span className="font-medium whitespace-pre-wrap">{order.notes}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bull Summary — unified lifecycle view */}
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

                  const totalUsed = totalPacked - totalReturned;
                  const delivered = totalPacked > 0 ? totalUsed : 0;
                  const outstanding = Math.max(0, ordered - delivered);
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
                          {/* Bills Through badge */}
                          <div className="mt-0.5">
                            {(() => {
                              const invCompany = (item as any).semen_companies;
                              const companyName = invCompany?.name as string | undefined;
                              if (companyName === 'Select Sires') {
                                return <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-[10px] font-medium">Billable · Select</span>;
                              } else if (companyName === 'CATL Resources, PC' || companyName?.includes('CATL')) {
                                return <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium">Billable · CATL</span>;
                              } else if (!item.invoicing_company_id) {
                                return <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 text-[10px] font-medium">Customer Owned</span>;
                              }
                              return null;
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
                          {(() => {
                            const directUnits = directSaleTxns
                              .filter((t) => (t.bull_catalog_id || t.custom_bull_name || "") === bullKey)
                              .reduce((s, t) => s + Math.abs(t.units_change || 0), 0);
                            const fulfilledTotal = Math.max(0, totalPacked - totalReturned) + directUnits;
                            return (
                              <>
                                <span className="font-medium">{fulfilledTotal > 0 ? fulfilledTotal : "—"}</span>
                                {totalReturned > 0 && (
                                  <div className="text-xs text-muted-foreground">({totalPacked} packed · {totalReturned} returned)</div>
                                )}
                                {directUnits > 0 && totalPacked === 0 && (
                                  <div className="text-xs text-muted-foreground">direct sale</div>
                                )}
                              </>
                            );
                          })()}
                        </div>

                        {/* Billed */}
                        <div className="col-span-1 text-center">
                          <span className="sm:hidden text-xs text-muted-foreground mr-1">Billed:</span>
                          {order.billing_status === "invoiced" ? (
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
                          ) : outstanding > 0 && totalPacked > 0 ? (
                            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{outstanding} outstanding</span>
                          ) : availTotal === 0 && totalPacked === 0 ? (
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
                      let totalDelivered = 0;
                      for (const link of (packData || [])) {
                        const pack = link.tank_packs;
                        if (!pack) continue;
                        const returnMap = unpackReturnsByBull(pack.tank_unpack_lines || []);
                        for (const line of (pack.tank_pack_lines || [])) {
                          const k = line.bull_catalog_id || line.bull_name || "";
                          const ret = returnMap.get(k) || 0;
                          totalDelivered += Math.max(0, (line.units || 0) - ret);
                        }
                      }
                      const outstanding = Math.max(0, totalUnits - totalDelivered);
                      if (outstanding === 0 && totalUnits > 0) return <span className="text-emerald-600 dark:text-emerald-400">✓ All filled</span>;
                      if (outstanding > 0 && totalDelivered > 0) return <span className="text-amber-600 dark:text-amber-400">{outstanding} outstanding</span>;
                      return "—";
                    })()}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Supplies card */}
        {supplyItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Supplies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supplyItems.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.product_name}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-muted-foreground">{item.unit_label || "—"}</TableCell>
                        <TableCell className="text-right">${(Number(item.unit_price) || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">
                          ${(Number(item.line_total) || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/20 font-bold">
                      <TableCell colSpan={4} className="text-right">
                        Supplies Total
                      </TableCell>
                      <TableCell className="text-right">
                        ${supplyItems.reduce((s: number, i: any) => s + (Number(i.line_total) || 0), 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reconciliation card only applies to inventory orders (POs from semen companies).
            Customer orders are filled by packing from existing tank inventory, which is
            already shown in the "Packed for this Order" card above. */}
        {id && order?.order_type === "inventory" && <OrderShipmentReconciliation orderId={id} />}
      </div>

      {/* Print-only billing sheet. Hidden on screen, revealed by window.print() via @media print rules in index.css. */}
      <OrderPrintSheet
        order={order}
        items={items}
        customerName={customerName}
        fulfilledByBull={(() => {
          const m = new Map<string, number>();
          for (const link of packData || []) {
            const pack = link.tank_packs;
            if (!pack) continue;
            const returnsByBull = unpackReturnsByBull(pack.tank_unpack_lines || []);
            for (const pl of (pack.tank_pack_lines || [])) {
              const k = pl.bull_catalog_id || pl.bull_name || "";
              if (!k) continue;
              const used = Math.max(0, (pl.units || 0) - (returnsByBull.get(k) || 0));
              m.set(k, (m.get(k) || 0) + used);
            }
          }
          for (const txn of directSaleTxns) {
            const k = txn.bull_catalog_id || txn.custom_bull_name || "";
            const used = Math.abs(txn.units_change || 0);
            m.set(k, (m.get(k) || 0) + used);
          }
          return m;
        })()}
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
      <AppFooter />
    </div>
  );
};

export default SemenOrderDetail;
