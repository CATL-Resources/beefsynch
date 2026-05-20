import { useState, useMemo, useEffect, Fragment } from "react";
import FindRoomDialog from "./FindRoomDialog";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Search, Archive, Users, Building2, Dna, FileText, FileSpreadsheet, ArrowUpDown,
  Truck, ChevronDown, ChevronUp, MoreHorizontal, Pencil, ClipboardList, Package,
  ArrowUpRight, ArrowDownLeft,
} from "lucide-react";
import QuickBullEditDialog from "@/components/bulls/QuickBullEditDialog";

import StatCard from "@/components/StatCard";
import TableSkeleton from "@/components/TableSkeleton";
import EmptyState from "@/components/EmptyState";
import TankMap from "@/components/inventory/TankMap";
import TransferDialog from "@/components/inventory/TransferDialog";
import { useOrgRole } from "@/hooks/useOrgRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { generateSemenInventoryPdf } from "@/lib/generateSemenInventoryPdf";
import { getBullDisplayName, bullMatchesQuery } from "@/lib/bullDisplay";
import { toast } from "sonner";

// ─── Inventory Tab Constants ───
const STORAGE_BADGES: Record<string, string> = {
  customer: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  communal: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  rental: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  inventory: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

type SortKey = "bull_name" | "breed" | "customer" | "tank" | "units";
type SortDir = "asc" | "desc";

interface InventoryTabProps {
  orgId: string;
  initialOwnerFilter?: "all" | "company" | "customer";
  onFilterReset?: () => void;
}

const InventoryTab = ({ orgId, initialOwnerFilter = "company", onFilterReset }: InventoryTabProps) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { userId } = useOrgRole();
  const [transferRow, setTransferRow] = useState<any>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [storageFilter, setStorageFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState<string>(initialOwnerFilter);
  const [breedFilter, setBreedFilter] = useState<string>("all");
  const [tankFilter, setTankFilter] = useState<string>("all");
  // "available" = company-owned, sellable; "all" = every shelf row including customer-owned.
  // Default to "available" so the dashboard shows what's actually for sale by default.
  const [shelfMode, setShelfMode] = useState<"available" | "all">("available");

  // Keep shelfMode + ownerFilter in sync so the toggle actually changes what
  // the user sees. The standalone ownerFilter dropdown was removed from the
  // UI, so it's driven entirely by the shelfMode toggle + StatCard click-
  // throughs.
  useEffect(() => {
    if (shelfMode === "available") {
      if (!["all", "company", "CATL", "Select"].includes(ownerFilter)) {
        setOwnerFilter("company");
      }
      // "all" doesn't make sense in available mode — snap to company-only.
      if (ownerFilter === "all") {
        setOwnerFilter("company");
      }
    }
    // Toggle says "All inventory" but ownerFilter was sitting on "company"
    // (its default) — flip to "all" so customer-owned rows actually show up.
    if (shelfMode === "all" && ownerFilter === "company") {
      setOwnerFilter("all");
    }
  }, [shelfMode, ownerFilter]);

  useEffect(() => {
    setOwnerFilter(initialOwnerFilter);
  }, [initialOwnerFilter]);
  const [sortKey, setSortKey] = useState<SortKey>("bull_name");
  const [editBullId, setEditBullId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [viewMode, setViewMode] = useState<"detail" | "grouped" | "map">("detail");
  const [editRow, setEditRow] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<{
    targetId: string;
    targetUnits: number;
    targetCanister: string;
    targetSubCanister: string | null;
    bullLabel: string;
  } | null>(null);
  const [merging, setMerging] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Always fetch the full inventory so the StatCards reflect reality regardless of
  // toggle state. The shelfMode toggle is applied client-side in `filtered` below,
  // so it only narrows the visible table — stats stay accurate.
  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ["semen-inventory", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("tank_inventory")
          .select("*, customers!tank_inventory_customer_id_fkey(name), tanks!tank_inventory_tank_id_fkey(tank_name, tank_number), bulls_catalog!tank_inventory_bull_catalog_id_fkey(bull_name, naab_code, breed)")
          .eq("organization_id", orgId!)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = data ?? [];
        allRows.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return allRows;
    },
  });



  const { data: tankOptions = [] } = useQuery({
    queryKey: ["tanks_for_edit", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tanks")
        .select("id, tank_name, tank_number")
        .eq("organization_id", orgId!)
        .order("tank_number");
      return data ?? [];
    },
  });

  const { data: breedOptions = [] } = useQuery({
    queryKey: ["breeds"],
    queryFn: async () => {
      const { data } = await supabase
        .from("breeds")
        .select("name, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      return (data ?? []) as { name: string; sort_order: number }[];
    },
    staleTime: 60 * 60 * 1000,
  });

  const { data: customerOptions = [] } = useQuery({
    queryKey: ["customers_for_edit", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name")
        .eq("organization_id", orgId!)
        .order("name");
      return data ?? [];
    },
  });




  const rows = useMemo(() => inventory.map((item: any) => ({
    id: item.id,
    bullName: getBullDisplayName(item),
    bullCatalogId: item.bull_catalog_id || null,
    _raw: item,
    bullCode: item.bull_code || "—",
    breed: item.bulls_catalog?.breed || "",
    customer: item.customers?.name || (item.customer_id ? "Unknown" : "Company"),
    customerId: item.customer_id,
    tankId: item.tank_id,
    tankName: item.tanks?.tank_name || "—",
    tankNumber: item.tanks?.tank_number || "—",
    canister: item.canister,
    subCanister: item.sub_canister || "—",
    units: item.units || 0,
    storageType: item.storage_type || "customer",
    owner: item.owner || null,
    notes: item.notes || null,
    inventoriedAt: item.inventoried_at,
  })), [inventory]);

  // Active project + order counts per catalog bull. We fetch *all* org rows
  // rather than passing distinct bull_catalog_ids in an .in() clause —
  // PostgREST's URL length cap can't take ~1k UUIDs and the request fails
  // silently. RLS + the org-scoped projects/orders embeds keep the result
  // size sane.
  // Three-category activity summary per catalog bull:
  //  - customerOrders: outbound (order_type=customer)
  //  - inventoryOrders: inbound POs (order_type=inventory) — "incoming"
  //  - projects: bulls allocated to active synchronization projects
  type Activity = {
    customerOrders: Record<string, { count: number; units: number; headCount: number }>;
    inventoryOrders: Record<string, { count: number; unitsPending: number }>;
    projects: Record<string, { count: number; headCount: number; units: number }>;
  };
  const { data: bullActivity = {
    customerOrders: {},
    inventoryOrders: {},
    projects: {},
  } as Activity } = useQuery<Activity>({
    queryKey: ["inventory_bull_activity_v2", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const customerOrders: Activity["customerOrders"] = {};
      const inventoryOrders: Activity["inventoryOrders"] = {};
      const projects: Activity["projects"] = {};
      const [projRes, ordRes] = await Promise.all([
        supabase
          .from("project_bulls")
          .select("bull_catalog_id, units, projects!inner(status, head_count, organization_id)")
          .eq("projects.organization_id", orgId!)
          .not("bull_catalog_id", "is", null),
        supabase
          .from("semen_order_items")
          .select("bull_catalog_id, units, units_received, item_status, semen_orders!inner(order_type, fulfillment_status, organization_id)")
          .eq("semen_orders.organization_id", orgId!)
          .not("bull_catalog_id", "is", null),
      ]);

      for (const r of (projRes.data ?? []) as any[]) {
        const status = r.projects?.status;
        if (status === "Work Complete" || status === "Invoiced") continue;
        const k = r.bull_catalog_id as string;
        const cur = projects[k] ?? { count: 0, headCount: 0, units: 0 };
        cur.count += 1;
        cur.headCount += r.projects?.head_count ?? 0;
        cur.units += r.units ?? 0;
        projects[k] = cur;
      }

      const TERMINAL_ITEM = new Set(["cancelled", "fulfilled", "received"]);
      const TERMINAL_ORDER = new Set(["cancelled", "fulfilled", "delivered"]);
      for (const r of (ordRes.data ?? []) as any[]) {
        if (TERMINAL_ITEM.has(r.item_status)) continue;
        const fs = r.semen_orders?.fulfillment_status;
        if (TERMINAL_ORDER.has(fs)) continue;
        const k = r.bull_catalog_id as string;
        const orderType = r.semen_orders?.order_type;
        if (orderType === "customer") {
          const cur = customerOrders[k] ?? { count: 0, units: 0, headCount: 0 };
          cur.count += 1;
          cur.units += r.units ?? 0;
          customerOrders[k] = cur;
        } else if (orderType === "inventory") {
          const cur = inventoryOrders[k] ?? { count: 0, unitsPending: 0 };
          cur.count += 1;
          cur.unitsPending += Math.max(0, (r.units ?? 0) - (r.units_received ?? 0));
          inventoryOrders[k] = cur;
        }
      }

      return { customerOrders, inventoryOrders, projects };
    },
  });

  // expandedRow: `${rowId}:projects` | `${rowId}:orders` | null
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const expandedBullCatalogId = useMemo(() => {
    if (!expandedRow) return null;
    const [rowId] = expandedRow.split(":");
    return rows.find((r: any) => r.id === rowId)?.bullCatalogId ?? null;
  }, [expandedRow, rows]);

  const { data: bullDetail } = useQuery({
    queryKey: ["inventory_bull_detail", expandedBullCatalogId],
    enabled: !!expandedBullCatalogId,
    queryFn: async () => {
      const id = expandedBullCatalogId!;
      const [projRes, ordRes] = await Promise.all([
        supabase
          .from("project_bulls")
          .select("units, projects!inner(id, name, protocol, head_count, breeding_date, status, customers!projects_customer_id_fkey(name))")
          .eq("bull_catalog_id", id),
        supabase
          .from("semen_order_items")
          .select("units, units_received, item_status, semen_orders!inner(id, order_type, order_date, fulfillment_status, placed_by, semen_company_id, customers!semen_orders_customer_id_fkey(name), semen_companies!semen_orders_semen_company_id_fkey(name))")
          .eq("bull_catalog_id", id),
      ]);
      const projects = (projRes.data ?? []).filter((r: any) => {
        const s = r.projects?.status;
        return s !== "Work Complete" && s !== "Invoiced";
      });
      const TERMINAL_ITEM = new Set(["cancelled", "fulfilled", "received"]);
      const TERMINAL_ORDER = new Set(["cancelled", "fulfilled", "delivered"]);
      const allOpenOrders = (ordRes.data ?? []).filter((r: any) =>
        !TERMINAL_ITEM.has(r.item_status) && !TERMINAL_ORDER.has(r.semen_orders?.fulfillment_status),
      );
      const customerOrders = allOpenOrders.filter((r: any) => r.semen_orders?.order_type === "customer");
      const inventoryOrders = allOpenOrders.filter((r: any) => r.semen_orders?.order_type === "inventory");
      return { projects, customerOrders, inventoryOrders };
    },
  });

  const filtered = useMemo(() => {
    let result = rows;
    // Shelf-mode toggle: "available" hides customer-owned rows in the visible table only.
    // Stats above are computed off the full `rows` set so they always reflect reality.
    if (shelfMode === "available") result = result.filter((r) => !r.customerId);
    if (storageFilter !== "all") result = result.filter((r) => r.storageType === storageFilter);
    if (breedFilter !== "all") result = result.filter((r) => r.breed === breedFilter);
    if (tankFilter !== "all") result = result.filter((r) => r.tankId === tankFilter);
    if (ownerFilter === "company") {
      result = result.filter((r) => !r.customerId);
    } else if (ownerFilter === "customer") {
      result = result.filter((r) => !!r.customerId);
    } else if (ownerFilter !== "all") {
      result = result.filter((r) => r.owner === ownerFilter || r.customer === ownerFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) => {
        if (bullMatchesQuery(r._raw, search)) return true;
        return (
          r.customer.toLowerCase().includes(q) ||
          r.tankName.toLowerCase().includes(q)
        );
      });
    }
    result = [...result].sort((a, b) => {
      let aVal: string | number, bVal: string | number;
      switch (sortKey) {
        case "bull_name": aVal = a.bullName.toLowerCase(); bVal = b.bullName.toLowerCase(); break;
        case "breed": aVal = (a.breed || "").toLowerCase(); bVal = (b.breed || "").toLowerCase(); break;
        case "customer": aVal = a.customer.toLowerCase(); bVal = b.customer.toLowerCase(); break;
        case "tank": aVal = a.tankName.toLowerCase(); bVal = b.tankName.toLowerCase(); break;
        case "units": aVal = a.units; bVal = b.units; break;
        default: aVal = ""; bVal = "";
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [rows, shelfMode, storageFilter, ownerFilter, breedFilter, tankFilter, search, sortKey, sortDir]);

  const groupedByBull = useMemo(() => {
    if (viewMode !== "grouped") return [];
    const map = new Map<string, { bullName: string; bullCode: string; customers: Map<string, { customer: string; totalUnits: number; tanks: string[] }>; totalUnits: number }>();
    for (const row of filtered) {
      const key = row.bullName;
      if (!map.has(key)) map.set(key, { bullName: row.bullName, bullCode: row.bullCode, customers: new Map(), totalUnits: 0 });
      const group = map.get(key)!;
      group.totalUnits += row.units;
      const custKey = row.customer;
      if (!group.customers.has(custKey)) group.customers.set(custKey, { customer: custKey, totalUnits: 0, tanks: [] });
      const custGroup = group.customers.get(custKey)!;
      custGroup.totalUnits += row.units;
      const tankLabel = row.tankName !== "—" ? row.tankName : row.tankNumber;
      if (!custGroup.tanks.includes(tankLabel)) custGroup.tanks.push(tankLabel);
    }
    return Array.from(map.values()).sort((a, b) => a.bullName.localeCompare(b.bullName));
  }, [filtered, viewMode]);

  const totalUnits = rows.reduce((s, r) => s + r.units, 0);
  const customerUnits = rows.filter((r) => r.customerId).reduce((s, r) => s + r.units, 0);
  const companyUnits = rows.filter((r) => !r.customerId).reduce((s, r) => s + r.units, 0);
  const uniqueBulls = new Set(rows.map((r) => r.bullName)).size;
  const filteredTotal = filtered.reduce((s, r) => s + r.units, 0);

  // Distinct customer names for the owner filter dropdown
  const customerOwnerNames = useMemo(() => {
    const names = new Set<string>();
    for (const r of rows) {
      if (r.customerId && r.customer && r.customer !== "Unknown" && r.customer !== "Company") {
        names.add(r.customer);
      }
    }
    return Array.from(names).sort();
  }, [rows]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortHeader = ({ label, sortKeyVal }: { label: string; sortKeyVal: SortKey }) => (
    <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort(sortKeyVal)}>
      {label}
      <ArrowUpDown className={cn("h-3 w-3", sortKey === sortKeyVal ? "text-foreground" : "text-muted-foreground/50")} />
    </button>
  );

  const handleExportPdf = () => generateSemenInventoryPdf(filtered, { storageFilter, ownerFilter, search });

  const openEdit = (row: any) => {
    setEditRow(row);
    setEditForm({
      custom_bull_name: row.bullName || "",
      bull_code: row.bullCode || "",
      tank_id: row.tankId || "",
      customer_id: row.customerId || "",
      canister: row.canister || "",
      sub_canister: row.subCanister === "—" ? "" : row.subCanister || "",
      units: row.units ?? 0,
      storage_type: row.storageType || "inventory",
      owner: row.owner || "",
      notes: row.notes || "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editRow) return;
    setSavingEdit(true);
    try {
      const updates: any = {
        custom_bull_name: editForm.custom_bull_name?.trim() || null,
        bull_code: editForm.bull_code?.trim() || null,
        tank_id: editForm.tank_id || editRow.tankId,
        customer_id: editForm.customer_id || null,
        canister: editForm.canister?.trim() || "1",
        sub_canister: editForm.sub_canister?.trim() || null,
        units: Number(editForm.units) || 0,
        storage_type: editForm.storage_type || null,
        owner: editForm.owner?.trim() || null,
        notes: editForm.notes?.trim() || null,
      };

      // Collision check: is there already a row with the same bull in the same
      // (tank, canister, sub_canister)? If so, we cannot just UPDATE — the unique
      // constraint will reject it. Offer to merge instead.
      const raw = editRow._raw;
      const bullCatalogId = raw?.bull_catalog_id ?? null;
      const customBullName = updates.custom_bull_name;

      let collisionQuery = supabase
        .from("tank_inventory")
        .select("id, units, canister, sub_canister, custom_bull_name, bulls_catalog!tank_inventory_bull_catalog_id_fkey(bull_name)")
        .eq("tank_id", updates.tank_id)
        .eq("canister", updates.canister)
        .neq("id", editRow.id);

      if (updates.sub_canister === null) {
        collisionQuery = collisionQuery.is("sub_canister", null);
      } else {
        collisionQuery = collisionQuery.eq("sub_canister", updates.sub_canister);
      }

      if (bullCatalogId) {
        collisionQuery = collisionQuery.eq("bull_catalog_id", bullCatalogId);
      } else if (customBullName) {
        collisionQuery = collisionQuery.is("bull_catalog_id", null).eq("custom_bull_name", customBullName);
      } else {
        // No bull identity to collide on — proceed with normal update
        const { error } = await supabase.from("tank_inventory").update(updates).eq("id", editRow.id);
        if (error) throw error;
        toast.success("Inventory row updated");
        queryClient.invalidateQueries({ queryKey: ["semen-inventory"] });
        queryClient.invalidateQueries({ queryKey: ["tank_map"] });
        setEditRow(null);
        return;
      }

      const { data: collisions, error: checkErr } = await collisionQuery.limit(1);
      if (checkErr) throw checkErr;

      if (collisions && collisions.length > 0) {
        const target = collisions[0] as any;
        const bullLabel =
          target.bulls_catalog?.bull_name ||
          target.custom_bull_name ||
          editRow.bullName ||
          "this bull";
        setMergeTarget({
          targetId: target.id,
          targetUnits: target.units || 0,
          targetCanister: target.canister,
          targetSubCanister: target.sub_canister,
          bullLabel,
        });
        setPendingUpdates(updates);
        // Leave edit dialog open behind the merge dialog; don't proceed with update
        return;
      }

      // No collision — proceed normally
      const { error } = await supabase
        .from("tank_inventory")
        .update(updates)
        .eq("id", editRow.id);
      if (error) throw error;
      toast.success("Inventory row updated");
      queryClient.invalidateQueries({ queryKey: ["semen-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["tank_map"] });
      setEditRow(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // Execute the merge: add editRow's units into the target row, then delete editRow
  const handleConfirmMerge = async () => {
    if (!mergeTarget || !editRow || !pendingUpdates) return;
    setMerging(true);
    try {
      const newTotal = (mergeTarget.targetUnits || 0) + (pendingUpdates.units || 0);

      const { error: updErr } = await supabase
        .from("tank_inventory")
        .update({ units: newTotal })
        .eq("id", mergeTarget.targetId);
      if (updErr) throw updErr;

      const { error: delErr } = await supabase
        .from("tank_inventory")
        .delete()
        .eq("id", editRow.id);
      if (delErr) throw delErr;

      toast.success(`Merged into canister ${mergeTarget.targetCanister} (${newTotal} units total)`);
      queryClient.invalidateQueries({ queryKey: ["semen-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["tank_map"] });
      setMergeTarget(null);
      setPendingUpdates(null);
      setEditRow(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setMerging(false);
    }
  };

  const handleCancelMerge = () => {
    setMergeTarget(null);
    setPendingUpdates(null);
    // editRow stays open so user can adjust
  };

  const handleDeleteRow = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("tank_inventory").delete().eq("id", id);
      if (error) throw error;
      toast.success("Inventory row deleted");
      queryClient.invalidateQueries({ queryKey: ["semen-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["tank_map"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportCsv = () => {
    if (viewMode === "grouped" && groupedByBull.length > 0) {
      const headers = ["Bull Name", "Bull Code", "Customer", "Tanks", "Units"];
      const csvRows: string[] = [headers.join(",")];
      for (const group of groupedByBull) {
        csvRows.push([`"${group.bullName}"`, `"${group.bullCode}"`, "", "", group.totalUnits].join(","));
        for (const [, cust] of group.customers) {
          csvRows.push(["", "", `"${cust.customer}"`, `"${cust.tanks.join(", ")}"`, cust.totalUnits].join(","));
        }
        csvRows.push("");
      }
      csvRows.push(["", "", "", "TOTAL", filteredTotal].join(","));
      const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `BeefSynch_Semen_Inventory_Grouped_${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } else {
      const headers = ["Bull Name", "Bull Code", "Customer", "Tank", "Tank #", "Canister", "Sub-canister", "Units", "Storage Type", "Owner", "Last Inventoried"];
      const csvRows = [
        headers.join(","),
        ...filtered.map((r) => [
          `"${r.bullName}"`, `"${r.bullCode}"`, `"${r.customer}"`, `"${r.tankName}"`, `"${r.tankNumber}"`,
          `"${r.canister}"`, `"${r.subCanister}"`, r.units, `"${r.storageType}"`, `"${r.owner || ""}"`,
          `"${r.inventoriedAt ? format(new Date(r.inventoriedAt), "yyyy-MM-dd") : ""}"`,
        ].join(","))
      ];
      const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `BeefSynch_Semen_Inventory_${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click(); URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h3 className="text-xl font-bold font-display tracking-tight">Semen Inventory</h3>
        <div className="flex gap-2">
          <FindRoomDialog />
          <Button variant="outline" className="gap-2" onClick={handleExportCsv}><FileSpreadsheet className="h-4 w-4" /> Export CSV</Button>
          <Button variant="outline" className="gap-2" onClick={handleExportPdf}><FileText className="h-4 w-4" /> Export PDF</Button>
        </div>
      </div>

      {/* Active Packs widget removed — see Packs tab. */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cn("transition-all", ownerFilter === "all" ? "ring-2 ring-primary rounded-xl" : "")}>
          <StatCard title="Total Units" value={totalUnits} delay={0} index={0} icon={Archive} onClick={() => { setOwnerFilter("all"); onFilterReset?.(); }} />
        </div>
        <div className={cn("transition-all", ownerFilter === "customer" ? "ring-2 ring-primary rounded-xl" : "")}>
          <StatCard
            title="Customer Units"
            value={customerUnits}
            delay={100}
            index={1}
            icon={Users}
            onClick={() => {
              // Drill-through: viewing customer-owned rows requires shelfMode=all,
              // otherwise the toggle would filter them all back out and the table goes empty.
              setShelfMode("all");
              setOwnerFilter("customer");
              onFilterReset?.();
            }}
          />
        </div>
        <div className={cn("transition-all", ownerFilter === "company" ? "ring-2 ring-primary rounded-xl" : "")}>
          <StatCard title="Company Units" value={companyUnits} delay={200} index={2} icon={Building2} onClick={() => { setOwnerFilter("company"); onFilterReset?.(); }} />
        </div>
        <StatCard title="Unique Bulls" value={uniqueBulls} delay={300} index={3} icon={Dna} />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setShelfMode("available")}
            className={cn(
              "px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
              shelfMode === "available" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50",
            )}
          >
            Saleable
          </button>
          <button
            onClick={() => setShelfMode("all")}
            className={cn(
              "px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
              shelfMode === "all" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50",
            )}
          >
            All inventory
          </button>
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search bull name or NAAB…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="w-44">
          <Select value={breedFilter} onValueChange={setBreedFilter}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Breed" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All breeds</SelectItem>
              {breedOptions.map((b) => (
                <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-56">
          <Select value={tankFilter} onValueChange={setTankFilter}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tank" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tanks</SelectItem>
              {tankOptions.map((t: any) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.tank_name ? `${t.tank_name} (#${t.tank_number})` : `Tank #${t.tank_number}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex border border-border rounded-md overflow-hidden">
          <button onClick={() => setViewMode("detail")} className={cn("px-3 py-1.5 text-sm transition-colors", viewMode === "detail" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50")}>Detail</button>
          <button onClick={() => setViewMode("grouped")} className={cn("px-3 py-1.5 text-sm transition-colors", viewMode === "grouped" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50")}>Grouped</button>
          <button onClick={() => setViewMode("map")} className={cn("px-3 py-1.5 text-sm transition-colors", viewMode === "map" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50")}>Map</button>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={8} columns={12} />
        ) : viewMode === "map" ? (
          <TankMap orgId={orgId!} />
        ) : viewMode === "detail" ? (
          <>
            {/* Desktop table — md and up */}
            <div className="hidden md:block">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-[24%]"><SortHeader label="Bull" sortKeyVal="bull_name" /></TableHead>
                    <TableHead className="w-[12%]"><SortHeader label="Breed" sortKeyVal="breed" /></TableHead>
                    <TableHead className="w-[20%]"><SortHeader label="Location" sortKeyVal="tank" /></TableHead>
                    <TableHead className="w-[18%]"><SortHeader label="Owner" sortKeyVal="customer" /></TableHead>
                    <TableHead className="w-[8%] text-right"><SortHeader label="Units" sortKeyVal="units" /></TableHead>
                    <TableHead className="w-[12%]">Storage</TableHead>
                    <TableHead className="w-[6%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && !isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <EmptyState
                          icon={Archive}
                          title={rows.length === 0 ? "No inventory data" : "No results"}
                          description={rows.length === 0 ? "No semen inventory to display." : "No inventory matches your filters. Try adjusting your filters."}
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((row) => {
                      const ownerDisplay = row.owner || row.customer;
                      const isZero = row.units === 0;
                      const subCanSuffix = row.subCanister && row.subCanister !== "—" ? ` / ${row.subCanister}` : "";
                      const cust = row.bullCatalogId ? bullActivity.customerOrders[row.bullCatalogId] : undefined;
                      const inv = row.bullCatalogId ? bullActivity.inventoryOrders[row.bullCatalogId] : undefined;
                      const proj = row.bullCatalogId ? bullActivity.projects[row.bullCatalogId] : undefined;
                      const hasActivity = !!(cust || inv || proj);
                      const pendingUnits = (proj?.units ?? 0) + (cust?.units ?? 0);
                      const isExpanded = expandedRow === row.id;
                      const toggleRow = () => {
                        if (!hasActivity) return;
                        setExpandedRow((cur) => (cur === row.id ? null : row.id));
                      };
                      return (
                        <Fragment key={row.id}>
                        <TableRow
                          className={cn(
                            "hover:bg-muted/20",
                            isZero && "opacity-60",
                            hasActivity && "cursor-pointer",
                          )}
                          onClick={hasActivity ? toggleRow : undefined}
                        >
                          <TableCell className="align-top">
                            <div className="font-medium truncate flex items-center gap-1" title={row.bullName}>
                              <span className="truncate">{row.bullName}</span>
                              {row.bullCatalogId && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditBullId(row.bullCatalogId); }}
                                  className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                  title="Edit bull info"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                              {hasActivity && (
                                isExpanded
                                  ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
                                  : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                              )}
                            </div>
                            <div className="text-xs font-mono text-muted-foreground truncate" title={row.bullCode}>{row.bullCode}</div>
                            {hasActivity ? (
                              <div className="mt-1 text-[11px] flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                                {cust && (
                                  <span style={{ color: "#D85A30" }}>
                                    {cust.count} customer order{cust.count === 1 ? "" : "s"} ({cust.units} units)
                                  </span>
                                )}
                                {cust && (inv || proj) && <span className="text-muted-foreground/60">·</span>}
                                {inv && (
                                  <span className="text-info">
                                    {inv.count} incoming ({inv.unitsPending} units pending)
                                  </span>
                                )}
                                {inv && proj && <span className="text-muted-foreground/60">·</span>}
                                {proj && (
                                  <span style={{ color: "#639922" }}>
                                    {proj.count} project{proj.count === 1 ? "" : "s"} ({proj.units} units needed)
                                  </span>
                                )}
                              </div>
                            ) : (
                              row.bullCatalogId && (
                                <div className="mt-1 text-[11px] text-muted-foreground/70">
                                  No orders or projects
                                </div>
                              )
                            )}
                          </TableCell>
                          <TableCell className="align-top text-sm text-muted-foreground">
                            {row.breed || "—"}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="truncate" title={`${row.tankName} #${row.tankNumber}`}>
                              {row.tankName} <span className="text-muted-foreground">#{row.tankNumber}</span>
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              Canister {row.canister}{subCanSuffix}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="truncate" title={ownerDisplay}>{ownerDisplay}</div>
                          </TableCell>
                          <TableCell className={cn("text-right align-top tabular-nums font-medium", isZero && "text-muted-foreground font-normal")}>
                            {row.units}
                            {pendingUnits > 0 && (
                              <div className="text-[11px] font-normal text-orange-500" title="Units committed to active projects + open orders">
                                {pendingUnits} pending
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge variant="outline" className={STORAGE_BADGES[row.storageType] || "bg-muted text-muted-foreground border-border"}>
                              {row.storageType}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setTransferRow(row._raw);
                                    setTransferOpen(true);
                                  }}
                                >
                                  Move Semen
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEdit(row)}>Edit</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    if (confirm(`Delete this inventory row for "${row.bullName}"? This cannot be undone.`)) {
                                      handleDeleteRow(row.id);
                                    }
                                  }}
                                >
                                  {deletingId === row.id ? "Deleting…" : "Delete"}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="bg-muted/10 hover:bg-muted/10">
                            <TableCell colSpan={7} className="py-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                              {!bullDetail ? (
                                <div className="text-xs text-muted-foreground">Loading…</div>
                              ) : (
                                <>
                                  {bullDetail.customerOrders.length > 0 && (
                                    <div className="space-y-1.5">
                                      <div className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1" style={{ color: "#993C1D" }}>
                                        <ArrowUpRight className="h-3.5 w-3.5" />
                                        Going out — Customer orders
                                      </div>
                                      {bullDetail.customerOrders.map((oi: any, idx: number) => {
                                        const o = oi.semen_orders;
                                        const status = oi.item_status ?? "pending";
                                        return (
                                          <button
                                            key={idx}
                                            type="button"
                                            onClick={() => navigate(`/semen-orders/${o.id}`)}
                                            className="w-full text-left rounded-md px-2.5 py-1.5 text-xs grid grid-cols-[1fr_auto_auto_auto] gap-3 items-baseline hover:opacity-90 transition-opacity"
                                            style={{ backgroundColor: "#FAECE7", color: "#712B13" }}
                                          >
                                            <div className="truncate font-medium" style={{ color: "#712B13" }}>{o?.customers?.name ?? "—"}</div>
                                            <div style={{ color: "#993C1D" }}>{o?.order_date ? format(new Date(o.order_date), "MMM d, yyyy") : "—"}</div>
                                            <div className="tabular-nums">
                                              <span className="font-medium">{oi.units ?? 0}</span>
                                              <span style={{ color: "#993C1D" }}> units</span>
                                            </div>
                                            <Badge
                                              variant="outline"
                                              className="capitalize text-[10px] border-current"
                                              style={{ backgroundColor: "transparent", borderColor: "#993C1D", color: "#993C1D" }}
                                            >
                                              {status.replace(/_/g, " ")}
                                            </Badge>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {bullDetail.inventoryOrders.length > 0 && (
                                    <div className="space-y-1.5">
                                      <div className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1" style={{ color: "#185FA5" }}>
                                        <ArrowDownLeft className="h-3.5 w-3.5" />
                                        Coming in — Inventory orders
                                      </div>
                                      {bullDetail.inventoryOrders.map((oi: any, idx: number) => {
                                        const o = oi.semen_orders;
                                        const status = oi.item_status ?? "pending";
                                        const company = o?.semen_companies?.name ?? "—";
                                        return (
                                          <button
                                            key={idx}
                                            type="button"
                                            onClick={() => navigate(`/semen-orders/${o.id}`)}
                                            className="w-full text-left rounded-md px-2.5 py-1.5 text-xs grid grid-cols-[1fr_auto_auto_auto] gap-3 items-baseline hover:opacity-90 transition-opacity"
                                            style={{ backgroundColor: "#E6F1FB", color: "#0C447C" }}
                                          >
                                            <div className="truncate font-medium" style={{ color: "#0C447C" }}>
                                              {company}
                                              {o?.placed_by ? <span style={{ color: "#185FA5" }}> — {o.placed_by}</span> : null}
                                            </div>
                                            <div style={{ color: "#185FA5" }}>{o?.order_date ? format(new Date(o.order_date), "MMM d, yyyy") : "—"}</div>
                                            <div className="tabular-nums">
                                              <span className="font-medium">{oi.units ?? 0}</span>
                                              <span style={{ color: "#185FA5" }}> units</span>
                                              {oi.units_received > 0 && <span style={{ color: "#185FA5" }}> · {oi.units_received} recv</span>}
                                            </div>
                                            <Badge
                                              variant="outline"
                                              className="capitalize text-[10px]"
                                              style={{ backgroundColor: "transparent", borderColor: "#185FA5", color: "#185FA5" }}
                                            >
                                              {status.replace(/_/g, " ")}
                                            </Badge>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {bullDetail.projects.length > 0 && (
                                    <div className="space-y-1.5">
                                      <div className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1" style={{ color: "#3B6D11" }}>
                                        <ClipboardList className="h-3.5 w-3.5" />
                                        Projects
                                      </div>
                                      {bullDetail.projects.map((pb: any, idx: number) => {
                                        const p = pb.projects;
                                        return (
                                          <button
                                            key={idx}
                                            type="button"
                                            onClick={() => navigate(`/project/${p.id}`)}
                                            className="w-full text-left rounded-md px-2.5 py-1.5 text-xs grid grid-cols-[1fr_auto_auto_auto] gap-3 items-baseline hover:opacity-90 transition-opacity"
                                            style={{ backgroundColor: "#EAF3DE", color: "#27500A" }}
                                          >
                                            <div className="truncate font-medium" style={{ color: "#27500A" }}>{p.name}</div>
                                            <div style={{ color: "#3B6D11" }}>
                                              {p.breeding_date ? format(new Date(p.breeding_date), "MMM d, yyyy") : "—"}
                                              {p.protocol ? ` · ${p.protocol}` : ""}
                                            </div>
                                            <div className="tabular-nums">
                                              <span className="font-medium">{pb.units ?? 0}</span>
                                              <span style={{ color: "#3B6D11" }}> units</span>
                                            </div>
                                            <Badge
                                              variant="outline"
                                              className="capitalize text-[10px]"
                                              style={{ backgroundColor: "transparent", borderColor: "#3B6D11", color: "#3B6D11" }}
                                            >
                                              {p.status}
                                            </Badge>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {bullDetail.customerOrders.length === 0 &&
                                    bullDetail.inventoryOrders.length === 0 &&
                                    bullDetail.projects.length === 0 && (
                                      <div className="text-xs text-muted-foreground">No orders or projects.</div>
                                    )}
                                </>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
                {filtered.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3} className="text-right font-semibold">Total</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{filteredTotal}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>

            {/* Mobile card layout — below md */}
            <div className="md:hidden divide-y divide-border">
              {filtered.length === 0 && !isLoading ? (
                <EmptyState
                  icon={Archive}
                  title={rows.length === 0 ? "No inventory data" : "No results"}
                  description={rows.length === 0 ? "No semen inventory to display." : "No inventory matches your filters. Try adjusting your filters."}
                />
              ) : (
                <>
                  {filtered.map((row) => {
                    const ownerDisplay = row.owner || row.customer;
                    const isZero = row.units === 0;
                    const subCanSuffix = row.subCanister && row.subCanister !== "—" ? ` / ${row.subCanister}` : "";
                    const mPendingUnits = row.bullCatalogId
                      ? (bullActivity.projects[row.bullCatalogId]?.units ?? 0) +
                        (bullActivity.customerOrders[row.bullCatalogId]?.units ?? 0)
                      : 0;
                    return (
                      <div key={row.id} className={cn("p-4 space-y-3", isZero && "opacity-60")}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate flex items-center gap-1">
                              <span className="truncate">{row.bullName}</span>
                              {row.bullCatalogId && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditBullId(row.bullCatalogId); }}
                                  className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                  title="Edit bull info"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                            <div className="text-xs font-mono text-muted-foreground truncate">{row.bullCode}</div>
                          </div>
                          <div className="flex items-start gap-2 shrink-0">
                            <div className="text-right">
                              <div className={cn("text-lg font-bold tabular-nums leading-none", isZero && "text-muted-foreground font-normal")}>
                                {row.units}
                              </div>
                              {mPendingUnits > 0 && (
                                <div className="text-[10px] text-orange-500 mt-0.5">
                                  {mPendingUnits} pending
                                </div>
                              )}
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">units</div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setTransferRow(row._raw);
                                    setTransferOpen(true);
                                  }}
                                >
                                  Move Semen
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEdit(row)}>Edit</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    if (confirm(`Delete this inventory row for "${row.bullName}"? This cannot be undone.`)) {
                                      handleDeleteRow(row.id);
                                    }
                                  }}
                                >
                                  {deletingId === row.id ? "Deleting…" : "Delete"}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                        <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-sm">
                          <div className="text-xs text-muted-foreground uppercase tracking-wide">Location</div>
                          <div className="truncate">{row.tankName} #{row.tankNumber} · Can {row.canister}{subCanSuffix}</div>
                          <div className="text-xs text-muted-foreground uppercase tracking-wide">Owner</div>
                          <div className="truncate">{ownerDisplay}</div>
                          <div className="text-xs text-muted-foreground uppercase tracking-wide">Storage</div>
                          <div>
                            <Badge variant="outline" className={STORAGE_BADGES[row.storageType] || "bg-muted text-muted-foreground border-border"}>
                              {row.storageType}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filtered.length > 0 && (
                    <div className="p-4 flex items-center justify-between bg-muted/20">
                      <div className="text-sm font-semibold">Total</div>
                      <div className="text-sm font-bold tabular-nums">{filteredTotal} units</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Bull / Customer</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Tanks</TableHead>
                <TableHead className="text-right">Units</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedByBull.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <EmptyState
                      icon={Archive}
                      title={rows.length === 0 ? "No inventory data" : "No results"}
                      description={rows.length === 0 ? "No semen inventory to display." : "No inventory matches your filters. Try adjusting your filters."}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                groupedByBull.map((group) => (
                  <>
                    <TableRow key={`bull-${group.bullName}`} className="bg-muted/40 hover:bg-muted/50">
                      <TableCell className="font-semibold">{group.bullName}</TableCell>
                      <TableCell className="text-muted-foreground">{group.bullCode}</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-bold">{group.totalUnits}</TableCell>
                    </TableRow>
                    {Array.from(group.customers.values()).map((cust) => (
                      <TableRow key={`${group.bullName}-${cust.customer}`} className="hover:bg-muted/20">
                        <TableCell className="pl-6 text-muted-foreground">{cust.customer}</TableCell>
                        <TableCell />
                        <TableCell className="text-sm text-muted-foreground">{cust.tanks.join(", ")}</TableCell>
                        <TableCell className="text-right">{cust.totalUnits}</TableCell>
                      </TableRow>
                    ))}
                  </>
                ))
              )}
            </TableBody>
            {groupedByBull.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-semibold">Total</TableCell>
                  <TableCell className="text-right font-bold">{filteredTotal}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}
      </div>

      {/* Edit Inventory Row Dialog */}
      <Dialog open={!!editRow} onOpenChange={(open) => { if (!open) setEditRow(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Inventory Row</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Bull Name</Label>
                <Input
                  className="mt-1"
                  value={editForm.custom_bull_name || ""}
                  onChange={(e) => setEditForm((p: any) => ({ ...p, custom_bull_name: e.target.value }))}
                  placeholder="Bull name"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Bull Code</Label>
                <Input
                  className="mt-1"
                  value={editForm.bull_code || ""}
                  onChange={(e) => setEditForm((p: any) => ({ ...p, bull_code: e.target.value }))}
                  placeholder="NAAB code"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">Tank</Label>
              <Select value={editForm.tank_id || ""} onValueChange={(v) => setEditForm((p: any) => ({ ...p, tank_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select tank" /></SelectTrigger>
                <SelectContent>
                  {(tankOptions || []).map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.tank_name ? `${t.tank_name} (#${t.tank_number})` : t.tank_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">Customer</Label>
              <Select value={editForm.customer_id || "none"} onValueChange={(v) => setEditForm((p: any) => ({ ...p, customer_id: v === "none" ? "" : v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Company (no customer)</SelectItem>
                  {(customerOptions || []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Canister</Label>
                <Input
                  className="mt-1"
                  value={editForm.canister || ""}
                  onChange={(e) => setEditForm((p: any) => ({ ...p, canister: e.target.value }))}
                  placeholder="1"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Sub-canister</Label>
                <Input
                  className="mt-1"
                  value={editForm.sub_canister || ""}
                  onChange={(e) => setEditForm((p: any) => ({ ...p, sub_canister: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Units</Label>
                <Input
                  className="mt-1"
                  type="number"
                  value={editForm.units ?? 0}
                  onChange={(e) => setEditForm((p: any) => ({ ...p, units: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Storage Type</Label>
                <Select value={editForm.storage_type || "inventory"} onValueChange={(v) => setEditForm((p: any) => ({ ...p, storage_type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inventory">Inventory</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="communal">Communal</SelectItem>
                    <SelectItem value="rental">Rental</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Owner</Label>
                <Input
                  className="mt-1"
                  value={editForm.owner || ""}
                  onChange={(e) => setEditForm((p: any) => ({ ...p, owner: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">Notes</Label>
              <Textarea
                className="mt-1"
                value={editForm.notes || ""}
                onChange={(e) => setEditForm((p: any) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge collision confirmation */}
      <AlertDialog open={!!mergeTarget} onOpenChange={(open) => { if (!open) handleCancelMerge(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge into existing location?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Canister <strong>{mergeTarget?.targetCanister}</strong>
                  {mergeTarget?.targetSubCanister ? ` / ${mergeTarget.targetSubCanister}` : ""}
                  {" "}already has <strong>{mergeTarget?.targetUnits} units</strong> of{" "}
                  <strong>{mergeTarget?.bullLabel}</strong>.
                </p>
                <p>
                  Merging will add the <strong>{pendingUpdates?.units} units</strong> from the row you're editing into that existing row (new total:{" "}
                  <strong>{(mergeTarget?.targetUnits || 0) + (pendingUpdates?.units || 0)} units</strong>).
                  The row you were editing will be deleted.
                </p>
                <p className="text-xs text-muted-foreground">
                  Cancel to go back and change the destination instead.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging} onClick={handleCancelMerge}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmMerge} disabled={merging}>
              {merging ? "Merging..." : `Merge into canister ${mergeTarget?.targetCanister}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {editBullId && (
        <QuickBullEditDialog
          open={!!editBullId}
          onOpenChange={(open) => { if (!open) setEditBullId(null); }}
          bullCatalogId={editBullId}
        />
      )}

      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        sourceRow={transferRow}
        sourceTankName={transferRow?.tanks?.tank_name || transferRow?.tanks?.tank_number || "Tank"}
        orgId={orgId}
        userId={userId}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["semen-inventory"] });
          queryClient.invalidateQueries({ queryKey: ["tank_map"] });
        }}
      />
    </div>
  );
};

export default InventoryTab;
