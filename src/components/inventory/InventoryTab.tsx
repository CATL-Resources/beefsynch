import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Search, Archive, Users, Building2, Dna, FileText, FileSpreadsheet, ArrowUpDown,
  Truck, ChevronDown, ChevronUp, MoreHorizontal, Pencil,
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
  // "available" = company-owned, sellable; "all" = every shelf row including customer-owned.
  // Default to "available" so the dashboard shows what's actually for sale by default.
  const [shelfMode, setShelfMode] = useState<"available" | "all">("available");

  // When the toggle is "available", customer-only filters would show empty results.
  // Reset to "company" if a customer-related filter is active.
  useEffect(() => {
    if (shelfMode === "available" && !["all", "company", "CATL", "Select"].includes(ownerFilter)) {
      setOwnerFilter("company");
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

  const filtered = useMemo(() => {
    let result = rows;
    // Shelf-mode toggle: "available" hides customer-owned rows in the visible table only.
    // Stats above are computed off the full `rows` set so they always reflect reality.
    if (shelfMode === "available") result = result.filter((r) => !r.customerId);
    if (storageFilter !== "all") result = result.filter((r) => r.storageType === storageFilter);
    if (breedFilter !== "all") result = result.filter((r) => r.breed === breedFilter);
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
  }, [rows, shelfMode, storageFilter, ownerFilter, breedFilter, search, sortKey, sortDir]);

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

      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-44">
          <Select value={storageFilter} onValueChange={setStorageFilter}>
            <SelectTrigger><SelectValue placeholder="Storage Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Storage</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="communal">Communal</SelectItem>
              <SelectItem value="rental">Rental</SelectItem>
              <SelectItem value="inventory">Inventory</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <Select value={breedFilter} onValueChange={setBreedFilter}>
            <SelectTrigger><SelectValue placeholder="Breed" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Breeds</SelectItem>
              {breedOptions.map((b) => (
                <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-36">
          <Select value={ownerFilter} onValueChange={(v) => { setOwnerFilter(v); onFilterReset?.(); }}>
            <SelectTrigger><SelectValue placeholder="Owner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              <SelectItem value="company">Company Only</SelectItem>
              {shelfMode === "all" && <SelectItem value="customer">Customer Only</SelectItem>}
              <SelectItem value="CATL">CATL</SelectItem>
              <SelectItem value="Select">Select</SelectItem>
              {shelfMode === "all" && customerOwnerNames.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium border-t mt-1 pt-1">Customers</div>
                  {customerOwnerNames.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search bull, customer, tank…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex border border-border rounded-md overflow-hidden">
          <button onClick={() => setShelfMode("available")} className={cn("px-3 py-1.5 text-sm transition-colors whitespace-nowrap", shelfMode === "available" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50")}>Available stock only</button>
          <button onClick={() => setShelfMode("all")} className={cn("px-3 py-1.5 text-sm transition-colors whitespace-nowrap", shelfMode === "all" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50")}>All shelf contents</button>
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
                      return (
                        <TableRow key={row.id} className={cn("hover:bg-muted/20", isZero && "opacity-60")}>
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
                            </div>
                            <div className="text-xs font-mono text-muted-foreground truncate" title={row.bullCode}>{row.bullCode}</div>
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
